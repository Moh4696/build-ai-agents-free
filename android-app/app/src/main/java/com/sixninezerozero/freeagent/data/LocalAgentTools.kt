package com.sixninezerozero.freeagent.data

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import java.time.Clock
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

private const val MAX_TOOL_ARGUMENT_CHARACTERS = 16_000
private const val MAX_EXPRESSION_CHARACTERS = 240
private const val MAX_RESULT_CHARACTERS = 1_000
private val CALCULATION_CONTEXT = MathContext(16, RoundingMode.HALF_EVEN)

class LocalAgentTools(
    private val clock: Clock = Clock.systemDefaultZone(),
) {
    fun definitions(): JSONArray = JSONArray()
        .put(
            functionDefinition(
                name = "calculator",
                description = "Safely evaluate basic arithmetic with +, -, *, /, %, decimals and parentheses.",
                properties = JSONObject().put(
                    "expression",
                    JSONObject()
                        .put("type", "string")
                        .put("description", "The arithmetic expression to evaluate."),
                ),
                required = JSONArray().put("expression"),
            ),
        )
        .put(
            functionDefinition(
                name = "word_count",
                description = "Count whitespace-separated words in supplied text.",
                properties = JSONObject().put(
                    "text",
                    JSONObject()
                        .put("type", "string")
                        .put("description", "The text whose words should be counted."),
                ),
                required = JSONArray().put("text"),
            ),
        )
        .put(
            functionDefinition(
                name = "current_date_time",
                description = "Read the current date, time and time zone from this Android device.",
                properties = JSONObject(),
                required = JSONArray(),
            ),
        )

    fun executeSafely(name: String, rawArguments: String): String {
        val outcome = runCatching {
            require(rawArguments.length <= MAX_TOOL_ARGUMENT_CHARACTERS) {
                "Tool arguments are too large."
            }
            val arguments = if (rawArguments.isBlank()) JSONObject() else JSONObject(rawArguments)
            when (name) {
                "calculator" -> calculate(arguments.getString("expression"))
                "word_count" -> countWords(arguments.getString("text")).toString()
                "current_date_time" -> currentDateTime()
                else -> error("Unknown tool.")
            }
        }

        return outcome.fold(
            onSuccess = { result ->
                JSONObject()
                    .put("ok", true)
                    .put("result", result.take(MAX_RESULT_CHARACTERS))
                    .toString()
            },
            onFailure = { failure ->
                JSONObject()
                    .put("ok", false)
                    .put("error", failure.message?.take(160) ?: "Tool could not complete the request.")
                    .toString()
            },
        )
    }

    private fun calculate(expression: String): String {
        require(expression.isNotBlank()) { "Expression is empty." }
        require(expression.length <= MAX_EXPRESSION_CHARACTERS) { "Expression is too long." }
        val value = DecimalExpressionParser(expression).parse()
        val rendered = value.stripTrailingZeros().toPlainString()
        require(rendered.length <= MAX_RESULT_CHARACTERS) { "Calculation result is too large." }
        return rendered
    }

    private fun countWords(text: String): Int =
        text.trim().takeIf(String::isNotEmpty)?.split(Regex("\\s+"))?.size ?: 0

    private fun currentDateTime(): String = ZonedDateTime.now(clock).format(
        DateTimeFormatter.ofPattern("EEEE, d MMMM uuuu 'at' HH:mm:ss z", Locale.getDefault()),
    )

    private fun functionDefinition(
        name: String,
        description: String,
        properties: JSONObject,
        required: JSONArray,
    ): JSONObject = JSONObject()
        .put("type", "function")
        .put(
            "function",
            JSONObject()
                .put("name", name)
                .put("description", description)
                .put(
                    "parameters",
                    JSONObject()
                        .put("type", "object")
                        .put("properties", properties)
                        .put("required", required)
                        .put("additionalProperties", false),
                ),
        )
}

private class DecimalExpressionParser(
    private val source: String,
) {
    private var index = 0

    fun parse(): BigDecimal {
        val result = parseExpression()
        skipWhitespace()
        require(index == source.length) { "Unexpected character at position ${index + 1}." }
        return result
    }

    private fun parseExpression(): BigDecimal {
        var value = parseTerm()
        while (true) {
            value = when {
                consume('+') -> value.add(parseTerm(), CALCULATION_CONTEXT)
                consume('-') -> value.subtract(parseTerm(), CALCULATION_CONTEXT)
                else -> return value
            }
        }
    }

    private fun parseTerm(): BigDecimal {
        var value = parseUnary()
        while (true) {
            value = when {
                consume('*') -> value.multiply(parseUnary(), CALCULATION_CONTEXT)
                consume('/') -> {
                    val divisor = parseUnary()
                    require(divisor.compareTo(BigDecimal.ZERO) != 0) { "Division by zero is not allowed." }
                    value.divide(divisor, CALCULATION_CONTEXT)
                }
                consume('%') -> {
                    val divisor = parseUnary()
                    require(divisor.compareTo(BigDecimal.ZERO) != 0) { "Division by zero is not allowed." }
                    value.remainder(divisor, CALCULATION_CONTEXT)
                }
                else -> return value
            }
        }
    }

    private fun parseUnary(): BigDecimal = when {
        consume('+') -> parseUnary()
        consume('-') -> parseUnary().negate(CALCULATION_CONTEXT)
        else -> parsePrimary()
    }

    private fun parsePrimary(): BigDecimal {
        if (consume('(')) {
            val value = parseExpression()
            require(consume(')')) { "Missing closing parenthesis." }
            return value
        }

        skipWhitespace()
        val start = index
        var sawDigit = false
        var sawDecimalPoint = false
        while (index < source.length) {
            when {
                source[index].isDigit() -> {
                    sawDigit = true
                    index += 1
                }
                source[index] == '.' && !sawDecimalPoint -> {
                    sawDecimalPoint = true
                    index += 1
                }
                else -> break
            }
        }
        require(sawDigit) { "Expected a number at position ${start + 1}." }
        return source.substring(start, index).toBigDecimal(CALCULATION_CONTEXT)
    }

    private fun consume(expected: Char): Boolean {
        skipWhitespace()
        if (source.getOrNull(index) != expected) return false
        index += 1
        return true
    }

    private fun skipWhitespace() {
        while (source.getOrNull(index)?.isWhitespace() == true) index += 1
    }
}
