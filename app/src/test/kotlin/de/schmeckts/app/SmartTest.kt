package de.schmeckts.app

import de.schmeckts.app.views.insightSaid
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The evaluation (Smart.kt) with made-up data
class SmartTest {
    init {
        berlin()
    }

    private val now0 = utc(2026, 6, 3, 10)
    private val t = "top"
    private val g = "gut"
    private val mi = "mittel"
    private val s = "sosse"
    private val x = "schlecht"

    private fun house(
        pets: List<String>,
        products: List<Any>,
        meals: List<Meal>,
    ) = household(pets, products, meals, now0)

    private fun model(
        db: Db,
        activePet: String = "all",
        hidden: List<String> = emptyList(),
        now: Long = now0,
    ) = analyze(db, Filter(activePet, hidden), now)

    private fun <T> sorts(
        m: Model,
        pick: (Sort) -> T,
    ) = m.sorts.associate { it.id to pick(it) }

    private fun keys(m: Model) = m.hints.map { hintKey(it) + if (it.kind == "sosse") "@" + it.pet else "" }

    @Test
    fun `score - the scale's points, unknown values do not count`() {
        val m = model(house(listOf("A"), listOf("p"), rate("p", "A", listOf(g, mi, s, x, "lecker"))))
        val e = m.byId.getValue("p")
        assertEquals(listOf(4, 40L, mapOf("gut" to 1, "mittel" to 1, "sosse" to 1, "schlecht" to 1)), listOf(e.n, e.pct, e.counts))
    }

    @Test
    fun `scales - one per food type, every level with its own points, the colour follows the points`() {
        fun scale(type: String) = scaleOf(recOf("type" to j(type))).map { it to RATINGS.getValue(it).score }
        assertEquals(listOf("top" to 100, "gut" to 80, "mittel" to 50, "eager" to 35, "sosse" to 30, "schlecht" to 0), scale("Nassfutter"))
        assertEquals(listOf("gern" to 100, "normal" to 80, "wenig" to 35, "liegen" to 0), scale("Trockenfutter"))
        assertEquals(listOf("verputzt" to 100, "spaeter" to 70, "angeknabbert" to 35, "unberuehrt" to 0), scale("Snack"))
        assertEquals(
            listOf(SCALES["bite"], SCALES["portion"], SCALES["portion"]),
            listOf(scaleOf(recOf("type" to j("Sonstiges"))), scaleOf(Rec()), scaleOf(null)),
        )
        assertEquals("every level belongs to exactly one scale", RATINGS.keys.sorted(), SCALES.values.flatten().sorted())
        assertEquals(
            listOf("r-good", "r-good", "r-mid", "r-sauce", "r-sauce", "r-sauce", "r-bad"),
            listOf("gut", "spaeter", "mittel", "eager", "wenig", "sosse", "liegen").map(::rateCls),
        )
    }

    private fun appetite(
        meals: List<Meal>,
        activePet: String = "all",
        pets: List<String> = listOf("A"),
        now: Long = now0,
    ) = model(household(pets, listOf("p1", "p2", "mies"), meals, now0), activePet, now = now)
        .hints
        .filter { it.kind == "appetit" }
        .map { listOf(hintKey(it), it.n, it.recent, it.usual) }

    @Test
    fun `mixed scales - verdicts and appetite work in points alone, the key counts and not the current type`() {
        val db =
            house(
                listOf("A"),
                listOf(
                    prod("trocken", "type" to "Trockenfutter"),
                    prod("snack", "type" to "Snack"),
                    prod(
                        "gewechselt",
                        "type" to "Trockenfutter",
                    ),
                ),
                rate("trocken", "A", listOf("gern", "normal", "wenig"), 40) + rate("snack", "A", listOf("unberuehrt", "spaeter"), 40) +
                    rate("gewechselt", "A", listOf(t, "normal", s), 40),
            )
        assertEquals(
            mapOf("trocken" to listOf(72L, "nachkaufen"), "gewechselt" to listOf(70L, "nachkaufen"), "snack" to listOf(35L, "neu")),
            sorts(model(db)) { listOf(it.pct, it.verdict) },
        )
        assertEquals(mapOf("top" to 1, "normal" to 1, "sosse" to 1), model(db).byId.getValue("gewechselt").counts)
        val usual = daily("A", List(8) { "trocken" to "normal" }, 4)
        val low = daily("A", listOf("trocken" to "wenig", "snack" to "angeknabbert", "p" to mi), 0.4, 0.8)
        assertEquals(listOf(listOf("appetit:A:2026-06-03", 3, 40L, 80L)), appetite(usual + low))
    }

    @Test
    fun `verdicts count ratings - buy again from 3 with two thirds good, stop buying from 2 with more than half left`() {
        val cases =
            linkedMapOf(
                "zwei" to listOf(t, t),
                "drei" to listOf(t, t, t),
                "zweiDrittel" to listOf(g, g, x),
                "halb" to listOf(g, mi, mi, g),
                "knapp" to listOf(t, mi, mi),
                "eins" to listOf(x),
                "halbLiegen" to listOf(mi, x),
                "nein2" to listOf(s, x),
                "dreiViertel" to listOf(t, s, s, x),
                "nein3" to listOf(mi, s, s),
                "bissl" to listOf(mi, "eager", "eager"),
            )
        val db = house(listOf("A"), cases.keys.toList(), cases.flatMap { (id, rs) -> rate(id, "A", rs) })
        assertEquals(
            mapOf(
                "zwei" to "neu",
                "drei" to "nachkaufen",
                "zweiDrittel" to "nachkaufen",
                "halb" to "geht",
                "knapp" to "geht",
                "eins" to "neu",
                "halbLiegen" to "neu",
                "nein2" to "nicht",
                "dreiViertel" to "nicht",
                "nein3" to "nicht",
                "bissl" to "nicht",
            ),
            sorts(model(db)) { it.verdict },
        )
    }

    @Test
    fun `the verdict rests on the newest eight ratings of the last 180 days, the score still weighs every rating`() {
        fun stat(meals: List<Meal>): List<Any> {
            val e = model(house(listOf("A", "B"), listOf("p"), meals)).byId.getValue("p")
            return listOf(e.n, e.verdict)
        }
        assertEquals(
            "three good ones 200 days ago and three left this week: only this week counts",
            listOf(3, "nicht"),
            stat(rate("p", "A", listOf(t, t, t), 200) + rate("p", "A", listOf(x, x, x), 2)),
        )
        val year = daily("A", List(10) { "p" to t }, 40, 30) // ten good ones, one a month
        assertEquals(
            "ten good over the year, then five left in a row: five of the newest eight",
            listOf(8, "nicht"),
            stat(
                year + daily("A", List(5) { "p" to x }, 1),
            ),
        )
        assertEquals(
            "ten good and two left: two of the seven within the window",
            listOf(7, "nachkaufen"),
            stat(
                year + daily("A", List(2) { "p" to x }, 1),
            ),
        )
        assertEquals("ratings older than 180 days alone: too few again", listOf(0, "neu"), stat(rate("p", "A", listOf(t, t, t, t), 181)))
        val old = model(house(listOf("A"), listOf("p"), rate("p", "A", listOf(t, t, t, t), 181))).byId.getValue("p")
        assertTrue("the score and the total still hold the old ratings", old.score > 0 && old.total == 4 && old.house.n == 0)
        // The household: each pet its own window, the household's counts their sum
        val db =
            house(
                listOf("A", "B"),
                listOf("p"),
                daily("A", List(9) { "p" to t }, 1) + daily("B", List(8) { "p" to x } + List(4) { "p" to t }, 1),
            )
        val both = model(db)
        val e = both.byId.getValue("p")
        assertEquals(
            listOf(8, "nachkaufen", 8, "nicht", 16, mapOf("top" to 8, "schlecht" to 8), "gemischt", 21),
            listOf(
                e.pets.getValue("A").n,
                e.pets.getValue("A").verdict,
                e.pets.getValue("B").n,
                e.pets.getValue("B").verdict,
                e.house.n,
                e.house.counts,
                e.verdict,
                e.total,
            ),
        )
        val b = ratingsIn(model(db, "B"), listOf("p"))
        assertEquals(
            "a strip shows the windows, and says that older ratings lie beyond",
            listOf(16, true, List(8) { x }, true),
            listOf(ratingsIn(both, listOf("p")).keys.size, ratingsIn(both, listOf("p")).more, b.keys, b.more),
        )
    }

    @Test
    fun `the weight halves every 90 days`() {
        val db =
            house(
                listOf("A"),
                listOf("alt", "halb"),
                rate("alt", "A", listOf(x), 180) + rate("alt", "A", listOf(t)) + rate("halb", "A", listOf(t), 90) +
                    rate("halb", "A", listOf(x)),
            )
        assertEquals(mapOf("alt" to 80L, "halb" to 33L), sorts(model(db)) { it.pct })
    }

    @Test
    fun `the score does not depend on when it is computed, as long as no rating is added`() {
        val db = house(listOf("A"), listOf("p"), rate("p", "A", listOf(x), 200) + rate("p", "A", listOf(t, g), 20))
        assertEquals(fixed6(model(db).byId.getValue("p").score), fixed6(model(db, now = now0 + 400 * DAY).byId.getValue("p").score), 0.0)
    }

