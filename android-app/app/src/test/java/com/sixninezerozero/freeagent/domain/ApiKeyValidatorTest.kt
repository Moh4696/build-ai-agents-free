package com.sixninezerozero.freeagent.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiKeyValidatorTest {
    private val groq = "gsk_" + "A1b2C3d4".repeat(6) + "Z9y8"
    private val gemini = "AIza" + "SyB-1234567890_abcdefghijklmnopqrst"

    @Test
    fun `sample keys have realistic shapes`() {
        assertEquals(56, groq.length)
        assertEquals(39, gemini.length)
    }

    @Test
    fun `clean keys are accepted unchanged`() {
        assertEquals(groq, ApiKeyValidator.normalise(groq))
        assertNull(ApiKeyValidator.errorFor(groq, AiProvider.GROQ))
        assertNull(ApiKeyValidator.errorFor(gemini, AiProvider.GEMINI))
    }

    @Test
    fun `extras copied from a phone are removed`() {
        val pastes = listOf(
            "​$groq​", // zero-width spaces
            "﻿$groq", // byte order mark
            " $groq \n", // non-breaking spaces and a line break
            "\"$groq\"", // straight quotes
            "“$groq”", // curly quotes
            "Bearer $groq",
            "API key: $groq",
            "GROQ_API_KEY=$groq",
            "Here is my key $groq thanks", // free text around a recognisable key
        )
        for (paste in pastes) {
            assertEquals("Failed for: $paste", groq, ApiKeyValidator.normalise(paste))
            assertNull("Failed for: $paste", ApiKeyValidator.errorFor(paste, AiProvider.GROQ))
        }
        assertEquals(gemini, ApiKeyValidator.normalise("Gemini key: '$gemini'"))
    }

    @Test
    fun `a key broken by a space is reported, not cut short`() {
        val broken = groq.substring(0, 30) + " " + groq.substring(30)
        assertEquals(broken, ApiKeyValidator.normalise(broken))
        assertTrue(ApiKeyValidator.errorFor(broken, AiProvider.GROQ)!!.contains("spaces"))
    }

    @Test
    fun `keys in the wrong box get a clear message`() {
        assertTrue(ApiKeyValidator.errorFor(gemini, AiProvider.GROQ)!!.contains("Gemini box"))
        assertTrue(ApiKeyValidator.errorFor(groq, AiProvider.GEMINI)!!.contains("Groq box"))
    }

    @Test
    fun `keys from other services are explained`() {
        val openAi = "sk-proj-" + "x".repeat(40)
        val eleven = "sk_" + "a1".repeat(24)
        val anthropic = "sk-ant-api03-" + "y".repeat(40)
        assertTrue(ApiKeyValidator.errorFor(openAi, AiProvider.GROQ)!!.contains("OpenAI"))
        assertTrue(ApiKeyValidator.errorFor(eleven, AiProvider.GROQ)!!.contains("ElevenLabs"))
        assertTrue(ApiKeyValidator.errorFor(anthropic, AiProvider.GEMINI)!!.contains("Anthropic"))
    }

    @Test
    fun `odd characters left in a key are refused`() {
        val accented = "abcdefghijklmnopqrstuvwxyé"
        assertTrue(ApiKeyValidator.errorFor(accented, AiProvider.GROQ)!!.contains("characters"))
    }

    @Test
    fun `swapped keys are put in the right boxes`() {
        assertEquals(groq to gemini, ApiKeyValidator.arrange(gemini, groq))
        assertEquals(groq to "", ApiKeyValidator.arrange("", groq))
        assertEquals("" to gemini, ApiKeyValidator.arrange(gemini, ""))
        assertEquals(groq to gemini, ApiKeyValidator.arrange(groq, gemini))
    }
}
