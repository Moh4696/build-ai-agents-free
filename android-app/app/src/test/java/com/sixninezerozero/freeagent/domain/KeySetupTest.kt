package com.sixninezerozero.freeagent.domain

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class KeySetupTest {
    private val groq = "gsk_" + "A1b2C3d4".repeat(6) + "Z9y8"
    private val gemini = "AIza" + "SyB-1234567890_abcdefghijklmnopqrst"

    @Test
    fun `working key is saved with a confirmation`() = runTest {
        val checker = FakeChecker(KeyCheck.Works)
        val result = KeySetup(checker).prepare(" API key: $groq​", "")

        assertTrue(result.canSave)
        assertEquals(groq, result.groqKey)
        assertEquals(listOf(AiProvider.GROQ to groq), checker.calls)
        assertTrue(result.notice!!.contains("Groq key works"))
    }

    @Test
    fun `rejected key blocks saving and says why`() = runTest {
        val result = KeySetup(FakeChecker(KeyCheck.Rejected("Invalid API Key"))).prepare(groq, "")

        assertFalse(result.canSave)
        assertTrue(result.groqError!!.contains("isn't valid"))
        assertTrue(result.groqError!!.contains("Invalid API Key"))
    }

    @Test
    fun `no internet still saves with a warning`() = runTest {
        val result = KeySetup(FakeChecker(KeyCheck.NoConnection)).prepare("", gemini)

        assertTrue(result.canSave)
        assertTrue(result.notice!!.contains("no internet"))
    }

    @Test
    fun `swapped keys are fixed and both are checked`() = runTest {
        val checker = FakeChecker(KeyCheck.Works)
        val result = KeySetup(checker).prepare(gemini, groq)

        assertTrue(result.canSave)
        assertEquals(groq, result.groqKey)
        assertEquals(gemini, result.geminiKey)
        assertEquals(listOf(AiProvider.GROQ to groq, AiProvider.GEMINI to gemini), checker.calls)
        assertTrue(result.notice!!.contains("swapped"))
    }

    @Test
    fun `format problems are reported without calling the provider`() = runTest {
        val checker = FakeChecker(KeyCheck.Works)
        val result = KeySetup(checker).prepare("sk-proj-" + "x".repeat(40), "")

        assertFalse(result.canSave)
        assertNotNull(result.groqError)
        assertTrue(checker.calls.isEmpty())
    }

    @Test
    fun `empty form asks for a key`() = runTest {
        val result = KeySetup(FakeChecker(KeyCheck.Works)).prepare("  ", "​")

        assertFalse(result.canSave)
        assertNull(result.groqError)
        assertNotNull(result.generalError)
    }

    private class FakeChecker(private val answer: KeyCheck) : KeyChecker {
        val calls = mutableListOf<Pair<AiProvider, String>>()

        override suspend fun check(provider: AiProvider, apiKey: String): KeyCheck {
            calls += provider to apiKey
            return answer
        }
    }
}
