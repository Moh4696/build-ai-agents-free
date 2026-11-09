package com.sixninezerozero.freeagent.domain

/** What kind of key a pasted value looks like, judged by its prefix. */
enum class KeyKind(val label: String) {
    GROQ("Groq"),
    GEMINI("Gemini"),
    OPENAI("OpenAI"),
    ANTHROPIC("Anthropic (Claude)"),
    ELEVENLABS("ElevenLabs"),
    UNKNOWN("unknown"),
}

object ApiKeyValidator {
    const val MINIMUM_KEY_LENGTH = 20
    const val MAXIMUM_KEY_LENGTH = 512

    // Whole keys only (with boundaries), so part of a key is never picked out on its own.
    private val groqToken = Regex("(?<![A-Za-z0-9_])gsk_[A-Za-z0-9]{48,}(?![A-Za-z0-9_])")
    private val geminiToken = Regex("(?<![0-9A-Za-z_-])AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])")
    private val quoteChars = "\"'`‘’“”<>«»"
    private val labelWords = setOf("api", "key", "apikey", "api_key", "token", "secret", "groq", "gemini", "google")

    /**
     * Cleans a pasted key. Phones often copy extra bits along with the key:
     * invisible characters, non-breaking spaces, quotes, a "Bearer " prefix or a label
     * such as "API key: ". This removes them so a correct key is not refused.
     */
    fun normalise(raw: String): String {
        val visible = buildString {
            for (char in raw) {
                when {
                    Character.getType(char) == Character.FORMAT.toInt() -> Unit // zero-width, BOM
                    char.isWhitespace() || Character.isSpaceChar(char) -> append(' ')
                    char.isISOControl() -> Unit
                    else -> append(char)
                }
            }
        }.trim()
        if (visible.isEmpty()) return ""

        val knownTokens = (groqToken.findAll(visible) + geminiToken.findAll(visible))
            .map { it.value }
            .toSet()
        if (knownTokens.size == 1) return knownTokens.first()

        var value = visible.trim { it.isWhitespace() || it in quoteChars }
        if (value.startsWith("bearer ", ignoreCase = true)) value = value.substring(7).trim()

        // "API key: abc..." -> drop a label in front of the key. Only clear labels are
        // dropped, so a key broken by a space is reported rather than silently cut short.
        val parts = value.split(' ').filter(String::isNotBlank)
        if (parts.size > 1 && parts.last().length >= MINIMUM_KEY_LENGTH) {
            val label = parts.dropLast(1)
            val endsLikeLabel = label.last().endsWith(':') || label.last().endsWith('=')
            val onlyLabelWords = label.all { it.lowercase().trimEnd(':', '=') in labelWords }
            if (endsLikeLabel || onlyLabelWords) value = parts.last()
        }
        return value.trim { it in quoteChars }
    }

    fun kindOf(key: String): KeyKind {
        val value = normalise(key)
        return when {
            value.startsWith("gsk_") -> KeyKind.GROQ
            value.startsWith("AIza") -> KeyKind.GEMINI
            value.startsWith("sk-ant-") -> KeyKind.ANTHROPIC
            value.startsWith("sk_") -> KeyKind.ELEVENLABS
            value.startsWith("sk-") -> KeyKind.OPENAI
            else -> KeyKind.UNKNOWN
        }
    }

    /** Returns a message explaining what is wrong, or null if the key can be checked. */
    fun errorFor(raw: String, provider: AiProvider): String? {
        val value = normalise(raw)
        val name = provider.displayName
        if (value.isEmpty()) return null
        if (value.length > MAXIMUM_KEY_LENGTH) return "$name key is too long. Copy just the key."
        if (value.any { it.isWhitespace() }) {
            return "$name key must not contain spaces. Copy just the key, without any other text."
        }
        if (value.any { it.code !in 0x21..0x7E }) {
            return "$name key contains characters a key can't have. Copy it again from the $name website."
        }

        val kind = kindOf(value)
        val expected = if (provider == AiProvider.GROQ) KeyKind.GROQ else KeyKind.GEMINI
        return when (kind) {
            expected, KeyKind.UNKNOWN ->
                if (value.length < MINIMUM_KEY_LENGTH) {
                    "$name key looks too short. Copy the whole key."
                } else {
                    null
                }
            KeyKind.GROQ, KeyKind.GEMINI ->
                "This is a ${kind.label} key. Paste it in the ${kind.label} box instead."
            else ->
                "This looks like an ${kind.label} key. This app only works with free Groq or " +
                    "Gemini keys. Tap \"Get a $name key\" to make one."
        }
    }

    /**
     * Puts each key in the right box when they were pasted the wrong way round.
     * Returns the corrected (groq, gemini) pair.
     */
    fun arrange(groqRaw: String, geminiRaw: String): Pair<String, String> {
        val groq = normalise(groqRaw)
        val gemini = normalise(geminiRaw)
        val groqKind = if (groq.isEmpty()) null else kindOf(groq)
        val geminiKind = if (gemini.isEmpty()) null else kindOf(gemini)

        val groqIsGemini = groqKind == KeyKind.GEMINI && (geminiKind == null || geminiKind == KeyKind.GROQ)
        val geminiIsGroq = geminiKind == KeyKind.GROQ && (groqKind == null || groqKind == KeyKind.GEMINI)
        return if (groqIsGemini || geminiIsGroq) gemini to groq else groq to gemini
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
    class InvalidCredentials(provider: String, detail: String? = null) :
        ApiFailure(
            buildString {
                append("$provider rejected the API key. Check it in Settings.")
                if (!detail.isNullOrBlank()) append(" ($detail)")
            },
        )

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
