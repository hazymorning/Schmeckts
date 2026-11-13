package de.schmeckts.app

import android.graphics.Bitmap
import android.graphics.PathMeasure
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.font.FontWeight
import androidx.core.graphics.PathParser
import de.schmeckts.app.ui.DARK
import de.schmeckts.app.ui.Faustina
import de.schmeckts.app.ui.Figtree
import de.schmeckts.app.ui.LIGHT
import de.schmeckts.app.ui.Palette
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

// What a user would see break in the design: contrast, typefaces, tokens, the logo, reduced motion. The old design_test.py.

private fun lum(c: Int): Double {
    fun f(v: Int) = (v / 255.0).let { if (it <= 0.04045) it / 12.92 else ((it + 0.055) / 1.055).pow(2.4) }
    return 0.2126 * f(c shr 16 and 255) + 0.7152 * f(c shr 8 and 255) + 0.0722 * f(c and 255)
}

fun contrast(
    a: Int,
    b: Int,
) = (max(lum(a), lum(b)) + 0.05) / (min(lum(a), lum(b)) + 0.05)

private val RATED = listOf("good", "mid", "sauce", "bad")
private val OBSERVED = listOf("happy", "stink", "hungry", "tired", "vomit")
private val TEXT_PAIRS =
    listOf("ink", "muted", "accentInk").flatMap { fg -> listOf("bg", "surface", "surface2").map { fg to it } } +
        listOf(
            "onAccent" to "accent",
            "onAccent" to "bad",
            "ink" to "segOn",
            "bg" to "ink",
            "toastAction" to "ink",
            "accentInk" to "accentSoft",
            "bad" to "badSoft",
            "good" to "goodSoft",
            "muted" to "goodSoft",
            "muted" to "badSoft",
            "bad" to "surface",
            "paperInk" to "paper",
            "paperMuted" to "paper",
        ) + (RATED + OBSERVED).map { "ink" to it + "Soft" }

// what lies on the page without glaring at it: the calendar sheet is on night paper in the dark
private val CALM_PAIRS = listOf("paper" to "bg")
private val ICON_PAIRS =
    (RATED + OBSERVED).flatMap { r -> listOf("bg", "surface", "surface2", r + "Soft").map { r to it } } + OBSERVED.map { "surface" to it }

private fun Palette.of(name: String) =
    when (name) {
        "bg" -> bg
        "surface" -> surface
        "surface2" -> surface2
        "ink" -> ink
        "muted" -> muted
        "accent" -> accent
        "accentInk" -> accentInk
        "accentSoft" -> accentSoft
        "onAccent" -> onAccent
        "good" -> good
        "goodSoft" -> goodSoft
        "mid" -> mid
        "midSoft" -> midSoft
        "sauce" -> sauce
        "sauceSoft" -> sauceSoft
        "bad" -> bad
        "badSoft" -> badSoft
        "happy" -> happy
        "happySoft" -> happySoft
        "stink" -> stink
        "stinkSoft" -> stinkSoft
        "hungry" -> hungry
        "hungrySoft" -> hungrySoft
        "tired" -> tired
        "tiredSoft" -> tiredSoft
        "vomit" -> vomit
        "vomitSoft" -> vomitSoft
        "paper" -> paper
        "paperInk" -> paperInk
        "paperMuted" -> paperMuted
        "segOn" -> segOn
        "toastAction" -> toastAction
        else -> error(name)
    }.toArgb()

private val ANDROID = "http://schemas.android.com/apk/res/android"
private val ROOT = File("..")
private val SRC = File("src/main/kotlin/de/schmeckts/app")

/** a vector in res/drawable: its group's position and its paths */
private fun layer(name: String): Pair<List<String>, List<String>> {
    val doc =
        DocumentBuilderFactory
            .newInstance()
            .apply { isNamespaceAware = true }
            .newDocumentBuilder()
            .parse(File("src/main/res/drawable/$name.xml"))
    val g = doc.getElementsByTagName("group").item(0) as org.w3c.dom.Element
    val at = listOf("scaleX", "scaleY", "translateX", "translateY").map { g.getAttributeNS(ANDROID, it) }
    val paths = doc.getElementsByTagName("path")
    return at to (0 until paths.length).map { (paths.item(it) as org.w3c.dom.Element).getAttributeNS(ANDROID, "pathData") }
}

