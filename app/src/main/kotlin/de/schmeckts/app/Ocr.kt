package de.schmeckts.app

import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

// Packaging text to the same {brand, variety, type, texture} the server returns. Input is readingOf() lines or plain
// text; plain text has no sizes, so no line is dropped for being small or slanted.

const val MAX_VARIETY = 40
const val PACK_LINES = 8 // more chips than this are too many to scan
private const val MIN_BRAND = 4 // shorter brands are too general to match or correct to

// Starting values from how type is set; heights are the recogniser's line heights in pixels
// letters of one word stand closer than this; higher values ran words with descenders together
private const val GAP = 0.15

// radians off the main direction; beyond it is a round badge or part of the picture
private const val TILT = 0.15

// share of the median line height; ML Kit needs about 16 px a letter, which small print does not have
private const val SMALL_PRINT = 0.4

// heights within this ratio count as alike; a larger ratio outweighs anything the length adds to a score
private const val LIKE = 1.25
private val HEIGHT_WEIGHT = 8 / ln(LIKE)
private const val NEAR = 1.5 // in main line heights: lines this close belong to the same label

// a nearby line this tall joins the name without a keyword, a smaller one only with a flavour or texture
private const val BESIDE = 0.5

// score lost by a line in another language ("Poulet & Saumon" beside "Huhn & Lachs"); it stays a chip
private const val FOREIGN = 4
private val OURS = setOf("", "und", "de", "en") // 'und' is the recogniser's "undetermined"

// The area around the variety is cropped, enlarged and read again (Recognize.kt).
const val SECOND_PASS = true
const val SECOND_PASS_MS = 2000L // skipped when the first reading took longer
const val CROP_WIDTH = 1600 // px, the crop is read at least this wide
private const val DOMINANT = 1.5 // main line height over the median from which a closer look pays
private const val MARGIN = 0.25 // added on each side, as a share of the crop's width and height
private const val OVERLAP = 0.6 // of the smaller box
private const val INSIDE = 0.9 // a line the crop cuts through keeps its first reading

// The thumbnail of a packaging photo is the square around its text (logic/Feeding.kt).
const val CLOSEST = 0.5 // of the photo's short side; closer in, a thumbnail shows print instead of a packaging
private const val ROOM = 0.15 // added on each side, as a share of the text's longer edge
private const val SAME_SHAPE = 0.02 // aspect ratios further apart are another photo, or the same one turned

/** What the packaging says; known: one of the household's varieties was found on it */
class Pack(
    val brand: String = "",
    val variety: String = "",
    val type: String = "",
    val texture: String? = null,
    val known: String? = null,
)

private val QUANTITY =
    jsRe("\\d+(?:[.,]\\d+)?\\s*[x×]\\s*\\d+(?:[.,]\\d+)?\\s*(?:g|kg|ml|l)?|\\d+(?:[.,]\\d+)?\\s*(?:g|kg|ml|l|stk|stück)\\b", "gi")
private val JUNK =
    jsRe(
        "zutaten|zusammensetzung|analytische|bestandteile|inhaltsstoff|rohprotein|rohfett|rohasche|feuchtigkeit|vitamin|zusatzstoff|" +
            "alleinfutter|ergänzungsfutter|haltbar|füllmenge|gmbh|www\\.|@|\\bean\\b",
        "i",
    )
private val AD_WORDS = "neu new jetzt gratis aktion vorteilspack sparpack premium qualität natürlich frisch lecker".split(" ")
private val ADS = jsRe("^(?:${AD_WORDS.joinToString("|")}|jetzt neu|100\\s*%\\s*natürlich|ohne zucker)$|^\\d+\\s*%", "i")

private fun squeeze(s: String?) = norm(s).replace(" ", "") // insensitive to case, hyphens and spaces

private fun tidyLine(s: String) = s.replace(jsRe("[\\r\\n]+"), " ")

fun readPack(
    text: String,
    products: List<Rec> = emptyList(),
) = readPack(Reading(text, 0, 0, emptyList()), products)

fun readPack(
    read: Reading,
    products: List<Rec> = emptyList(),
): Pack {
    val page = pageOf(read, products)
    val raw = page.lines.joinToString("\n") { it.text }
    if (raw.isBlank()) return Pack()
    val tight = squeeze(raw)
    val known =
        products
            .filter { p ->
                // an empty brand or variety would match any text
                squeeze(p.str("brand")).isNotEmpty() &&
                    squeeze(p.str("variety")).isNotEmpty() &&
                    squeeze("${p.str("brand")} ${p.str("variety")}").length >= 4 &&
                    squeeze(p.str("brand")) in tight &&
                    squeeze(p.str("variety")) in tight
            }.sortedByDescending { squeeze("${it.str("brand")} ${it.str("variety")}").length }
            .firstOrNull()
    if (known != null) {
        return Pack(
            known.str("brand") ?: "",
            known.str("variety") ?: "",
            known.str("type") ?: "",
            known.str("texture"),
            known.id.takeIf { it.isNotEmpty() }, // Recognize.kt treats this like a barcode hit
        )
    }
    val brand = pickBrand(page, raw, products)
    val type = foodType(raw)
    val variety = pickVariety(page, brand, products)
    if (brand.isEmpty() && variety.isEmpty()) return Pack()
    val texture = TEXTURES[type]?.items?.find { it.re.containsMatchIn(raw) }?.key
    return Pack(brand, variety, type, texture)
}

