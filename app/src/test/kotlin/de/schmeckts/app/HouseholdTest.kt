package de.schmeckts.app

import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// A real household's first three weeks (tests/fixtures/household/mau.json, names changed), replayed every three
// hours as the data stood then: what the evaluation says has to hold up against what happened at the bowl.
class HouseholdTest {
    init {
        berlin()
    }

    private val diary = tidy(fixture("household/mau.json"))
    private val end = diary.servings.maxOf { it.servedAt } + 3_600_000L

    private fun named(variety: String) = diary.products.first { it.str("variety") == variety }.id

    private fun type(id: String?) = diary.products.first { it.id == id }.str("type")

    // the meals served by then, rated only once the rating was given
    private fun asOf(t: Long): Db {
        val db = Db()
        db.pets.addAll(diary.pets)
        db.products.addAll(diary.products.filter { (it.num("createdAt") ?: 0.0) <= t })
        diary.servings.filter { it.servedAt <= t }.forEach { s ->
            val c = s.copy()
            c["pets"] =
                JsonObject(
                    s.pets.mapValues { (_, x) ->
                        if (((x as JsonObject)["at"].asDouble ?: 0.0) <=
                            t
                        ) {
                            x
                        } else {
                            jsonObject("r" to kotlinx.serialization.json.JsonNull)
                        }
                    },
                )
            db.servings.add(c)
        }
        sortNewest(db.servings, "servedAt")
        db.observations.addAll(diary.observations.filter { it.at <= t })
        sortNewest(db.observations, "at")
        return db
    }

    private class Said(
        val t: Long,
        val db: Db,
        val m: Model,
        val insights: List<Insight>,
    )

    private val said: List<Said> by lazy {
        val out = mutableListOf<Said>()
        var t = diary.servings.minOf { it.servedAt }
        while (t <= end) {
            val db = asOf(t)
            val m = analyze(db, Filter(), t)
            out.add(Said(t, db, m, insights(db, m, t)))
            t += 3 * 3_600_000L
        }
        out
    }
    private val last get() = said.last()

    private val pet = diary.pets[0].id
    private val db0 by lazy { asOf(end) }
    private val m0 by lazy { analyze(db0, Filter(), end) }
    private val r0 by lazy { ranking(m0, end) }

    private fun names(ids: List<String>) = ids.map { id -> diary.products.first { it.id == id }.str("variety") }

    private fun tones(x: Side) = listOf(x.good, x.mid, x.sauce, x.bad)

    @Test
    fun `four days of food in sauce she leaves are the food, not the cat - never an appetite alarm`() {
        assertEquals(emptyList<Long>(), said.filter { x -> x.m.hints.any { it.kind == "appetit" } }.map { it.t })
    }

    @Test
    fun `the treats she always eats up are never put forward to buy again`() {
        assertTrue(said.all { x -> x.m.hints.all { it.kind != "liebling" || type(it.id) != "Snack" } })
    }

    @Test
    fun `food in sauce goes down worse, and no flavour takes the blame for it`() {
        val sauce = last.insights.find { it.kind == "konsistenz" }
        assertTrue(last.insights.map { it.kind }.toString(), sauce?.a?.key == "sosse" && sauce.gap < 0)
        assertTrue(said.all { x -> x.insights.all { it.kind != "geschmack" } })
    }

    @Test
    fun `what she eats and what she leaves, by variety and by brand`() {
        val r = ranking(last.m, end)
        val ids = { list: List<Sort> -> list.map { it.id } }
        assertTrue(named("Lamm mit Nachtkerzenöl") in ids(r.top))
        for (left in listOf("Huhn & Lachs in Sauce", "Thunfisch & Huhn in Sauce")) {
            assertTrue(
                left,
                named(left) in ids(r.flop) &&
                    last.m.byId
                        .getValue(named(left))
                        .verdict == "nicht",
            )
        }
        assertEquals(
            listOf(listOf("Miamor", "sosse", 4, 0, 9)),
            packs(m0).map { listOf(it.brand, it.texture, it.sorts.size, it.a.good, it.a.n) },
        )
        assertEquals(
            emptyList<Long>(),
            said
                .filter { x ->
                    packs(x.m).any { it.brand == "Catz Finefood" || it.brand == "Bozita" }
                }.map { it.t },
        )
    }

    @Test
    fun `the whole Miamor line fails, and sauce cannot yet be told from the brand`() {
        val traits =
            profile(db0, m0, r0, weeks(db0, m0, pet, end), trend(db0, m0, end), moves(m0, end, r0), observed(db0, m0.pets, end), end)
        assertEquals(listOf("liebling", "pack", "konsistenz", "snacks", "appetit"), traits.map { it.kind })
        assertEquals(listOf("Lamm mit Nachtkerzenöl"), names(traits[0].ids))
        val pack = traits[1].pack!!
        assertEquals(listOf(listOf(0, 3, 4, 2), listOf(16, 5, 8, 2)), listOf(tones(pack.a), tones(pack.b)))
        val sauce = traits[2]
        assertEquals("sosse", sauce.key)
        assertEquals(listOf(listOf(2, 4, 8, 2), listOf(14, 4, 4, 2)), listOf(tones(sauce.insight!!.a), tones(sauce.insight.b)))
        assertEquals(listOf("Miamor", "Bozita"), sauce.mixed)
        assertEquals("Catz Finefood", experimentOf(sauce.insight, sauce.mixed)?.liked)
        assertEquals(10, traits[3].treats?.n)
    }

    @Test
    fun `her appetite is unauffaellig, and no week is ever flagged on the way`() {
        val weeks = weeks(db0, m0, pet, end)
        assertEquals(
            listOf(listOf(13, 5, 5, 2, 1), listOf(14, 6, 1, 4, 3), listOf(13, 5, 2, 6, 0)),
            weeks.map { listOf(it.n, it.good, it.mid, it.sauce, it.bad) },
        )
        assertEquals(listOf(5.31, 5.23, 5.48), weeks.map { Math.round(it.expected * 100) / 100.0 })
        assertEquals(listOf(emptyMap(), mapOf("tired" to 1, "happy" to 2), mapOf("happy" to 1)), weeks.map { it.seen })
        assertEquals(at("2026-09-20"), weeks[0].from)
        assertEquals("unauffaellig", appetiteOf(m0, pet, trend(db0, m0, end), weeks)?.state)
        val flagged =
            said.filter { x ->
                val state = appetiteOf(x.m, pet, trend(x.db, x.m, x.t), weeks(x.db, x.m, pet, x.t))?.state
                state == "wieder" || state?.startsWith("zuletzt") == true
            }
        assertEquals(emptyList<Long>(), flagged.map { it.t })
    }

    @Test
    fun `the shelf and what to feed next`() {
        val shelf = shelf(m0)
        assertEquals(listOf(2, 2, 4, 20), listOf(shelf.buy, shelf.meh, shelf.stop, shelf.open))
        val last = LinkedHashMap<String, Long>()
        for (s in db0.servings) s.str("productId")?.let { if (!last.containsKey(it)) last[it] = s.servedAt }
        val picks = nextPicks(r0, nextUp(m0, end, r0, last, slowStarters(m0)))
        assertEquals(8, picks.size)
        assertEquals(listOf("Pute mit Reis Pastete", "Wildschwein mit Nachtkerzenöl"), names(picks.take(2).map { it.id }))
        assertEquals(listOf<Any>(51, at("2026-09-20")), diary(m0).let { listOf(it.n, dayStart(it.first)) })
    }
}