    @Test
    fun `only meals up to now count`() {
        val db = house(listOf("A"), listOf("p"), rate("p", "A", listOf(x, x), 5) + rate("p", "A", listOf(t, t, t), -3))

        fun e(time: Long) = model(db, now = time).byId.getValue("p").let { listOf(it.n, it.verdict) }
        assertEquals(listOf(listOf(2, "nicht"), listOf(5, "geht")), listOf(e(now0), e(now0 + 6 * DAY)))
    }

    @Test
    fun `household, mixed verdict, the manual setting and the pet filter`() {
        val db =
            house(
                listOf("Minka", "Tiger"),
                listOf("gemischt", "ja", "nein", "offen", prod("immer", "kaufen" to "immer"), prod("nie", "kaufen" to "nicht")),
                rate(
                    "gemischt",
                    "Minka",
                    listOf(g, g, g),
                ) + rate("gemischt", "Tiger", listOf(x, x)) + rate("ja", "Minka", listOf(g, g, g)) +
                    rate("ja", "Tiger", listOf(x)) + rate("nein", "Minka", listOf(x, s)) + rate("nein", "Tiger", listOf(g)) +
                    rate("offen", "Minka", listOf(g, g)) + rate("immer", "Minka", listOf(x, x)) + rate("nie", "Tiger", listOf(g, g, g)),
            )
        val m = model(db)
        assertEquals(
            mapOf(
                "gemischt" to listOf("gemischt", listOf("Minka"), listOf("Tiger")),
                "ja" to listOf("nachkaufen", listOf("Minka"), emptyList<String>()),
                "nein" to listOf("nicht", emptyList<String>(), listOf("Minka")),
                "offen" to listOf("neu", emptyList<String>(), emptyList<String>()),
                "immer" to listOf("nicht", emptyList<String>(), listOf("Minka")),
                "nie" to listOf("nachkaufen", listOf("Tiger"), emptyList<String>()),
            ),
            sorts(m) { listOf(it.house.verdict, it.yes, it.no) },
        )
        assertEquals(listOf("nachkaufen", "nicht", "gemischt"), listOf("immer", "nie", "gemischt").map { m.byId.getValue(it).choice })
        assertTrue("Sorten mit eigener Einstellung bekommen keine Hinweise", keys(m).none { Regex(":(immer|nie)").containsMatchIn(it) })
        val tiger = model(db, "Tiger")
        assertEquals(listOf("nicht", 2, 7), listOf(tiger.byId.getValue("gemischt").verdict, tiger.byId.getValue("gemischt").n, tiger.rated))
    }

    @Test
    fun `hints by precedence, hidden per type and variety, no treat to buy again`() {
        val db =
            house(
                listOf("A", "B"),
                listOf("stop1", "stop2", "sauce", "lieb1", "lieb2", "wenig", "selten", prod("leckerli", "type" to "Snack")),
                rate("leckerli", "A", listOf("verputzt", "verputzt", "verputzt")) + rate("stop1", "A", listOf(x, x, x)) +
                    rate("stop2", "A", listOf(s, x)) +
                    rate("sauce", "A", listOf(g, g, g)) + rate("sauce", "B", listOf(s, s, g)) + rate("lieb1", "A", listOf(g, g, mi)) +
                    rate("lieb2", "A", listOf(g, g, g)) + rate("wenig", "B", listOf(s, s, g, g, mi)) + rate("selten", "A", listOf(s, s)),
            )
        assertEquals(
            listOf("stop:stop1", "stop:stop2", "stop:selten", "sosse:sauce@B", "liebling:lieb2", "liebling:lieb1"),
            keys(model(db)),
        )
        assertEquals(
            listOf("stop:stop2", "stop:selten", "sosse:sauce@B", "liebling:lieb1"),
            keys(model(db, hidden = listOf("stop:stop1", "liebling:lieb2"))),
        )
        assertEquals("A buys it again, B leaves it: no stop hint, the sauce one", "gemischt", model(db).byId.getValue("sauce").verdict)
    }

    @Test
    fun `feeding times - from 14 days, treats excluded, from 4 days on, reminder 45 minutes later, only when nothing has been served`() {
        fun day(
            d: Int,
            time: String,
        ) = "2026-06-${d.toString().padStart(2, '0')}T$time"
        val now = at(day(10, "12:00"))
        val meals =
            listOf(3, 4, 5, 6, 7, 8, 9).flatMap { d ->
                listOf(
                    meal(
                        "nass",
                        mapOf("A" to g),
                        day(
                            d,
                            if (d % 2 ==
                                1
                            ) {
                                "07:10"
                            } else {
                                "07:40"
                            },
                        ),
                    ),
                    meal("nass", mapOf("A" to g), day(d, "18:30")),
                )
            } +
                listOf(7, 8, 9).map { meal("nass", mapOf("A" to g), day(it, "12:30")) } +
                listOf(5, 6, 7, 8, 9).map { meal("snack", mapOf("A" to "verputzt"), day(it, "15:00")) } +
                meal("nass", mapOf("A" to g), day(10, "07:20"))
        val products = listOf(prod("nass", "type" to "Nassfutter"), prod("snack", "type" to "Snack"))
        val db = house(listOf("A"), products, meals)

        fun hhmm(min: Int) = "${(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}"
        assertEquals(
            listOf(listOf("07:10", "07:20", "08:05"), listOf("18:30", "18:30", "19:15")),
            feedSlots(db, now).map {
                listOf(hhmm(it.from), hhmm(it.at), hhmm(it.remind))
            },
        )

        fun sv(time: Long): String {
            val c = calendar(time)
            return "%04d-%02d-%02d %02d:%02d:%02d".format(
                c.get(java.util.Calendar.YEAR),
                c.get(java.util.Calendar.MONTH) + 1,
                c.get(java.util.Calendar.DAY_OF_MONTH),
                c.get(java.util.Calendar.HOUR_OF_DAY),
                c.get(java.util.Calendar.MINUTE),
                c.get(java.util.Calendar.SECOND),
            )
        }

        fun due(
            data: Db,
            time: Long,
        ) = feedReminders(data, time).map { listOf(it.key, sv(it.at)) }

        fun days(
            from: Int,
            to: Int,
        ) = (from..to).map { "2026-06-$it" }
        assertEquals(
            days(11, 16).map { listOf("$it|440", "$it 08:05:00") } + days(10, 16).map { listOf("$it|1110", "$it 19:15:00") },
            due(db, now),
        )
        val fed = house(listOf("A"), products, meals + meal("snack", mapOf("A" to "verputzt"), day(10, "17:50")))
        val fedMeal = house(listOf("A"), products, meals + meal("nass", mapOf("A" to null), day(10, "17:45")))
        assertEquals(
            listOf(13, days(11, 16).map { "$it|440" } + days(11, 16).map { "$it|1110" }),
            listOf(due(fed, at(day(10, "18:00"))).size, due(fedMeal, at(day(10, "18:00"))).map { it[0] }),
        )
        assertEquals(emptyList<Slot>(), feedSlots(house(listOf("A"), listOf("nass"), meals.take(6)), now))
    }

    @Test
    fun `flavours - every group a name holds, matched at the start of a word, the general fish only without a particular one`() {
        val cases =
            mapOf(
                "Seelachs in Soße" to listOf("Fisch"),
                "Wildschwein mit Nachtkerzenöl" to listOf("Wildschwein"),
                "Hirschragout" to listOf("Wild"),
                "Huhn & Thunfisch" to listOf("Thunfisch", "Huhn"),
                "Pferd mit Nachtkerzenöl" to listOf("Pferd"),
                "Rinderherz" to listOf("Rind", "Herz"),
                "Elemente" to emptyList(),
                "Herzhaftes" to emptyList(),
                "Lachs mit Fischöl" to listOf("Lachs"),
                "Forelle & Lachs" to listOf("Lachs", "Fisch"),
                "Hühnerleber" to listOf("Huhn", "Leber"),
                "Rentier in Soße" to listOf("Wild"),
                "Huhn & Fasan mit Quinoa" to listOf("Huhn", "Wild"),
                "Wild & Rotbarsch" to listOf("Wild", "Fisch"),
            )
        for ((text, want) in cases) assertEquals(text, want, flavoursOf(text))
    }

    // Erkenntnisse as the page words them, strongest first: [kind, sentence, counts] without markup
    private fun learned(
        db: Db,
        activePet: String = "all",
        now: Long = now0,
    ) = insights(db, model(db, activePet, now = now), now).map {
        val said = insightSaid(it)
        listOf(it.kind, said.say.replace(Regex("<[^>]*>"), ""), said.why.replace(Regex("<[^>]*>"), ""))
    }

    private fun learnedOf(
        kind: String,
        db: Db,
        activePet: String = "all",
    ) = learned(db, activePet).filter { it[0] == kind }.map { it.drop(1) }