/** A line of the page: plain text has no place or size */
private class PL(
    val text: String,
    val h: Double,
    val src: Line? = null,
) {
    val box get() = src!!.box
    val cx get() = src!!.cx
    val cy get() = src!!.cy
    val tilt get() = src?.tilt ?: 0.0
    val lang get() = src?.lang ?: ""
}

// mid is the median line height, tilt the direction most lines run in, height the photo's
private class Page(
    val geo: Boolean,
    val lines: List<PL>,
    val mid: Double,
    val tilt: Double,
    val height: Double,
    val words: Set<String>,
)

private fun pageOf(
    read: Reading,
    products: List<Rec>,
): Page {
    val words = knownWords(products)
    val geo = read.lines.isNotEmpty()
    val texts = if (geo) read.lines.map { spoken(it, words) } else read.text.split(Regex("\\r?\\n"))
    val clean = cleanText(texts.joinToString("\n") { tidyLine(it) }, products).split("\n")
    val lines = texts.indices.map { i -> if (geo) PL(clean[i], read.lines[i].h, read.lines[i]) else PL(clean[i], 1.0) }
    return Page(
        geo,
        if (geo) readingOrder(lines) else lines,
        median(lines.map { it.h }).takeIf { it != 0.0 } ?: 1.0,
        if (geo) median(lines.map { it.tilt }) else 0.0,
        if (geo && read.height > 0) read.height.toDouble() else max(0.0, lines.maxOfOrNull { it.src?.box?.bottom ?: 0.0 } ?: 0.0),
        words,
    )
}

// Spacing comes from where the words stand, since the recogniser's own is unreliable. A tiny unknown scrap at either
// end goes: a small "mit" in front of large print often reads as "A".
private class Part(
    val text: String,
    val h: Double,
    val from: Double,
    val to: Double,
)

private val SCRAP_WORD = Regex("^\\p{L}{1,3}$")

private fun spoken(
    line: Line,
    words: Set<String>,
): String {
    val ux = kotlin.math.cos(line.tilt)
    val uy = kotlin.math.sin(line.tilt)
    val parts =
        line.elements
            .map { e ->
                val at = e.cx * ux + e.cy * uy // position along the line
                Part(e.text, e.h, at - e.w / 2, at + e.w / 2)
            }.sortedBy { it.from }
            .toMutableList()
    if (parts.isEmpty()) return line.text
    val tallest = parts.maxOf { it.h }
    val scrap = { p: Part -> SCRAP_WORD.matches(p.text) && p.h < SMALL_PRINT * tallest && norm(p.text) !in words }
    while (parts.size > 1 && scrap(parts[0])) parts.removeAt(0)
    while (parts.size > 1 && scrap(parts.last())) parts.removeAt(parts.size - 1)
    return parts.mapIndexed { i, p -> (if (i > 0 && p.from - parts[i - 1].to >= GAP * line.h) " " else "") + p.text }.joinToString("")
}

private class Row(
    val cy: Double,
    val h: Double,
    val lines: MutableList<PL>,
)

private fun readingOrder(lines: List<PL>): List<PL> {
    val rows = mutableListOf<Row>()
    for (l in lines.sortedBy { it.cy }) {
        val row = rows.lastOrNull()
        if (row != null && abs(l.cy - row.cy) < min(l.h, row.h) / 2) row.lines.add(l) else rows.add(Row(l.cy, l.h, mutableListOf(l)))
    }
    return rows.flatMap { r -> r.lines.sortedBy { it.box.left } }
}

private fun median(values: List<Double>): Double {
    val v = values.filter { it.isFinite() }.sorted()
    return if (v.isNotEmpty()) (v[(v.size - 1) shr 1] + v[v.size shr 1]) / 2 else 0.0
}

// angle between two directions, 0 to π
private fun turn(
    a: Double,
    b: Double,
) = abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)

private fun noise(
    tilt: Double,
    h: Double,
    pageTilt: Double,
    mid: Double,
) = turn(tilt, pageTilt) > TILT || h < SMALL_PRINT * mid

private fun noise(
    l: PL,
    page: Page,
) = noise(l.tilt, l.h, page.tilt, page.mid)

private fun apart(
    a: PL,
    b: PL,
) = maxOf(0.0, a.box.left - b.box.right, b.box.left - a.box.right, max(a.box.top - b.box.bottom, b.box.top - a.box.bottom))

private val LINE_NAMES = PRODUCT_LINES.flatMap { it.second }

private fun knownWords(products: List<Rec>): Set<String> =
    SMALL +
        (BRANDS + LINE_NAMES + products.flatMap { listOf(it.str("brand"), it.str("variety")) })
            .flatMap { norm(it).split(" ") }
            .filter { it.isNotEmpty() }

private fun flavourOrTexture(v: String) =
    FLAVORS.any { it.second.containsMatchIn(v) } || TEXTURES.values.any { t -> t.items.any { it.re.containsMatchIn(v) } }

private fun holdsKnown(
    v: String,
    products: List<Rec>,
): Boolean {
    val flat = " ${norm(v)} "
    return flavourOrTexture(v) ||
        brandsOf(products).any { " ${it.key} " in flat } ||
        products.any { squeeze(it.str("variety")).length >= 4 && squeeze(it.str("variety")) in squeeze(v) }
}

