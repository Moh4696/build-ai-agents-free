package com.sixninezerozero.freeagent.data

import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalAgentToolsTest {
    private val tools = LocalAgentTools(
        Clock.fixed(Instant.parse("2026-08-15T12:34:56Z"), ZoneOffset.UTC),
    )

    @Test
    fun `calculator respects precedence parentheses and unary signs`() {
        assertToolResult("14", "calculator", """{"expression":"2 + 3 * 4"}""")
        assertToolResult("-10", "calculator", """{"expression":"-(2 + 3) * 2"}""")
        assertToolResult("2.5", "calculator", """{"expression":"10 / 4"}""")
    }

    @Test
    fun `calculator rejects division by zero without throwing out of the tool boundary`() {
        val response = JSONObject(
            tools.executeSafely("calculator", """{"expression":"4 / 0"}"""),
        )

        assertFalse(response.getBoolean("ok"))
        assertTrue(response.getString("error").contains("zero"))
    }

    @Test
    fun `word count handles repeated and Unicode whitespace`() {
        assertToolResult(
            "4",
            "word_count",
            """{"text":"one  two\nthree\tfour"}""",
        )
    }

    @Test
    fun `current date time uses the injected device clock`() {
        val response = JSONObject(tools.executeSafely("current_date_time", "{}"))

        assertTrue(response.getBoolean("ok"))
        assertTrue(response.getString("result").contains("2026"))
        assertTrue(response.getString("result").contains("12:34:56"))
    }

    @Test
    fun `unknown tools are refused`() {
        val response = JSONObject(tools.executeSafely("run_shell", "{}"))

        assertFalse(response.getBoolean("ok"))
    }

    private fun assertToolResult(expected: String, name: String, arguments: String) {
        val response = JSONObject(tools.executeSafely(name, arguments))
        assertTrue(response.getBoolean("ok"))
        assertEquals(expected, response.getString("result"))
    }
}