    private val four =
        listOf(
            prod("a", "brand" to "Sheba", "variety" to "Lachs in Soße"),
            prod("b", "brand" to "Sheba", "variety" to "Huhn in Soße"),
            prod("c", "brand" to "Felix", "variety" to "Lachs in Gelee"),
            prod("d", "brand" to "Felix", "variety" to "Huhn in Gelee"),
        )

    // only the comparisons of groups of varieties
    private fun groupsOf(db: Db) = learned(db).filter { it[0] in listOf("marke", "konsistenz", "geschmack") }

    @Test
    fun `Erkenntnisse by brand and consistency - wet food, a group against the rest, two varieties rated twice a group`() {
        assertEquals(
            "a brand on the very varieties of a consistency says nothing more",
            listOf(
                listOf(
                    "konsistenz",
                    "Bisher kommt Stückchen in Soße besser an als Stückchen in Gelee.",
                    "Stückchen in Soße 6 von 6 Mal gut gefressen, Stückchen in Gelee 0 von 6 Mal.",
                ),
            ),
            groupsOf(
                house(
                    listOf("A"),
                    four,
                    rate("a", "A", listOf(t, t, t)) + rate("b", "A", listOf(t, g, t)) + rate("c", "A", listOf(x, x, x)) +
                        rate("d", "A", listOf(s, x, x)),
                ),
            ),
        )
        val mixed =
            listOf(
                prod("a", "brand" to "Sheba", "variety" to "Lachs in Soße"),
                prod("b", "brand" to "Sheba", "variety" to "Huhn in Gelee"),
                prod("c", "brand" to "Felix", "variety" to "Lachs in Soße"),
                prod("d", "brand" to "Felix", "variety" to "Huhn in Gelee"),
                prod("e", "brand" to "Whiskas", "variety" to "Rind in Soße"),
                prod("f", "brand" to "Whiskas", "variety" to "Pute in Gelee"),
            )

        fun brands(left: List<String>) =
            rate("a", "A", listOf(t, t, t)) + rate("b", "A", listOf(t, g, t)) + left.flatMap { rate(it, "A", listOf(x, s, x)) }
        assertEquals(
            listOf("marke", "Bisher kommt Sheba besser an als Felix.", "Sheba 6 von 6 Mal gut gefressen, Felix 0 von 6 Mal."),
            groupsOf(house(listOf("A"), mixed.take(4), brands(listOf("c", "d"))))[0],
        )
        assertEquals(
            "the rest is named where it is one brand",
            listOf(
                listOf(
                    "marke",
                    "Bisher kommt Sheba besser an als andere Marken.",
                    "Sheba 6 von 6 Mal gut gefressen, andere Marken 0 von 12 Mal.",
                ),
            ),
            groupsOf(house(listOf("A"), mixed, brands(listOf("c", "d", "e", "f")))),
        )
        val real =
            listOf(
                prod("m1", "brand" to "Miamor", "variety" to "Huhn in Sauce"),
                prod("m2", "brand" to "Miamor", "variety" to "Ente in Sauce"),
                prod("b1", "brand" to "Bozita", "variety" to "Rentier in Soße"),
                prod("b2", "brand" to "Bozita", "variety" to "Pute in Soße"),
                prod("c1", "brand" to "Catz Finefood", "variety" to "Lamm"),
                prod("c2", "brand" to "Catz Finefood", "variety" to "Pferd"),
                prod("c3", "brand" to "Catz Finefood", "variety" to "Hirsch"),
            )
        assertEquals(
            "what does not go down well is said too, against food whose consistency is not known; the brand without sauce says the same",
            listOf(
                listOf(
                    "konsistenz",
                    "Bisher kommt Stückchen in Soße schlechter an als anderes Nassfutter.",
                    "Stückchen in Soße 1 von 10 Mal gut gefressen, anderes Nassfutter 8 von 9 Mal.",
                ),
            ),
            groupsOf(
                house(
                    listOf("A"),
                    real,
                    rate("m1", "A", listOf(x, mi)) + rate("m2", "A", listOf(mi, x)) + rate("b1", "A", listOf(g, s, mi)) +
                        rate("b2", "A", listOf(s, x, mi)) +
                        rate("c1", "A", listOf(t, t, g)) + rate("c2", "A", listOf(g, t, g)) + rate("c3", "A", listOf(t, g, mi)),
                ),
            ),
        )
        assertEquals(
            "four against four, one of them good: so few meals can fall that way by chance",
            emptyList<List<String>>(),
            groupsOf(
                house(
                    listOf("A"),
                    four,
                    rate("a", "A", listOf(t, t)) + rate("b", "A", listOf(t, g)) + rate("c", "A", listOf(x, x)) +
                        rate("d", "A", listOf(t, x)),
                ),
            ),
        )
        assertEquals(
            "one variety a group: that is a verdict, not an insight",
            emptyList<List<String>>(),
            groupsOf(house(listOf("A"), listOf(four[0], four[2]), rate("a", "A", listOf(t, t)) + rate("c", "A", listOf(x, x)))),
        )
        val once =
            rate("a", "A", listOf(t)) + rate("b", "A", listOf(t, g, t)) + rate("c", "A", listOf(x, x, x)) + rate("d", "A", listOf(s, x, x))
        assertEquals("a variety rated once does not make a group", emptyList<List<String>>(), groupsOf(house(listOf("A"), four, once)))
        assertEquals(
            "but its rating counts in a group that has two varieties rated twice",
            listOf(
                listOf(
                    "konsistenz",
                    "Bisher kommt Stückchen in Soße besser an als Stückchen in Gelee.",
                    "Stückchen in Soße 6 von 6 Mal gut gefressen, Stückchen in Gelee 0 von 6 Mal.",
                ),
            ),
            groupsOf(
                house(
                    listOf("A"),
                    four + prod("e", "brand" to "Sheba", "variety" to "Rind in Soße"),
                    once + rate("e", "A", listOf(t, t)),
                ),
            ),
        )
        val dry = four.map { it + ("type" to "Trockenfutter") }
        assertEquals(
            "dry food: no comparison",
            emptyList<List<String>>(),
            groupsOf(
                house(
                    listOf("A"),
                    dry,
                    rate("a", "A", listOf("gern", "gern")) + rate("b", "A", listOf("gern", "gern")) +
                        rate("c", "A", listOf("liegen", "liegen")) +
                        rate("d", "A", listOf("liegen", "liegen")),
                ),
            ),
        )
    }

    @Test
    fun `Geschmacksprofil - brand, consistency and flavour of wet food with its good meals, best first, two varieties rated twice`() {
        val db =
            house(
                listOf("A"),
                four + prod("e", "brand" to "Felix", "variety" to "Rind Pastete"),
                rate("a", "A", listOf(t, t, t)) + rate("b", "A", listOf(t, g, x)) + rate("c", "A", listOf(x, x, mi)) +
                    rate("d", "A", listOf(g, x, x)) +
                    rate("e", "A", listOf(x, x, x, x)),
            )

        fun of(list: List<TasteRow>) = list.map { listOf(it.key, it.good, it.n) }
        val ta = taste(model(db))
        assertEquals(listOf(listOf("Sheba", 5, 6), listOf("Felix", 1, 10)), of(ta.marke))
        assertEquals(listOf(listOf("sosse", 5, 6), listOf("gelee", 1, 6)), of(ta.konsistenz))
        assertEquals(listOf(listOf("Huhn", 3, 6), listOf("Lachs", 3, 6)), of(ta.geschmack))
        val soft = house(listOf("A"), listOf(four[0], four[1]), rate("a", "A", listOf(t, t)) + rate("b", "A", listOf(x, x)))
        assertEquals("one consistency alone has nothing to be set against", emptyList<TasteRow>(), taste(model(soft)).konsistenz)
        val kinds = listOf("Huhn", "Rind", "Lachs", "Pute", "Ente", "Kalb")
        val many =
            house(
                listOf("A"),
                kinds.flatMap { listOf(prod(it + "1", "variety" to "$it in Soße"), prod(it + "2", "variety" to "$it in Gelee")) },
                kinds.flatMapIndexed { i, k ->
                    rate(k + "1", "A", if (i == 5) listOf(t, t) else listOf(t, t, x)) +
                        rate(k + "2", "A", listOf(t, x))
                },
            )
        assertEquals(
            "the five most rated, the one rated least is left out however well it went",
            listOf("Ente", "Huhn", "Lachs", "Pute", "Rind"),
            taste(model(many)).geschmack.map { it.key },
        )
    }

