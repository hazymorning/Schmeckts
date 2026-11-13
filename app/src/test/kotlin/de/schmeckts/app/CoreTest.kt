package de.schmeckts.app

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// Without a phone: barcodes, records as fields, the hybrid clock, module layering
class CoreTest {
    @Test
    fun `barcodes - EAN-13, EAN-8 and UPC-A with a valid check digit`() {
        val codes =
            listOf("4008429087455", "4008429087456", "036000291452", "96385074", "96385075", " 4008429087455 ", "40084290874", "abc", null)
        assertEquals(
            listOf("4008429087455", "", "0036000291452", "96385074", "", "4008429087455", "", "", ""),
            codes.map(::normBarcode),
        )
    }

    @Test
    fun `consistency and treat type - the choice per type, keywords in brand and variety`() {
        assertEquals(
            mapOf(
                "Nassfutter" to
                    listOf(
                        "Konsistenz",
                        "sosse In Soße",
                        "gelee In Gelee",
                        "pastete Pastete",
                        "mousse Mousse",
                        "block Fester Block",
                        "suppe Suppe",
                    ),
                "Snack" to
                    listOf("Snack-Art", "knusprig Knusprig", "weich Weich", "creme Creme", "milch Milch", "stick Stick", "kau Kauartikel"),
            ),
            TEXTURES.mapValues { (_, t) -> listOf(t.title) + t.items.map { "${it.key} ${it.label}" } },
        )

        fun guess(
            type: String,
            names: List<String>,
        ) = names.map { guessTexture(type, "", it) }
        assertEquals(
            listOf("sosse", "sosse", "gelee", "gelee", "pastete", "pastete", "pastete", "mousse", "block", "suppe", "suppe", "suppe", null),
            guess(
                "Nassfutter",
                listOf(
                    "Lachs in Soße",
                    "Huhn in Sauce",
                    "Rind in Gelee",
                    "Tuna in Jelly",
                    "Feine Pastete",
                    "Pâté Ente",
                    "Terrine",
                    "Mousse Kalb",
                    "Loaf Huhn",
                    "Suppe",
                    "Soup",
                    "Brühe mit Huhn",
                    "Lachs",
                ),
            ),
        )
        assertEquals(
            listOf("knusprig", "knusprig", "weich", "creme", "creme", "creme", "milch", "milch", "milch", "stick", "stick", "kau", "kau"),
            guess(
                "Snack",
                listOf(
                    "Knuspertaschen",
                    "Crunchy Bites",
                    "Soft Happen",
                    "Käse-Creme",
                    "Cream Snack",
                    "Malt Paste",
                    "Katzenmilch",
                    "Cat Milk",
                    "Drink",
                    "Sticks Lachs",
                    "Filetstreifen",
                    "Kausnack",
                    "Dental Chew",
                ),
            ),
        )
        assertEquals(
            listOf(null, "knusprig", "gelee"),
            listOf(
                guessTexture("Trockenfutter", "", "Kroketten in Soße"),
                guessTexture("Snack", "Crunchy", "Huhn"),
                guessTexture(null, "", "Huhn in Gelee"),
            ),
        )
        assertNull(textureOf(recOf("type" to JsonPrimitive("Snack")), "sosse"))
        assertEquals("In Soße", textureOf(recOf("type" to JsonPrimitive("Nassfutter")), "sosse")?.label)
        assertNull(textureOf(recOf("type" to JsonPrimitive("Sonstiges")), "kau"))
    }

    @Test
    fun `fields - maps break down into entries, local fields and null stay out`() {
        val meal =
            Rec(
                parseJson(
                    """{"id":"meal0001","productId":"prod0001","servedAt":5,"note":null,"pets":{"minka":{"r":"gut"},"tiger":null},
                    "photo":"data:…","status":"waiting","scanCode":"4008429087455"}""",
                ).obj(),
            )
        assertEquals(mapOf("productId" to "\"prod0001\"", "servedAt" to "5", "pets.minka" to "{\"r\":\"gut\"}"), fieldsOf("servings", meal))
        assertEquals(
            mapOf("codes.4008429087455" to "true"),
            fieldsOf("products", Rec(parseJson("""{"id":"prod0001","codes":{"4008429087455":true}}""").obj())),
        )
        assertEquals("gut", (valueOf(meal, "pets.minka") as JsonObject)["r"].asString)
        assertNull(valueOf(meal, "pets.kiwi"))
    }

