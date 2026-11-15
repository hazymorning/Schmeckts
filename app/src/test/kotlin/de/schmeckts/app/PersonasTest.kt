package de.schmeckts.app

import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertTrue
import org.junit.Test

// Erkenntnisse and observations on simulated households: a cat that likes everything alike gets hardly any insight,
// a cat with a clear habit the one that names it; notes that come at random are hardly ever tied to a variety, a
// variety that upsets the stomach is. Seeded, so every run sees the same households.
class PersonasTest {
    init {
        berlin()
    }

    private val hour = 3_600_000L
    private val now = utc(2026, 10, 8, 20)
    private val houses = 200
    private val days = 60
    private val brands = listOf("Sheba", "Felix", "Whiskas", "Gourmet", "Animonda")
    private val flavours = listOf("Huhn", "Rind", "Lachs", "Thunfisch", "Pute")
    private val textures = listOf("in Soße", "in Gelee", "Pastete")

    private class Rnd(
        var seed: Long,
    ) {
        operator fun invoke(): Double {
            seed = ((seed.toInt() * 1664525).toLong() + 1013904223L) and 0xffffffffL
            return seed / 4294967296.0
        }
    }

    // good: the chance of „Alles“ or „Fast alles“; of the rest a share is „Nur Soße“
    private fun rating(
        rnd: Rnd,
        good: Double,
        sauce: Double,
    ): String {
        if (rnd() < good) return if (rnd() < 0.6) "top" else "gut"
        return if (rnd() < sauce) "sosse" else listOf("mittel", "eager", "schlecht")[Math.floor(rnd() * 3).toInt()]
    }

    private class MealSeen(
        val t: Long,
        val p: Map<String, Any?>,
        val again: Boolean,
        val first: Boolean,
        val morning: Boolean,
        val afterSnack: Boolean,
        val by: String,
    )

    private class Habit(
        val good: (MealSeen) -> Double = { 0.6 },
        val sauce: (MealSeen) -> Double = { 0.25 },
        val snacks: Double = 0.3,
    )

    private fun rec(m: Map<String, Any?>) = Rec(j(m) as JsonObject)

    // Two meals a day of ten wet varieties for DAYS days, now and then the same as the meal before, a treat on some
    // days, two people feeding. habit gives the chance of a good rating and the sauce share for one meal. In lines a
    // brand comes in one consistency, and the lines in sauce mostly with chicken, as the shelves have them. A second
    // cat rates the same meals by its own habit, with dice of its own.
    private fun household(
        seed: Long,
        habit: Habit = Habit(),
        lines: Boolean = false,
        second: Habit? = null,
    ): Db {
        val rnd = Rnd(seed)
        val products =
            (0 until 10).map { i ->
                val b = Math.floor(rnd() * brands.size).toInt()
                val flavour = flavours[Math.floor(rnd() * flavours.size).toInt()]
                val texture = textures[(if (lines) b else i) % textures.size]
                mapOf(
                    "id" to "p$i",
                    "brand" to brands[b],
                    "variety" to "${if (lines && texture == "in Soße" && rnd() < 0.7) "Huhn" else flavour} $texture",
                    "type" to "Nassfutter",
                    "codes" to emptyMap<String, Any>(),
                    "lastPets" to emptyList<String>(),
                    "createdAt" to 1,
                )
            }
        val db = Db()
        db.pets.add(rec(mapOf("id" to "cat", "name" to "Mau", "createdAt" to 1)))
        if (second != null) db.pets.add(rec(mapOf("id" to "cat2", "name" to "Mimi", "createdAt" to 2)))
        val cats = db.pets.map { it.id }
        val dice = Rnd(seed + 2)
        products.forEach { db.products.add(rec(it)) }
        db.products.add(
            rec(
                mapOf(
                    "id" to "snack",
                    "brand" to "Dreamies",
                    "variety" to "Käse",
                    "type" to "Snack",
                    "codes" to emptyMap<String, Any>(),
                    "lastPets" to emptyList<String>(),
                    "createdAt" to 1,
                ),
            ),
        )
        val seen = HashSet<String>()
        var before: Map<String, Any?>? = null
        var snack = Double.NEGATIVE_INFINITY
        val servings = mutableListOf<Rec>()
        for (d in days downTo 1) {
            val day = (now - d * DAY).toDouble()
            if (rnd() < habit.snacks) {
                snack = day - 6 * hour + Math.floor(rnd() * 8) * hour
                servings.add(
                    rec(
                        mapOf(
                            "id" to "x$d",
                            "productId" to "snack",
                            "servedAt" to snack.toLong(),
                            "by" to "Anna",
                            "pets" to cats.associateWith { mapOf("r" to "verputzt") },
                        ),
                    ),
                )
            }
            for ((k, h) in listOf(0 to -12.5, 1 to -2.0)) {
                val t = day + h * hour
                val p = if (before != null && rnd() < 0.25) before else products[Math.floor(rnd() * 10).toInt()]
                val meal =
                    MealSeen(
                        t.toLong(),
                        p,
                        before === p,
                        p["id"] !in seen,
                        k == 0,
                        t > snack && t - snack <= 3 * hour,
                        if (rnd() <
                            0.5
                        ) {
                            "Anna"
                        } else {
                            "Jonas"
                        },
                    )
                seen.add(p["id"] as String)
                val r = rating(rnd, habit.good(meal), habit.sauce(meal))
                val rated = mutableMapOf("cat" to mapOf("r" to r))
                if (second != null) rated["cat2"] = mapOf("r" to rating(dice, second.good(meal), second.sauce(meal)))
                servings.add(
                    rec(
                        mapOf(
                            "id" to "s$d$k",
                            "productId" to p["id"],
                            "servedAt" to t.toLong(),
                            "by" to meal.by,
                            "pets" to rated,
                        ),
                    ),
                )
                before = p
            }
        }
        db.servings.addAll(servings.sortedByDescending { it.servedAt })
        return db
    }