    @Test
    fun `Erkenntnisse by flavour - only against varieties of the same brand and consistency, two flavours count in both`() {
        val line =
            listOf(
                prod("h1", "brand" to "Sheba", "variety" to "Huhn in Soße"),
                prod("h2", "brand" to "Sheba", "variety" to "Huhn & Lachs in Soße"),
                prod("r1", "brand" to "Sheba", "variety" to "Rind in Soße"),
                prod("l1", "brand" to "Sheba", "variety" to "Lachs in Soße"),
            )
        assertEquals(
            listOf(
                listOf(
                    "geschmack",
                    "Bisher kommt Huhn besser an als andere Sorten derselben Marke.",
                    "Mit Huhn 8 von 8 Mal gut gefressen, ohne 0 von 8 Mal.",
                ),
            ),
            groupsOf(
                house(
                    listOf("A"),
                    line,
                    rate("h1", "A", listOf(t, t, t, t)) + rate("h2", "A", listOf(t, g, t, t)) + rate("r1", "A", listOf(x, x, x, x)) +
                        rate("l1", "A", listOf(x, s, x, x)),
                ),
            ),
        )
        val sauce =
            listOf(
                prod("s1", "brand" to "Sheba", "variety" to "Huhn in Soße"),
                prod("s2", "brand" to "Sheba", "variety" to "Huhn & Pute in Soße"),
                prod("p1", "brand" to "Felix", "variety" to "Huhn Pastete"),
                prod("p2", "brand" to "Felix", "variety" to "Rind Pastete"),
                prod("p3", "brand" to "Felix", "variety" to "Lamm Pastete"),
            )
        assertEquals(
            "chicken came mostly in sauce, and the sauce is to blame, not the chicken",
            listOf(
                listOf(
                    "konsistenz",
                    "Bisher kommt Pastete besser an als Stückchen in Soße.",
                    "Pastete 9 von 9 Mal gut gefressen, Stückchen in Soße 0 von 6 Mal.",
                ),
            ),
            groupsOf(
                house(
                    listOf("A"),
                    sauce,
                    rate("s1", "A", listOf(x, x, x)) + rate("s2", "A", listOf(s, x, x)) + rate("p1", "A", listOf(t, t, t)) +
                        rate("p2", "A", listOf(t, g, t)) +
                        rate("p3", "A", listOf(g, t, t)),
                ),
            ),
        )
    }

    @Test
    fun `Erkenntnisse by consistency - the texture field, the keywords only when it is missing`() {
        val db =
            house(
                listOf("A"),
                listOf(
                    prod("n1", "variety" to "Lachs in Soße", "texture" to "gelee"),
                    prod("n2", "variety" to "Huhn in Gelee"),
                    prod("n3", "variety" to "Rind Pastete"),
                    prod("n4", "variety" to "Pute", "texture" to "pastete"),
                ),
                rate("n1", "A", listOf(t, t, t)) + rate("n2", "A", listOf(t, g, t)) + rate("n3", "A", listOf(mi, mi, mi)) +
                    rate("n4", "A", listOf(x, mi, x)),
            )
        assertEquals(
            listOf(
                listOf(
                    "Bisher kommt Stückchen in Gelee besser an als Pastete.",
                    "Stückchen in Gelee 6 von 6 Mal gut gefressen, Pastete 0 von 6 Mal.",
                ),
            ),
            learnedOf("konsistenz", db),
        )
    }

    @Test
    fun `Erkenntnisse on sauce - at least four in ten ratings of the varieties in sauce Nur Sosse, from five ratings`() {
        fun sauce(meals: List<Meal>) =
            learnedOf("sosse", house(listOf("A"), listOf("x") + four + prod("p", "variety" to "Rind Pastete"), meals))
        val licked = rate("a", "A", listOf(s, s, t, t, t)) + rate("b", "A", listOf(s, s, t, t, t))
        val said = "Bei Stückchen in Soße wird oft nur die Soße geleckt."
        assertEquals(listOf(listOf(said, "4 von 10 Mal nur die Soße.")), sauce(licked))
        assertEquals(
            "the texture that goes down well is named, not one that does not",
            listOf(listOf(said, "4 von 10 Mal nur die Soße. Stückchen in Gelee dagegen 4 von 5 Mal gut gefressen.")),
            sauce(licked + rate("c", "A", listOf(t, t, x)) + rate("d", "A", listOf(t, g)) + rate("p", "A", listOf(x, x, x, x, t))),
        )
        assertEquals(
            "no texture goes down better: no advice",
            listOf(listOf(said, "4 von 10 Mal nur die Soße.")),
            sauce(
                licked + rate("p", "A", listOf(x, x, x, x, t)),
            ),
        )
        assertEquals(
            "four ratings are too few",
            emptyList<List<String>>(),
            sauce(
                rate("a", "A", listOf(s, s, t)) + rate("b", "A", listOf(s)),
            ),
        )
        assertEquals(
            "three in ten are not enough, and a variety not in sauce does not count",
            emptyList<List<String>>(),
            sauce(rate("a", "A", listOf(s, t, t, t, t)) + rate("b", "A", listOf(s, s, t, t, t)) + rate("x", "A", listOf(s, s))),
        )
    }

    // A pet's meals in the order they were served, the oldest first, one a day up to yesterday: [variety, rating]
    private fun inTurn(
        pet: String,
        meals: List<Pair<String?, String?>>,
    ) = meals.mapIndexed { i, (sort, r) -> Meal(sort, mapOf(pet to r), meals.size - i) }

    private val sortsAB = listOf("a", "b", "c", "d", prod("snack", "type" to "Snack"))

    // four times the same variety again right away, all left, against five after another one, all eaten well
    private val again0 = listOf("a" to t, "a" to x, "b" to t, "b" to x, "c" to t, "c" to x, "d" to t, "d" to x, "a" to t, "b" to t)

    @Test
    fun `Erkenntnisse on serving the same twice - a meal of the variety the pet had just before against one of another`() {
        fun again(meals: List<Pair<String?, String?>>) = learnedOf("wiederholung", house(listOf("A"), sortsAB, inTurn("A", meals)))
        assertEquals(
            listOf(
                listOf(
                    "Zweimal hintereinander dieselbe Sorte kommt schlechter an.",
                    "Beim zweiten Mal 0 von 4 Mal gut gefressen, sonst 5 von 5 Mal.",
                ),
            ),
            again(again0),
        )
        assertEquals("three times again are too few", emptyList<List<String>>(), again(again0.drop(2)))
        assertEquals(
            "the same again going down better is no help when buying or feeding",
            emptyList<List<String>>(),
            again(
                again0.map { (sort, r) ->
                    sort to
                        (if (r == t) x else t)
                },
            ),
        )
        val around = listOf<Pair<String?, String?>>("a" to t, "snack" to "verputzt", "a" to x, null to t, "a" to x)
        val db = house(listOf("A"), sortsAB, inTurn("A", around + again0.drop(2)))
        assertEquals(
            "a treat between two meals of the same variety leaves it a repeat, a meal of unknown food takes a place",
            listOf(listOf(4, 0, 6, 5)),
            insights(db, model(db), now0).filter { it.kind == "wiederholung" }.map { listOf(it.a.n, it.a.good, it.b.n, it.b.good) },
        )
    }

    // first encounters: [variety, first rating, later ratings …] each, the first one the oldest, the later ones spread
    // after it five days apart, all of it `start` days ago
    private fun met(
        pet: String,
        list: List<List<String>>,
        start: Int = 100,
    ) = list.flatMapIndexed { i, l -> l.drop(1).mapIndexed { k, r -> Meal(l[0], mapOf(pet to r), start - k * 5 - i) } }

    private val newSorts = listOf("s1", "s2", "s3", "s4", "s5", "s6", prod("snack", "type" to "Snack"))
    private val curious =
        listOf(
            listOf("s1", t, x, x, x, x),
            listOf("s2", t, x, x, x),
            listOf("s3", t, t, x, x, x),
            listOf("s4", t, t, x, x),
            listOf("s5", t, t, x, x),
            listOf("s6", x, x, x, x, x),
        )
    private val slow =
        listOf(
            listOf("s1", x, t, t, t, t, t),
            listOf("s2", x, t, t, t, t),
            listOf("s3", x, t, t, t, x),
            listOf("s4", t, t, t, t, x),
            listOf("s5", x, t, t, t, t),
        )

    @Test
    fun `Erkenntnisse on new varieties - the first rating of each against the later ones, from five varieties served again`() {
        fun fresh(meals: List<Meal>) = learnedOf("neu", house(listOf("A"), newSorts, meals))
        assertEquals(
            listOf(
                listOf(
                    "Neue Sorten kommen beim ersten Mal besser an als danach.",
                    "Beim ersten Mal 5 von 6, danach 3 von 21 Mal gut gefressen.",
                ),
            ),
            fresh(met("A", curious)),
        )
        assertEquals(
            "every rating counts, however old",
            listOf(
                listOf(
                    "Neue Sorten brauchen eine Weile, danach läuft es besser.",
                    "Beim ersten Mal 1 von 5, danach 19 von 21 Mal gut gefressen.",
                ),
            ),
            fresh(met("A", slow, 400)),
        )
        assertEquals("four varieties are too few", emptyList<List<String>>(), fresh(met("A", slow.take(4))))
        assertEquals(
            "a variety rated once and treats do not count",
            emptyList<List<String>>(),
            fresh(met("A", slow.take(4) + listOf(listOf("s5", x), listOf("snack", "unberuehrt", "verputzt", "verputzt")))),
        )
        val both = met("A", curious) + met("B", slow, 300)
        assertEquals(
            "a pet that needs a while is told apart for a second try, in the filter",
            listOf(listOf("B"), emptyList()),
            listOf(
                slowStarters(model(house(listOf("A", "B"), newSorts, both))),
                slowStarters(model(house(listOf("A", "B"), newSorts, both), "A")),
            ),
        )
    }

