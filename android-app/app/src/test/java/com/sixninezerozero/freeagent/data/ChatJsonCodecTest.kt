package com.sixninezerozero.freeagent.data

import com.sixninezerozero.freeagent.domain.AiProvider
import com.sixninezerozero.freeagent.domain.ChatMessage
import com.sixninezerozero.freeagent.domain.MessageRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ChatJsonCodecTest {
    @Test
    fun `round trip preserves message fields`() {
        val messages = listOf(
            ChatMessage("user-1", MessageRole.USER, "Hello", 123L),
            ChatMessage("assistant-1", MessageRole.ASSISTANT, "Hi", 456L, AiProvider.GROQ),
        )

        assertEquals(messages, ChatJsonCodec.decode(ChatJsonCodec.encode(messages)))
    }

    @Test
    fun `decode skips unknown roles and blank messages`() {
        val stored = """[
            {"id":"bad-role","role":"TOOL","content":"ignored"},
            {"id":"blank","role":"USER","content":"   "},
            {"id":"kept","role":"USER","content":" hello ","timestampMillis":9}
        ]"""

        val decoded = ChatJsonCodec.decode(stored)

        assertEquals(1, decoded.size)
        assertEquals("kept", decoded.single().id)
        assertEquals("hello", decoded.single().content)
    }

    @Test
    fun `malformed document is rejected so the repository can recover`() {
        assertThrows(Exception::class.java) { ChatJsonCodec.decode("not-json") }
    }
}
