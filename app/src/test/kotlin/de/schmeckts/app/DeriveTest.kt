package de.schmeckts.app

import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The shopping list to share (Derive.kt), from the store in memory
class DeriveTest {
    init {
        berlin()
    }

    private val phone = phoneIn()
    private val derive get() = phone.derive

    // meals: [variety, {pet: rating}], one a day up to yesterday, newest first as the app keeps them
    private fun household(
        products: List<List<String?>>,
        meals: List<Pair<String, Map<String, String>>>,
    ) {
        val now = Time.now()
        val db = Db()
        db.pets.add(Rec(j(mapOf("id" to "minka00001", "name" to "Minka", "species" to "Katze", "createdAt" to 1)) as JsonObject))
        db.pets.add(Rec(j(mapOf("id" to "tiger00001", "name" to "Tiger", "species" to "Katze", "createdAt" to 2)) as JsonObject))
        for ((id, brand, variety, type, kaufen) in products.map { it + listOf(null) }) {
            db.products.add(
                Rec(
                    j(
                        mapOf(
                            "id" to id,
                            "brand" to brand,
                            "variety" to variety,
                            "type" to type,
                            "codes" to emptyMap<String, Any>(),
                            "createdAt" to 1,
                        ) +
                            (if (kaufen != null) mapOf("kaufen" to kaufen) else emptyMap()),
                    ) as JsonObject,
                ),
            )
        }
        meals.forEachIndexed { i, (productId, rated) ->
            db.servings.add(
                Rec(
                    j(
                        mapOf(
                            "id" to "meal" + i.toString().padStart(6, '0'),
                            "productId" to productId,
                            "servedAt" to now - (i + 1) * DAY,
                            "note" to "",
                            "pets" to rated.entries.associate { (pet, r) -> pet + "00001" to mapOf("r" to r, "at" to now) },
                        ),
                    ) as JsonObject,
                ),
            )
        }
        phone.store.replaceDb(db)
    }

    private fun listFor(pet: String): Derive.Shopping {
        phone.prefs.activePet = pet
        return derive.shoppingList()
    }

    @Test
    fun `the shopping list - only what to buy again, one block per food type, the best first`() {
        household(
            listOf(
                listOf("lachs", "Sheba", "Lachs in Soße", "Nassfutter"),
                listOf("huhn", "Felix", "Huhn in Gelee", "Nassfutter"),
                listOf("rind", "Gourmet", "Rind Pastete", "Nassfutter"),
                listOf("trocken", "Josera", "Huhn", "Trockenfutter"),
                listOf("kaese", "Dreamies", "Käse", "Snack", "immer"),
                listOf("stick", "Vitakraft", "Stick", "Snack", "nicht"),
                listOf("neu", "Animonda", "Pute", "Nassfutter"),
            ),
            listOf("top", "top", "top").map { "lachs" to mapOf("minka" to it) } +
                listOf("gut", "gut", "gut").map { "huhn" to mapOf("minka" to it, "tiger" to "schlecht") } +
                listOf("schlecht", "schlecht").map { "rind" to mapOf("tiger" to it) } +
                listOf("gern", "gern", "normal").map { "trocken" to mapOf("minka" to it) } +
                listOf("verputzt", "verputzt", "verputzt").map { "stick" to mapOf("tiger" to it) } +
                listOf("neu" to mapOf("minka" to "top")),
        )
        val all = listFor("all")
        assertEquals("Einkaufen für Minka und Tiger", all.title)
        assertEquals(
            listOf(
                "Einkaufen für Minka und Tiger",
                "Nassfutter\n- Sheba Lachs in Soße\n- Felix Huhn in Gelee (nur für Minka)",
                "Trockenfutter\n- Josera Huhn",
                "Snack\n- Dreamies Käse",
            ).joinToString("\n\n"),
            all.text,
        )
        assertTrue(
            "nothing that is not to be bought, and no block for it",
            !Regex("Nicht|Rind|Stick|Pute").containsMatchIn(listFor("all").text),
        )
        assertEquals(
            "with a pet chosen, its own verdicts: Huhn is simply to be bought again",
            "Einkaufen für Minka\n\nNassfutter\n- Sheba Lachs in Soße\n- Felix Huhn in Gelee\n\n" +
                "Trockenfutter\n- Josera Huhn\n\nSnack\n- Dreamies Käse",
            listFor("minka00001").text,
        )
        assertEquals(
            "what was set by hand holds for every pet, and a type with nothing to buy has no block",
            "Einkaufen für Tiger\n\nSnack\n- Dreamies Käse",
            listFor("tiger00001").text,
        )
    }

    @Test
    fun `the shopping list with nothing to buy yet - the title alone`() {
        household(listOf(listOf("lachs", "Sheba", "Lachs in Soße", "Nassfutter")), listOf("lachs" to mapOf("minka" to "top")))
        val all = listFor("all")
        assertEquals(listOf("Einkaufen für Minka und Tiger", "Einkaufen für Minka und Tiger"), listOf(all.title, all.text))
    }

    @Test
    fun `nicknames - a pet on its own goes by each of its names in turn, the same in one place all day`() {
        val db = Db()
        db.pets.add(
            Rec(
                parseJson(
                    """{"id":"minka00001","name":"Minka","nicknames":["Mimi","Schnurrli","Minka",7,""],"species":"Katze","createdAt":1}""",
                ) as JsonObject,
            ),
        )
        db.pets.add(
            Rec(parseJson("""{"id":"tiger00001","name":"Tiger","nicknames":"Tigi","species":"Katze","createdAt":2}""") as JsonObject),
        )
        phone.store.replaceDb(db)
        assertEquals("each name once", listOf("Minka", "Mimi", "Schnurrli"), namesOf(derive.getPet("minka00001")))
        assertEquals("what another phone sent that is no list is left out", listOf("Tiger"), namesOf(derive.getPet("tiger00001")))
        val noon = at("2026-10-02T12:00")
        val week = (0 until 7).map { derive.calledNames(listOf("minka00001"), "line", noon + it * DAY) }
        assertTrue("each name in a week $week", listOf("Mimi", "Schnurrli").all { it in week } && "Minka" in week)
        assertEquals("the same later that day", week[0], derive.calledNames(listOf("minka00001"), "line", noon + 3 * 3_600_000L))
        assertEquals(callName(derive.getPet("minka00001"), "meal0001"), callName(derive.getPet("minka00001"), "meal0001"))
        assertEquals("several by their own names", "Minka und Tiger", derive.calledNames(listOf("minka00001", "tiger00001"), "line", noon))
    }
}