    // meals by day from 1 February on: per day [hour, rating] pairs, the oldest first; hour 25 is one in the night after
    private fun byDays(
        pet: String,
        days: List<List<Pair<Int, String>>>,
    ) = days.flatMapIndexed { i, meals ->
        meals.mapIndexed { k, (hour, r) ->
            Meal(
                if (k % 2 ==
                    1
                ) {
                    "a"
                } else {
                    "b"
                },
                mapOf(pet to r),
                At(localTime(2026, 2, 1 + i, hour)),
            )
        }
    }

    @Test
    fun `Erkenntnisse on the time of day - first meal against last, 0_3 apart is enough on enough meals, a wide gap on few is not`() {
        fun daytime(days: List<List<Pair<Int, String>>>) = learnedOf("tageszeit", house(listOf("A"), listOf("a", "b"), byDays("A", days)))

        fun days(
            n: Int,
            hours: Pair<Int, Int>,
            goodFirst: Int,
            goodLast: Int,
        ) = List(n) { i -> listOf(hours.first to (if (i < goodFirst) t else x), hours.second to (if (i < goodLast) t else x)) }
        val firstBetter =
            listOf(
                listOf(
                    "Die erste Mahlzeit am Tag kommt besser an als die letzte.",
                    "Bei der ersten 8 von 8 Mal gut gefressen, bei der letzten 2 von 8 Mal.",
                ),
            )
        assertEquals(firstBetter, daytime(days(8, 7 to 18, 8, 2)))
        assertEquals(
            "the first meal comes at noon, and it is still the first",
            listOf(
                listOf(
                    "Die letzte Mahlzeit am Tag kommt besser an als die erste.",
                    "Bei der ersten 2 von 8 Mal gut gefressen, bei der letzten 8 von 8 Mal.",
                ),
            ),
            daytime(days(8, 12 to 19, 2, 8)),
        )
        assertEquals(
            "a meal in between counts for neither, a day with one meal not at all",
            firstBetter,
            daytime(days(8, 7 to 18, 8, 2).map { (a, b) -> listOf(a, 13 to x, b) } + listOf(listOf(8 to x), listOf(19 to t))),
        )
        assertEquals("a meal in the night still belongs to the day before", firstBetter, daytime(days(8, 7 to 25, 8, 2)))
        assertEquals("three days are too few", emptyList<List<String>>(), daytime(days(3, 10 to 18, 3, 0)))
        assertEquals(
            "4 of 4 against 1 of 4: wide apart, but that many meals can fall that way by chance",
            emptyList<List<String>>(),
            daytime(
                days(
                    4,
                    8 to 18,
                    4,
                    1,
                ),
            ),
        )
        assertEquals("28 of 40 against 16 of 40: exactly 0.3", 1, daytime(days(40, 8 to 19, 28, 16)).size)
        assertEquals("28 of 40 against 20 of 40 are too close", emptyList<List<String>>(), daytime(days(40, 8 to 19, 28, 20)))
    }

    @Test
    fun `Erkenntnisse on treats - the meals up to three hours after one against all others, only where they go down worse`() {
        fun day(
            d: Int,
            time: String,
        ) = "2026-05-${d.toString().padStart(2, '0')}T$time"

        fun after(
            d: Int,
            r: String,
            gap: String = "16:00",
        ) = listOf(meal("snack", mapOf("A" to "verputzt"), day(d, gap)), meal("a", mapOf("A" to r), day(d, "18:00")))

        fun plain(
            d: Int,
            r: String,
        ) = listOf(meal("b", mapOf("A" to r), day(d, "18:00")))

        fun snacks(meals: List<Meal>) = learnedOf("snack", house(listOf("A"), listOf("a", "b", prod("snack", "type" to "Snack")), meals))
        val meals = listOf(1, 2, 3, 4).flatMap { after(it, x) } + listOf(5, 6, 7, 8).flatMap { plain(it, t) }
        assertEquals(
            listOf(
                listOf(
                    "Nach einem Snack bleibt beim nächsten Napf öfter etwas stehen.",
                    "Nach Snacks 0 von 4 Mal gut gefressen, sonst 4 von 4 Mal.",
                ),
            ),
            snacks(meals),
        )
        assertEquals(
            "a treat three and a half hours before does not count",
            emptyList<List<String>>(),
            snacks(listOf(1, 2, 3, 4).flatMap { after(it, x, "14:30") } + listOf(5, 6, 7, 8).flatMap { plain(it, t) }),
        )
        assertEquals("three meals after a treat are too few", emptyList<List<String>>(), snacks(meals.drop(2)))
        assertEquals(
            "meals after treats going down better is no help",
            emptyList<List<String>>(),
            snacks(
                listOf(1, 2, 3, 4).flatMap { after(it, t) } + listOf(5, 6, 7, 8).flatMap { plain(it, x) },
            ),
        )
    }

    @Test
    fun `Erkenntnisse on who serves - the same varieties as often from each person, the one the pets eat best with`() {
        // ten days: the same two varieties from both, a with Anna eaten well, with Jonas left
        fun days(
            ra: (Int) -> String,
            rj: (Int) -> String,
            n: Int = 10,
            sort: List<String> = listOf("a", "b"),
        ) = List(
            n,
        ) { i ->
            listOf(
                meal(sort[i % 2], mapOf("A" to ra(i)), i + 0.5, "Anna"),
                meal(sort[i % 2], mapOf("A" to rj(i)), i + 0.6, "Jonas"),
            )
        }.flatten()

        fun feeder(meals: List<Meal>) = learnedOf("feeder", house(listOf("A"), listOf("a", "b", prod("s", "type" to "Snack")), meals))
        assertEquals(
            listOf(
                listOf(
                    "Bei Anna kommen dieselben Sorten besser an als bei Jonas.",
                    "Bei Anna 10 von 10 Mal gut gefressen, bei Jonas 4 von 10 Mal.",
                ),
            ),
            feeder(days({ t }, { if (it % 3 != 0) x else t })),
        )
        assertEquals("three meals each are too few", emptyList<List<String>>(), feeder(days({ t }, { x }, 3)))
        assertEquals(
            "Jonas serving the liked one more often does not make him better",
            emptyList<List<String>>(),
            feeder(
                List(12) { meal("a", mapOf("A" to t), it + 0.5, "Anna") } + List(12) { meal("b", mapOf("A" to x), it + 0.6, "Anna") } +
                    List(12) { meal("a", mapOf("A" to t), it + 0.7, "Jonas") } + List(2) { meal("b", mapOf("A" to x), it + 0.8, "Jonas") },
            ),
        )
        assertEquals(
            "one person only",
            emptyList<List<String>>(),
            feeder(
                days({ t }, { x }).map {
                    if (it.by ==
                        "Jonas"
                    ) {
                        Meal(it.p, it.rated, it.ago, "")
                    } else {
                        it
                    }
                },
            ),
        )
        assertEquals("treats do not count", emptyList<List<String>>(), feeder(days({ "verputzt" }, { "unberuehrt" }, 10, listOf("s", "s"))))
    }

    @Test
    fun `Erkenntnisse - the widest gap first, and only the pet in the filter`() {
        fun day(
            d: Int,
            hour: String,
        ) = "2026-05-${d.toString().padStart(2, '0')}T$hour:00"

        fun each(
            sort: String,
            list: List<String>,
        ) = list.map { sort to it }
        val db =
            house(
                listOf("A", "B"),
                four,
                daily(
                    "A",
                    each("a", listOf(t, t, t, t)) + each("b", listOf(t, t, t, t)) + each("c", listOf(x, x, x, x)) +
                        each("d", listOf(t, x, x, x)),
                    20,
                ) +
                    listOf(
                        1,
                        2,
                        3,
                        4,
                        5,
                        6,
                        7,
                        8,
                    ).flatMap { listOf(meal("a", mapOf("B" to t), day(it, "07")), meal("c", mapOf("B" to x), day(it, "19"))) },
            )

        fun kinds(activePet: String = "all") = learned(db, activePet).map { it[0] }
        assertEquals(
            "first meal against last before consistency, further apart; each pet on its own",
            listOf(listOf("tageszeit", "konsistenz"), listOf("konsistenz"), listOf("tageszeit")),
            listOf(kinds(), kinds("A"), kinds("B")),
        )
    }

    // „Vorlieben“
    private fun ids(list: List<Sort>) = list.map { it.id }

    private fun sides(
        db: Db,
        activePet: String = "all",
        now: Long = now0,
    ): Map<String, Any> {
        val r = ranking(model(db, activePet, now = now), now)
        return mapOf(
            "top" to ids(r.top),
            "flop" to ids(r.flop),
            "mid" to ids(r.mid),
            "split" to ids(r.split),
            "thin" to ids(r.thin),
            "settled" to r.settled,
        )
    }

