package de.schmeckts.app

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import java.net.URLEncoder

const val PROTOCOL = 1

/** kind: offline, auth, locked (too many attempts), busy (cost brake), unavailable, server, bad or input */
class ServerError(
    val kind: String,
    var text: String,
    val status: Int = 0,
    val timeout: Boolean = false,
) : Exception() {
    var retry = false
    override val message: String get() = text
}

// private ranges and local names; host comes from the parsed address, so it is already normalised
private fun isHome(host: String): Boolean {
    val name = host.removeSuffix(".")
    if (name == "localhost" || Regex("\\.(local|home\\.arpa)$").containsMatchIn(name)) return true
    Regex("^(\\d+)\\.(\\d+)\\.\\d+\\.\\d+$").matchEntire(name)?.let {
        val a = it.groupValues[1].toInt()
        val b = it.groupValues[2].toInt()
        return a == 10 || a == 127 || (a == 172 && b in 16..31) || (a == 192 && b == 168) || (a == 100 && b in 64..127)
    }
    val v6 = Regex("^\\[?([0-9a-f]{1,4}):").find(name)
    val h = v6?.let { Integer.parseInt(it.groupValues[1], 16) } ?: 0
    return (h and 0xfe00) == 0xfc00 || (h and 0xffc0) == 0xfe80
}

// a host ending in a number is an IPv4 address in any form a browser takes (3232235777, 0xc0.168.1.1, 192.168.257)
private fun dottedOf(host: String): String? {
    val parts = host.removeSuffix(".").split(".")
    if (!Regex("\\d+|0[xX][0-9a-fA-F]*").matches(parts.last())) return null
    val bad = ServerError("input", "Das ist keine gültige Adresse.")
    val n =
        parts.map { p ->
            when {
                p.startsWith("0x", true) -> if (p.length == 2) 0L else p.substring(2).toLongOrNull(16)
                p.length > 1 && p.startsWith("0") -> p.substring(1).toLongOrNull(8)
                else -> p.toLongOrNull()
            } ?: throw bad
        }
    if (n.size > 4 || n.dropLast(1).any { it > 255 } || n.last() >= 1L shl (8 * (5 - n.size))) throw bad
    val ip = n.dropLast(1).fold(0L) { acc, x -> acc shl 8 or x } shl (8 * (5 - n.size)) or n.last()
    return (3 downTo 0).joinToString(".") { (ip shr (8 * it) and 255).toString() }
}

// every address passes here, so plain http is refused outside the home network in one place
fun normServer(s: String?): String {
    var v = (s ?: "").trim().replace(Regex("/+$"), "")
    if (v.isEmpty()) return ""
    if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(v)) v = "http://$v"
    val host = Regex("^https?://(?:[^@/?#]*@)?(\\[[^]]*]|[^/?#:]*)", RegexOption.IGNORE_CASE).find(v)!!.groupValues[1]
    val v6 = host.startsWith("[") // as written: OkHttp turns ::ffff:192.168.1.1 into an IPv4 address
    val dotted = if (v6) null else dottedOf(host)
    val url =
        (if (dotted != null) v.replaceFirst(host, dotted) else v).toHttpUrlOrNull()
            ?: throw ServerError("input", "Das ist keine gültige Adresse.")
    if (url.scheme != "https" && !isHome(if (v6) host.lowercase() else url.host)) {
        throw ServerError("input", "Außerhalb des Heimnetzes geht es nur mit https.")
    }
    return v
}

// "k7pm 3qxd" → "K7PM-3QXD"
fun normCode(s: String?): String {
    val v = (s ?: "").uppercase().replace(Regex("[^A-Z0-9]"), "")
    return if (v.length == 8) v.substring(0, 4) + "-" + v.substring(4) else v
}

fun encodeUri(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

class Api(
    private val store: Store,
    private val http: Http,
) {
    suspend fun request(
        method: String,
        path: String,
        body: JsonElement? = null,
        code: String = store.prefs.code,
        base: String = store.prefs.server,
        timeout: Long = 20_000,
    ): JsonObject {
        val root = normServer(base)
        val headers = LinkedHashMap<String, String>()
        if (code.isNotEmpty()) headers["Authorization"] = "Bearer $code"
        if (body != null) headers["Content-Type"] = "application/json"
        val sent = store.clock.now()
        val res =
            try {
                http.send(method, root + path, headers, body?.stringify(), timeout)
            } catch (e: Http.Offline) {
                throw ServerError(
                    "offline",
                    if (e.timedOut) "Der Server antwortet nicht." else "Der Server ist nicht erreichbar.",
                    timeout = e.timedOut,
                )
            }
        // an answer without JSON is judged by its status below
        val data = res.body?.let { runCatching { parseJson(it) }.getOrNull() } as? JsonObject
        store.clock.measure(data?.get("now").asDouble, sent, store.clock.now())
        val ok = res.status in 200..299
        if (ok && data != null) return data
        val s = res.status
        val kind =
            when {
                s == 401 -> "auth"
                s == 429 -> if (path.startsWith("/api/recognize")) "busy" else "locked"
                s == 503 -> "unavailable"
                s >= 500 -> "server"
                ok -> "server"
                else -> "bad"
            }
        throw ServerError(kind, data?.get("error").asString ?: "Der Server meldet einen Fehler ($s).", s)
    }

    fun eventsUrl(): String = "${normServer(store.prefs.server)}/api/events?code=${encodeUri(store.prefs.code)}"
}
