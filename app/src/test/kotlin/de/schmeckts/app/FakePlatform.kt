package de.schmeckts.app

import java.util.Collections

/** The phone's own parts as the tests see them: what was asked of them is in calls, their answers are set ahead. */
class FakePlatform : Platform {
    override var version = "9.9.9"
    val calls: MutableList<Pair<String, Any?>> = Collections.synchronizedList(mutableListOf())

    // the recogniser answers with the next of these, else with reading, after delay ms; failing makes it fail
    val readings = ArrayDeque<Reading>()
    var reading: Reading = UNREAD
    var readDelay = 0L
    var barcode: String? = null
    var scanError: String? = null
    var scanModule = true
    var photo: ByteArray? = null
    var installError: String? = null
    var shareCancelled = false
    val shared = mutableListOf<Pair<String, String>>()

    override val pictures = FakePictures()
    override val notifications = FakeNotifications(calls)

    override fun haptic(level: String) {
        calls.add("haptic" to level)
    }

    override suspend fun shareText(
        title: String,
        text: String,
    ): String {
        calls.add("shareText" to text)
        return "shared"
    }

    override suspend fun shareFile(
        name: String,
        text: String,
        title: String,
        dialogTitle: String,
    ): Boolean {
        calls.add("shareFile" to name)
        if (shareCancelled) return false
        shared.add(name to text)
        return true
    }

    override fun clearExports() {
        calls.add("clearExports" to null)
    }

    var camera = false // the app's own camera; without one the camera app stands in

    override fun hasCamera() = camera

    override suspend fun takePhoto(hint: String?): ByteArray? {
        calls.add("capture" to hint)
        return photo
    }

    override suspend fun readPhoto(b64: String): Reading {
        calls.add("processImage" to b64.length)
        if (readDelay > 0) kotlinx.coroutines.delay(readDelay)
        return readings.removeFirstOrNull() ?: reading
    }

    override suspend fun scanBarcode(onInstall: () -> Unit): String? {
        if (!scanModule) {
            onInstall()
            calls.add("installModule" to null)
            kotlinx.coroutines.delay(700)
            scanModule = true
        }
        calls.add("scan" to null)
        scanError?.let { throw java.io.IOException(it) }
        return barcode
    }

    // what the pickers hand back, null as if cancelled
    var file: String? = null
    var image: ByteArray? = null
    val uris = HashMap<String, String>()
    var picked: Long? = null

    override suspend fun pickFile(): String? {
        calls.add("pickFile" to null)
        return file
    }

    override suspend fun pickImage(): ByteArray? {
        calls.add("pickImage" to null)
        return image
    }

    override suspend fun readUri(uri: String): String = uris[uri] ?: throw java.io.FileNotFoundException(uri)

    override suspend fun pickDateTime(
        t: Long,
        max: Long,
    ): Long? {
        calls.add("pickDateTime" to t)
        return picked?.coerceAtMost(max)
    }

    override fun canUpdate() = true

    override suspend fun install(
        url: String,
        share: (Double) -> Unit,
    ) {
        calls.add("install" to url)
        share(0.5)
        installError?.let { throw java.io.IOException(it) }
    }
}

class FakePicture(
    override val width: Int,
    override val height: Int,
) : Picture

/** Pictures without decoding: a photo's size comes from its JPEG header */
class FakePictures : Pictures {
    override fun decode(b64: String): Picture? = jpegSize(b64).takeIf { it.first > 0 }?.let { FakePicture(it.first, it.second) }

    override fun resize(
        p: Picture,
        max: Int,
        quality: Double,
    ) = "data:image/jpeg;base64,${p.width}x${p.height}@$max"

    override fun square(
        p: Picture,
        size: Int,
        quality: Double,
        rect: Square?,
    ) = "data:image/jpeg;base64,square$size"

    override fun crop(
        p: Picture,
        rect: Box,
        width: Int,
        maxHeight: Int,
        quality: Double,
    ): Pair<String, Double> = "crop" to 2.0
}

class FakeNotifications(
    private val calls: MutableList<Pair<String, Any?>>,
) : Notifications {
    var granted = "prompt"
    var answer = "granted"
    var planned: List<Note> = emptyList()
    var feedSet: List<FeedNote> = emptyList()
    var feedServer = ""
    var feedCode = ""

    override fun permission() = granted

    override suspend fun request(): String {
        calls.add("requestPermissions" to null)
        granted = answer
        return granted
    }

    override fun plan(notes: List<Note>) {
        calls.add("plan" to notes.map { it.serving })
        planned = notes
    }

    override fun feed(
        reminders: List<FeedNote>,
        dismiss: List<Int>,
        server: String,
        code: String,
    ) {
        calls.add("feedSet" to reminders.map { it.key })
        feedSet = reminders
        feedServer = server
        feedCode = code
    }
}