/** A brand as the text may name it; vocab: only Open Pet Food Facts knows it */
private class BrandEntry(
    val name: String,
    val key: String,
    val vocab: Boolean,
)

private fun brandEntry(
    name: String?,
    vocab: Boolean = false,
) = BrandEntry((name ?: "").trim(), norm(name), vocab)

// Hits in the two largest lines or the top third, where the logo is, rank first. A brand only Open Pet Food Facts
// knows must be in the two largest lines, since that list holds ordinary words too ("Classic").
private fun brandHits(
    page: Page,
    raw: String,
    products: List<Rec>,
): List<BrandEntry> {
    val flat = " ${norm(raw)} "
    val hits = brandsOf(products).filter { " ${it.key} " in flat }
    val order = compareBy<BrandEntry> { if (it.vocab) 1 else 0 }.thenByDescending { it.key.length }
    val big = page.lines.sortedByDescending { it.h }.take(2)

    fun rank(b: BrandEntry): Int {
        val at = page.lines.filter { " ${norm(it.text)} ".contains(" ${b.key} ") }
        return (if (at.any { it in big }) 2 else 0) + (if (at.any { it.cy < page.height / 3 }) 1 else 0)
    }
    val ranked =
        if (page.geo) {
            hits
                .map { it to rank(it) }
                .filter { (b, r) -> !b.vocab || r >= 2 }
                .sortedWith(
                    compareByDescending<Pair<BrandEntry, Int>> { it.second }.thenComparator {
                        x,
                        y,
                        ->
                        order.compare(x.first, y.first)
                    },
                ).map { it.first }
        } else {
            hits.sortedWith(order)
        }
    val seen = HashSet<String>()
    return (
        ranked.filter {
            !it.vocab
        } + logoBrands(page, products, big) + lineBrands(raw) + ranked.filter { it.vocab }
    ).filter { seen.add(it.key) }
}

// a logo read only as its first word ("Catz" of "Catz Finefood"); an ordinary word like "Happy" does not count
private fun logoBrands(
    page: Page,
    products: List<Rec>,
    big: List<PL>,
): List<BrandEntry> {
    val ordinary = { w: String -> w in VOCAB_WORD_SET || w in COMMON || w in SMALL || w in KEPT }
    val own = wordsOf(MIN_FIX, products.flatMap { listOf(it.str("brand"), it.str("variety")) }).map(::norm).toSet()
    val word = { w: String -> w in own || fixedWords().lexicon.spelling[w] != null }
    return page.lines
        .filter { !page.geo || it in big || it.cy < page.height / 3 }
        .map { l -> norm(l.text).split(" ").filter { it.isNotEmpty() } }
        .filter { ws -> ws.isNotEmpty() && ws.size <= 2 && ws[0].length >= MIN_BRAND && !ordinary(ws[0]) && !word(ws.getOrElse(1) { "" }) }
        .flatMap { ws -> LISTED_BRANDS.filter { b -> " " in b.key && b.key.split(" ")[0] == ws[0] } }
}

private fun lineBrands(raw: String): List<BrandEntry> {
    val tight = squeeze(raw)
    return PRODUCT_LINES.filter { (_, lines) -> lines.any { squeeze(it) in tight } }.map { brandEntry(it.first) }
}

private fun pickBrand(
    page: Page,
    raw: String,
    products: List<Rec>,
) = brandHits(page, raw, products).firstOrNull()?.name ?: ""

const val PACK_BRANDS = 3

fun packBrands(
    text: String,
    products: List<Rec> = emptyList(),
) = packBrands(Reading(text, 0, 0, emptyList()), products)

fun packBrands(
    read: Reading,
    products: List<Rec> = emptyList(),
): List<String> {
    val page = pageOf(read, products)
    return brandHits(page, page.lines.joinToString("\n") { it.text }, products).take(PACK_BRANDS).map { it.name }
}

// Open Pet Food Facts lists "Katzenfutter", "Dog food" and the like as brands
private val FOOD = jsRe("^(?:food|futter|nahrung)$|katze|kitten|\\bcat\\b|hund|\\bdog\\b")

private fun onlyFood(b: BrandEntry) =
    b.key.split(" ").all { w ->
        FOOD.containsMatchIn(w) ||
            TYPE_WORDS.any {
                it.second.containsMatchIn(w)
            }
    }

private val LISTED_BRANDS = BRANDS.map { brandEntry(it) }
private val VOCAB_BRAND_ENTRIES by lazy { VOCAB_BRANDS.map { brandEntry(it, true) }.filter { !onlyFood(it) } }

// the first spelling wins, so the list beats ours and ours beats Open Pet Food Facts
private fun brandsOf(products: List<Rec>): List<BrandEntry> {
    val seen = HashSet<String>()
    return (LISTED_BRANDS + products.map { brandEntry(it.str("brand")) } + VOCAB_BRAND_ENTRIES).filter {
        it.key.replace(" ", "").length >=
            MIN_BRAND &&
            seen.add(it.key)
    }
}

private fun foodType(raw: String): String {
    TYPE_WORDS.find { it.second.containsMatchIn(raw) }?.let { return it.first }
    return TEXTURES.entries.find { (_, t) -> t.items.any { it.re.containsMatchIn(raw) } }?.key ?: ""
}