    // notes on random days and hours, as often as NOTES says per day; upset: vomiting after half the meals of p3
    private val notes = linkedMapOf("happy" to 2.0 / 7, "stink" to 1.0 / 7, "hungry" to 1.0 / 7, "vomit" to 1.0 / 14)

    private fun noted(
        seed: Long,
        upset: Boolean = false,
    ): Db {
        val db = household(seed)
        val rnd = Rnd(seed + 1)

        fun note(
            kind: String,
            at: Double,
        ) = db.observations.add(
            rec(
                mapOf(
                    "id" to "o${db.observations.size}",
                    "kind" to kind,
                    "at" to at.toLong(),
                    "pets" to mapOf("cat" to true),
                ),
            ),
        )
        for (d in days downTo 1) for ((kind, chance) in notes) if (rnd() < chance) note(kind, now - d * DAY + (8 + rnd() * 12) * hour)
        if (upset) for (s in db.servings) if (s.str("productId") == "p3" && rnd() < 0.5) note("vomit", s.servedAt + (1 + rnd() * 4) * hour)
        sortNewest(db.observations, "at")
        return db
    }

    // per kind of insight, in how many of the households it shows
    private fun shown(
        habit: Habit = Habit(),
        lines: Boolean = false,
    ): Map<String, Int> {
        val out = linkedMapOf("any" to 0)
        for (i in 1..houses) {
            val db = household(i * 7919L, habit, lines)
            val kinds = insights(db, analyze(db, Filter(), now), now).map { it.kind }.toSet()
            if (kinds.isNotEmpty()) out["any"] = out.getValue("any") + 1
            for (k in kinds) out[k] = (out[k] ?: 0) + 1
        }
        return out
    }

    private fun share(
        out: Map<String, Int>,
        k: String,
    ) = (out[k] ?: 0).toDouble() / houses

    // the week rule alone: the hint on home and the four-week trend come first on the page, but have tests of their own
    private fun weekRule(
        db: Db,
        at: Long = now,
    ): String? {
        val m = analyze(db, Filter(), at)
        return appetiteOf(Model(m.pet, m.pets, m.sorts, m.byId, m.rated, emptyList()), "cat", emptyList(), weeks(db, m, "cat", at))?.state
    }

    @Test
    fun `a cat that likes everything alike - after two months at most one household in sixteen sees a line beyond its favourite`() {
        val out = linkedMapOf("any" to 0)
        for (i in 1..houses) {
            val db = household(i * 7919L)
            val kinds =
                findings(db, analyze(db, Filter(), now), now).map { it.kind } + listOfNotNull(weekRule(db)?.takeIf { it != "unauffaellig" })
            if (kinds.isNotEmpty()) out["any"] = out.getValue("any") + 1
            for (k in kinds.toSet()) out[k] = (out[k] ?: 0) + 1
        }
        assertTrue("$out", share(out, "any") <= 1.0 / 16)
    }

    @Test
    fun `a cat that likes everything alike - opened daily for four weeks, at most one household in eight sees a week flagged`() {
        val out = linkedMapOf("any" to 0)
        for (i in 1..houses) {
            val db = household(i * 7919L)
            val states = (0 until 28).mapNotNull { k -> weekRule(db, now - k * DAY)?.takeIf { it != "unauffaellig" } }.toSet()
            if (states.isNotEmpty()) out["any"] = out.getValue("any") + 1
            for (s in states) out[s] = (out[s] ?: 0) + 1
        }
        assertTrue("$out", share(out, "any") <= 1.0 / 8)
    }