private fun svgPaths(path: String) =
    Regex("<path [^>]* d=\"([^\"]*)\"")
        .findAll(File(ROOT, path).readText())
        .map {
            it.groupValues[1]
        }.toList()

class DesignFilesTest {
    @Test
    fun `palette - text at 4,5 to 1, icons at 3 to 1, the calendar sheet calm, light and dark`() {
        for ((theme, p) in listOf("light" to LIGHT, "dark" to DARK)) {
            fun low(
                pairs: List<Pair<String, String>>,
                ok: (Double) -> Boolean,
            ) = pairs
                .filter { (a, b) ->
                    !ok(contrast(p.of(a), p.of(b)))
                }.map { (a, b) -> "$a on $b %.2f".format(contrast(p.of(a), p.of(b))) }
            check(low(TEXT_PAIRS) { it >= 4.5 }.isEmpty(), "text tokens at least 4.5:1 ($theme) ${low(TEXT_PAIRS) { it >= 4.5 }}")
            check(
                low(ICON_PAIRS) { it >= 3 }.isEmpty(),
                "rating and observation colours as icons at least 3:1 ($theme) ${low(ICON_PAIRS) { it >= 3 }}",
            )
            check(
                low(CALM_PAIRS) { it <= 2 }.isEmpty(),
                "the calendar sheet at most 2:1 against the page ($theme) ${low(CALM_PAIRS) { it <= 2 }}",
            )
        }
    }

    @Test
    fun `files - the layers of the icon are the paths of the logo files, in one position`() {
        val (atGround, ground) = layer("ic_launcher_background")
        val (atFront, front) = layer("ic_launcher_foreground")
        val (atMono, mono) = layer("ic_launcher_monochrome")
        check(ground + front == svgPaths("design/schmeckts-icon.svg"), "ground and foreground of the icon: the paths of schmeckts-icon.svg")
        check(mono == svgPaths("design/schmeckts-mark-mono.svg"), "themed icon: the paths of design/schmeckts-mark-mono.svg")
        check(atGround == atFront && atFront == atMono, "the layers of the icon share one position $atGround $atFront $atMono")
    }

    // the names an object of Theme.kt declares
    private fun names(obj: String): List<String> {
        val theme = File(SRC, "ui/Theme.kt").readText()
        val body = Regex("object $obj \\{(.*?)\\n}", RegexOption.DOT_MATCHES_ALL).find(theme)!!.groupValues[1]
        return Regex("(?m)^\\s+(?:const )?val (\\w+)").findAll(body).map { it.groupValues[1] }.toList()
    }

