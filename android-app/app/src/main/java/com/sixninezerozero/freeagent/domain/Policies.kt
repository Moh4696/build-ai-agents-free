package com.sixninezerozero.freeagent.domain

object ApiKeyValidator {
    const val MINIMUM_KEY_LENGTH = 20
    const val MAXIMUM_KEY_LENGTH = 512

    fun normalise(raw: String): String = raw.trim()

    fun errorFor(raw: String, providerName: String): String? {
        val value = normalise(raw)
        if (value.isEmpty()) return null
        if (value.length < MINIMUM_KEY_LENGTH) return "$providerName key looks too short."
        if (value.length > MAXIMUM_KEY_LENGTH) return "$providerName key is too long."
        if (value.any(Char::isWhitespace)) return "$providerName key must not contain spaces or line breaks."
        return null
    }
}

object ConversationPolicy {
    const val MAX_STORED_MESSAGES = 200
    const val MAX_STORED_CHARACTERS = 500_000
    const val MAX_CONTEXT_MESSAGES = 24
    const val MAX_CONTEXT_CHARACTERS = 48_000
    const val MAX_USER_MESSAGE_CHARACTERS = 12_000
    const val MAX_SYSTEM_PROMPT_CHARACTERS = 4_000

    fun trimForStorage(messages: List<ChatMessage>): List<ChatMessage> {
        val selected = ArrayDeque<ChatMessage>()
        var usedCharacters = 0

        for (message in messages.asReversed()) {
            if (selected.size >= MAX_STORED_MESSAGES) break
            if (selected.isNotEmpty() && usedCharacters + message.content.length > MAX_STORED_CHARACTERS) break
            selected.addFirst(message)
            usedCharacters += message.content.length
        }

        return selected.toList()
    }

    fun contextForRequest(messages: List<ChatMessage>): List<ChatMessage> {
        val selected = ArrayDeque<ChatMessage>()
        var usedCharacters = 0

        for (message in messages.asReversed()) {
            if (selected.size >= MAX_CONTEXT_MESSAGES) break
            if (selected.isNotEmpty() && usedCharacters + message.content.length > MAX_CONTEXT_CHARACTERS) break

            selected.addFirst(message)
            usedCharacters += message.content.length
        }

        while (selected.firstOrNull()?.role == MessageRole.ASSISTANT) {
            selected.removeFirst()
        }

        return selected.toList()
    }
}

sealed class ApiFailure(
    override val message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {
    class MissingCredentials : ApiFailure("Add a Groq or Gemini API key in Settings.")
    class InvalidCredentials(provider: String) :
        ApiFailure("$provider rejected the API key. Check it in Settings.")

    class RateLimited(provider: String) :
        ApiFailure("$provider has reached its current rate limit. Try again shortly.")

    class Network(cause: Throwable? = null) :
        ApiFailure("Could not reach the AI service. Check your internet connection.", cause)

    class Service(provider: String, detail: String? = null) :
        ApiFailure(
            buildString {
                append("$provider could not complete the request.")
                if (!detail.isNullOrBlank()) append(" $detail")
            },
        )

    class EmptyResponse(provider: String) : ApiFailure("$provider returned an empty response.")
}
