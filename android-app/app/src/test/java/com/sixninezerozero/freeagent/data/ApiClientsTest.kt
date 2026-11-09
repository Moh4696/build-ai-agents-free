package com.sixninezerozero.freeagent.data

import com.sixninezerozero.freeagent.domain.AiProvider
import com.sixninezerozero.freeagent.domain.ApiFailure
import com.sixninezerozero.freeagent.domain.KeyCheck
import com.sixninezerozero.freeagent.domain.ChatMessage
import com.sixninezerozero.freeagent.domain.MessageRole
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiClientsTest {
    @Test
    fun `Groq request uses bearer header and parses assistant content`() = runTest {
        val transport = RecordingTransport(
            HttpResponse(
                200,
                """{"choices":[{"message":{"content":"Hello from Groq"}}]}""",
            ),
        )
        val client = GroqClient(transport)

        val result = client.generate("secret-key", "Be useful", listOf(userMessage()))

        assertEquals("Hello from Groq", result)
        assertEquals("Bearer secret-key", transport.lastRequest!!.headers["Authorization"])
        assertFalse(transport.lastRequest!!.url.contains("secret-key"))
        val json = JSONObject(transport.lastRequest!!.body)
        assertEquals("openai/gpt-oss-120b", json.getString("model"))
        assertEquals("system", json.getJSONArray("messages").getJSONObject(0).getString("role"))
        val toolNames = json.getJSONArray("tools").let { tools ->
            (0 until tools.length()).map {
                tools.getJSONObject(it).getJSONObject("function").getString("name")
            }
        }
        assertEquals(listOf("calculator", "word_count", "current_date_time"), toolNames)
    }

    @Test
    fun `Groq executes an allow-listed tool and returns its result to the model`() = runTest {
        val toolRequest = HttpResponse(
            200,
            """{"choices":[{"message":{"role":"assistant","content":null,"tool_calls":[{"id":"call-1","type":"function","function":{"name":"calculator","arguments":"{\"expression\":\"2 + 3 * 4\"}"}}]}}]}""",
        )
        val finalResponse = HttpResponse(
            200,
            """{"choices":[{"message":{"role":"assistant","content":"The answer is 14."}}]}""",
        )
        val transport = RecordingTransport(toolRequest, finalResponse)

        val result = GroqClient(transport).generate(
            "secret-key",
            "Be useful",
            listOf(userMessage()),
        )

        assertEquals("The answer is 14.", result)
        assertEquals(2, transport.requests.size)
        val secondRequest = JSONObject(transport.requests[1].body)
        val messages = secondRequest.getJSONArray("messages")
        val toolMessage = messages.getJSONObject(messages.length() - 1)
        assertEquals("tool", toolMessage.getString("role"))
        assertEquals("call-1", toolMessage.getString("tool_call_id"))
        assertEquals("14", JSONObject(toolMessage.getString("content")).getString("result"))
    }

    @Test
    fun `Gemini request uses API key header and parses all text parts`() = runTest {
        val transport = RecordingTransport(
            HttpResponse(
                200,
                """{"candidates":[{"content":{"parts":[{"text":"Hello "},{"text":"from Gemini"}]}}]}""",
            ),
        )
        val client = GeminiClient(transport)

        val result = client.generate("secret-key", "Be useful", listOf(userMessage()))

        assertEquals("Hello from Gemini", result)
        assertEquals("secret-key", transport.lastRequest!!.headers["x-goog-api-key"])
        assertFalse(transport.lastRequest!!.url.contains("secret-key"))
        assertTrue(transport.lastRequest!!.url.contains("gemini-3.6-flash"))
        val json = JSONObject(transport.lastRequest!!.body)
        assertTrue(json.has("systemInstruction"))
        assertEquals("user", json.getJSONArray("contents").getJSONObject(0).getString("role"))
    }

    @Test
    fun `HTTP 429 is mapped to a safe rate limit error`() {
        val client = GroqClient(RecordingTransport(HttpResponse(429, "too many")))

        assertThrows(ApiFailure.RateLimited::class.java) {
            runTest { client.generate("secret-key", "Be useful", listOf(userMessage())) }
        }
    }

    @Test
    fun `Gemini bad-key answer (HTTP 400 API_KEY_INVALID) is reported as a rejected key`() {
        val body = """{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}"""
        val client = GeminiClient(RecordingTransport(HttpResponse(400, body)))

        val failure = assertThrows(ApiFailure.InvalidCredentials::class.java) {
            runTest { client.generate("secret-key", "Be useful", listOf(userMessage())) }
        }
        assertTrue(failure.message.contains("API key not valid"))
    }

    @Test
    fun `key check uses a free GET request and maps each answer`() = runTest {
        val transport = RecordingTransport(
            HttpResponse(200, """{"data":[]}"""),
            HttpResponse(401, """{"error":{"message":"Invalid API Key"}}"""),
            HttpResponse(400, """{"error":{"message":"API key not valid.","details":[{"reason":"API_KEY_INVALID"}]}}"""),
            HttpResponse(503, """{"error":{"message":"Service unavailable"}}"""),
        )
        val checker = HttpKeyChecker(transport)

        assertEquals(KeyCheck.Works, checker.check(AiProvider.GROQ, "groq-key"))
        assertEquals("GET", transport.lastRequest!!.method)
        assertTrue(transport.lastRequest!!.url.endsWith("/openai/v1/models"))
        assertEquals("Bearer groq-key", transport.lastRequest!!.headers["Authorization"])

        assertEquals(KeyCheck.Rejected("Invalid API Key"), checker.check(AiProvider.GROQ, "groq-key"))

        assertEquals(KeyCheck.Rejected("API key not valid."), checker.check(AiProvider.GEMINI, "gemini-key"))
        assertEquals("gemini-key", transport.lastRequest!!.headers["x-goog-api-key"])
        assertFalse(transport.lastRequest!!.url.contains("gemini-key"))

        assertEquals(KeyCheck.CouldNotCheck("Service unavailable"), checker.check(AiProvider.GEMINI, "gemini-key"))
    }

    @Test
    fun `key check reports no connection when the network fails`() = runTest {
        val offline = object : HttpTransport {
            override suspend fun send(request: HttpRequest): HttpResponse = throw java.io.IOException("offline")
        }
        assertEquals(KeyCheck.NoConnection, HttpKeyChecker(offline).check(AiProvider.GROQ, "groq-key"))
    }

    private fun userMessage() = ChatMessage(
        role = MessageRole.USER,
        content = "Hello",
        timestampMillis = 0,
    )
}

private class RecordingTransport(
    vararg responses: HttpResponse,
) : HttpTransport {
    private val pendingResponses = ArrayDeque(responses.toList())
    val requests = mutableListOf<HttpRequest>()

    var lastRequest: HttpRequest? = null
        private set

    override suspend fun send(request: HttpRequest): HttpResponse {
        lastRequest = request
        requests += request
        return pendingResponses.removeFirstOrNull() ?: error("No fake HTTP response remains.")
    }
}