    @Test
    fun `files - only the type styles, distances, radii and colours the design names`() {
        val types = names("Type").filter { it.first().isLowerCase() }
        check(
            types.sorted() ==
                listOf("body", "bodyStrong", "caption", "captionStrong", "heading", "small", "smallStrong", "subheading", "title").sorted(),
            "only the type styles the design names $types",
        )
        val spaces = names("Space")
        check(
            spaces == listOf("hair", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "gutter", "pageWidth"),
            "only the distances the design names $spaces",
        )
        val sources = SRC.walkTopDown().filter { it.isFile && it.extension == "kt" && it.name != "Theme.kt" }.toList()

        fun found(re: Regex) =
            sources.flatMap { f ->
                f.readLines().mapIndexedNotNull { i, l -> if (re.containsMatchIn(l.substringBefore("//"))) "${f.name}:${i + 1}" else null }
            }
        // black and transparent only as masks and as the shape an icon is tinted from
        val colours = found(Regex("Color\\(0x|Color\\.(rgb|argb|White|Red|Green|Blue|Gray|Yellow)|Color\\(\\s*\\d"))
        check(colours.isEmpty(), "colours only in Theme.kt $colours")
        val distances = found(Regex("(padding|spacedBy|Gap|PaddingValues)\\([^)]*\\b[1-9]\\d*(\\.\\d+)?\\.dp"))
        check(distances.isEmpty(), "distances from the space scale $distances")
        val radii = found(Regex("RoundedCornerShape\\([^)]*\\b[1-9]\\d*(\\.\\d+)?\\.dp"))
        check(radii.isEmpty(), "radii from the radius tokens $radii")
        val type = found(Regex("fontSize\\s*=|\\bTextStyle\\(|\\d\\.sp\\b"))
        check(type.isEmpty(), "type only through the styles of Theme.kt $type")
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DesignLogoTest {
    @Test
    fun `logo - the foreground inside the 33 dp safe zone, so the splash shows all of it`() {
        val (at, front) = layer("ic_launcher_foreground")
        val (k, _, tx, ty) = at.map { it.toFloat() }
        var r = 0.0
        val pos = FloatArray(2)
        for (d in front) {
            val m = PathMeasure(PathParser.createPathFromPathData(d), false)
            do {
                for (i in 0..600) {
                    m.getPosTan(m.length * i / 600, pos, null)
                    r = max(r, hypot((tx + k * pos[0] - 54).toDouble(), (ty + k * pos[1] - 54).toDouble()))
                }
            } while (m.nextContour())
        }
        check(r <= 33, "the foreground inside the 33 dp safe zone ${"%.1f".format(r)}")
    }
}

/** Visible text in the top layer: at 4.5:1 against what lies beneath it, in Figtree or Faustina, one bold per sentence at most. */
fun ScreenTest.scanText(): List<String> {
    idle(400)
    val bmp = rule.onRoot().captureToImage().asAndroidBitmap()
    val pane = sheetPane()
    val bad = mutableListOf<String>()
    val nodes =
        rule
            .onAllNodes(
                androidx.compose.ui.test.SemanticsMatcher
                    .keyIsDefined(SemanticsProperties.Text),
                useUnmergedTree = true,
            ).fetchSemanticsNodes()
            .filter { paneOf(it) == pane }
    // what lies over the content: the fades at the screen's edges, the toast and the feeding button
    val d = rule.density.density
    val clear =
        androidx.compose.ui.geometry
            .Rect(0f, 32 * d, bmp.width.toFloat(), bmp.height - 96 * d)
    val over =
        listOf(
            androidx.compose.ui.test
                .hasTestTag("toast"),
            androidx.compose.ui.test
                .hasText("Füttern", substring = false),
        ).flatMap { m -> rule.onAllNodes(m).fetchSemanticsNodes().map { it.boundsInRoot } }
    for (n in nodes) {
        val text = n.config[SemanticsProperties.Text].joinToString(" ").trim()
        if (text.isEmpty() || disabled(n)) continue
        val inToast = generateSequence(n) { it.parent }.any { it.config.getOrElseNullable(SemanticsProperties.TestTag) { null } == "toast" }
        val b = n.boundsInRoot
        if (!inToast &&
            (
                b.top < clear.top ||
                    b.bottom > clear.bottom ||
                    over.any { o -> o.overlaps(b) && !(o.contains(b.topLeft) && o.contains(b.bottomRight)) }
            )
        ) {
            continue
        }
        val layouts = mutableListOf<TextLayoutResult>()
        n.config
            .getOrElseNullable(SemanticsActions.GetTextLayoutResult) { null }
            ?.action
            ?.invoke(layouts)
        val style = layouts.firstOrNull()?.layoutInput?.style
        if (style != null && style.fontFamily != Figtree && style.fontFamily != Faustina) bad += "${style.fontFamily} on „$text“"
        val r = n.boundsInRoot
        val x0 = r.left.toInt().coerceAtLeast(0)
        val y0 = r.top.toInt().coerceAtLeast(0)
        val x1 = r.right.toInt().coerceAtMost(bmp.width)
        val y1 = r.bottom.toInt().coerceAtMost(bmp.height)
        if (x1 - x0 < 4 || y1 - y0 < 4) continue
        val ratio = ratioIn(bmp, x0, y0, x1, y1)
        if (ratio != null && ratio < 4.5) bad += "contrast ${"%.2f".format(ratio)} „$text“"
        val annotated = layouts.firstOrNull()?.layoutInput?.text ?: continue
        val bold = annotated.spanStyles.filter { (it.item.fontWeight ?: FontWeight.Normal) >= FontWeight.SemiBold }
        var start = 0
        for (m in Regex("[.!?](?=\\s|$)").findAll(annotated.text).map { it.range.last + 1 } + annotated.text.length) {
            if (bold.count { it.start >= start && it.start < m } >
                1
            ) {
                bad += "two bold in one sentence: ${annotated.text.substring(start, m).trim()}"
            }
            start = m
        }
    }
    return bad.distinct()
}

// the background: the colour most of the box shows; the text: the pixel that stands out most from it
private fun ratioIn(
    bmp: Bitmap,
    x0: Int,
    y0: Int,
    x1: Int,
    y1: Int,
): Double? {
    val px = IntArray((x1 - x0) * (y1 - y0))
    bmp.getPixels(px, 0, x1 - x0, x0, y0, x1 - x0, y1 - y0)
    val bg =
        px
            .groupBy { it }
            .maxBy { it.value.size }
            .key
    val most = px.maxOf { contrast(it, bg) }
    return if (most < 1.05) null else most // nothing drawn
}

private fun ScreenTest.sheetPane(): String? {
    if (ui.camera.open) return "camera"
    return ui.sheet?.kind
}

private fun paneOf(n: SemanticsNode): String? {
    var p: SemanticsNode? = n
    while (p != null) {
        p.config.getOrElseNullable(SemanticsProperties.PaneTitle) { null }?.let { return it }
        p = p.parent
    }
    return null
}

private fun disabled(n: SemanticsNode): Boolean {
    var p: SemanticsNode? = n
    while (p != null) {
        if (SemanticsProperties.Disabled in p.config) return true
        p = p.parent
    }
    return false
}

abstract class DesignViews : ScreenTest() {
    private fun visible(tag: String): Boolean {
        val b = rule.onNode(hasTestTag(tag), useUnmergedTree = true).captureToImage().asAndroidBitmap()
        val px = IntArray(b.width * b.height).also { b.getPixels(it, 0, b.width, 0, 0, b.width, b.height) }
        return px.distinct().size > 4
    }

    fun walk(scheme: String) {
        val bad = mutableListOf<String>()
        platform.pictures = AndroidPictures()
        open()
        bad += scanText()
        check(visible("logo"), "the app icon on the welcome page ($scheme)")
        act("demo")
        idle(1000)
        bad += scanText()
        act("open-evaluation")
        bad += scanText()
        ui.sheets.openPage("insights")
        bad += scanText()
        act("settings-back")
        act("open-level", "v" to "shop")
        bad += scanText()
        act("settings-back")
        act("settings-back")
        act("open-settings")
        bad += scanText()
        act("settings-page", "v" to "house")
        act("connect-form")
        bad += scanText()
        act("settings-back")
        act("settings-back")
        act("feed")
        bad += scanText()
        act("close")
        for (p in db.products) p["codes"] = j(mapOf("4001234567890" to true))
        act("open-product", "id" to tags("pick-", within = "sec-evaluation").first())
        bad += scanText()
        act("close")
        val hist = { tags("row-", within = "sec-hist").first { id -> db.servings.any { it.id == id } } }
        act("open-serving", "id" to hist())
        bad += scanText()
        act("close")
        act("open-settings")
        act("edit-pet", "id" to db.pets[0].id)
        bad += scanText()
        platform.image = jpegOf(300, 200)
        act("pet-photo")
        bad += scanText()
        act("crop-cancel")
        act("settings-back")
        act("settings-back")
        platform.camera = true
        act("feed")
        act("photo")
        idle(400)
        bad += scanText()
        tap("Abbrechen")
        idle(400)
        act("close")
        platform.camera = false
        act("open-report")
        bad += scanText()
        act("settings-back")
        idle(400)
        val pend = db.servings.first { s -> s.pets.values.any { !(it as kotlinx.serialization.json.JsonObject)["r"].truthy } }
        // reduced motion: the dimming behind a sheet is there in the first frame
        rule.mainClock.autoAdvance = false
        act("open-serving", "id" to pend.id)
        rule.mainClock.advanceTimeBy(16)
        val first =
            rule
                .onRoot()
                .captureToImage()
                .asAndroidBitmap()
                .getPixel(10, 10)
        rule.mainClock.advanceTimeBy(1000)
        val last =
            rule
                .onRoot()
                .captureToImage()
                .asAndroidBitmap()
                .getPixel(10, 10)
        rule.mainClock.autoAdvance = true
        check(first == last, "reduced motion reaches the sheet dimming ($scheme)")
        act("close")
        val pet =
            pend.pets.entries
                .first { !(it.value as kotlinx.serialization.json.JsonObject)["r"].truthy }
                .key
        act("rate", "s" to pend.id, "p" to pet, "r" to "gut")
        bad += scanText()
        act("open-serving", "id" to hist())
        bad += scanText()
        act("close")
        act("open-settings")
        act("arm", "then" to "wipe")
        act("arm", "then" to "wipe")
        idle(1000)
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        bad += scanText()
        // the storage full: the next save fails and says so
        for (n in listOf("db", "prefs", "sync", "queue")) File(dir, "$n.json.tmp").mkdirs()
        act("observe", "v" to "happy")
        check(until { toast?.startsWith("Der Speicher ist voll") == true }, "a full storage told")
        bad += scanText()
        check(bad.isEmpty(), "all visible text at 4.5:1, in Figtree or Faustina, at most one bold per sentence ($scheme) ${bad.distinct()}")
    }
}

class DesignLightTest : DesignViews() {
    @Test
    fun `light - every view readable`() = walk("light")
}

@Config(qualifiers = "w390dp-h844dp-night-xxhdpi")
class DesignDarkTest : DesignViews() {
    @Test
    fun `dark - every view readable`() = walk("dark")
}

class DesignLoaderTest : ScreenTest() {
    private fun onePet(reduce: Boolean) {
        platform.pictures = AndroidPictures()
        open(reduce = reduce)
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
    }

    // the node's part of the whole screen
    private fun image(tag: String): Bitmap {
        val r = rule.onNode(hasTestTag(tag), useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val all = rule.onRoot().captureToImage().asAndroidBitmap()
        return Bitmap.createBitmap(all, r.left.toInt(), r.top.toInt(), r.width.toInt(), r.height.toInt())
    }

    private fun drawn(tag: String) =
        image(tag).let { b ->
            IntArray(b.width * b.height).also { b.getPixels(it, 0, b.width, 0, 0, b.width, b.height) }.distinct().size > 2
        }

    private fun bounds(tag: String) = rule.onAllNodes(hasTestTag(tag), useUnmergedTree = true).fetchSemanticsNodes().map { it.boundsInRoot }

    private fun field(label: String) =
        rule
            .onNode(
                androidx.compose.ui.test
                    .hasContentDescription(label) and
                    androidx.compose.ui.test
                        .hasSetTextAction(),
                useUnmergedTree = true,
            ).fetchSemanticsNode()
            .boundsInRoot

    @Test
    fun `skeleton - as tall as the fields it stands in for`() {
        onePet(true)
        val gate = platform.hold("Whiskas\nRind in Gelee")
        platform.photo = jpegOf(480, 360)
        act("feed")
        act("photo")
        check(until { bounds("skel-field").size == 2 }, "the skeleton while it reads")
        val skeleton = bounds("skel-label").zip(bounds("skel-field")) { l, f -> f.bottom - l.top }
        check(until(6000) { fieldText("Marke") != null }, "the fields once patience runs out")
        val fields =
            listOf("Marke", "Sorte").map { name ->
                val label =
                    rule
                        .onNode(
                            androidx.compose.ui.test
                                .hasText(name, substring = false) and
                                !androidx.compose.ui.test
                                    .hasSetTextAction(),
                            useUnmergedTree = true,
                        ).fetchSemanticsNode()
                        .boundsInRoot
                field(name).bottom - label.top
            }
        gate.complete(Unit)
        idle(400)
        check(skeleton == fields, "the skeleton is as tall as the fields it stands in for $skeleton $fields")
    }

    private fun loader(reduce: Boolean) {
        onePet(reduce)
        val gate = platform.hold("Whiskas")
        platform.photo = jpegOf(480, 360)
        act("feed")
        rule.mainClock.autoAdvance = false
        act("photo")
        check(until { db.servings.firstOrNull()?.str("status") == "reading" && bounds("wait").isNotEmpty() }, "reading")
        val waited = {
            Time.now() -
                phone.recognize.readingSince.values
                    .first()
        }
        while (waited() < 200) idle(20)
        val early = drawn("wait")
        while (fieldText("Marke") == null && waited() < 6000) idle(50)
        idle(100)
        val later = drawn("wait")
        val (wait1, photo1) = image("wait") to image("name-photo")
        idle(300)
        val moved = !wait1.sameAs(image("wait"))
        val sheen = !photo1.sameAs(image("name-photo"))
        rule.mainClock.autoAdvance = true
        gate.complete(Unit)
        idle(400)
        if (!reduce) {
            check(
                !early && later && moved && sheen,
                "the loader waits a moment, drawn again it goes on, the sheen runs over the photo $early $later $moved $sheen",
            )
        } else {
            check(!early && later && !moved && !sheen, "reduced motion: the loader stands still, still after a moment, and no sheen runs")
        }
    }

    @Test
    fun `loader - waits a moment, then fills, and goes on when drawn again`() = loader(false)

    @Test
    fun `loader - reduced motion, it stands still and no sheen runs`() = loader(true)
}
