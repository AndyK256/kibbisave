package com.kibbisave.app

import org.json.JSONObject
import java.net.HttpCookie
import java.net.HttpURLConnection

class ApiException(val status: Int, message: String) : Exception(message)
data class ApiReply(val body: JSONObject, val sessionCookie: String?, val expires: Long)

/** No browser, WebView, automatic redirects, request queue, or automatic write retries. */
class ApiClient(private val store: SecureStore) {
    fun request(path: String, body: JSONObject? = null, authenticated: Boolean = true): ApiReply {
        val connection = ApiAddress.resolve(BuildConfig.API_URL, path).toURL().openConnection() as HttpURLConnection
        connection.connectTimeout = 8_000
        connection.readTimeout = 15_000
        connection.instanceFollowRedirects = false
        connection.useCaches = false
        connection.requestMethod = if (body == null) "GET" else "POST"
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Cache-Control", "no-store")
        if (authenticated) store.session()?.let { connection.setRequestProperty("Cookie", it.cookie) }
        try {
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                val encoded = body.toString().toByteArray(Charsets.UTF_8)
                connection.setFixedLengthStreamingMode(encoded.size)
                connection.outputStream.use { it.write(encoded) }
            }
            val status = connection.responseCode
            if (status in 300..399) throw ApiException(status, "The API redirected to a website. Check the API address.")
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bytes = stream?.use { it.readBytesLimited(2 * 1024 * 1024) } ?: byteArrayOf()
            if (!connection.contentType.orEmpty().contains("application/json", ignoreCase = true)) {
                throw ApiException(status, "The server did not return an API response. Check the deployment.")
            }
            val data = try { JSONObject(String(bytes, Charsets.UTF_8)) }
                catch (_: Exception) { throw ApiException(status, "The server returned an unreadable response.") }
            if (status !in 200..299) throw ApiException(status, data.optString("error", "Request failed ($status)").take(220))
            val cookies = connection.headerFields.entries.filter { it.key.equals("Set-Cookie", true) }
                .flatMap { it.value.orEmpty() }.flatMap { try { HttpCookie.parse(it) } catch (_: Exception) { emptyList() } }
            val cookie = cookies.firstOrNull { it.name == "kibbisave_token" }
            val expiry = System.currentTimeMillis() + minOf(cookie?.maxAge?.takeIf { it >= 0 } ?: 604800L, 604800L) * 1000
            return ApiReply(data, cookie?.let { "${it.name}=${it.value}" }, expiry)
        } finally { connection.disconnect() }
    }
}

private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
    val buffer = java.io.ByteArrayOutputStream()
    val chunk = ByteArray(8192)
    while (true) {
        val count = read(chunk)
        if (count < 0) break
        if (buffer.size() + count > limit) throw ApiException(502, "The API response was too large.")
        buffer.write(chunk, 0, count)
    }
    return buffer.toByteArray()
}
