package de.schmeckts.app

import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import java.io.File
import java.nio.file.Files
import java.util.concurrent.Executors

val FIXTURES = File("../tests/fixtures")

fun fixture(path: String): JsonElement = parseJson(File(FIXTURES, path).readText())

fun tempDir(prefix: String = "phone"): File = Files.createTempDirectory("schmeckts-$prefix-").toFile()

/** A phone in a folder of its own, its work on a thread of its own as the app's main thread. */
fun phoneIn(
    dir: File = tempDir(),
    http: Http = OkHttp(),
): Phone {
    val main = Executors.newSingleThreadExecutor { Thread(it, "phone-main").apply { isDaemon = true } }.asCoroutineDispatcher()
    return runBlocking(main) { Phone(dir, main, kotlinx.coroutines.Dispatchers.IO, http) }
}

/** Runs on the phone's main thread, as everything in the app does. */
fun <T> Phone.on(block: suspend Phone.() -> T): T = runBlocking(main) { block() }

fun Phone.flushNow() = on { store.flush() }

fun JsonElement.obj(): JsonObject = this as JsonObject

// a phone already in use: one pet, one variety, three rated meals
fun savedDb(): JsonObject =
    parseJson(
        """{"version":3,"pets":[{"id":"lxpet00001","name":"Minka","species":"Katze","photo":null,"createdAt":1750000000000}],
        "products":[{"id":"lxprod0001","brand":"Sheba","variety":"Lachs","type":"Nassfutter","thumb":null,"lastPets":["lxpet00001"],"createdAt":1750000000000}],
        "servings":[""" +
            (0..2).joinToString(",") {
                """{"id":"lxserv000$it","productId":"lxprod0001","servedAt":${1750000000000 + it * 86400000L},
                "pets":{"lxpet00001":{"r":"gut","at":${1750000000000 + it * 86400000L + 3600000}}},"note":""}"""
            } +
            "]}",
    ).obj()

fun writeFiles(
    dir: File,
    files: Map<String, Any>,
) {
    dir.mkdirs()
    for ((name, v) in files) File(dir, "$name.json").writeText(if (v is JsonElement) v.stringify() else v.toString())
}

/** Waits until cond (asked on the phone's main thread) holds; returns whether it did. */
fun Phone.until(
    seconds: Double = 10.0,
    cond: Phone.() -> Boolean,
): Boolean {
    val end = System.currentTimeMillis() + (seconds * 1000).toLong()
    while (System.currentTimeMillis() < end) {
        if (on { cond() }) return true
        Thread.sleep(100)
    }
    return on { cond() }
}

fun Phone.rec(
    c: String,
    id: String,
) = db[c].find { it.id == id }