/** k keyword score, s with length, p prominence, i reading order */
private class Scored(
    val l: PL,
    val text: String,
    val i: Int,
    val k: Int,
    val s: Double,
    val foreign: Int,
    val p: Double,
) {
    val h get() = l.h
}

private fun pickVariety(
    page: Page,
    brand: String,
    products: List<Rec>,
): String {
    val lines = scored(page, brand, products)
    val main = mainOf(lines) ?: return ""
    val take = mutableListOf(main)
    val fits = { x: Scored -> joined(take + x).length <= MAX_VARIETY }
    if (page.geo) {
        val kin = lines.filter { it !== main && (it.h >= BESIDE * main.h || flavourOrTexture(it.text)) }
        while (true) {
            val next =
                kin
                    .filter { x -> x !in take && take.any { y -> apart(x.l, y.l) <= NEAR * main.h } && fits(x) }
                    .minByOrNull { x -> take.minOf { y -> apart(x.l, y.l) } } ?: break
            take.add(next)
        }
    } else {
        for (x in lines.filter { it !== main }.sortedByDescending { it.s }) {
            if (x.s < 1 || !fits(x)) break
            take.add(x)
        }
    }
    return cutName(joined(take).replace(LEADING_SMALL, ""), MAX_VARIETY)
}

private val LEADING_SMALL = jsRe("^(?:mit|with)\\s+(?=\\S)", "iu")

// Keywords decide before size, since the largest print is as often a logo or slogan as the flavour. Ties go to our
// languages, then a clearly taller line, then the first, as a name stands above what is said about it.
private fun mainOf(lines: List<Scored>): Scored? {
    var pool = lines.filter { it.k > 0 }
    if (pool.isEmpty()) return lines.filter { it.p > 0 }.sortedByDescending { it.p }.firstOrNull()

    fun most(
        xs: List<Scored>,
        f: (Scored) -> Double,
    ): List<Scored> {
        val top = xs.maxOf(f)
        return xs.filter { f(it) == top }
    }
    pool = most(most(pool) { it.k.toDouble() }) { -it.foreign.toDouble() }
    val tallest = pool.maxOf { it.h }
    return pool.filter { it.h * LIKE >= tallest }.minByOrNull { it.i }
}

private fun scored(
    page: Page,
    brand: String,
    products: List<Rec>,
) = usable(page, norm(brand), products).mapIndexed { i, l ->
    val k = keywords(l.text)
    val s = k + min(2.0, l.text.length / 12.0) - min(1.0, i * 0.2)
    val foreign = if (l.lang.split("-")[0] in OURS) 0 else 1
    Scored(l, l.text, i, k, s, foreign, s + HEIGHT_WEIGHT * ln(l.h / page.mid) - FOREIGN * foreign)
}

private val FIRST_WORD = Regex("^\\p{L}+")

private fun joined(lines: List<Scored>) =
    lines
        .sortedBy { it.i }
        .mapIndexed { n, l ->
            if (n >
                0
            ) {
                FIRST_WORD.replace(l.text) { w -> if (norm(w.value) in SMALL) w.value.lowercase(Locale.GERMAN) else w.value }
            } else {
                l.text
            }
        }.joinToString(" ")

private val SPACES = jsRe("\\s+")
private val ENDS = jsRe("^[\\s\\-–,·|+]+|[\\s\\-–,·|]+$")
private val NOT_LETTERS = Regex("[^\\p{L}]")

// bare is the normalised brand, dropped from the front of a line
private fun usable(
    page: Page,
    bare: String,
    products: List<Rec>,
): List<PL> {
    val seen = HashSet<String>()
    val out = mutableListOf<PL>()
    for (l in page.lines) {
        val v =
            withoutBrand(
                l.text
                    .replace(QUANTITY, " ")
                    .replace(SPACES, " ")
                    .trim(),
                bare,
            ).replace(ENDS, "")
        val letters = v.replace(NOT_LETTERS, "")
        if (letters.length < 3 || (letters.length == 3 && norm(letters) !in page.words)) continue
        if (JUNK.containsMatchIn(v) ||
            ADS.containsMatchIn(v) ||
            norm(v) == bare ||
            "$bare ".startsWith("${norm(v)} ") ||
            norm(v) in seen
        ) {
            continue
        }
        if (!says(v)) continue
        if (page.geo && noise(l, page) && !holdsKnown(v, products)) continue
        seen.add(norm(v))
        out.add(PL(v, l.h, l.src))
    }
    return out
}

fun packLines(
    text: String,
    bare: String = "",
    products: List<Rec> = emptyList(),
) = packLines(Reading(text, 0, 0, emptyList()), bare, products)

fun packLines(
    read: Reading,
    bare: String = "",
    products: List<Rec> = emptyList(),
): List<String> {
    val lines = usable(pageOf(read, products), bare, products)
    val keep = lines.sortedByDescending { it.h }.take(PACK_LINES).toSet()
    return lines.filter { it in keep }.map { it.text }
}

