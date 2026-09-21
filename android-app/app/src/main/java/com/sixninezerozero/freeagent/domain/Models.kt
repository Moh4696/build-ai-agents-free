package com.sixninezerozero.freeagent.domain

import java.util.UUID

enum class MessageRole(val wireName: String) {
    USER("user"),
    ASSISTANT("assistant"),
}

enum class AiProvider(val displayName: String) {
    GROQ("Groq"),
    GEMINI("Gemini"),
}

data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val role: MessageRole,
    val content: String,
    val timestampMillis: Long = System.currentTimeMillis(),
    val provider: AiProvider? = null,
)

data class AppSettings(
    val groqApiKey: String = "",
    val geminiApiKey: String = "",
    val fallbackEnabled: Boolean = true,
    val systemPrompt: String = DEFAULT_SYSTEM_PROMPT,
) {
    val hasAnyKey: Boolean
        get() = groqApiKey.isNotBlank() || geminiApiKey.isNotBlank()

    companion object {
        const val DEFAULT_SYSTEM_PROMPT =
            "You are a helpful, careful assistant. Be concise, distinguish facts from uncertainty, " +
                "and never claim to have searched the web unless a search tool was actually used."
    }
}

data class AiReply(
    val text: String,
    val provider: AiProvider,
    val fallbackUsed: Boolean,
)

sealed class AppScreen {
    data object Onboarding : AppScreen()
    data object Chat : AppScreen()
    data object Settings : AppScreen()
}

data class ChatUiState(
    val isInitialising: Boolean = true,
    val screen: AppScreen = AppScreen.Onboarding,
    val settings: AppSettings = AppSettings(),
    val messages: List<ChatMessage> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val fallbackNotice: String? = null,
    val failedMessageId: String? = null,
)