    @Test
    fun `Vorlieben - the side comes from the verdict, treats and dry food are left out, nothing is in both lists or padded`() {
        val db =
            house(
                listOf("A"),
                listOf(
                    "favourite",
                    "fresh",
                    "mostly",
                    "half",
                    "little",
                    "left",
                    "new",
                    prod("snack", "type" to "Snack"),
                    prod(
                        "dry",
                        "type" to "Trockenfutter",
                    ),
                    prod("other", "type" to "Sonstiges"),
                ),
                rate("favourite", "A", listOf(t, t, t, t, t, t, t, g), 10) + rate("fresh", "A", listOf(t, t, t), 10) +
                    rate("mostly", "A", listOf(t, t, mi, mi, t), 10) +
                    rate("half", "A", listOf(t, t, mi, mi), 10) + rate("little", "A", listOf(s, s, "eager", "eager"), 10) +
                    rate("left", "A", listOf(x, x), 10) +
                    rate("new", "A", listOf(t), 10) + rate("snack", "A", listOf("verputzt", "verputzt", "verputzt"), 10) +
                    rate("dry", "A", listOf("gern", "gern", "gern"), 10) +
                    rate("other", "A", listOf("verputzt", "verputzt", "spaeter"), 10),
            )
        assertEquals(
            mapOf(
                "top" to listOf("favourite", "fresh", "other", "mostly"),
                "flop" to listOf("left", "little"),
                "mid" to listOf("half"),
                "split" to emptyList<String>(),
                "thin" to listOf("new"),
                "settled" to 7,
            ),
            sides(db),
        )
    }

    @Test
    fun `Vorlieben - a side from a verdict, Geht so by its majority and on average less than half eaten`() {
        fun side(
            counts: Map<String, Int>,
            verdict: String,
        ) = sideOf(Counted(counts.values.sum(), counts, verdict))
        assertEquals(
            "three times half eaten is no flop, and neither is one good, one sauce, one half",
            listOf("top", "flop", "top", "mid", "flop", "mid", "mid", "split", "thin", "thin"),
            listOf(
                side(mapOf("top" to 2, "schlecht" to 1), "nachkaufen"),
                side(mapOf("schlecht" to 2), "nicht"),
                side(mapOf("top" to 3, "mittel" to 2), "geht"),
                side(mapOf("top" to 2, "mittel" to 2), "geht"),
                side(mapOf("sosse" to 2, "eager" to 2), "geht"),
                side(mapOf("mittel" to 3), "geht"),
                side(mapOf("top" to 1, "sosse" to 1, "mittel" to 1), "geht"),
                side(mapOf("top" to 4, "schlecht" to 4), "gemischt"),
                side(mapOf("top" to 1), "neu"),
                side(emptyMap(), "neu"),
            ),
        )
    }

    @Test
    fun `Vorlieben - evidence beats luck, the verdict's own first, and the worst flop first`() {
        assertEquals(
            listOf(80.0, 90.0, 25.0),
            listOf(
                likingOf(Counted(3, mapOf("top" to 3))),
                likingOf(Counted(8, mapOf("top" to 8))),
                likingOf(
                    Counted(
                        2,
                        mapOf(
                            "schlecht" to 2,
                        ),
                    ),
                ),
            ),
        )
        val db =
            house(
                listOf("A"),
                listOf("long", "lucky", "decent", "awful", "poor"),
                rate("long", "A", listOf(t, t, t, t, t, t, t, g), 10) + rate("lucky", "A", listOf(t, t, t), 10) +
                    rate("decent", "A", listOf(t, t, t, mi, mi), 10) +
                    rate("awful", "A", listOf(x, x, x, x, x, x), 10) + rate("poor", "A", listOf(x, x), 10),
            )
        val r = sides(db)
        assertEquals(listOf(listOf("long", "lucky", "decent"), listOf("awful", "poor")), listOf(r["top"], r["flop"]))
        assertEquals(
            "„Einkaufen“ in the same order, so the two never put varieties in a different order",
            listOf(listOf("long", "lucky"), listOf("awful", "poor")),
            listOf(ids(shopGroups(model(db)).nachkaufen), ids(shopGroups(model(db)).nicht)),
        )
    }

    @Test
    fun `Einkaufen - the verdict's own before Gemischt and a setting by hand, then by liking`() {
        val db =
            house(
                listOf("Minka", "Tiger"),
                listOf("split", "both", prod("pinned", "kaufen" to "immer")),
                rate("split", "Minka", List(8) { t }, 10) + rate("split", "Tiger", listOf(x, x, x, x), 10) +
                    rate("both", "Minka", listOf(g, g, g), 10) +
                    rate("both", "Tiger", listOf(g, g, g), 10) + rate("pinned", "Minka", listOf(t, t), 10),
            )
        assertEquals(
            "the top of the card comes first on „Einkaufen“ as well, though the others go down better",
            listOf("both", "pinned", "split"),
            ids(shopGroups(model(db)).nachkaufen),
        )
    }

    @Test
    fun `Vorlieben - the varieties rated at all, and whether all of their ratings lie beyond the window`() {
        fun r(list: List<Meal>) = ranking(model(house(listOf("A"), listOf("p1", "p2"), list)), now0).let { listOf(it.rated, it.stale) }
        val old = rate("p1", "A", listOf(t, t, t), 200)
        assertEquals(
            listOf(listOf(0, false), listOf(1, true), listOf(2, false), listOf(2, false)),
            listOf(r(emptyList()), r(old), r(old + rate("p2", "A", listOf(t), 10)), r(old + rate("p2", "A", listOf(t, t, t), 10))),
        )
    }

    @Test
    fun `Vorlieben with two pets - Gemischt stands apart, and a pet chosen decides on its own`() {
        val db =
            house(
                listOf("Minka", "Tiger"),
                listOf("both", "split", "minka"),
                rate("both", "Minka", listOf(t, t, t), 10) + rate("both", "Tiger", listOf(t, g, t), 10) +
                    rate("split", "Minka", listOf(t, t, t), 10) +
                    rate("split", "Tiger", listOf(x, x, x), 10) + rate("minka", "Minka", listOf(x, x), 10),
            )
        assertEquals(
            mapOf(
                "top" to listOf("both"),
                "flop" to listOf("minka"),
                "mid" to emptyList<String>(),
                "split" to listOf("split"),
                "thin" to emptyList<String>(),
                "settled" to 3,
            ),
            sides(db),
        )
        assertEquals(
            mapOf(
                "top" to listOf("both"),
                "flop" to listOf("split"),
                "mid" to emptyList<String>(),
                "split" to emptyList<String>(),
                "thin" to emptyList<String>(),
                "settled" to 2,
            ),
            sides(db, "Tiger"),
        )
    }

    @Test
    fun `Vorlieben - flat where the varieties differ no more than chance would make them`() {
        fun flat(list: List<Meal>) = ranking(model(house(listOf("A"), listOf("a", "b", "c", "d"), list)), now0).flat
        val alike = listOf("a", "b", "c", "d").flatMap { rate(it, "A", listOf(t, mi, t, mi, t, mi, t, mi), 10) }
        val apart =
            rate("a", "A", List(8) { t }, 10) + rate("b", "A", listOf(t, t, t, t, t, t, t, g), 10) +
                rate("c", "A", listOf(x, x, x, x, x, x, s, s), 10) +
                rate("d", "A", listOf(x, x, x, x, x, x, x, mi), 10)
        assertEquals(listOf(true, false, false), listOf(flat(alike), flat(apart), flat(alike.take(24))))
    }

    @Test
    fun `Vorlieben - varieties still tried, new within 60 days, mostly good so far, the closest to a verdict first`() {
        val db =
            house(
                listOf("A"),
                listOf("one", "two", "left", "old", prod("no", "kaufen" to "nicht"), "settled"),
                rate("one", "A", listOf(t), 5) + rate("two", "A", listOf(t, g), 5) + rate("left", "A", listOf(x), 5) +
                    rate("old", "A", listOf(t), 30) +
                    rate("old", "A", listOf(t), 90) + rate("no", "A", listOf(t), 5) + rate("settled", "A", listOf(t, t, t), 5),
            )
        assertEquals(
            listOf(listOf("two", 1, "A"), listOf("one", 2, "A")),
            ranking(model(db), now0).trials.map { listOf(it.e.id, it.need, it.pet) },
        )
    }

