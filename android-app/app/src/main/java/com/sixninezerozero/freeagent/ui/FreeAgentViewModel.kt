package com.sixninezerozero.freeagent.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sixninezerozero.freeagent.data.AppRepository
import com.sixninezerozero.freeagent.data.GeminiClient
import com.sixninezerozero.freeagent.data.GroqClient
import com.sixninezerozero.freeagent.data.SecureStore
import com.sixninezerozero.freeagent.data.UrlConnectionTransport
import com.sixninezerozero.freeagent.domain.AiCoordinator
import com.sixninezerozero.freeagent.domain.ApiFailure
import com.sixninezerozero.freeagent.domain.ApiKeyValidator
import com.sixninezerozero.freeagent.domain.AppScreen
import com.sixninezerozero.freeagent.domain.AppSettings
import com.sixninezerozero.freeagent.domain.ChatMessage
import com.sixninezerozero.freeagent.domain.ChatUiState
import com.sixninezerozero.freeagent.domain.ConversationPolicy
import com.sixninezerozero.freeagent.domain.MessageRole
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class FreeAgentViewModel(
    private val repository: AppRepository,
    private val coordinator: AiCoordinator,
) : ViewModel() {
    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private val requestInFlight = AtomicBoolean(false)

    init {
        viewModelScope.launch {
            runCatching {
                repository.loadSettings() to repository.loadMessages()
            }.onSuccess { (settings, messages) ->
                _state.update {
                    it.copy(
                        isInitialising = false,
                        settings = settings,
                        messages = messages,
                        screen = if (settings.hasAnyKey) AppScreen.Chat else AppScreen.Onboarding,
                    )
                }
            }.onFailure {
                _state.update {
                    it.copy(
                        isInitialising = false,
                        errorMessage = "Saved app data could not be opened. Add your API key again.",
                    )
                }
            }
        }
    }

    fun openSettings() {
        _state.update { it.copy(screen = AppScreen.Settings, errorMessage = null) }
    }

    fun closeSettings() {
        _state.update {
            it.copy(screen = if (it.settings.hasAnyKey) AppScreen.Chat else AppScreen.Onboarding)
        }
    }

    fun saveSettings(settings: AppSettings) {
        val cleaned = settings.copy(
            groqApiKey = ApiKeyValidator.normalise(settings.groqApiKey),
            geminiApiKey = ApiKeyValidator.normalise(settings.geminiApiKey),
            systemPrompt = settings.systemPrompt.trim(),
        )
        val validationError =
            ApiKeyValidator.errorFor(cleaned.groqApiKey, "Groq")
                ?: ApiKeyValidator.errorFor(cleaned.geminiApiKey, "Gemini")
                ?: when {
                    !cleaned.hasAnyKey -> "Add at least one API key."
                    cleaned.systemPrompt.isBlank() -> "The assistant instruction cannot be empty."
                    cleaned.systemPrompt.length > ConversationPolicy.MAX_SYSTEM_PROMPT_CHARACTERS ->
                        "The assistant instruction is too long."
                    else -> null
                }

        if (validationError != null) {
            _state.update { it.copy(errorMessage = validationError) }
            return
        }

        viewModelScope.launch {
            runCatching { repository.saveSettings(cleaned) }
                .onSuccess {
                    _state.update {
                        it.copy(
                            settings = cleaned,
                            screen = AppScreen.Chat,
                            errorMessage = null,
                        )
                    }
                }
                .onFailure {
                    _state.update {
                        it.copy(errorMessage = "Settings could not be saved securely. Please try again.")
                    }
                }
        }
    }

    fun sendMessage(rawText: String) {
        val text = rawText.trim()
        if (text.isEmpty() || _state.value.isLoading) return
        if (text.length > ConversationPolicy.MAX_USER_MESSAGE_CHARACTERS) {
            _state.update {
                it.copy(errorMessage = "Message is too long. Keep it under 12,000 characters.")
            }
            return
        }

        val userMessage = ChatMessage(role = MessageRole.USER, content = text)
        val messages = _state.value.messages + userMessage
        _state.update {
            it.copy(
                messages = messages,
                isLoading = true,
                errorMessage = null,
                fallbackNotice = null,
                failedMessageId = null,
            )
        }
        requestReply(messages, userMessage.id)
    }

    fun retryLastMessage() {
        val snapshot = _state.value
        val failedId = snapshot.failedMessageId ?: return
        if (snapshot.isLoading || snapshot.messages.none { it.id == failedId }) return

        _state.update {
            it.copy(
                isLoading = true,
                errorMessage = null,
                fallbackNotice = null,
            )
        }
        requestReply(snapshot.messages, failedId)
    }

    fun clearChat() {
        if (_state.value.isLoading) return
        viewModelScope.launch {
            runCatching { repository.clearMessages() }
                .onSuccess {
                    _state.update {
                        it.copy(messages = emptyList(), failedMessageId = null, errorMessage = null)
                    }
                }
                .onFailure {
                    _state.update { it.copy(errorMessage = "Chat history could not be cleared.") }
                }
        }
    }

    fun eraseEverything() {
        if (_state.value.isLoading) return
        viewModelScope.launch {
            runCatching { repository.eraseEverything() }
                .onSuccess {
                    _state.value = ChatUiState(isInitialising = false)
                }
                .onFailure {
                    _state.update { it.copy(errorMessage = "App data could not be erased.") }
                }
        }
    }

    fun dismissError() {
        _state.update { it.copy(errorMessage = null) }
    }

    fun dismissFallbackNotice() {
        _state.update { it.copy(fallbackNotice = null) }
    }

    private fun requestReply(messages: List<ChatMessage>, userMessageId: String) {
        if (!requestInFlight.compareAndSet(false, true)) return

        viewModelScope.launch {
            try {
                runCatching { repository.saveMessages(messages) }

                val reply = coordinator.reply(_state.value.settings, messages)
                val assistantMessage = ChatMessage(
                    role = MessageRole.ASSISTANT,
                    content = reply.text,
                    provider = reply.provider,
                )
                val completed = ConversationPolicy.trimForStorage(messages + assistantMessage)
                val persistFailure = runCatching { repository.saveMessages(completed) }.exceptionOrNull()

                _state.update {
                    it.copy(
                        messages = completed,
                        isLoading = false,
                        failedMessageId = null,
                        fallbackNotice = if (reply.fallbackUsed) {
                            "Groq was unavailable, so Gemini completed this reply."
                        } else {
                            null
                        },
                        errorMessage = if (persistFailure != null) {
                            "Reply received, but chat history could not be saved."
                        } else {
                            null
                        },
                    )
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: ApiFailure) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = failure.message,
                        failedMessageId = userMessageId,
                    )
                }
            } catch (_: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Something unexpected went wrong. Please try again.",
                        failedMessageId = userMessageId,
                    )
                }
            } finally {
                requestInFlight.set(false)
            }
        }
    }

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    require(modelClass.isAssignableFrom(FreeAgentViewModel::class.java))
                    val transport = UrlConnectionTransport()
                    return FreeAgentViewModel(
                        repository = AppRepository(SecureStore(context.applicationContext)),
                        coordinator = AiCoordinator(
                            groqClient = GroqClient(transport),
                            geminiClient = GeminiClient(transport),
                        ),
                    ) as T
                }
            }
    }
}
