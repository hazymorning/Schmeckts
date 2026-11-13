package de.schmeckts.app

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// stages run cheapest first, the own key before the server; any may be skipped, and an error moves on to the next

private val RETRY = setOf("offline", "busy", "unavailable", "server", "auth", "locked")

// ms the naming sheet shows a skeleton before the empty fields
const val READ_PATIENCE = 2500L

// ML Kit wants about 16 px per letter, small print has less at the 1100 px of the photos kept in memory
const val READ_MAX = 2400
const val READ_QUALITY = 0.9

class Details(
    val brand: String,
    val variety: String,
    val type: String?,
    val texture: String?,
)

/** source: the stage that found it, '' for none; products, or details of a new variety; error: the last stage's */
class Identified(
    val source: String,
    val products: List<Rec>? = null,
    val details: Details? = null,
    val via: String? = null,
    val read: Reading? = null,
    val lines: List<String> = emptyList(),
    val brands: List<String> = emptyList(),
    val error: Exception? = null,
)

/** the lines and brands read off a meal's packaging, offered as chips while naming it */
class Lines(
    val lines: List<String>,
    val brands: List<String>,
)

/** for schmeckts://ocr-dump, which shares it as a test fixture */
class LastReading(
    val meal: String,
    val at: Long,
    val first: Reading,
    val second: Second?,
)

class Second(
    val crop: Box,
    val scale: Double,
    val read: Reading,
)

private fun asDetails(
    brand: String?,
    variety: String?,
    type: String?,
    texture: String?,
): Details? {
    val b = (brand ?: "").trim()
    val v = (variety ?: "").trim()
    if (b.isEmpty() && v.isEmpty()) return null
    return Details(b, v, type?.takeIf { it in TYPES }, texture)
}

private fun asDetails(hit: JsonObject?) =
    hit?.let {
        asDetails(it["brand"].asString, it["variety"].asString, it["type"].asString, it["texture"].asString)
    }

