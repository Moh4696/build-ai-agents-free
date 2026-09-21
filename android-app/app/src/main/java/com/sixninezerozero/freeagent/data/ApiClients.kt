package com.sixninezerozero.freeagent.data

import com.sixninezerozero.freeagent.domain.AiClient
import com.sixninezerozero.freeagent.domain.AiProvider
import com.sixninezerozero.freeagent.domain.ApiFailure
import com.sixninezerozero.freeagent.domain.ChatMessage
import com.sixninezerozero.freeagent.domain.MessageRole
import java.io.IOException
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

private const val GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
private const val GROQ_MODEL = "openai/gpt-oss-120b"
private const val MAX_TOOL_ROUNDS = 4
private const val MAX_TOOL_CALLS_PER_ROUND = 4
private const val GEMINI_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"

class GroqClient(
    private val transport: HttpTransport,
    private val tools: LocalAgentTools = LocalAgentTools(),
) : AiClient {
    override val provider: AiProvider = AiProvider.GROQ

    override suspend fun generate(
        apiKey: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
    ): String {
        val wireMessages = JSONArray().put(
            JSONObject()
                .put("role", "system")
                .put(
                    "content",
                    "$systemPrompt\n\nUse the provided tools when they improve accuracy. " +
                        "Never invent a tool result, and explain the final answer clearly.",
                ),
        )
        messages.forEach { message ->
            wireMessages.put(
                JSONObject()
                    .put("role", message.role.wireName)
                    .put("content", message.content),
            )
        }

        for (round in 0..MAX_TOOL_ROUNDS) {
            val body = JSONObject()
                .put("model", GROQ_MODEL)
                .put("messages", wireMessages)
                .put("tools", tools.definitions())
                .put("tool_choice", "auto")
                .put("temperature", 0.3)
                .put("max_completion_tokens", 2_048)
                .toString()

            val response = execute(
                transport = transport,
                request = HttpRequest(
                    url = GROQ_ENDPOINT,
                    headers = mapOf("Authorization" to "Bearer $apiKey"),
                    body = body,
                ),
                provider = provider,
            )

            try {
                val assistant = JSONObject(response.body)
                    .getJSONArray("choices")
                    .getJSONObject(0)
                    .getJSONObject("message")
                val toolCalls = assistant.optJSONArray("tool_calls")
                if (toolCalls == null || toolCalls.length() == 0) {
                    return if (assistant.isNull("content")) "" else assistant.optString("content")
                }

                if (round == MAX_TOOL_ROUNDS) {
                    throw ApiFailure.Service(
                        provider.displayName,
                        "The agent reached its safe tool-step limit.",
                    )
                }
                if (toolCalls.length() > MAX_TOOL_CALLS_PER_ROUND) {
                    throw ApiFailure.Service(
                        provider.displayName,
                        "The agent requested too many tools at once.",
                    )
                }

                wireMessages.put(
                    JSONObject()
                        .put("role", "assistant")
                        .put("content", assistant.opt("content") ?: JSONObject.NULL)
                        .put("tool_calls", toolCalls),
                )

                for (index in 0 until toolCalls.length()) {
                    val call = toolCalls.getJSONObject(index)
                    val callId = call.getString("id")
                    val function = call.getJSONObject("function")
                    val name = function.getString("name")
                    val arguments = function.optString("arguments", "{}")
                    require(callId.isNotBlank() && name.isNotBlank())

                    wireMessages.put(
                        JSONObject()
                            .put("role", "tool")
                            .put("tool_call_id", callId)
                            .put("name", name)
                            .put("content", tools.executeSafely(name, arguments)),
                    )
                }
            } catch (error: JSONException) {
                throw ApiFailure.Service(
                    provider.displayName,
                    "The response format was not recognised.",
                )
            } catch (error: IllegalArgumentException) {
                throw ApiFailure.Service(
                    provider.displayName,
                    "The tool request format was not recognised.",
                )
            }
        }

        throw ApiFailure.Service(provider.displayName, "The agent could not finish its tool loop.")
    }
}

class GeminiClient(
    private val transport: HttpTransport,
) : AiClient {
    override val provider: AiProvider = AiProvider.GEMINI

    override suspend fun generate(
        apiKey: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
    ): String {
        val contents = JSONArray()
        messages.forEach { message ->
            contents.put(
                JSONObject()
                    .put("role", if (message.role == MessageRole.USER) "user" else "model")
                    .put(
                        "parts",
                        JSONArray().put(JSONObject().put("text", message.content)),
                    ),
            )
        }

        val body = JSONObject()
            .put(
                "systemInstruction",
                JSONObject().put(
                    "parts",
                    JSONArray().put(JSONObject().put("text", systemPrompt)),
                ),
            )
            .put("contents", contents)
            .put(
                "generationConfig",
                JSONObject()
                    .put("temperature", 0.3)
                    .put("maxOutputTokens", 2_048),
            )
            .toString()

        val response = execute(
            transport = transport,
            request = HttpRequest(
                url = GEMINI_ENDPOINT,
                headers = mapOf("x-goog-api-key" to apiKey),
                body = body,
            ),
            provider = provider,
        )

        return try {
            val parts = JSONObject(response.body)
                .getJSONArray("candidates")
                .getJSONObject(0)
                .getJSONObject("content")
                .getJSONArray("parts")

            buildString {
                for (index in 0 until parts.length()) {
                    val text = parts.getJSONObject(index).optString("text")
                    if (text.isNotBlank()) append(text)
                }
            }
        } catch (error: JSONException) {
            throw ApiFailure.Service(provider.displayName, "The response format was not recognised.")
        }
    }
}

private suspend fun execute(
    transport: HttpTransport,
    request: HttpRequest,
    provider: AiProvider,
): HttpResponse {
    val response = try {
        transport.post(request)
    } catch (error: IOException) {
        throw ApiFailure.Network(error)
    }

    if (response.statusCode in 200..299) return response

    when (response.statusCode) {
        401, 403 -> throw ApiFailure.InvalidCredentials(provider.displayName)
        429 -> throw ApiFailure.RateLimited(provider.displayName)
    }

    throw ApiFailure.Service(provider.displayName, extractSafeError(response.body))
}

private fun extractSafeError(body: String): String? {
    if (body.isBlank()) return null
    return runCatching {
        JSONObject(body).optJSONObject("error")?.optString("message")
    }.getOrNull()
        ?.takeIf(String::isNotBlank)
        ?.replace(Regex("[\\r\\n]+"), " ")
        ?.take(180)
}
