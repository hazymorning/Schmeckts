package de.schmeckts.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

// A newer release from GitHub, installed over this one by Android's installer.

private const val LATEST = "https://api.github.com/repos/hazymorning/Schmeckts/releases/latest"
private const val APK = "schmeckts.apk"

private fun parts(v: String) = v.removePrefix("v").split(".").map { it.toIntOrNull() ?: 0 }

fun newer(
    a: String,
    b: String,
): Boolean {
    val x = parts(a)
    val y = parts(b)
    for (i in 0 until maxOf(x.size, y.size)) {
        val p = x.getOrElse(i) { 0 }
        val q = y.getOrElse(i) { 0 }
        if (p != q) return p > q
    }
    return false
}

/** state: '' not asked yet, asking, current, failed (GitHub out of reach), found, loading. later: „Später“ on the
 *  home card, until the next start. */
class Release(
    private val platform: Platform,
    private val http: Http,
) {
    var state by mutableStateOf("")
    var version by mutableStateOf("")
    var url = ""
    var share by mutableStateOf(0.0)
    var later by mutableStateOf(false)

    var onChanged: () -> Unit = {}

    fun canUpdate() = platform.canUpdate()

    suspend fun check() {
        if (!platform.canUpdate() || platform.version.isEmpty() || state == "asking" || state == "loading") return
        state = "asking"
        onChanged()
        try {
            val res = http.send("GET", LATEST, timeoutMs = 10_000)
            if (res.status !in 200..299) throw java.io.IOException("HTTP ${res.status}")
            val r = parseJson(res.body ?: "") as JsonObject
            // the APK is attached a few minutes after the release is published
            val apk = (r["assets"] as? JsonArray)?.mapNotNull { it as? JsonObject }?.find { it["name"].asString == APK }
            val tag = r["tag_name"].asString ?: ""
            if (apk != null && newer(tag, platform.version)) {
                state = "found"
                version = tag.removePrefix("v")
                url = apk["browser_download_url"].asString ?: ""
            } else {
                state = "current"
            }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            state = "failed" // offline, or GitHub busy: asked again on the next start
        }
        onChanged()
    }

    // returns once Android's installer is open; that asks before it replaces the app, and cancelling leaves all as it was
    suspend fun install() {
        if (state != "found") return
        state = "loading"
        share = 0.0
        onChanged()
        try {
            platform.install(url) {
                share = it
                onChanged()
            }
        } finally {
            state = "found"
            onChanged()
        }
    }
}