/** crop box in photo pixels, null when the main line does not stand out */
fun focusOf(
    read: Reading,
    products: List<Rec> = emptyList(),
): Box? {
    val page = pageOf(read, products)
    if (!page.geo) return null
    val raw = page.lines.joinToString("\n") { it.text }
    val main = mainOf(scored(page, pickBrand(page, raw, products), products)) ?: return null
    if (main.h < DOMINANT * page.mid) return null
    val mb = main.l.box
    val across = { l: PL -> min(l.box.right, mb.right) > max(l.box.left, mb.left) }
    val above = page.lines.filter { it.cy < mb.top && across(it) }.maxByOrNull { it.cy }
    val below = page.lines.filter { it.cy > mb.bottom && across(it) }.minByOrNull { it.cy }
    val box = around(listOfNotNull(main.l, above, below).map { it.box })
    val dx = MARGIN * (box.right - box.left)
    val dy = MARGIN * (box.bottom - box.top)
    val width = if (read.width > 0) read.width.toDouble() else page.lines.maxOf { it.box.right }
    val height = if (read.height > 0) read.height.toDouble() else page.lines.maxOf { it.box.bottom }
    return Box(
        max(0.0, floor(box.left - dx)),
        max(0.0, floor(box.top - dy)),
        min(width, ceil(box.right + dx)),
        min(
            height,
            ceil(
                box.bottom + dy,
            ),
        ),
    )
}

class Square(
    val x: Int,
    val y: Int,
    val side: Int,
)

private val TWO_LETTERS = Regex("\\p{L}{2}")

/** in the pixels of the same photo at width × height; null with too little text, or for a reading of the photo turned */
fun textSquare(
    read: Reading?,
    width: Int,
    height: Int,
): Square? {
    if (read == null || read.width == 0 || read.height == 0 || width == 0 || height == 0) return null
    if (abs((width.toDouble() * read.height) / (height.toDouble() * read.width) - 1) > SAME_SHAPE) return null
    val mid = median(read.lines.map { it.h })
    val tilt = median(read.lines.map { it.tilt })
    val text = read.lines.filter { TWO_LETTERS.containsMatchIn(it.text) && !noise(it.tilt, it.h, tilt, mid) }
    if (text.size < 2) return null
    val s = width.toDouble() / read.width
    val all = around(text.map { it.box })
    val short = min(width, height).toDouble()
    val wanted = s * (1 + 2 * ROOM) * max(all.right - all.left, all.bottom - all.top)
    val side = jsRound(min(short, max(CLOSEST * short, wanted))).toDouble()
    val tall = median(text.map { it.h })
    val large = around(text.filter { it.h >= tall }.map { it.box })

    // centred on the text; when it cannot hold all of it, the larger print stays in
    fun start(
        from: Double,
        to: Double,
        keepFrom: Double,
        keepTo: Double,
        size: Int,
    ): Int {
        val m = min(max((s * (from + to)) / 2, s * keepTo - side / 2), s * keepFrom + side / 2)
        return jsRound(min(size - side, max(0.0, m - side / 2))).toInt()
    }
    return Square(
        start(all.left, all.right, large.left, large.right, width),
        start(all.top, all.bottom, large.top, large.bottom, height),
        side.toInt(),
    )
}

private fun around(boxes: List<Box>) =
    Box(
        boxes.minOf {
            it.left
        },
        boxes.minOf { it.top },
        boxes.maxOf { it.right },
        boxes.maxOf { it.bottom },
    )

/** crop: the area read again, in photo pixels, plus the scale it was enlarged by */
class Crop(
    val box: Box,
    val scale: Double,
)

fun joinReadings(
    first: Reading,
    second: Reading?,
    crop: Crop,
): Reading {
    val c = crop.box

    fun sx(v: Double) = c.left + v / crop.scale

    fun sy(v: Double) = c.top + v / crop.scale

    fun back(x: Shape) =
        Shape(
            Box(sx(x.box.left), sy(x.box.top), sx(x.box.right), sy(x.box.bottom)),
            x.w / crop.scale,
            x.h / crop.scale,
            sx(x.cx),
            sy(x.cy),
            x.tilt,
        )
    val moved = second?.lines.orEmpty().map { l -> Line(l.text, l.elements.map { Element(it.text, back(it)) }, back(l), l.lang) }
    val within = { l: Line -> shared(l.box, c) >= INSIDE * area(l.box) }
    val kept = first.lines.filter { l -> !(within(l) && moved.any { overlaps(l, it) }) }
    return Reading(first.text, first.width, first.height, kept + moved.filter { m -> kept.none { overlaps(it, m) } }, first.ms, first.raw)
}

private fun area(b: Box) = max(0.0, b.right - b.left) * max(0.0, b.bottom - b.top)

private fun shared(
    a: Box,
    b: Box,
) = area(Box(max(a.left, b.left), max(a.top, b.top), min(a.right, b.right), min(a.bottom, b.bottom)))

private fun overlaps(
    a: Shape,
    b: Shape,
) = shared(a.box, b.box) > OVERLAP * min(area(a.box), area(b.box))

private const val LEFT_OUT =
    "zucker|soja|getreide|gluten|farbstoffe|konservierungsstoffe|zusatz(?:stoffe)?|k(?:ü|ue)nstliche[a-zäöüß]*"
private val LEFT_OUT_WORDS =
    "zucker soja getreide gluten farbstoffe konservierungsstoffe zusatz zusatzstoffe kuenstliche kunstliche"
        .split(
            " ",
        ).toSet()
private const val UP_TO_TWO = "(?:(?!ohne\\b)[\\p{L}-]+ ){0,2}"
private val CLAIMS = jsRe("ohne $UP_TO_TWO(?:$LEFT_OUT)|(?:zucker|getreide|gluten)frei", "giu")

