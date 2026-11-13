package de.schmeckts.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import java.io.File
import java.io.IOException

/** Private app files (Android keeps them when space runs low), each written atomically through a .tmp file. */
class Disk(
    val dir: File,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher,
    private val report: (String, Any?) -> Unit,
) {
    var failed: (Throwable) -> Unit = {}
    var trace: ((String) -> Unit)? = null // tests watch the order of writes

    private fun readText(file: File): String? {
        if (!file.exists()) return null
        return file.readText(Charsets.UTF_8) // an unreadable file throws: never carry on with an empty state
    }

    fun read(name: String): JsonElement? {
        var file = File(dir, "$name.json")
        var text = readText(file)
        if (text == null) {
            file = File(dir, "$name.json.tmp") // a crash between delete and rename
            text = readText(file)
        }
        if (text == null) return null
        return try {
            parseJson(text)
        } catch (e: Exception) {
            val aside = "$name.corrupt-${Time.now()}.json"
            if (!file.renameTo(File(dir, aside))) report("setting the corrupted file aside", file.name)
            report("${file.name} is corrupted and now sits alongside as $aside", null)
            null
        }
    }

    // true when unsure, so nothing is tidied away
    fun setAside(): Boolean =
        try {
            dir.list()!!.any { Regex("\\.corrupt-\\d+\\.json$").containsMatchIn(it) }
        } catch (e: Exception) {
            report("looking for set-aside data", e)
            true
        }

    private fun writeNow(
        name: String,
        text: String,
    ) {
        val path = File(dir, "$name.json")
        val tmp = File(dir, "$name.json.tmp")
        dir.mkdirs()
        tmp.writeText(text, Charsets.UTF_8)
        trace?.invoke("write ${tmp.name}")
        trace?.invoke("rename ${tmp.name} ${path.name}")
        if (!tmp.renameTo(path)) {
            // rename may not overwrite; the target may be missing, and after a crash here read() takes the .tmp
            path.delete()
            if (!tmp.renameTo(path)) throw IOException("rename $tmp")
        }
    }

    private class Write(
        val produce: () -> Pair<String, Any?>,
        val done: ((Any?) -> Unit)?,
    )

    private val pending = LinkedHashMap<String, Write>()
    private var busy = false
    private var fails = 0
    private var retry: Job? = null
    private val idle = mutableListOf<CompletableDeferred<Unit>>()

    // produce() runs at write time so the newest state is written; done(ctx) runs after that write
    fun schedule(
        name: String,
        produce: () -> Pair<String, Any?>,
        done: ((Any?) -> Unit)? = null,
    ) {
        pending[name] = Write(produce, done)
        if (!busy) {
            busy = true
            scope.launch { loop() }
        }
    }

    private suspend fun loop() {
        busy = true
        while (pending.isNotEmpty()) {
            val name = ORDER.first { it in pending }
            val job = pending.remove(name)!!
            val (text, ctx) = job.produce()
            try {
                withContext(io) { writeNow(name, text) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (name !in pending) pending[name] = job // everything behind it waits
                busy = false
                if (fails++ == 0) failed(e)
                report("saving $name failed", e)
                retry?.cancel()
                retry =
                    scope.launch {
                        delay(minOf(60_000L, 5_000L * (1L shl minOf(fails, 10))))
                        if (!busy) loop()
                    }
                return
            }
            fails = 0
            job.done?.invoke(ctx)
        }
        busy = false
        idle.toList().also { idle.clear() }.forEach { it.complete(Unit) }
    }

    suspend fun flush() {
        if (!busy && pending.isEmpty()) return
        val d = CompletableDeferred<Unit>()
        idle.add(d)
        d.await()
    }

    companion object {
        val ORDER = listOf("queue", "db", "sync", "prefs", "ai")
    }
}