    @Test
    fun `Wie laeuft's gerade - four weeks against the eight before, per pet, a clear change only beyond chance, and its cause`() {
        fun run(
            recent: List<Meal>,
            before: List<Meal>,
            pets: List<String> = listOf("A"),
            activePet: String = "all",
        ): List<List<Any?>> {
            val db = house(pets, listOf("p1", "p2", "p3", prod("snack", "type" to "Snack")), recent + before)
            return trend(db, model(db, activePet), now0).map {
                listOf(it.pet, it.kind, it.dir, it.recent.n, it.recent.good, it.before.n, it.before.good, it.cause, it.behind)
            }
        }

        fun good(
            sort: String,
            n: Int,
            start: Number,
            r: String = t,
        ) = daily("A", List(n) { sort to r }, start)
        // the usual varieties go worse as well: the pet
        assertEquals(
            listOf(listOf("A", "deutlich", -1, 12, 0, 12, 12, "tier", emptyList<String>())),
            run(
                good("p1", 6, 1, x) + good("p2", 6, 7, x),
                good("p1", 6, 30) + good("p2", 6, 40),
            ),
        )
        // the usual one holds and a new one stays in the bowl: the food, named
        assertEquals(
            listOf(listOf("A", "deutlich", -1, 12, 6, 12, 12, "futter", listOf("p3"))),
            run(good("p1", 6, 1) + good("p3", 6, 7, x), good("p1", 12, 30)),
        )
        // 11 of 23 against 20 of 30: under 20 points, so only „etwas“
        assertEquals(
            listOf(listOf("A", "etwas", -1)),
            run(
                good("p1", 11, 1) + daily("A", List(12) { "p2" to mi }, 1, 0.5),
                good("p1", 20, 30, t) + daily("A", List(10) { "p2" to mi }, 31, 0.5),
            ).map { it.take(3) },
        )
        // ten points or less is the same, and nine ratings on a side are too few; treats do not count
        assertEquals(
            listOf(listOf("A", "gleich")),
            run(
                good("p1", 10, 1) + good("p2", 2, 11, mi),
                good("p1", 20, 30) + good("p2", 4, 50, mi),
            ).map { it.take(2) },
        )
        assertEquals(emptyList<List<Any?>>(), run(good("p1", 9, 1) + good("snack", 5, 10, "verputzt"), good("p1", 12, 30)))

        // exactly ten points is no longer the same, whatever the counts
        fun ten(
            now: Int,
            then: Int,
        ) = run(
            good("p1", now, 1) + good("p2", 10 - now, 11, mi),
            good("p1", then, 30) + good("p2", 10 - then, 40, mi),
        ).map { it.take(3) }[0]
        assertEquals(
            listOf(listOf("A", "etwas", 1), listOf("A", "etwas", 1), listOf("A", "etwas", 1), listOf("A", "etwas", -1)),
            listOf(ten(3, 2), ten(2, 1), ten(8, 7), ten(7, 8)),
        )
        // with a pet chosen, only that pet
        val two = good("p1", 12, 1) + daily("B", List(12) { "p1" to x }, 1)
        val before = good("p1", 12, 30) + daily("B", List(12) { "p1" to t }, 30)
        assertEquals(listOf(listOf("A", "gleich"), listOf("B", "deutlich")), run(two, before, listOf("A", "B")).map { it.take(2) })
        assertEquals(listOf(listOf("B", "deutlich")), run(two, before, listOf("A", "B"), "B").map { it.take(2) })
    }

    @Test
    fun `moves - what changed its side within 30 days, a real move only with ratings before and since that differ`() {
        val db =
            house(
                listOf("A"),
                listOf("cooled", "warmed", "new", "once", "steady"),
                rate("cooled", "A", listOf(t, t, t), 40) + rate("cooled", "A", listOf(s, s, s, mi), 5) +
                    rate("warmed", "A", listOf(x, x, mi), 40) +
                    rate("warmed", "A", listOf(t, t, t, t, t), 5) + rate("new", "A", listOf(t, t, t), 5) +
                    rate("once", "A", listOf(t, t, mi), 40) +
                    rate("once", "A", listOf(x), 5) + rate("steady", "A", listOf(x, x, x), 40),
            )
        val m = model(db)
        val mv = moves(m, now0, ranking(m, now0))
        assertEquals(
            "one rating since is no move, and what stood still is not new",
            listOf(
                listOf("new", "warmed"),
                listOf(listOf("cooled", 3, mapOf("top" to 3), 4, mapOf("sosse" to 3, "mittel" to 1))),
                listOf("warmed"),
            ),
            listOf(
                mv.fresh.sorted(),
                mv.cooled.map {
                    listOf(it.id, it.before.n, it.before.counts, it.since.n, it.since.counts)
                },
                mv.warmed.map { it.id },
            ),
        )
        val my = model(house(listOf("A"), listOf("new"), rate("new", "A", listOf(t, t, t), 5)))
        assertEquals("in a young diary nothing is marked new", emptyList<String>(), moves(my, now0, ranking(my, now0)).fresh.toList())
    }

    @Test
    fun `moves - the window and its 180 days are measured from the day the 30 days began`() {
        val db =
            house(
                listOf("A"),
                listOf("far", "near", "b", "c", "d"),
                rate("far", "A", listOf(t, t, t), 250) + rate("far", "A", listOf(t, t, t), 10) + rate("near", "A", listOf(t, t, t), 200) +
                    rate("near", "A", listOf(t, t, t), 10) + listOf("b", "c", "d").flatMap { rate(it, "A", listOf(t, t, t), 60) },
            )
        val m = model(db)
        assertEquals(
            "thirty days ago the old ratings of „far“ already lay beyond the window, those of „near“ did not",
            listOf("far"),
            moves(m, now0, ranking(m, now0)).fresh.toList(),
        )
    }

    private fun lastOf(db: Db): Map<String, Long> {
        val last = LinkedHashMap<String, Long>()
        for (sv in db.servings) sv.str("productId")?.let { if (!last.containsKey(it)) last[it] = sv.servedAt }
        return last
    }

    @Test
    fun `nextUp - favourites gone for six weeks from their newest ratings however old, a second chance only where it pays`() {
        val db =
            house(
                listOf("A", "B"),
                listOf("gone", "recent", prod("no", "kaufen" to "nicht"), "split", "first", prod("treat", "type" to "Snack")),
                rate("gone", "A", listOf(t, t, t), 300) + rate("recent", "A", listOf(t, t, t), 50) + rate("recent", "A", listOf(t), 3) +
                    rate(
                        "no",
                        "A",
                        listOf(t, t, t),
                        100,
                    ) + rate("split", "A", listOf(t, t, t), 100) + rate("split", "B", listOf(x, x), 100) +
                    rate("first", "A", listOf(x), 10) + rate("treat", "A", listOf("verputzt", "verputzt", "verputzt"), 100),
            )
        val m = model(db)
        val r = ranking(m, now0)

        fun next(slow: List<String>) = nextUp(m, now0, r, lastOf(db), slow)
        assertEquals(listOf(listOf("gone", 3, mapOf("top" to 3))), next(listOf("A")).missed.map { listOf(it.id, it.n, it.counts) })
        assertEquals(listOf(listOf("first", "A")), next(listOf("A")).retry.map { listOf(it.id, it.pet) })
        assertEquals("only where slowStarters() says the pet needs a while", emptyList<Retry>(), next(listOf("B")).retry)
        val turned =
            house(
                listOf("A", "B"),
                listOf("flop", "mixed"),
                rate("flop", "A", List(6) { t }, 250) + rate("flop", "A", listOf(x, x), 50) + rate("mixed", "A", listOf(t, t, t), 100) +
                    rate("mixed", "B", List(6) { t }, 250) + rate("mixed", "B", listOf(x, x), 50),
            )
        val mt = model(turned)
        val rt = ranking(mt, now0)
        assertEquals(
            "a favourite once whose window says „Nicht mehr kaufen“ now, for all or for one pet, is not served again",
            listOf(listOf("flop"), listOf("mixed"), emptyList()),
            listOf(ids(rt.flop), ids(rt.split), nextUp(mt, now0, rt, lastOf(turned), emptyList()).missed.map { it.id }),
        )
    }

    @Test
    fun `basis - the ratings the evaluation rests on, since when, and the types left out that have ratings`() {
        val db =
            house(
                listOf("A"),
                listOf("p1", prod("snack", "type" to "Snack"), prod("dry", "type" to "Trockenfutter")),
                rate("p1", "A", listOf(t, g), 3) + rate("p1", "A", listOf(mi), 40) + rate("p1", "A", listOf(t), 400) +
                    rate("snack", "A", listOf("verputzt"), 2),
            )
        val m = model(db)
        val b = basis(m, ranking(m, now0))
        assertEquals(listOf(3, now0 - 40 * DAY, listOf("Snack")), listOf(b.n, b.first, b.left))
        val mt = model(house(listOf("A"), listOf("p1", "p2"), rate("p1", "A", listOf(t, t, t), 3) + rate("p2", "A", listOf(t), 1)))
        assertEquals("only what the lists rest on, not a variety still being tried", 3, basis(mt, ranking(mt, now0)).n)
    }

    private val usual0 = daily("A", List(8) { "p1" to g }, 4)
    private val low0 = daily("A", listOf("p1" to mi, "p2" to s, "p1" to mi), 0.4, 0.8)

    @Test
    fun `appetite - 72 hours against the 30 days before, taking precedence over everything else`() {
        val m = model(house(listOf("A"), listOf("p1", "p2", "mies"), usual0 + low0 + daily("A", listOf("mies" to x, "mies" to x), 40)))
        assertEquals(listOf("appetit:A:2026-06-03", "stop:mies", "liebling:p1"), keys(m))
        assertEquals(listOf(listOf("appetit:A:2026-06-03", 3, 43L, 80L)), appetite(usual0 + low0))
    }

