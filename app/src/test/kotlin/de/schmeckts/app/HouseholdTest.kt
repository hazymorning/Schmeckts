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
        assertEquals(listOf("Catz Finefood", "Bozita", "Miamor"), taste(last.m).marke.map { it.key })
    }
}
