package de.schmeckts.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

private const val MAX_CHANGES = 500
private const val MAX_BYTES = 8_000_000 // server limit: 500 changes and 12 MB per request
private const val CHECK_EVERY = 5 * 60_000L
private const val INFO_EVERY = 10 * 60_000L

/** state: off, wait, ok, offline or error; recognition and features are null until /api/info answered */
class SyncStatus(
    connected: Boolean,
) {
    var state by mutableStateOf(if (connected) "wait" else "off")
    var kind by mutableStateOf("")
    var message by mutableStateOf("")
    var busy by mutableStateOf(false)
    var lastOk by mutableStateOf(0L)
    var live by mutableStateOf(false)
    var recognition by mutableStateOf<Boolean?>(null)
    var features by mutableStateOf<List<String>?>(null)
}

class Connection(
    val code: String,
    val base: String,
    val serverInfo: JsonObject,
)

class Sync(
    private val store: Store,
    private val api: Api,
    private val http: Http,
    private val scope: CoroutineScope,
    private val report: (String, Any?) -> Unit,
    private val visible: () -> Boolean,
) {
    val prefs get() = store.prefs

    fun isConnected() = prefs.code.isNotEmpty()

    val status = SyncStatus(isConnected())

    // nothing waits on a server the last sync could not reach
    fun reachable() = isConnected() && status.state != "offline"

    // an older server rejects collections it does not know, so changes to those wait in the queue; checksum likewise
    private fun serverColls() = if (status.features?.contains("collections") == true) COLLECTIONS else BASE

    private fun sendable(x: Change) = x.c in serverColls()

    fun pending() = store.queue.filter(::sendable)

    fun held() = store.queue.filterNot(::sendable)

    var onStatus: () -> Unit = {}
    var onReachable: () -> Unit = {}

    private var timer: Job? = null
    private var running: Deferred<Unit>? = null
    private var again = false
    private var failures = 0
    private var pauseUntil = 0L
    private var checkedAt = 0L
    private var infoAt = 0L
    private var mismatches = 0
    private var es: AutoCloseable? = null

    private fun setStatus(patch: SyncStatus.() -> Unit) {
        status.patch()
        onStatus()
    }

    fun syncSoon(ms: Long = 400) {
        if (!isConnected()) return
        timer?.cancel()
        timer =
            scope.launch {
                delay(ms)
                syncNow()
            }
    }

    fun syncNow(): Deferred<Unit> {
        timer?.cancel()
        if (!isConnected()) return CompletableDeferred(Unit)
        running?.let {
            again = true
            return it
        }
        val run =
            scope.async {
                // an unexpected error must never block the sync for good
                try {
                    do {
                        again = false
                        cycle()
                    } while (again && isConnected())
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    report("sync", e)
                } finally {
                    running = null
                }
            }
        if (run.isActive) running = run
        return run
    }

    private suspend fun cycle() {
        if (Time.now() < pauseUntil || status.kind == "auth" || status.kind == "protocol") return
        try {
            setStatus { busy = true }
            if (Time.now() - infoAt > INFO_EVERY) checkInfo()
            push()
            pull()
            if (pending().isNotEmpty()) push()
            verify()
            if (!isConnected()) return // disconnected meanwhile
            failures = 0
            setStatus {
                state = "ok"
                kind = ""
                message = ""
                lastOk = Time.now()
            }
            openLive()
            onReachable()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            reportFailure(e)
        } finally {
            setStatus { busy = false }
        }
    }

    private fun reportFailure(error: Exception) {
        if (!isConnected()) return // a request still on its way when the connection was ended
        val e =
            if (error is ServerError) {
                error
            } else {
                report("sync", error)
                ServerError("bad", "Beim Abgleich ist ein Fehler aufgetreten.")
            }
        closeLive()
        failures++
        if (e.kind == "offline") {
            setStatus {
                state = "offline"
                kind = ""
                message = e.text
            }
            syncSoon(minOf(60_000L, 5_000L * (1L shl minOf(failures - 1, 10))))
            return
        }
        if (e.kind == "locked") {
            pauseUntil = Time.now() + 10 * 60_000L
        } else if (e.kind != "auth" && e.kind != "protocol" && e.kind != "input") {
            syncSoon(minOf(5 * 60_000L, 15_000L * (1L shl minOf(failures, 10))))
        }
        setStatus {
            state = "error"
            kind = e.kind
            message = e.text
        }
    }

    private suspend fun checkInfo(timeout: Long = 20_000) {
        // without a code, so it does not count as a failed attempt
        val serverInfo = api.request("GET", "/api/info", code = "", timeout = timeout)
        val problem = protocolProblem(serverInfo)
        if (problem.isNotEmpty()) throw ServerError("protocol", problem)
        abilities(serverInfo)
        infoAt = Time.now()
    }

    private fun abilities(serverInfo: JsonObject) {
        status.recognition = serverInfo["recognition"].truthy
        status.features = (serverInfo["features"] as? JsonArray)?.mapNotNull { it.asString } ?: emptyList()
    }

    suspend fun serverCan(feature: String): Boolean {
        if (!isConnected()) return false
        // offline or an old server: the feature counts as missing, nothing to report
        if (status.features == null) runCatching { checkInfo(5_000) }
        return status.features?.contains(feature) == true
    }

    private fun protocolProblem(serverInfo: JsonObject): String {
        if (serverInfo["app"].asString != "schmeckts") return "Unter dieser Adresse läuft kein Schmeckt’s-Server."
        val p = serverInfo["protocol"].asDouble
        if (p != null && p > PROTOCOL) return "Der Server ist neuer als diese App. Bitte die App aktualisieren."
        if (p != PROTOCOL.toDouble()) return "Der Server ist älter als diese App. Bitte den Server aktualisieren."
        return ""
    }

    private fun batch(limit: Int): List<Change> {
        val out = mutableListOf<Change>()
        var bytes = 20
        for (x in pending()) {
            val size =
                x
                    .toJson()
                    .stringify()
                    .toByteArray(Charsets.UTF_8)
                    .size + 1
            if (out.isNotEmpty() && (out.size >= limit || bytes + size > MAX_BYTES)) break
            out.add(x)
            bytes += size
        }
        return out
    }

    private suspend fun push() {
        var limit = MAX_CHANGES
        var clockRounds = 0
        while (pending().isNotEmpty()) {
            val changes = batch(limit)
            val res =
                try {
                    api.request("POST", "/api/changes", jsonObject("changes" to JsonArray(changes.map { it.toJson() })), timeout = 60_000)
                } catch (e: ServerError) {
                    if (e.status != 413) throw e
                    if (changes.size > 1) {
                        limit = (changes.size + 1) / 2
                        continue
                    }
                    store.ack(listOf(changes[0].id))
                    store.log("change too large for the server, dropped")
                    continue
                }
            val done = (res["ok"] as? JsonArray)?.mapNotNull { it.asString }?.toMutableList() ?: mutableListOf()
            var clock = 0
            for (r in (res["rejected"] as? JsonArray).orEmpty()) {
                val o = r as? JsonObject ?: continue
                val id = o["id"].asString ?: continue
                if (o["reason"].asString == "clock") {
                    store.restamp(id)
                    clock++
                } else {
                    done.add(id)
                    store.log("change dropped: ${o["detail"].asString?.takeIf { it.isNotEmpty() } ?: o["reason"].asString}")
                }
            }
            store.ack(done)
            if (clock > 0 && ++clockRounds > 3) throw ServerError("bad", "Die Uhrzeit dieses Handys weicht zu stark ab.")
            if (done.isEmpty() && clock == 0) throw ServerError("server", "Der Server hat die Änderungen nicht angenommen.")
        }
    }

    private fun recordsOf(res: JsonObject) = (res["records"] as? JsonArray).orEmpty().mapNotNull(Remote::of)

    private suspend fun pull() {
        val known = store.state.epoch
        val query = if (known.isNotEmpty()) "since=${store.state.seq}&epoch=${encodeUri(known)}" else "since=0"
        val res = api.request("GET", "/api/changes?$query", timeout = 60_000)
        val records = recordsOf(res)
        val epoch = res["epoch"].asString ?: ""
        if (epoch != known) {
            // first connection, or the server restored from a backup
            if (known.isNotEmpty()) store.log("the server was restored, doing a full sync")
            store.reconcile(records)
            checkedAt = 0
        } else if (records.isNotEmpty()) {
            store.merge(records)
        }
        store.setPosition(epoch, res["seq"].asLong ?: 0)
    }

    private suspend fun verify() {
        if (pending().isNotEmpty() || Time.now() - checkedAt < CHECK_EVERY) return
        val colls = serverColls()
        val res = api.request("GET", "/api/checksum?c=" + colls.joinToString(","))
        checkedAt = Time.now()
        if (res["epoch"].asString != store.state.epoch || res["seq"].asLong != store.state.seq) {
            again = true // changed meanwhile, catch up first
            return
        }
        val (sum, fields) = store.checksum(colls)
        if (pending().isNotEmpty()) return
        if (sum == res["sum"].asString) {
            mismatches = 0
            return
        }
        val theirs = res["fields"].asLong
        if (mismatches++ > 0) {
            if (mismatches == 2) store.log("checksum still differs after a full sync ($fields against $theirs fields)")
            return
        }
        store.log("checksum differs ($fields against $theirs fields), doing a full sync")
        val all = api.request("GET", "/api/changes?since=0", timeout = 60_000)
        store.reconcile(recordsOf(all))
        store.setPosition(all["epoch"].asString ?: "", all["seq"].asLong ?: 0)
        push()
        checkedAt = 0
        verify()
    }

    private fun openLive() {
        if (es != null || !isConnected() || !visible()) return
        es =
            http.events(api.eventsUrl(), { type, data ->
                scope.launch {
                    if (type != "seq") return@launch
                    val x = runCatching { parseJson(data) as JsonObject }.getOrNull() ?: return@launch // the next cycle catches up anyway
                    if (!status.live) setStatus { live = true }
                    if (x["epoch"].asString != store.state.epoch || (x["seq"].asLong ?: 0) > store.state.seq) syncSoon(50)
                }
            }, {
                scope.launch {
                    closeLive() // no endless retry, the next cycle reconnects
                    syncSoon(5_000)
                }
            })
    }

    fun closeLive() {
        es?.close()
        es = null
        if (status.live) setStatus { live = false }
    }

    suspend fun checkServer(
        codeInput: String,
        serverInput: String,
    ): Connection {
        val code = normCode(codeInput)
        val base = normServer(serverInput)
        if (base.isEmpty()) throw ServerError("input", "Bitte die Adresse des Servers eintragen.")
        if (code.length != 9) throw ServerError("input", "Der Haushaltscode hat acht Zeichen, zum Beispiel K7PM-3QXD.")
        val serverInfo =
            try {
                api.request("GET", "/api/info", code = code, base = base, timeout = 10_000)
            } catch (e: ServerError) {
                if (e.kind == "offline") e.text = "Der Server ist nicht erreichbar. Bist du im WLAN zu Hause oder ist WireGuard an?"
                throw e
            }
        val problem = protocolProblem(serverInfo)
        if (problem.isNotEmpty()) throw ServerError("protocol", problem)
        if (!serverInfo["auth"].truthy) throw ServerError("auth", serverInfo["error"].asString ?: "Der Haushaltscode stimmt nicht.")
        return Connection(code, base, serverInfo)
    }

    fun startSession(c: Connection): Deferred<Unit> {
        if (prefs.server.isNotEmpty() && prefs.server != c.base) store.resetSync()
        prefs.server = c.base
        prefs.code = c.code
        store.savePrefs()
        failures = 0
        pauseUntil = 0
        mismatches = 0
        checkedAt = 0
        infoAt = Time.now()
        setStatus {
            state = "wait"
            kind = ""
            message = ""
        }
        abilities(c.serverInfo)
        onStatus()
        return syncNow()
    }

    suspend fun caughtUp(ms: Long) {
        val run = syncNow()
        withTimeoutOrNull(ms) { run.await() }
    }

    fun retrySync(): Deferred<Unit> {
        if (status.kind == "protocol" || status.kind == "locked") {
            status.kind = ""
            pauseUntil = 0
        }
        infoAt = 0
        checkedAt = 0
        return syncNow()
    }

    fun disconnect() {
        closeLive()
        timer?.cancel()
        prefs.code = ""
        store.savePrefs()
        store.resetSync() // data stays here; the next connection does a full sync
        setStatus {
            state = "off"
            kind = ""
            message = ""
            lastOk = 0
            recognition = null
            features = null
        }
    }

    private var ticker: Job? = null

    fun start() {
        ticker?.cancel()
        ticker =
            scope.launch {
                while (true) {
                    delay(60_000)
                    if (visible()) syncSoon(0)
                }
            }
        syncSoon(0)
    }

    fun stop() {
        ticker?.cancel()
        timer?.cancel()
        closeLive()
    }

    // the app went to the background or came back
    fun shown(on: Boolean) {
        if (!on) {
            closeLive()
            scope.launch { store.flush() }
        } else {
            syncSoon(50)
        }
    }

    // the network came back
    fun online() = syncSoon(50)
}