// badges read as one line run together ("ohne Sojaohne Zucker"), so a glued "ohne" is split off first
private val GLUED = jsRe("(\\p{L})(ohne ?$UP_TO_TWO(?:$LEFT_OUT))", "giu")
private val GLUED_AFTER = jsRe("\\bohne(?=$LEFT_OUT)", "giu")

private fun unglued(v: String) = v.replace(GLUED, "$1 $2").replace(GLUED_AFTER, "ohne ")

private val EN_CLAIMS = jsRe("\\bsuitable for(?: [\\p{L}-]+){0,2}", "giu") // „Suitable for sterilised cats“

// spelled as a chip would show them; also spelling targets, so "Aurin" becomes "Taurin" and drops out too
private val MARKETING =
    (
        "Feinere Stückchen Taurin Omega Vitamin Vitamine Vitamins Mineral Mineralien Minerals Mineralstoffe Protein " +
            "Proteine Proteins Energie Energy Adapted Swedish Sweden Schweden Natural Naturally Ingredients Ingredient " +
            "Quality Qualität Grain Free Frei Suitable Complete Balanced Premium Recipe Recipes Rezeptur Made Hergestellt " +
            "Europe Europa Deutschland Germany Animal Content Level Levels Nutrition Formula Health Healthy Prozent Percent"
    ).split(" ")
private val MARKETING_WORDS = MARKETING.map(::norm).toSet()
private val DIGITS = Regex("^\\d+$")

// a line of nothing but filler, promises ("ohne Zucker") or badge words only makes the chip list longer
private fun says(v: String) =
    norm(unglued(v).replace(CLAIMS, " ").replace(EN_CLAIMS, " "))
        .split(" ")
        .any { w -> w.length >= 3 && w !in SMALL && w !in LEFT_OUT_WORDS && w !in MARKETING_WORDS && !DIGITS.matches(w) }

// packaging print often shouts; a mostly capital line gets title case, with German small words kept small
private val LETTER = Regex("\\p{L}")
private val WORDS = Regex("\\p{L}[\\p{L}'’]*")

private fun upper(s: String) = s.uppercase(Locale.GERMAN)

private fun unshout(line: String): String {
    val letters = LETTER.findAll(line).map { it.value }.toList()
    if (letters.size < 2 || letters.count { it == upper(it) }.toDouble() / letters.size < 0.6) return line
    return line.lowercase(Locale.GERMAN).replace(WORDS) { m ->
        val w = m.value
        if (m.range.first > 0 && norm(w) in SMALL) w else upper(w.substring(0, 1)) + w.substring(1)
    }
}

// Near misses are put right ("MLAMOR" to "Miamor") so a variety already in the household is found again. A word
// changes only when exactly one known word is that close. Known words, COMMON and KEPT stay, since against a
// thousand words they would be put wrong ("sind" to "Rind"). Running it twice changes nothing more.
private const val MIN_FIX = 3
private const val MIN_TWO_OFF = 5 // a lone word needs this many letters to match a brand two edits away
private val WORD = Regex("\\p{L}{$MIN_FIX,}")
private const val SPREAD = 2 // largest length difference worth measuring
private const val RUN_TOGETHER = 8 // shortest word that may be two run together

// ad and quantity words are searched for as they are: "frisch" must not become "Fisch"
private val KEPT = (AD_WORDS + listOf("stück", "stücke")).map(::norm).toSet()

// German and English function words, normalised
private val COMMON =
    (
        "der die das den dem des ein eine einer eines einem einen kein keine keiner keines keinem keinen ist sind war " +
            "waren wird werden wurde hat haben kann darf muss soll will ich sie wir ihr uns euch sich mir dir ihm ihn mich " +
            "dich bin bist ihre ihrer ihren sein seine seiner seinen mein meine dein deine unser unsere euer eure diese " +
            "dieser dieses diesem diesen jede jeder jedes alle aller alles allen und oder aber auch als also wie wenn dann " +
            "dass weil denn doch noch nur schon sehr mehr hier dort was wer wen wem warum weg gar ganz nicht nichts nie " +
            "immer bis durch gegen ohne uber unter nach seit vom zum zur beim ins ans aufs fur mit bei von vor aus auf nein " +
            "the and for with from this that these those are was were has have had not all any but our your their its his " +
            "her who what when where why how can will may yes"
    ).split(" ").toSet()

private class Lexicon(
    val spelling: HashMap<String, String>,
    val byLength: HashMap<Int, MutableList<String>>,
)

private class Ctx(
    val fixed: Fixed,
    val own: Lexicon,
    val spelling: (String) -> String?,
    val known: (String) -> Boolean,
)

fun cleanText(
    text: String,
    products: List<Rec> = emptyList(),
): String {
    val fixed = fixedWords()
    val own = lexicon(wordsOf(MIN_BRAND, products.map { it.str("brand") }) + wordsOf(MIN_FIX, products.map { it.str("variety") }))
    val spelling = { w: String -> fixed.listed[w] ?: own.spelling[w] ?: fixed.lexicon.spelling[w] }
    val ctx = Ctx(fixed, own, spelling) { w -> spelling(w) != null || w in SMALL || w in COMMON || w in KEPT }
    return text.split(Regex("\\r?\\n")).joinToString("\n") { cleanLine(it, ctx) }
}

private val LONE = Regex("^\\p{L}+$")

