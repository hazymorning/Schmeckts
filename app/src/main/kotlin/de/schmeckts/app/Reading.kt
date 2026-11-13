package de.schmeckts.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import okio.ByteString.Companion.decodeBase64
import kotlin.math.atan2
import kotlin.math.hypot

// Text recognition results as plain data, kept free of the recogniser so plain JUnit can run it.

class Box(
    val left: Double,
    val top: Double,
    val right: Double,
    val bottom: Double,
)

/** box is in photo pixels; w and h run along the line's own direction, so a slanted line is not taller than it is;
 *  tilt is in radians, positive falling to the right. */
open class Shape(
    val box: Box,
    val w: Double,
    val h: Double,
    val cx: Double,
    val cy: Double,
    val tilt: Double,
)

class Element(
    val text: String,
    shape: Shape,
) : Shape(shape.box, shape.w, shape.h, shape.cx, shape.cy, shape.tilt)

class Line(
    val text: String,
    val elements: List<Element>,
    shape: Shape,
    val lang: String,
) : Shape(shape.box, shape.w, shape.h, shape.cx, shape.cy, shape.tilt) {
    fun withText(t: String) = Line(t, elements, this, lang)
}

/** raw: what the recogniser answered (tests/fixtures/ocr), kept for schmeckts://ocr-dump; ms: how long it took */
class Reading(
    val text: String,
    val width: Int,
    val height: Int,
    val lines: List<Line>,
    val ms: Long = 0,
    val raw: JsonObject? = null,
)

private fun JsonElement?.d(key: String) = (this as? JsonObject)?.get(key).asDouble

fun readingOf(
    raw: JsonObject?,
    width: Int = 0,
    height: Int = 0,
    ms: Long = 0,
): Reading {
    val lines = mutableListOf<Line>()
    for (block in (raw?.get("blocks") as? JsonArray).orEmpty()) {
        for (item in ((block as? JsonObject)?.get("lines") as? JsonArray).orEmpty()) {
            val line = item as? JsonObject ?: continue
            val shape = shapeOf(line) ?: continue
            val elements =
                (line["elements"] as? JsonArray).orEmpty().mapNotNull { e ->
                    val text = (e as? JsonObject)?.get("text").asString ?: ""
                    val s = shapeOf(e as? JsonObject)
                    if (text.isNotEmpty() && s != null) Element(text, s) else null
                }
            val lang = line["recognizedLanguage"].asString ?: (block as JsonObject)["recognizedLanguage"].asString ?: ""
            lines.add(Line(line["text"].asString ?: "", elements, shape, lang))
        }
    }
    return Reading(raw?.get("text").asString ?: "", width, height, lines, ms, raw)
}

// corners come top left, top right, bottom right, bottom left; without them the box is taken as level
private fun shapeOf(x: JsonObject?): Shape? {
    val corners = (x?.get("cornerPoints") as? JsonArray)?.takeIf { it.size == 4 }?.map { it.d("x")!! to it.d("y")!! }
    val b = x?.get("boundingBox") as? JsonObject
    val box =
        if (b != null) {
            Box(b.d("left") ?: Double.NaN, b.d("top") ?: Double.NaN, b.d("right") ?: Double.NaN, b.d("bottom") ?: Double.NaN)
        } else if (corners != null) {
            Box(corners.minOf { it.first }, corners.minOf { it.second }, corners.maxOf { it.first }, corners.maxOf { it.second })
        } else {
            return null
        }
    if (!(box.right >= box.left && box.bottom >= box.top)) return null
    if (corners == null) {
        val w = box.right - box.left
        val h = box.bottom - box.top
        return Shape(box, w, h, (box.left + box.right) / 2, (box.top + box.bottom) / 2, 0.0)
    }

    fun span(
        p: Pair<Double, Double>,
        q: Pair<Double, Double>,
    ) = hypot(q.first - p.first, q.second - p.second)
    return Shape(
        box,
        (span(corners[0], corners[1]) + span(corners[3], corners[2])) / 2,
        (span(corners[0], corners[3]) + span(corners[1], corners[2])) / 2,
        corners.sumOf { it.first } / 4,
        corners.sumOf { it.second } / 4,
        atan2(corners[1].second - corners[0].second, corners[1].first - corners[0].first),
    )
}

/** from the frame header without decoding; 48 KB reaches past a camera photo's embedded preview */
fun jpegSize(b64: String?): Pair<Int, Int> {
    val none = 0 to 0
    val bytes = (b64 ?: "").take(65536).decodeBase64()?.toByteArray() ?: return none // not base64, so not a photo either

    fun at(i: Int) = if (i < bytes.size) bytes[i].toInt() and 0xff else 0
    if (at(0) != 0xff || at(1) != 0xd8) return none
    var i = 2
    while (i + 8 < bytes.size) {
        if (at(i) != 0xff) return none
        val marker = at(i + 1)
        if (marker == 0xff) {
            i++ // fill byte
            continue
        }
        // SOF0 to SOF15 carry the size; C4 (Huffman tables), C8 and CC (arithmetic coding) share the range but do not
        if (marker in 0xc0..0xcf &&
            marker !in listOf(0xc4, 0xc8, 0xcc)
        ) {
            return ((at(i + 7) shl 8) or at(i + 8)) to ((at(i + 5) shl 8) or at(i + 6))
        }
        i += 2 + ((at(i + 2) shl 8) or at(i + 3))
    }
    return none
}
