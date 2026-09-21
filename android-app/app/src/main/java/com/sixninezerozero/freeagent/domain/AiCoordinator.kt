package com.sixninezerozero.freeagent.domain

interface AiClient {
    val provider: AiProvider

    suspend fun generate(
        apiKey: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
    ): String
}

class AiCoordinator(
    private val groqClient: AiClient,
    private val geminiClient: AiClient,
) {
    init {
        require(groqClient.provider == AiProvider.GROQ)
        require(geminiClient.provider == AiProvider.GEMINI)
    }

    suspend fun reply(settings: AppSettings, messages: List<ChatMessage>): AiReply {
        val context = ConversationPolicy.contextForRequest(messages)
        val groqKey = ApiKeyValidator.normalise(settings.groqApiKey)
        val geminiKey = ApiKeyValidator.normalise(settings.geminiApiKey)

        if (groqKey.isBlank() && geminiKey.isBlank()) throw ApiFailure.MissingCredentials()

        if (groqKey.isBlank()) {
            return generateWith(geminiClient, geminiKey, settings.systemPrompt, context, false)
        }

        return try {
            generateWith(groqClient, groqKey, settings.systemPrompt, context, false)
        } catch (failure: ApiFailure) {
            if (!settings.fallbackEnabled || geminiKey.isBlank()) throw failure
            generateWith(geminiClient, geminiKey, settings.systemPrompt, context, true)
        }
    }

    private suspend fun generateWith(
        client: AiClient,
        apiKey: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
        fallbackUsed: Boolean,
    ): AiReply {
        val text = client.generate(apiKey, systemPrompt, messages).trim()
        if (text.isEmpty()) throw ApiFailure.EmptyResponse(client.provider.displayName)
        return AiReply(text = text, provider = client.provider, fallbackUsed = fallbackUsed)
    }
}