private fun cleanLine(
    line: String,
    ctx: Ctx,
): String {
    val words = fixWords(unshout(spaced(line)), ctx)
    val lone = words.trim().takeIf { LONE.matches(it) }
    val whole = unscrapped((lone?.let { brandTwoOff(it, ctx) }) ?: words, ctx.known)
    val part = germanPart(whole)
    return (if (part == whole) whole else unshout(part)).replace(SPACES, " ").trim()
}

private val fixedNear = HashMap<String, List<String>>() // cache of near() over fixedWords()

private fun fixWords(
    line: String,
    ctx: Ctx,
): String =
    line.replace(WORD) { m ->
        val word = m.value
        val w = norm(word)
        ONE_WORD_BRANDS[w]?.let { return@replace it } // „miamor“ off a logo is „Miamor“
        if (w.isEmpty() || " " in w || w in SMALL || w in COMMON || w in KEPT || ctx.spelling(w) != null) return@replace word
        val cachedNear =
            synchronized(fixedNear) {
                if (fixedNear.size > 20000) fixedNear.clear()
                fixedNear.getOrPut(w) { near(ctx.fixed.lexicon, w) }
            }
        val hits = LinkedHashSet(cachedNear + near(ctx.own, w))
        if (hits.any { v -> (v.startsWith(w) || w.startsWith(v)) && abs(v.length - w.length) <= 1 }) return@replace word
        if (hits.size == 1) return@replace ctx.spelling(hits.first())!!
        (if (w.length >= RUN_TOGETHER) twoWords(w, ctx.spelling) else null) ?: word
    }

private fun twoWords(
    w: String,
    spelling: (String) -> String?,
): String? {
    for (at in MIN_FIX..w.length - MIN_FIX) {
        val head = w.substring(0, at)
        val tail = w.substring(at)
        if (spelling(head) != null &&
            spelling(tail) != null &&
            (head in NAMED_WORDS || tail in NAMED_WORDS)
        ) {
            return "${spelling(head)} ${spelling(tail)}"
        }
    }
    return null
}

private fun brandTwoOff(
    word: String,
    ctx: Ctx,
): String? {
    val w = norm(word)
    if (w.length < MIN_TWO_OFF || ctx.known(w)) return null
    val hits = TWO_OFF_BRANDS.filter { k -> abs(k.length - w.length) <= 2 && distance(w, k, 2) <= 2 }
    return if (hits.size == 1) ONE_WORD_BRANDS[hits[0]] else null
}

// lower case with a capital inside ("eRoed" off a script logo) is a misread unless we know the word
private val SCRAP = Regex("^\\p{Ll}+\\p{Lu}\\p{L}*$")

private fun unscrapped(
    line: String,
    known: (String) -> Boolean,
) = line.split(" ").filter { !SCRAP.matches(it) || known(norm(it)) }.joinToString(" ")

// of "Chicken / Huhn / Kyckling" the most German part stays; on a tie cutName() cuts at the " / " later
private const val GERMAN_SOURCE =
    "(?<!\\p{L})(?:huhn|h(?:ü|ue)hn\\p{L}*|h(?:ä|ae)hnchen|gefl(?:ü|ue)gel|pute|truthahn|rind|ente|lamm|kaninchen|wild|hirsch|reh|" +
        "kalb|schwein|lachs|thunfisch|forelle|fisch|garnele|k(?:ä|ae)se|leber|herz|sauce|so(?:ß|ss)e|gelee|pastete|h(?:ä|ae)ppchen|" +
        "st(?:ü|ue)ckchen|filets?|ragout|feines?|zartes?|mit|und|ohne|f(?:ü|ue)r|katzen?)(?!\\p{L})"
private val GERMAN = jsRe(GERMAN_SOURCE, "giu")
private val ENGLISH =
    jsRe(
        "(?<!\\p{L})(?:chicken|turkey|beef|duck|lamb|rabbit|venison|veal|pork|salmon|tuna|trout|fish|shrimp|cheese|liver|heart|" +
            "with|and)(?!\\p{L})",
        "iu",
    )
private val SLASH = jsRe("\\s*/\\s*")

private fun germanPart(line: String): String {
    val parts = line.split(SLASH)
    if (parts.size < 2) return germanTail(line)
    val hits = parts.map { GERMAN.findAll(it).count() }
    val most = hits.max()
    return if (most > 0 && hits.count { it == most } == 1) germanTail(parts[hits.indexOf(most)]) else line
}

private fun germanTail(part: String): String {
    val first = GERMAN.find(part)?.range?.first ?: -1
    if (first <= 0) return part
    val head = part.substring(0, first)
    return if (ENGLISH.containsMatchIn(head) && !GERMAN.containsMatchIn(head)) part.substring(first) else part
}

// "Mt" is a small "mit" in script; a lone character opening a line or a figure ending it is a scrap of the picture
private val AMP_FIGURE = jsRe("(?<=\\p{L})\\s*\\d?\\s*&\\s*\\d?\\s*(?=\\p{L})", "gu")
private val JOIN = jsRe("(\\p{L})\\s*([&+/])\\s*(?=\\p{L})", "gu")
private val GLUE = "von mit und oder ohne in im am an auf aus bei für vor zu zum zur".split(" ")
private val GLUED_SMALL =
    jsRe("(?<!\\p{L})(${GLUE.joinToString("|") { "[${it[0]}${it[0].uppercase()}]${it.substring(1)}" }})(?=\\p{Lu}\\p{Ll})", "gu")
