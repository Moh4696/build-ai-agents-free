package com.sixninezerozero.freeagent.data

import com.sixninezerozero.freeagent.domain.AppSettings
import com.sixninezerozero.freeagent.domain.ChatMessage
import com.sixninezerozero.freeagent.domain.ConversationPolicy
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val KEY_GROQ = "groq_api_key"
private const val KEY_GEMINI = "gemini_api_key"
private const val KEY_FALLBACK = "fallback_enabled"
private const val KEY_SYSTEM_PROMPT = "system_prompt"
private const val KEY_HISTORY = "chat_history"

class AppRepository(
    private val secureStore: SecureStore,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    suspend fun loadSettings(): AppSettings = withContext(ioDispatcher) {
        AppSettings(
            groqApiKey = secureStore.getString(KEY_GROQ).orEmpty(),
            geminiApiKey = secureStore.getString(KEY_GEMINI).orEmpty(),
            fallbackEnabled = secureStore.getBoolean(KEY_FALLBACK, true),
            systemPrompt = secureStore.getString(KEY_SYSTEM_PROMPT)
                ?.takeIf(String::isNotBlank)
                ?: AppSettings.DEFAULT_SYSTEM_PROMPT,
        )
    }

    suspend fun saveSettings(settings: AppSettings) = withContext(ioDispatcher) {
        writeOrRemove(KEY_GROQ, settings.groqApiKey.trim())
        writeOrRemove(KEY_GEMINI, settings.geminiApiKey.trim())
        secureStore.putBoolean(KEY_FALLBACK, settings.fallbackEnabled)
        secureStore.putString(KEY_SYSTEM_PROMPT, settings.systemPrompt.trim())
    }

    suspend fun loadMessages(): List<ChatMessage> = withContext(ioDispatcher) {
        val stored = secureStore.getString(KEY_HISTORY) ?: return@withContext emptyList()
        runCatching { ChatJsonCodec.decode(stored) }.getOrElse {
            secureStore.remove(KEY_HISTORY)
            emptyList()
        }
    }

    suspend fun saveMessages(messages: List<ChatMessage>) = withContext(ioDispatcher) {
        secureStore.putString(
            KEY_HISTORY,
            ChatJsonCodec.encode(ConversationPolicy.trimForStorage(messages)),
        )
    }

    suspend fun clearMessages() = withContext(ioDispatcher) {
        secureStore.remove(KEY_HISTORY)
    }

    suspend fun eraseEverything() = withContext(ioDispatcher) {
        secureStore.clear()
    }

    private fun writeOrRemove(key: String, value: String) {
        if (value.isBlank()) secureStore.remove(key) else secureStore.putString(key, value)
    }
}
