package com.sixninezerozero.freeagent.data

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class HttpRequest(
    val url: String,
    val method: String = "POST",
    val headers: Map<String, String>,
    val body: String = "",
    val connectTimeoutMillis: Int = 15_000,
    val readTimeoutMillis: Int = 60_000,
)

data class HttpResponse(
    val statusCode: Int,
    val body: String,
)

interface HttpTransport {
    suspend fun send(request: HttpRequest): HttpResponse
}

class UrlConnectionTransport(
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : HttpTransport {
    override suspend fun send(request: HttpRequest): HttpResponse = withContext(ioDispatcher) {
        val sendsBody = request.method == "POST"
        val connection = URL(request.url).openConnection() as HttpURLConnection

        try {
            connection.apply {
                requestMethod = request.method
                connectTimeout = request.connectTimeoutMillis
                readTimeout = request.readTimeoutMillis
                doInput = true
                doOutput = sendsBody
                instanceFollowRedirects = false
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                request.headers.forEach(::setRequestProperty)
            }

            if (sendsBody) {
                connection.outputStream.use { output ->
                    output.write(request.body.toByteArray(Charsets.UTF_8))
                }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            HttpResponse(statusCode = status, body = responseBody)
        } finally {
            connection.disconnect()
        }
    }
}