    @Test
    fun `a cat whose appetite drops to a third in the last week - three households in five see it as zuletzt schwaecher`() {
        val drop = Habit(good = { if (it.t > now - 7 * DAY) 0.2 else 0.6 })
        val out = linkedMapOf<String, Int>()
        for (i in 1..houses) {
            val state = weekRule(household(i * 7919L, drop)) ?: "none"
            out[state] = (out[state] ?: 0) + 1
        }
        assertTrue("$out", share(out, "zuletzt-schwaecher") >= 0.6)
    }

    private fun differs(
        habit: Habit,
        second: Habit,
    ): Map<String, Int> {
        val out = linkedMapOf("any" to 0)
        for (i in 1..houses) {
            val keys =
                differ(
                    household(i * 7919L, habit, second = second),
                    listOf("cat", "cat2"),
                    now,
                ).map { "${it.kind}:${it.key}" }.toSet()
            if (keys.isNotEmpty()) out["any"] = out.getValue("any") + 1
            for (k in keys) out[k] = (out[k] ?: 0) + 1
        }
        return out
    }

    @Test
    fun `two cats alike - at most one household in sixteen sees them differ`() {
        val out = differs(Habit(), Habit())
        assertTrue("$out", share(out, "any") <= 1.0 / 16)
    }

    @Test
    fun `one cat leaves sauce, the other eats it - most households see them differ on sauce`() {
        val sauce = { good: Double -> Habit(good = { if ("Soße" in (it.p["variety"] as String)) good else 0.6 }) }
        val out = differs(sauce(0.15), sauce(0.8))
        assertTrue("$out", share(out, "konsistenz:sosse") >= 0.75)
    }

    @Test
    fun `a cat with a clear habit - the insight that names it shows in most households after two months`() {
        val habits =
            linkedMapOf(
                "konsistenz" to Habit(good = { if ("Gelee" in (it.p["variety"] as String)) 0.85 else 0.45 }),
                "sosse" to
                    Habit(
                        sauce = { if ("Soße" in (it.p["variety"] as String)) 0.8 else 0.15 },
                        good = { if ("Soße" in (it.p["variety"] as String)) 0.35 else 0.65 },
                    ),
                "wiederholung" to Habit(good = { if (it.again) 0.3 else 0.7 }),
                "neu" to Habit(good = { if (it.first) 0.15 else 0.7 }),
                "tageszeit" to Habit(good = { if (it.morning) 0.35 else 0.75 }),
                "snack" to Habit(good = { if (it.afterSnack) 0.2 else 0.7 }, snacks = 0.6),
                "feeder" to Habit(good = { if (it.by == "Anna") 0.8 else 0.45 }),
                "marke" to Habit(good = { if (it.p["brand"] == "Whiskas") 0.15 else 0.6 }),
            )
        val least = mapOf("konsistenz" to 0.6, "feeder" to 0.6, "marke" to 0.4) // a brand needs two of the ten varieties
        for ((kind, habit) in habits) {
            val out = shown(habit)
            assertTrue("$kind $out", share(out, kind) >= (least[kind] ?: 0.75))
        }
    }

    @Test
    fun `a cat that leaves sauce, the sauce mostly with chicken - hardly any household blames a flavour`() {
        val sauce =
            Habit(
                sauce = { if ("Soße" in (it.p["variety"] as String)) 0.4 else 0.15 },
                good = { if ("Soße" in (it.p["variety"] as String)) 0.15 else 0.6 },
            )
        val out = shown(sauce, true)
        assertTrue("$out", share(out, "geschmack") <= 1.0 / 20 && share(out, "konsistenz") >= 0.75)
    }

    @Test
    fun `notes that come at random - after two months at most one household in ten sees one tied to a variety`() {
        var tied = 0
        for (i in 1..houses) if (observed(noted(i * 7919L), listOf("cat"), now).isNotEmpty()) tied++
        assertTrue("$tied of $houses", tied.toDouble() / houses <= 0.1)
    }

    @Test
    fun `a variety that upsets the stomach - after two months vomiting is tied to it in most households`() {
        var found = 0
        for (i in 1..houses) {
            val links = observed(noted(i * 7919L, true), listOf("cat"), now)
            if (links.any { it.kind == "vomit" && it.id == "p3" }) found++
        }
        assertTrue("$found of $houses", found.toDouble() / houses >= 0.8)
    }
}
