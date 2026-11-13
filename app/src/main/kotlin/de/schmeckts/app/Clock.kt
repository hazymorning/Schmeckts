package de.schmeckts.app

import java.security.SecureRandom

// "<ms, 13 digits>-<counter, 4 digits>-<device>", sortable as text; ms is our time plus the server offset

private val PATTERN = Regex("^(\\d{13})-(\\d{4})-([a-z0-9]{4,16})$")
private const val FUTURE = 10 * 60_000L // the server rejects clocks further ahead
private val random = SecureRandom()

fun randomId(len: Int = 16): String {
    val abc = "abcdefghijklmnopqrstuvwxyz0123456789"
    val bytes = ByteArray(len).also(random::nextBytes)
    return bytes.joinToString("") { abc[(it.toInt() and 0xff) % 36].toString() }
}

class Clock(
    val now: () -> Long = { Time.now() },
) {
    var device = ""
    var offset = 0L
    var ms = 0L
    var n = 0

    fun serverNow(): Long = now() + offset

    fun stamp(): String {
        val t = serverNow()
        if (t > ms) {
            ms = t
            n = 0
        } else if (++n > 9999) {
            ms++
            n = 0
        }
        return "${ms.toString().padStart(13, '0')}-${n.toString().padStart(4, '0')}-$device"
    }

    fun observe(t: String?) {
        val m = PATTERN.matchEntire(t ?: return) ?: return
        val ms = m.groupValues[1].toLong()
        val n = m.groupValues[2].toInt()
        if (ms > serverNow() + FUTURE) return
        if (ms > this.ms || (ms == this.ms && n > this.n)) {
            this.ms = ms
            this.n = n
        }
    }

    fun measure(
        server: Double?,
        sentAt: Long,
        receivedAt: Long,
    ) {
        if (server == null || receivedAt - sentAt > 10_000) return
        offset = jsRound(server - (sentAt + receivedAt) / 2.0)
    }

    // after the server rejected a clock
    fun rebase() {
        val t = serverNow()
        if (ms > t) {
            ms = t
            n = 0
        }
    }
}