class Recognize(
    private val store: Store,
    private val sync: Sync,
    private val api: Api,
    private val ai: Ai,
    private val online: Online,
    private val derive: Derive,
    private val platform: Platform,
) {
    // a server out of reach or without a key leaves the photo to the phone
    fun photoByServer() = sync.reachable() && store.prefs.serverPhoto && sync.status.recognition != false

    // an AI looks at the photo: on this phone's own key, or on the server's
    fun photoByAI() = ai.ready() || photoByServer()

    val seenBy = HashMap<String, String>() // meal → who recognised its photo, shown in its sheet; memory only
    val memLines = HashMap<String, Lines>() // meal → what was read, memory only
    val readingSince = HashMap<String, Long>() // meal → when its recognition began
    var last: LastReading? = null
        private set

    // switched on by schmeckts://ocr-measure for this run: px → milliseconds
    var timing = false
    val timings = LinkedHashMap<Int, MutableList<Long>>()

    private class Asked(
        val code: String,
        val photo: String,
        val sharp: String,
        val meal: String,
    )

    private class Step(
        val name: String,
        val hint: String,
        val whenOn: (Asked) -> Boolean,
        val run: suspend (Asked) -> Identified?,
    )

    private val steps =
        listOf(
            Step("codes", "", { it.code.isNotEmpty() }) { o ->
                val found = derive.productsByCode(o.code)
                if (found.isNotEmpty()) Identified("codes", products = found) else null
            },
            Step("online", "Barcode wird nachgeschlagen …", { it.code.isNotEmpty() && store.prefs.lookup }) { o ->
                val hit = online.lookup(o.code)
                (if (hit.found) asDetails(hit.brand, hit.variety, hit.type, null) else null)?.let { Identified("online", details = it) }
            },
            Step("ai", "Sorte wird erkannt …", { it.photo.isNotEmpty() && ai.ready() }) { o ->
                asDetails(ai.recognize(o.photo))?.let { Identified("ai", details = it, via = ai.provider) }
            },
            Step("server", "Sorte wird erkannt …", { it.photo.isNotEmpty() && photoByServer() }) { o ->
                asDetails(recognize(o.photo))?.let { Identified("server", details = it, via = "server") }
            },
            Step("text", "", { it.photo.isNotEmpty() }) { o -> readText(o) },
        )

    private suspend fun readText(o: Asked): Identified? {
        val b64 = o.sharp.ifEmpty { o.photo }
        val first = platform.readPhoto(b64)
        val second = readAgain(b64, first)
        if (first.raw != null) last = LastReading(o.meal, Time.now(), first, second)
        if (timing && o.sharp.isNotEmpty()) measure(o, first)
        val read = if (second != null) joinReadings(first, second.read, Crop(second.crop, second.scale)) else first
        val products = store.db.products
        val pack = readPack(read, products)
        // a known variety counts like a barcode hit, unless the server reads photos
        val known = if (!photoByServer() && pack.known != null) derive.getProduct(pack.known) else null
        // tidied like the fields, so a chip and its field agree; read places the thumbnail
        val lines = packLines(read, "", products)
        val brands = packBrands(read, products)
        if (known != null) return Identified("text", products = listOf(known), read = read, lines = lines, brands = brands)
        val details = asDetails(pack.brand, pack.variety, pack.type, pack.texture) ?: return null
        return Identified("text", details = details, read = read, lines = lines, brands = brands)
    }

    // only after a quick first reading with a line that stands out; a failure leaves the first reading as it is
    private suspend fun readAgain(
        b64: String,
        first: Reading,
    ): Second? {
        val crop = if (SECOND_PASS && first.raw != null && first.ms <= SECOND_PASS_MS) focusOf(first, store.db.products) else null
        if (crop == null) return null
        return try {
            val p = platform.pictures.decode(b64) ?: return null
            val (part, scale) = platform.pictures.crop(p, crop, CROP_WIDTH, READ_MAX, READ_QUALITY)
            val read = platform.readPhoto(part)
            if (read.raw != null) Second(crop, scale, read) else null
        } catch (e: Exception) {
            report("reading the variety a second time", e)
            null
        }
    }

    private suspend fun measure(
        o: Asked,
        read: Reading,
    ) {
        fun took(
            px: Int,
            ms: Long,
        ) {
            timings.getOrPut(px) { mutableListOf() }.add(ms)
            report("reading at $px px", "$ms ms")
        }
        val edge = maxOf(read.width, read.height)
        val img = platform.pictures.decode(o.sharp) ?: return
        took(edge, read.ms)
        for (px in listOf(1100, 1800).filter {
            it < edge
        }) {
            took(px, platform.readPhoto(platform.pictures.resize(img, px, READ_QUALITY).substringAfter(",")).ms)
        }
    }

    /** sharp: the same photo larger, for reading on the phone */
    suspend fun identify(
        code: String = "",
        photo: String = "",
        sharp: String = "",
        meal: String = "",
        note: (String) -> Unit = {},
    ): Identified {
        val o = Asked(code, photo, sharp, meal)
        var error: Exception? = null
        for (step in steps) {
            if (!step.whenOn(o)) continue
            try {
                note(step.hint)
                val hit = step.run(o)
                if (hit != null) {
                    note("")
                    // a stage before it may have failed
                    return Identified(step.name, hit.products, hit.details, hit.via, hit.read, hit.lines, hit.brands, error)
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                error = e // the last error is what the interface explains
                report("recognition (${step.name})", e)
            }
        }
        note("")
        return Identified("", error = error)
    }

    private suspend fun recognize(b64: String): JsonObject {
        try {
            return api.request("POST", "/api/recognize", jsonObject("image" to JsonPrimitive(b64)), timeout = 70_000)
        } catch (e: ServerError) {
            e.retry = e.kind in RETRY
            throw e
        }
    }
}