    @Test
    fun `appetite at the thresholds`() {
        val none =
            mapOf(
                "only 2 ratings in the window" to usual0 + low0.take(2),
                "only 7 in the comparison" to usual0.take(7) + low0,
                "only one variety in the window" to usual0 + daily("A", listOf("p1" to mi, "p1" to s, "p1" to mi), 0.4, 0.8),
                "third rating older than 72 hours" to usual0.take(7) + daily("A", listOf("p1" to mi, "p2" to s, "p1" to mi), 0.4, 1.31),
                "only 29 points below" to
                    daily("A", listOf(g, g, g, g, g, mi, mi, mi).map { "p1" to it }, 4) +
                    daily("A", listOf("p1" to mi, "p2" to s, "p1" to mi, "p2" to s), 0.4, 0.6),
                "average not below 50" to
                    daily("A", List(8) { "p1" to t }, 4) + daily("A", listOf("p1" to mi, "p2" to mi, "p1" to mi), 0.4, 0.8),
                "comparison older than 30 days" to daily("A", List(8) { "p1" to g }, 34) + low0,
                "only food that was left before as well" to
                    daily("A", List(6) { "p1" to g } + listOf("p2" to x, "mies" to x), 4) +
                    daily("A", listOf("p2" to x, "mies" to x, "p2" to s), 0.4, 0.8),
            )
        for ((name, meals) in none) assertEquals(name, emptyList<List<Any>>(), appetite(meals))
        val edge =
            daily("A", listOf(g, g, g, g, g, g, mi, s).map { "p1" to it }, 4) +
                daily("A", listOf("p1" to mi, "p2" to s, "p1" to mi, "p2" to s), 0.4, 0.6)
        assertEquals("exactly 30 points below is enough", listOf(listOf("appetit:A:2026-06-03", 4, 40L, 70L)), appetite(edge))
    }

    @Test
    fun `appetite per pet, hidden until the next rating`() {
        val two = usual0 + low0 + daily("B", List(8) { "p1" to g }, 4) + daily("B", listOf("p1" to g, "p2" to t, "p1" to g), 0.4, 0.8)
        assertEquals(listOf(1, 1, 0), listOf("all", "A", "B").map { appetite(two, it, listOf("A", "B")).size })
        val hidden = listOf("appetit:A:2026-06-03")

        fun appetiteHidden(
            meals: List<Meal>,
            now: Long = now0,
        ) = model(household(listOf("A"), listOf("p1", "p2", "mies"), meals, now0), hidden = hidden, now = now)
            .hints
            .filter {
                it.kind ==
                    "appetit"
            }.map { hintKey(it) }
        assertEquals(emptyList<String>(), appetiteHidden(usual0 + low0))
        assertEquals("appetit:A:2026-06-04", appetiteHidden(usual0 + low0 + meal("p2", mapOf("A" to x), -0.9), now0 + DAY)[0])
    }

    // Observations: one meal a day at the same hour, so a stink five hours after one falls in that meal's day alone
    private class Note(
        val kind: String,
        val daysAgo: Int,
        val pets: List<String>,
        val hours: Int = 5,
    )

    private fun noted(
        meals: List<Meal>,
        notes: List<Note>,
    ): Db {
        val db = house(listOf("A", "B"), listOf("lachs", "huhn", "rind"), meals)
        notes
            .mapIndexed { i, n ->
                Rec(
                    j(
                        mapOf(
                            "id" to "obs$i",
                            "kind" to n.kind,
                            "at" to now0 - n.daysAgo * DAY + n.hours * 3_600_000L,
                            "pets" to n.pets.associateWith { true },
                        ),
                    ) as kotlinx.serialization.json.JsonObject,
                )
            }.sortedByDescending { it.at }
            .forEach { db.observations.add(it) }
        return db
    }

    private val lachsDays = listOf(2, 6, 10, 14, 18, 22)
    private val obsMeals =
        (1..26).map { d ->
            meal(
                if (d in
                    lachsDays
                ) {
                    "lachs"
                } else if (d % 2 == 1) {
                    "huhn"
                } else {
                    "rind"
                },
                mapOf("A" to g),
                d,
            )
        }

    @Test
    fun `observations - how often each kind was noted, and a variety a kind about meals came after clearly more often`() {
        val db =
            noted(
                obsMeals,
                listOf(2, 6, 10, 14, 18).map { Note("stink", it, listOf("A")) } + Note("stink", 3, listOf("A")) +
                    Note("tired", 3, listOf("A"), 2) +
                    Note("tired", 40, listOf("A")),
            )
        val o = observed(db, listOf("A"), now0)
        assertEquals(listOf(listOf("stink", 6, 0), listOf("tired", 1, 1)), o.kinds.map { listOf(it.kind, it.n, it.before) })
        assertEquals(now0 - 2 * DAY + 5 * 3_600_000L, o.kinds[0].last)
        assertEquals(
            listOf(listOf("stink", "lachs", 6, 5, 20, 1)),
            o.links.map {
                listOf(it.kind, it.id, it.after.n, it.after.hit, it.other.n, it.other.hit)
            },
        )
        assertEquals(listOf(listOf("stink", 6, 5)), observedAfter(db, listOf("A"), now0, "lachs").map { listOf(it.kind, it.n, it.hit) })
        assertEquals(listOf(listOf("stink", 13, 1)), observedAfter(db, listOf("A"), now0, "huhn").map { listOf(it.kind, it.n, it.hit) })
        assertEquals(
            "a stink is weighed against the meals of its pets within a day before it",
            listOf("lachs"),
            mealsBefore(db, db.observations.first { it.str("kind") == "stink" }).map { it.str("productId") },
        )
        assertEquals("a tired day against none", emptyList<Rec>(), mealsBefore(db, db.observations.first { it.str("kind") == "tired" }))
        // the ratings stay what they are
        assertEquals(sorts(model(Db(db.pets, db.products, db.servings))) { it.verdict }, sorts(model(db)) { it.verdict })
    }

    @Test
    fun `observations - only what the data carry, within the pets asked for`() {
        fun stinks(days: List<Int>) = days.map { Note("stink", it, listOf("A")) }

        fun links(
            notes: List<Note>,
            meals: List<Meal> = obsMeals,
            pets: List<String> = listOf("A"),
        ) = observed(noted(meals, notes), pets, now0).links.map { it.id }
        assertEquals(listOf("lachs"), links(stinks(listOf(2, 6, 10, 14))))
        assertEquals("a single stink after it is chance", emptyList<String>(), links(stinks(listOf(2))))
        assertEquals("as often after the others: nothing stands out", emptyList<String>(), links(stinks(listOf(2, 6, 3, 5, 7, 9))))
        val few = obsMeals.filter { it.p != "lachs" || (it.ago as Int) < 10 }
        assertEquals("two of only two meals of it: too few meals", emptyList<String>(), links(stinks(listOf(2, 6)), few))
        assertEquals(
            "another pet: its meals and notes alone",
            emptyList<String>(),
            links(stinks(listOf(2, 6, 10, 14)), obsMeals, listOf("B")),
        )
        assertEquals(
            "not clear which of two it was: it counts for both",
            listOf("lachs"),
            links(
                listOf(2, 6, 10, 14).map {
                    Note("stink", it, listOf("A", "B"))
                },
            ),
        )
        assertTrue(
            "more than a day after it: not about that meal, but the next one",
            "lachs" !in links(stinks(listOf(2, 6, 10, 14)).map { Note(it.kind, it.daysAgo, it.pets, 30) }),
        )
        assertEquals(
            "what comes back up counts within hours of the meal only",
            listOf(listOf("lachs"), emptyList()),
            listOf(5, 8).map { hours -> links(listOf(2, 6, 10, 14).map { Note("vomit", it, listOf("A"), hours) }) },
        )
        val before = noted(obsMeals, emptyList())
        val o = observed(Db(before.pets, before.products, before.servings), listOf("A"), now0)
        assertTrue("data from before observations", o.kinds.isEmpty() && o.links.isEmpty())
    }

    @Test
    fun `appetite - what was noted about the pet in the same hours comes with the hint`() {
        val db = house(listOf("A"), listOf("p1", "p2", "mies"), usual0 + low0)
        db.observations.add(
            Rec(
                j(
                    mapOf("id" to "o1", "kind" to "tired", "at" to now0 - 3_600_000L, "pets" to mapOf("A" to true)),
                ) as kotlinx.serialization.json.JsonObject,
            ),
        )
        db.observations.add(
            Rec(
                j(
                    mapOf("id" to "o2", "kind" to "stink", "at" to now0 - 10 * DAY, "pets" to mapOf("A" to true)),
                ) as kotlinx.serialization.json.JsonObject,
            ),
        )
        assertEquals(listOf("tired"), model(db).hints[0].seen)
    }

    @Test
    fun `reminder buttons - the best and the worst level of each scale and one between, so any meal can be rated there`() {
        for (type in listOf("Nassfutter", "Trockenfutter", "Snack", null)) {
            val p = if (type == null) Rec() else recOf("type" to j(type))
            val (best, between, worst) = quickOf(p).map { scaleOf(p).indexOf(it) }
            assertTrue("$type", best == 0 && between > 0 && worst > between && worst == scaleOf(p).size - 1)
            assertTrue("$type", RATINGS.getValue(scaleOf(p)[between]).score < GOOD)
        }
    }
}
