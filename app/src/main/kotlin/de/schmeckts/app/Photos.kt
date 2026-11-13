package de.schmeckts.app

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okio.ByteString.Companion.decodeBase64
import okio.ByteString.Companion.toByteString
import java.io.File
import java.io.FileNotFoundException

// One packaging photo file per variety, kept out of db.json, sync, backups and exchange files so those stay small.
// Other phones in the household fetch it from the server (sharedPhoto).

class Photos(
    dir: File,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher,
    private val store: Store,
    private val sync: Sync,
    private val api: Api,
) {
    private val folder = File(dir, "photos")
    private val kept = HashSet<String>()
    private val writing = HashMap<String, Job>()
    private val origin = HashMap<String, String?>() // variety → the meal its photo came from, this run only

    /** large photos of meals, memory only */
    val mem = HashMap<String, String>()

    init {
        folder.list()?.forEach { f -> Regex("^(.+)\\.jpg$").find(f)?.let { kept.add(it.groupValues[1]) } }
    }

    private fun file(id: String) = File(folder, "$id.jpg")

    fun hasPhoto(
        s: Rec?,
        p: Rec?,
    ) = if (p !=
        null
    ) {
        kept.contains(p.id) || (p["sharedPhoto"].truthy && sync.isConnected())
    } else {
        s != null &&
            (mem.containsKey(s.id) || !s.str("photo").isNullOrEmpty())
    }

    /** throws if the server fails and no older photo is here; with one here, stale(e) is told and the old one shown */
    suspend fun photoSrc(
        s: Rec?,
        p: Rec?,
        stale: (Exception) -> Unit,
    ): String? {
        if (p == null) {
            val b64 = s?.let { mem[it.id] }
            return if (b64 != null) "data:image/jpeg;base64,$b64" else s?.str("photo")?.ifEmpty { null }
        }
        var b64 = photoData(p.id)
        val stamp = serverStamp(p)
        if ((b64 == null || stamp > (store.prefs.photoStamps[p.id] ?: 0)) && p["sharedPhoto"].truthy && sync.isConnected()) {
            var fresh: String? = null
            try {
                if (!sync.reachable()) throw ServerError("offline", "Der Server ist gerade nicht erreichbar.")
                fresh = api.request("GET", "/api/photo/" + p.id, timeout = 10_000)["image"].asString
            } catch (e: ServerError) {
                if (e.status != 404) {
                    if (b64 == null) throw e
                    stale(e)
                }
            }
            if (fresh != null) {
                if (b64 != null) replacePhotoFile(p.id, fresh) else keepPhoto(p.id, fresh)
                b64 = fresh
                if (stamp > 0) {
                    store.prefs.photoStamps[p.id] = stamp
                    store.savePrefs()
                }
            }
        }
        return if (b64 != null) "data:image/jpeg;base64,$b64" else null
    }

    suspend fun photoData(pid: String): String? {
        if (!kept.contains(pid)) return null
        writing[pid]?.join()
        return try {
            withContext(io) { file(pid).readBytes() }.toByteString().base64()
        } catch (e: FileNotFoundException) {
            forgetPhoto(pid) // anything but a missing file keeps the photo
            null
        }
    }

    fun keptPhoto(pid: String) = kept.contains(pid)

    // kept and origin change at once so the next view offers the photo; readers wait for the file
    private fun track(
        pid: String,
        after: Job?,
        work: () -> Unit,
        where: String,
    ) {
        val job =
            scope.launch {
                after?.join()
                try {
                    withContext(io) { work() }
                } catch (e: Exception) {
                    kept.remove(pid)
                    report(where, e)
                }
            }
        writing[pid] = job
        job.invokeOnCompletion { scope.launch { if (writing[pid] === job) writing.remove(pid) } }
    }

    private fun write(
        pid: String,
        b64: String,
    ) {
        val bytes = b64.decodeBase64()?.toByteArray() ?: throw IllegalArgumentException("not base64")
        folder.mkdirs()
        val tmp = File(folder, "$pid.jpg.tmp")
        tmp.writeBytes(bytes)
        if (!tmp.renameTo(file(pid))) throw java.io.IOException("photo not written")
    }

    /** b64 without the data URL prefix; sid is the meal it came from, none when fetched from the server */
    fun keepPhoto(
        pid: String,
        b64: String,
        sid: String? = null,
    ) {
        if (pid.isEmpty() || b64.isEmpty() || kept.contains(pid)) return
        kept.add(pid)
        origin[pid] = sid
        track(pid, null, { write(pid, b64) }, "keeping the packaging photo")
    }

    fun replacePhotoFile(
        pid: String,
        b64: String,
    ) {
        if (pid.isEmpty() || b64.isEmpty()) return
        kept.add(pid)
        origin.remove(pid)
        track(pid, writing[pid], { write(pid, b64) }, "replacing the packaging photo")
    }

    fun photoFrom(pid: String) = origin[pid]

    fun passPhoto(
        from: String,
        into: String,
    ) {
        if (!kept.contains(from) || from == into) return
        if (kept.contains(into)) return forgetPhoto(from)
        kept.remove(from)
        kept.add(into)
        origin[into] = origin[from]
        origin.remove(from)
        track(into, writing[from], {
            if (!file(from).renameTo(file(into))) throw java.io.IOException("photo not moved")
        }, "moving the packaging photo")
    }

    fun forgetPhoto(pid: String) {
        if (!kept.contains(pid)) return
        kept.remove(pid)
        origin.remove(pid)
        val after = writing[pid]
        scope.launch {
            after?.join()
            try {
                withContext(io) { if (!file(pid).delete() && file(pid).exists()) throw java.io.IOException("photo not deleted") }
            } catch (e: Exception) {
                report("deleting the packaging photo", e)
            }
        }
    }

    fun sweepPhotos(keep: Set<String>) {
        for (id in kept.toList()) if (id !in keep) forgetPhoto(id)
        val gone =
            store.prefs.photoStamps.keys
                .filter { it !in keep }
        if (gone.isEmpty()) return
        for (id in gone) store.prefs.photoStamps.remove(id)
        store.savePrefs()
    }

    /** waits for every photo being written, for tests and the end of an import */
    suspend fun settled() = writing.values.toList().forEach { it.join() }
}

/** sharedPhoto: true for a variety's first photo, a stamp once a phone replaced it */
fun serverStamp(p: Rec) = p["sharedPhoto"].let { if (it.asBoolean == null) it.asLong ?: 0L else 0L }
