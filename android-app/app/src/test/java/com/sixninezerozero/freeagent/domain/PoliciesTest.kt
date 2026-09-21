package com.sixninezerozero.freeagent.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PoliciesTest {
    @Test
    fun `key validator accepts empty optional key and trims valid key`() {
        assertNull(ApiKeyValidator.errorFor("", "Gemini"))
        assertEquals("abcdefghijklmnopqrstuvwxyz", ApiKeyValidator.normalise("  abcdefghijklmnopqrstuvwxyz  "))
        assertNull(ApiKeyValidator.errorFor("abcdefghijklmnopqrstuvwxyz", "Groq"))
    }

    @Test
    fun `key validator rejects short and whitespace values`() {
        assertTrue(ApiKeyValidator.errorFor("short", "Groq")!!.contains("short"))
        assertTrue(
            ApiKeyValidator.errorFor("x".repeat(ApiKeyValidator.MAXIMUM_KEY_LENGTH + 1), "Groq")!!
                .contains("long"),
        )
        assertTrue(
            ApiKeyValidator.errorFor("abcdefghijklmnopqrst uvwxyz", "Gemini")!!
                .contains("spaces"),
        )
    }

    @Test
    fun `context keeps newest messages in order and begins with user`() {
        val messages = buildList {
            add(message(MessageRole.ASSISTANT, "orphaned assistant"))
            repeat(30) { index ->
                add(message(if (index % 2 == 0) MessageRole.USER else MessageRole.ASSISTANT, "message-$index"))
            }
        }

        val context = ConversationPolicy.contextForRequest(messages)

        assertTrue(context.size <= ConversationPolicy.MAX_CONTEXT_MESSAGES)
        assertEquals(MessageRole.USER, context.first().role)
        assertEquals("message-29", context.last().content)
    }

    @Test
    fun `storage keeps only the newest two hundred messages`() {
        val messages = (0 until 230).map { message(MessageRole.USER, it.toString()) }
        val stored = ConversationPolicy.trimForStorage(messages)

        assertEquals(ConversationPolicy.MAX_STORED_MESSAGES, stored.size)
        assertEquals("30", stored.first().content)
        assertEquals("229", stored.last().content)
    }

    @Test
    fun `storage also applies a bounded character budget`() {
        val chunk = "x".repeat(100_000)
        val messages = (0 until 10).map { message(MessageRole.USER, "$it$chunk") }

        val stored = ConversationPolicy.trimForStorage(messages)

        assertTrue(stored.sumOf { it.content.length } <= ConversationPolicy.MAX_STORED_CHARACTERS)
        assertEquals(messages.last().id, stored.last().id)
    }

    private fun message(role: MessageRole, content: String) = ChatMessage(
        id = content,
        role = role,
        content = content,
        timestampMillis = 0,
    )
}