private val GLUED_CAPS = Regex("(\\p{Lu}{2,})(\\p{Lu}\\p{Ll})")
private val MT = Regex("(?<![\\p{L}\\p{N}])(?:Mt|mt|MT)(?![\\p{L}\\p{N}])")
private val FIGURE_IN_WORD = Regex("(?<=\\p{L})[015](?=\\p{L})")
private val AS_LETTER = mapOf('0' to "o", '1' to "i", '5' to "s")
private val STRAY_FIRST = jsRe("^[\\p{L}\\p{N}]\\s+(?=\\S)", "u")
private val STRAY_LAST = jsRe("(?<=\\S)\\s+\\p{N}$", "u")

private fun spaced(line: String): String {
    val t =
        line
            .trim()
            .replace(AMP_FIGURE, " & ")
            .replace(JOIN, "$1 $2 ")
            .replace(GLUED_SMALL, "$1 ")
            .replace(GLUED_CAPS, "$1 $2")
            .replace(MT) {
                if (it.value == "MT") {
                    "MIT"
                } else if (it.value[0] == 'M') {
                    "Mit"
                } else {
                    "mit"
                }
            }
    return t
        .replace(FIGURE_IN_WORD) { m ->
            val next = t[m.range.first + 1].toString()
            val letter = AS_LETTER.getValue(m.value[0])
            if (next == upper(next)) letter.uppercase() else letter
        }.replaceFirst(STRAY_FIRST, "")
        .replaceFirst(STRAY_LAST, "")
}

// only the list's: many Open Pet Food Facts brands are ordinary words ("Classic", "Good")
private val ONE_WORD_BRANDS: Map<String, String> = BRANDS.filter { Regex("^\\p{L}+$").matches(it) }.associateBy { norm(it) }
private val TWO_OFF_BRANDS = ONE_WORD_BRANDS.keys.filter { it.length >= 6 }

private class Fixed(
    val listed: Map<String, String>,
    val lexicon: Lexicon,
)

// listed spellings win over those from Open Pet Food Facts
private val fixedOnce: Fixed by lazy {
    val listed = wordsOf(MIN_BRAND, BRANDS) + wordsOf(MIN_FIX, LINE_NAMES) + MARKETING
    Fixed(lexicon(listed).spelling, lexicon(listed + wordsOf(MIN_FIX, VOCAB_WORDS)))
}

private fun fixedWords() = fixedOnce

private val VOCAB_WORD_SET by lazy { VOCAB_WORDS.map(::norm).toSet() }
private val NOT_LETTER_RUN = Regex("[^\\p{L}]+")

private fun wordsOf(
    least: Int,
    texts: List<String?>,
) = texts.flatMap { (it ?: "").split(NOT_LETTER_RUN) }.filter { norm(it).length >= least }

// a run-together word may only split at one of these
private val NAMED_WORDS = wordsOf(MIN_FIX, BRANDS + LINE_NAMES + MARKETING).map(::norm).toSet()

// spelling: normalised → first spelling seen; byLength: normalised words by length
private fun lexicon(words: List<String>): Lexicon {
    val spelling = HashMap<String, String>()
    val byLength = HashMap<Int, MutableList<String>>()
    for (w in words) {
        val n = norm(w)
        if (" " in n || spelling.containsKey(n)) continue
        spelling[n] = w
        byLength.getOrPut(n.length) { mutableListOf() }.add(n)
    }
    return Lexicon(spelling, byLength)
}

private fun near(
    lex: Lexicon,
    w: String,
): List<String> {
    val out = mutableListOf<String>()
    for (n in max(MIN_FIX, w.length - SPREAD)..w.length + SPREAD) for (v in lex.byLength[n].orEmpty()) if (close(w, v)) out.add(v)
    return out
}

private fun close(
    a: String,
    b: String,
): Boolean {
    val max = if (max(a.length, b.length) >= 8) 2 else 1
    return abs(a.length - b.length) <= max && distance(a, b, max) <= max
}

// Levenshtein, stopping once every path costs more than max
private fun distance(
    a: String,
    b: String,
    max: Int,
): Int {
    var prev = IntArray(b.length + 1) { it }
    for (i in 1..a.length) {
        val row = IntArray(b.length + 1)
        row[0] = i
        var least = i
        for (j in 1..b.length) {
            row[j] = minOf(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (if (a[i - 1] == b[j - 1]) 0 else 1))
            least = min(least, row[j])
        }
        if (least > max) return max + 1
        prev = row
    }
    return prev[b.length]
}

// a field matching a chip's text shows that chip as pressed
fun hasLine(
    value: String?,
    line: String,
) = norm(value) == norm(line)

private fun withoutBrand(
    v: String,
    bare: String,
): String {
    if (bare.isEmpty()) return v
    val words = v.split(" ")
    for (n in 1..words.size) {
        val head = norm(words.take(n).joinToString(" "))
        if (head == bare) return words.drop(n).joinToString(" ")
        if (!bare.startsWith(head)) break
    }
    return v
}

private fun keywords(v: String) =
    (if (FLAVORS.any { it.second.containsMatchIn(v) }) 3 else 0) +
        (if (TEXTURES.values.any { t -> t.items.any { it.re.containsMatchIn(v) } }) 2 else 0) +
        (if (TYPE_WORDS.any { it.second.containsMatchIn(v) }) 1 else 0)
