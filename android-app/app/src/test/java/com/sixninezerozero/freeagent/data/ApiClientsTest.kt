package com.sixninezerozero.freeagent.data

import com.sixninezerozero.freeagent.domain.ApiFailure
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

    override suspend fun post(request: HttpRequest): HttpResponse {
        lastRequest = request
        requests += request
        return pendingResponses.removeFirstOrNull() ?: error("No fake HTTP response remains.")
    }
}
