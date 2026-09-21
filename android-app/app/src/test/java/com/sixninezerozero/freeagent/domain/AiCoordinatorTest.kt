package com.sixninezerozero.freeagent.domain

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AiCoordinatorTest {
    @Test
    fun `uses Groq first when both keys exist`() = runTest {
        val groq = FakeClient(AiProvider.GROQ, response = "primary")
        val gemini = FakeClient(AiProvider.GEMINI, response = "fallback")
        val coordinator = AiCoordinator(groq, gemini)

        val reply = coordinator.reply(settings(), listOf(userMessage()))

        assertEquals(AiProvider.GROQ, reply.provider)
        assertEquals("primary", reply.text)
        assertFalse(reply.fallbackUsed)
        assertEquals(1, groq.calls)
        assertEquals(0, gemini.calls)
    }

    @Test
    fun `falls back to Gemini when Groq fails`() = runTest {
        val groq = FakeClient(AiProvider.GROQ, failure = ApiFailure.RateLimited("Groq"))
        val gemini = FakeClient(AiProvider.GEMINI, response = "fallback")
        val coordinator = AiCoordinator(groq, gemini)

        val reply = coordinator.reply(settings(), listOf(userMessage()))

        assertEquals(AiProvider.GEMINI, reply.provider)
        assertTrue(reply.fallbackUsed)
        assertEquals(1, groq.calls)
        assertEquals(1, gemini.calls)
    }

    @Test
    fun `does not use fallback when it is disabled`() = runTest {
        val groq = FakeClient(AiProvider.GROQ, failure = ApiFailure.Network())
        val gemini = FakeClient(AiProvider.GEMINI, response = "fallback")
        val coordinator = AiCoordinator(groq, gemini)

        var thrown = false
        try {
            coordinator.reply(settings().copy(fallbackEnabled = false), listOf(userMessage()))
        } catch (_: ApiFailure.Network) {
            thrown = true
        }
        assertTrue(thrown)
        assertEquals(0, gemini.calls)
    }

    @Test
    fun `requires at least one credential`() {
        val coordinator = AiCoordinator(
            FakeClient(AiProvider.GROQ, response = "unused"),
            FakeClient(AiProvider.GEMINI, response = "unused"),
        )

        assertThrows(ApiFailure.MissingCredentials::class.java) {
            runTest { coordinator.reply(AppSettings(), listOf(userMessage())) }
        }
    }

    private fun settings() = AppSettings(
        groqApiKey = "gsk_abcdefghijklmnopqrstuvwxyz",
        geminiApiKey = "AIzaabcdefghijklmnopqrstuvwxyz",
    )

    private fun userMessage() = ChatMessage(
        role = MessageRole.USER,
        content = "Hello",
        timestampMillis = 0,
    )
}

private class FakeClient(
    override val provider: AiProvider,
    private val response: String = "",
    private val failure: ApiFailure? = null,
) : AiClient {
    var calls: Int = 0
        private set

    override suspend fun generate(
        apiKey: String,
        systemPrompt: String,
        messages: List<ChatMessage>,
    ): String {
        calls += 1
        failure?.let { throw it }
        return response
    }
}
