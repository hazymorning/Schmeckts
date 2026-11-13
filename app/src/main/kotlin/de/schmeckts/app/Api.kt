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

// every address passes here, so plain http is refused outside the home network in one place
fun normServer(s: String?): String {
    var v = (s ?: "").trim().replace(Regex("/+$"), "")
    if (v.isEmpty()) return ""
    if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(v)) v = "http://$v"
    val url = v.toHttpUrlOrNull() ?: throw ServerError("input", "Das ist keine gültige Adresse.")
    if (url.scheme != "https" && !isHome(url.host)) throw ServerError("input", "Außerhalb des Heimnetzes geht es nur mit https.")
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
