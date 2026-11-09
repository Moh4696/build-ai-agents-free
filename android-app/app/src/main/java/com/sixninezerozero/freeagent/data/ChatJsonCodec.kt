package com.sixninezerozero.freeagent.data

import com.sixninezerozero.freeagent.domain.AiProvider
import com.sixninezerozero.freeagent.domain.ChatMessage
import com.sixninezerozero.freeagent.domain.MessageRole
import org.json.JSONArray
import org.json.JSONObject

object ChatJsonCodec {
    fun encode(messages: List<ChatMessage>): String {
        val array = JSONArray()
        messages.forEach { message ->
            array.put(
                JSONObject()
                    .put("id", message.id)
                    .put("role", message.role.name)
                    .put("content", message.content)
                    .put("timestampMillis", message.timestampMillis)
                    .put("provider", message.provider?.name ?: JSONObject.NULL),
            )
        }
        return array.toString()
    }

    fun decode(json: String): List<ChatMessage> {
        if (json.isBlank()) return emptyList()
        val array = JSONArray(json)
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                val role = runCatching { MessageRole.valueOf(item.getString("role")) }.getOrNull()
                    ?: continue
                val content = item.optString("content").trim()
                if (content.isEmpty()) continue
                val provider = item.optString("provider")
                    .takeIf(String::isNotBlank)
                    ?.let { runCatching { AiProvider.valueOf(it) }.getOrNull() }

                add(
                    ChatMessage(
                        id = item.optString("id").ifBlank { "restored-$index" },
                        role = role,
                        content = content,
                        timestampMillis = item.optLong("timestampMillis", 0L),
                        provider = provider,
                    ),
                )
            }
        }
    }
}