    @Test
    fun `fields - a record from field values, null removes, id and _del are not fields`() {
        val prod =
            fromFields(
                "products",
                "prod0001",
                linkedMapOf(
                    "brand" to JsonPrimitive("Sheba"),
                    "codes.4008429087455" to JsonPrimitive(true),
                    "codes.96385074" to JsonPrimitive(true),
                    "_del" to JsonPrimitive(false),
                ),
            )
        assertEquals(parseJson("""{"id":"prod0001","codes":{"4008429087455":true,"96385074":true},"brand":"Sheba"}"""), prod.toJson())
        setField("products", prod, "codes.4008429087455", null)
        setField("products", prod, "brand", null)
        setField("products", prod, "id", JsonPrimitive("anders"))
        setField("products", prod, "brand.x", num(1))
        assertEquals(parseJson("""{"id":"prod0001","codes":{"96385074":true}}"""), prod.toJson())
        assertFalse(
            "a map this version does not know stays out",
            setField("pets", Rec(parseJson("""{"id":"pet00001"}""").obj()), "photos.a1", JsonPrimitive("data:a")),
        )
        assertEquals(listOf(true, false, false, false), listOf("abcd", "abc", "a b c d", null).map { validId(it as String?) })
    }

    @Test
    fun `clock - sortable, always rising, follows foreign clocks and server time`() {
        val clock = Clock().apply { device = "handy001" }
        val a = clock.stamp()
        val b = clock.stamp()
        assertTrue(Regex("^\\d{13}-\\d{4}-handy001$").matches(a))
        assertTrue(b > a)
        val ahead = "${(System.currentTimeMillis() + 60_000).toString().padStart(13, '0')}-0007-anderes1"
        clock.observe(ahead)
        assertTrue("after a foreign clock it carries on above it", clock.stamp() > ahead)
        clock.observe("${(System.currentTimeMillis() + 3_600_000).toString().padStart(13, '0')}-0000-anderes1")
        assertTrue("clocks far in the future do not count", clock.ms < System.currentTimeMillis() + 61_000)
        clock.measure((System.currentTimeMillis() - 3_600_000).toDouble(), System.currentTimeMillis() - 100, System.currentTimeMillis())
        assertTrue("offset to server time measured", Math.abs(clock.offset + 3_600_000) < 1000)
        clock.rebase()
        assertTrue("after a \"clock\" rejection do not keep counting in the future", clock.ms <= System.currentTimeMillis() + clock.offset)
    }

    // each layer imports only from the ones below it: foundations and data in the root package, then ui, views,
    // logic, and the control (Actions, MainActivity, App) at the top
    @Test
    fun `modules - layers reach upwards only through hooks`() {
        val root = File("src/main/kotlin/de/schmeckts/app")
        val layer = mapOf("" to 0, "ui" to 1, "views" to 2, "logic" to 3)
        val top = setOf("Actions.kt", "MainActivity.kt", "App.kt", "Receivers.kt")
        val wrong = mutableListOf<String>()
        for (file in root.walkTopDown().filter { it.isFile && it.extension == "kt" }) {
            val pkg = file.parentFile.relativeTo(root).path
            val own = if (pkg.isEmpty() && file.name in top) 4 else layer.getValue(pkg)
            for (m in Regex("^import de\\.schmeckts\\.app\\.(ui|views|logic)\\.", RegexOption.MULTILINE).findAll(file.readText())) {
                if (layer.getValue(m.groupValues[1]) > own) wrong.add("${file.relativeTo(root)} imports ${m.groupValues[1]}")
            }
        }
        assertEquals(emptyList<String>(), wrong)
    }

    @Test
    fun `news - one per release with something to see, newest first, none ahead of the app`() {
        val app = Regex("^version=(\\S+)$", RegexOption.MULTILINE).find(File("gradle.properties").readText())!!.groupValues[1]
        val order = { v: String -> v.split(".").fold(0L) { n, part -> n * 1000 + part.toLong() } }
        val versions = NEWS.map { it.v }
        assertTrue(versions.joinToString(), versions.all { Regex("^\\d+\\.\\d+\\.\\d+$").matches(it) })
        assertEquals("newest first", versions.sortedByDescending(order), versions)
        assertEquals("one per release", versions.size, versions.toSet().size)
        assertTrue("${versions[0]} is not ahead of the app's $app", versions.isEmpty() || order(versions[0]) <= order(app))
        assertTrue("each says what is new", NEWS.all { it.title.isNotEmpty() && it.say.isNotEmpty() })
    }

    @Test
    fun `numbers are written as JavaScript writes them`() {
        assertEquals(
            listOf("0", "1", "-1", "1750000000000", "1.5", "0.1", "1e+21", "1.5e-7", "0.000001", "1152921504606847000"),
            listOf(0.0, 1.0, -1.0, 1.75e12, 1.5, 0.1, 1e21, 1.5e-7, 1e-6, Math.pow(2.0, 60.0)).map(::jsNumber),
        )
        assertEquals("""{"a":1,"b":[1.5,2],"c":"x"}""", parseJson("""{"a":1.0,"b":[1.50,2e0],"c":"x"}""").stringify())
    }
}
