package de.schmeckts.app

import de.schmeckts.app.content.ANCHORS
import de.schmeckts.app.content.DAY_FACTS
import de.schmeckts.app.content.FACTS
import de.schmeckts.app.content.NOTABLE
import de.schmeckts.app.content.NOTED
import de.schmeckts.app.content.Sheet
import de.schmeckts.app.views.Card
import de.schmeckts.app.views.catOf
import de.schmeckts.app.views.factOn
import de.schmeckts.app.views.factsOf
import de.schmeckts.app.views.formatOn
import de.schmeckts.app.views.hangingDay
import de.schmeckts.app.views.headOf
import de.schmeckts.app.views.momentOf
import de.schmeckts.app.views.sentenceOf
import de.schmeckts.app.views.sharesWord
import de.schmeckts.app.views.sheetOn
import de.schmeckts.app.views.sheetText
import de.schmeckts.app.views.valuesOf
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// The overview card (Glance.kt, views/Overview.kt) and the cat calendar (views/Facts.kt), their texts in content/
class GlanceTest {
    init {
        berlin()
    }

    private val now0 = at("2026-06-10T12:00")

    private fun day(
        d: Int,
        time: String,
    ) = "2026-06-${d.toString().padStart(2, '0')}T$time"

    private class M(
        val p: String,
        val who: List<String>,
        val time: Any,
        val r: String? = null,
    )

    // meals: [variety, pets, 'DD hh:mm' or a time, person, rating]
    private fun house(
        products: List<Any>,
        meals: List<M>,
        pets: List<String> = listOf("A", "B"),
    ): Db =
        household(
            pets,
            products,
            meals.map { m ->
                Meal(
                    m.p,
                    m.who.associateWith { m.r },
                    if (m.time is Long) At(m.time) else day((m.time as String).take(2).toInt(), m.time.drop(3)),
                )
            },
            now0,
            productDefaults = mapOf("brand" to "", "variety" to "", "codes" to emptyMap<String, Any>(), "createdAt" to 1),
        )

    private val snack = prod("snack", "type" to "Snack")

    @Test
    fun `the glance - newest serving and newest meal of the pets shown, left when one of them left it, today's meals and treats`() {
        val db =
            house(
                listOf("nass", snack),
                listOf(
                    M("nass", listOf("A"), "10 07:10", "schlecht"),
                    M("nass", listOf("A", "B"), "10 09:00", "top"),
                    M("snack", listOf("A"), "10 11:00", "unberuehrt"),
                    M("nass", listOf("A"), "10 12:30", "schlecht"),
                ),
            )
        val m1 = db.servings.first { it.id == "meal1" }
        m1["pets"] = m1.pets.with("B", jsonObject("r" to j("schlecht")))

        fun seen(
            pets: List<String>,
            time: String,
        ) = glance(db, pets, at(day(10, time))).let { listOf(it.last?.id, it.meal?.id, it.left, it.meals, it.treats) }
        assertEquals(
            listOf(
                listOf("meal2", "meal1", false, 2, 1),
                listOf("meal1", "meal1", false, 2, 0),
                listOf("meal1", "meal1", true, 1, 0),
                listOf("meal1", "meal1", true, 2, 0),
                listOf(null, null, false, 0, 0),
            ),
            listOf(
                seen(listOf("A"), "12:00"),
                seen(listOf("A"), "10:00"),
                seen(listOf("B"), "10:00"),
                seen(listOf("A", "B"), "10:00"),
                seen(listOf("A"), "07:00"),
            ),
        )

        fun usual(times: List<Long>) =
            glance(
                house(
                    listOf(snack),
                    times.map {
                        M("snack", listOf("A"), it)
                    },
                    listOf("A"),
                ),
                listOf("A"),
                now0,
            ).treatsUsual

        fun days(vararg n: Double) = n.map { now0 - (it * DAY).toLong() }
        assertEquals(
            "treats are usual on five days of the last fourteen, today one of them",
            listOf(true, false, true, false, false),
            listOf(
                usual(days(1.0, 3.0, 5.0, 7.0, 9.0)),
                usual(days(1.0, 3.0, 5.0, 7.0)),
                usual(days(1.0, 3.0, 5.0, 7.0, 13.0)),
                usual(days(1.0, 3.0, 5.0, 7.0, 14.0)),
                usual(days(1.0, 1.1, 3.0, 5.0, 7.0)),
            ),
        )
    }

    @Test
    fun `the glance - how the last meal went, a variety's first time, the rated meals in a row, the week, today's notes`() {
        val db =
            house(
                listOf("nass", "neu", snack),
                listOf(
                    M("nass", listOf("A"), "03 07:00", "schlecht"),
                    M("nass", listOf("A"), "04 07:00", "top"),
                    M("nass", listOf("A"), "05 07:00", "gut"),
                    M("nass", listOf("A"), "06 07:00", "schlecht"),
                    M("nass", listOf("A"), "07 07:00", "top"),
                    M("nass", listOf("A"), "08 07:00", "top"),
                    M("nass", listOf("A"), "09 07:00", "gut"),
                    M("snack", listOf("A"), "10 06:00", "verputzt"),
                    M("neu", listOf("A"), "10 07:00"),
                ),
                listOf("A"),
            )
        db.observations.add(
            Rec(j(mapOf("id" to "o1", "kind" to "happy", "at" to at(day(10, "08:00")), "pets" to mapOf("A" to true))) as JsonObject),
        )
        db.observations.add(
            Rec(j(mapOf("id" to "o2", "kind" to "vomit", "at" to at(day(9, "08:00")), "pets" to mapOf("A" to true))) as JsonObject),
        )
        val g = glance(db, listOf("A"), now0)
        assertEquals(
            listOf("neu", null, null, true, "good", 3, 6, 5, 2, listOf("happy" to listOf("A")), 1, 1),
            listOf(
                g.meal!!.str("productId"),
                g.outcome,
                g.rating,
                g.first,
                g.streak.kind,
                g.streak.n,
                g.week.n,
                g.week.good,
                g.week.sorts,
                g.noted.map {
                    it.kind to
                        it.pets
                },
                g.meals,
                g.treats,
            ),
        )
        val rated = glance(db, listOf("A"), at(day(9, "12:00")))
        assertEquals(
            "the day before: the last meal rated, a variety served before",
            listOf("nass", "good", "gut", false),
            listOf(rated.meal!!.str("productId"), rated.outcome, rated.rating, rated.first),
        )
        val neu = db.servings.first { it.str("productId") == "neu" }
        neu["pets"] = neu.pets.with("A", jsonObject("r" to j("sosse")))
        val x = glance(db, listOf("A"), now0)
        assertEquals(listOf("left", "sosse", true, "left", 1), listOf(x.outcome, x.rating, x.left, x.streak.kind, x.streak.n))
    }

    @Test
    fun `the next usual meal - later today, due while nothing has been served for it, tomorrow once today is over`() {
        val week =
            listOf(3, 4, 5, 6, 7, 8, 9).flatMap { d ->
                listOf(
                    M("nass", listOf("A"), "${d.toString().padStart(2, '0')} 07:15"),
                    M("nass", listOf("A"), "${d.toString().padStart(2, '0')} 18:30"),
                )
            }

        fun next(
            extra: List<M>,
            time: String,
            pets: List<String>? = null,
        ) = nextMeal(house(listOf("nass", snack), week + extra), at(day(10, time)), pets)?.let { listOf(it.at, it.due, it.tomorrow) }
        val morning = listOf(M("nass", listOf("A"), "10 07:20"))
        assertEquals(
            listOf(
                listOf(435, false, false),
                listOf(435, true, false),
                listOf(1110, false, false),
                listOf(1110, false, false),
                listOf(1110, true, false),
                listOf(1110, true, false),
                listOf(435, false, true),
                null,
            ),
            listOf(
                next(emptyList(), "06:00"),
                next(emptyList(), "07:30"),
                next(emptyList(), "09:10"),
                next(morning, "12:00"),
                next(morning, "18:40"),
                next(morning + M("snack", listOf("A"), "10 18:35"), "18:40"),
                next(morning + M("nass", listOf("A"), "10 18:00"), "18:40"),
                next(morning, "12:00", listOf("B")),
            ),
        )
    }

    @Test
    fun `a heading and a sentence share a word when a content word or a name comes back, small words, numbers and markup do not count`() {
        val same =
            listOf(
                "Heute ist noch nichts eingetragen." to "Heute stand zum ersten Mal Sheba im Napf.",
                "Seit 3 Stunden ist Ruhe am Napf." to "Ein zerkratzter Napf merkt sich jeden Geruch.",
                "Der erste Napf des Tages ist überfällig." to "Seit 12 Tagen schreibst du hier mit.",
                "Mit dem ersten Napf beginnt das Tagebuch." to "Die erste Mahlzeit stand im Tagebuch.",
                "Neues von Minka" to "Gegen <b>18 Uhr</b> gibt’s wieder was, <b>Minka</b> weiß das.",
            )
        val apart =
            listOf(
                "Seit 3 Stunden ist Ruhe." to "Noch <b>3×</b> füttern, dann ist das 100. Mal erreicht.",
                "Die Katze ist satt und der Kater auch." to "Das Futter ist da, und die Uhr tickt nach.",
                "Gestern gab’s <b>Rind</b>." to "Heute gab’s <b>Lachs</b>.",
            )
        for ((a, b) in same) assertTrue("$a | $b", sharesWord(a, b) && sharesWord(b, a))
        for ((a, b) in apart) assertTrue("$a | $b", !sharesWord(a, b))
    }

    private val mau = "mau0000001"
    private val products =
        listOf(
            prod(
                "lamm000001",
                "brand" to "Catz",
                "variety" to "Lamm mit Nachtkerzenöl",
                "type" to "Nassfutter",
                "codes" to emptyMap<String, Any>(),
            ),
            prod(
                "huhn000001",
                "brand" to "Bozita",
                "variety" to "Huhn & Pute in Soße",
                "type" to "Nassfutter",
                "codes" to emptyMap<String, Any>(),
            ),
            prod(
                "pferd00001",
                "brand" to "Catz",
                "variety" to "Pferd mit Nachtkerzenöl",
                "type" to "Nassfutter",
                "codes" to emptyMap<String, Any>(),
            ),
            prod(
                "paste00001",
                "brand" to "Sheba",
                "variety" to "Feine Pastete",
                "type" to "Nassfutter",
                "codes" to emptyMap<String, Any>(),
            ),
            prod("snack00001", "brand" to "Dreamies", "variety" to "Käse", "type" to "Snack", "codes" to emptyMap<String, Any>()),
        )

    private fun t(
        time: String,
        days: Int = 0,
    ) = addDays(at("2026-06-09T$time"), days) // a Tuesday

    private class H(
        val p: String,
        val at: Long,
        val r: String? = null,
    )

    // two weeks of a meal at 7:15 and one at 18:30, rated, treats on two days of three
    private val weeks =
        (-14 until 0).flatMap { d ->
            listOf(H("lamm000001", t("07:15", d), if (d % 4 != 0) "top" else "mittel"), H("huhn000001", t("18:30", d), "gut")) +
                (if (d % 3 != 0) listOf(H("snack00001", t("15:00", d), "verputzt")) else emptyList())
        }

    private class Note(
        val kind: String,
        val at: Long,
        val who: List<String>,
    )

    private class Home(
        val db: Db,
        val card: Card,
        val now: Long,
    )

    private val phone = phoneIn()

    // the card for one cat or several: meals as [variety, time, rating], then the glance as the overview makes it
    private fun home(
        meals: List<H>,
        now: Long,
        sex: String? = null,
        cats: Int = 1,
        notes: List<Note> = emptyList(),
        favourite: String? = "Rind in Gelee",
    ): Home {
        val db = Db()
        val ids = (0 until cats).map { if (it > 0) "cat${it}000001" else mau }
        for (i in 0 until cats) {
            db.pets.add(
                Rec(
                    j(
                        mapOf("id" to ids[i], "name" to (if (i > 0) "Kater$i" else "Mau"), "createdAt" to 1) +
                            (if (sex != null && i == 0) mapOf("sex" to sex) else emptyMap()),
                    ) as JsonObject,
                ),
            )
        }
        products.forEach { db.products.add(Rec(j(it) as JsonObject)) }
        meals
            .mapIndexed { i, m ->
                Rec(
                    j(
                        mapOf(
                            "id" to "serv" + i.toString().padStart(5, '0'),
                            "productId" to m.p,
                            "servedAt" to m.at,
                            "pets" to ids.associateWith { mapOf("r" to m.r) },
                        ),
                    ) as JsonObject,
                )
            }.sortedByDescending { it.servedAt }
            .forEach { db.servings.add(it) }
        notes.forEachIndexed { i, n ->
            db.observations.add(
                Rec(
                    j(
                        mapOf(
                            "id" to "note${i}0000",
                            "kind" to n.kind,
                            "at" to n.at,
                            "pets" to n.who.associateWith { true },
                        ),
                    ) as JsonObject,
                ),
            )
        }
        return Home(db, Card(glance(db, ids, now), cats, if (cats == 1) "Mau" else null, favourite), now)
    }

    // each state's sentence with its own household in the store, where the card finds the cats' names
    private fun sentence(
        h: Home,
        now: Long = h.now,
        card: Card = h.card,
    ): String {
        phone.store.replaceDb(h.db)
        return phone.sentenceOf(card, now)
    }

    private fun keys(text: String) = Regex("\\{(\\w+)\\}").findAll(text).map { it.groupValues[1] }.toList()

    private fun plain(html: String) = html.replace(Regex("<[^>]*>"), "")

    // a state for every anchor and fact, with and without a sex, one cat and two
    private val states: Map<String, Home> by lazy {
        linkedMapOf(
            "none" to home(emptyList(), t("12:00")),
            "older" to home(weeks, t("12:00", 3)),
            "fresh" to home(weeks + H("lamm000001", t("07:20")), t("07:40"), sex = "f"),
            "firstFresh" to home(weeks + H("pferd00001", t("07:20")), t("07:40"), sex = "m"),
            "freshTreat" to
                home(
                    weeks + H("lamm000001", t("07:20")) + H("snack00001", t("11:30")) + H("snack00001", t("11:50")),
                    t("12:00"),
                    sex = "f",
                ),
            "notYet" to home(weeks, t("09:00"), sex = "f"),
            "notYetPlain" to home(weeks + H("paste00001", t("18:40", -1)), t("09:00")),
            "last" to home(weeks + H("lamm000001", t("07:20"), "gut"), t("15:30"), sex = "f"),
            "lastPlain" to home(weeks + H("paste00001", t("07:20")), t("12:00")),
            "lastBoth" to home(weeks + H("lamm000001", t("07:20"), "top"), t("12:00"), cats = 2),
            "lastLeft" to
                home(
                    weeks + H("lamm000001", t("07:20"), "sosse") + H("huhn000001", t("12:20"), "schlecht"),
                    t("16:00"),
                    cats = 2,
                ),
            "firstLast" to home(weeks + H("pferd00001", t("07:20"), "top"), t("12:00"), sex = "f"),
            "firstLastBoth" to home(weeks + H("pferd00001", t("07:20"), "top"), t("12:00"), cats = 2),
            "night" to home(weeks, t("01:00"), sex = "m"),
            "noted" to
                home(
                    weeks + H("lamm000001", t("07:20"), "gut"),
                    t("16:00"),
                    sex = "f",
                    notes = listOf(Note("happy", t("09:00"), listOf(mau)), Note("vomit", t("10:00"), listOf(mau))),
                ),
            "notedBoth" to
                home(
                    weeks + H("lamm000001", t("07:20"), "gut"),
                    t("16:00"),
                    cats = 2,
                    notes = listOf(Note("hungry", t("09:00"), listOf(mau, "cat1000001"))),
                ),
            "freshPlain" to home(weeks + H("paste00001", t("07:20"), "gut"), t("07:40")),
            "bare" to home(listOf(H("lamm000001", t("07:20"), "gut")), t("12:00"), favourite = null),
        )
    }

    @Test
    fun `the overview card - every anchor and every wording of it in use, only what the card knows is named, one bold a sentence, short`() {
        val used = HashSet<String>()
        for ((name, h) in states) {
            phone.store.replaceDb(h.db)
            val values = phone.valuesOf(h.card, h.now)
            for ((pool, list) in ANCHORS) for (x in list) if (keys(x).all { values[it] != null }) used.add("$pool|$x")
            val said = sentence(h)
            assertTrue("$name: $said", said.isNotEmpty() && !Regex("[{}]|undefined|null").containsMatchIn(said))
            assertTrue("$name: $said", plain(said).length <= 120)
            for (one in said.split(Regex("(?<=[.!?])\\s"))) assertTrue(said, Regex("<b>").findAll(one).count() <= 1)
        }
        for ((pool, list) in ANCHORS) for (x in list) assertTrue("$pool: $x is never said", "$pool|$x" in used)
        assertEquals(
            listOf(
                "none" to "none",
                "older" to "older",
                "fresh" to "fresh",
                "firstFresh" to "fresh",
                "freshTreat" to "freshTreat",
                "notYet" to "notYet",
                "last" to "today",
                "firstLast" to "today",
                "night" to "night",
            ),
            states.filter { !Regex("Plain|Both|Left|noted|bare").containsMatchIn(it.key) }.map { (name, h) ->
                phone.store.replaceDb(h.db)
                name to phone.momentOf(h.card, h.now)
            },
        )
    }

    @Test
    fun `the overview card - the last meal with how it went, then one fact of the day, the notable ones first, never the schedule`() {
        fun said(name: String) = plain(sentence(states.getValue(name)))

        fun facts(name: String) = states.getValue(name).let { factsOf(it.card, it.now, "today") }
        assertTrue(Regex("Lamm bekommen und fast alles gefressen\\.").containsMatchIn(said("last")))
        assertTrue(Regex("Lamm\\. Beide haben gut gefressen\\.").containsMatchIn(said("lastBoth")))
        assertTrue(Regex("Huhn und Pute\\. Da blieb einiges stehen\\.").containsMatchIn(said("lastLeft")))
        assertTrue(Regex("zum ersten Mal Pferd mit Nachtkerzenöl").containsMatchIn(said("firstFresh")))
        assertTrue(Regex("zum ersten Mal Pferd mit Nachtkerzenöl bekommen und alles gefressen\\.").containsMatchIn(said("firstLast")))
        assertTrue(Regex("gestern um 18:30 Huhn und Pute").containsMatchIn(said("night")))
        assertTrue(Regex("gestern um 18:30 Huhn und Pute").containsMatchIn(said("notYet")))
        assertTrue(
            "the note that matters most, after the cat is named",
            Regex("\\. Sie hat heute erbrochen\\.$").containsMatchIn(said("noted")),
        )
        assertTrue(Regex("\\. Mau und Kater1 waren heute extra hungrig\\.$").containsMatchIn(said("notedBoth")))
        assertTrue(
            Regex("(?U)Der letzte Eintrag ist 3 Tage her|Zuletzt gab es am 8\\.\\sJuni Huhn und Pute").containsMatchIn(said("older")),
        )
        assertEquals("only the notable ones", listOf("streakLeft", "treatsNone"), facts("lastLeft"))
        assertTrue(
            "two left in a row come first",
            Regex("Die letzten zwei Mahlzeiten kamen schlecht an\\.").containsMatchIn(said("lastLeft")),
        )
        assertEquals("an afternoon without the usual treat", listOf("treatsNone"), facts("last"))
        assertEquals("a first day has no facts yet", emptyList<String>(), facts("bare"))
        val plenty = facts("firstLast")
        assertTrue("$plenty", listOf("streakGood", "week", "favourite", "sorts").all { it in plenty } && plenty.none { it in NOTABLE })
        for ((name, h) in states) {
            for (hour in 0 until 24 step 3) {
                val text = plain(sentence(h, h.now + hour * 3_600_000L))
                assertTrue("no time to come: $text", !Regex("gegen|Uhr").containsMatchIn(text))
                assertTrue("plain sentences, no colon and no comma: $name $text", !Regex(":(?!\\d)|,").containsMatchIn(text))
            }
        }
        for ((kind, list) in DAY_FACTS) assertTrue(kind, list.isNotEmpty())
    }

    @Test
    fun `the overview card - a wording stays for three hours and until something is served or noted, the day sees several`() {
        val h = states.getValue("firstLast")

        fun hour(x: Double) = dayStart(h.now) + (x * 3_600_000).toLong()

        fun shape(x: Double) = plain(sentence(h, hour(x))).replace(Regex("\\d+"), "#")
        assertEquals("within the stretch only the hours go on", shape(12.0), shape(13.8))
        val allDay = listOf(9.0, 12.0, 15.0, 18.0, 21.0).map { sentence(h, hour(it)) }
        val fed =
            listOf(
                0,
                1,
                2,
            ).map { sentence(h, hour(12.0), Card(h.card.g, h.card.pets, h.card.name, h.card.favourite, h.card.meals + it)) }
        assertTrue("the wordings of a day $allDay", allDay.toSet().size >= 3)
        assertTrue("a new meal, a new wording $fed", fed.toSet().size >= 2)
    }

    @Test
    fun `the overview card names the cat before it says she or he, and says so only where its sex is known`() {
        for ((name, h) in states) {
            for (d in 0 until 14) {
                val said = plain(sentence(h, addDays(h.now, d)))
                val pronoun = Regex("\\b(Sie|Er|sie|er)\\b").find(said)?.range?.first ?: -1
                if (h.card.g.sex == null) {
                    assertEquals("$name: $said", -1, pronoun)
                } else if (pronoun >= 0) {
                    assertTrue("$name: $said", "Mau" in said.substring(0, pronoun))
                }
            }
        }
        val last = states.getValue("last")
        val said = (0 until 14).map { plain(sentence(last, addDays(last.now, it))) }
        assertTrue("she $said", said.any { Regex("\\bsie\\b|\\bSie\\b").containsMatchIn(it) })
    }

    @Test
    fun `the overview heading - a greeting for the hour, by the name of whoever holds the phone, the weekend its own`() {
        fun on(
            d: String,
            h: Int,
        ) = at("2026-10-${d}T${h.toString().padStart(2, '0')}:00") // the 6th a Tuesday
        val hours = listOf(1, 6, 12, 15, 19, 23).map { headOf(on("06", it), "") }
        assertTrue("night, morning, noon, afternoon, evening: $hours", hours.toSet().size == 5 && hours[0] == hours[5])
        assertEquals("the same within a part of the day", headOf(on("06", 7), ""), headOf(on("06", 10), ""))
        assertEquals("the name escaped, after a comma", "${hours[1]}, A&lt;b&gt;", headOf(on("06", 7), "A<b>"))
        assertTrue(
            "Saturday and Sunday from noon to the evening",
            headOf(on("10", 12), "") != hours[2] && headOf(on("11", 15), "") != hours[3] && headOf(on("11", 19), "") == hours[4],
        )
    }

    @Test
    fun `a wording in one piece`() {
        for (
        list in ANCHORS.values + DAY_FACTS.values +
            listOf(
                NOTED.values.toList(),
            )
        ) {
            for (x in list) assertTrue(x, Regex("^[^|\\[\\]]+$").matches(x))
        }
    }

    private fun cat(
        sex: String?,
        name: String = "Schnurrsula",
    ) = Rec(
        j(
            mapOf("id" to "cat$name", "name" to name, "species" to "Katze") + (
                if (sex !=
                    null
                ) {
                    mapOf("sex" to sex)
                } else {
                    emptyMap()
                }
            ),
        ) as JsonObject,
    )

    private val sheets = FACTS.values.flatten()

    @Test
    fun `the cat calendar - a format a weekday, an id prefix each, every text once, back only on Stimmt's, months only in Wissen`() {
        assertEquals(
            listOf("Wissen", "Katzenlogik", "Stimmt’s?", "Kurios", "Wissen", "Flachwitz", "Sprache"),
            (0..6).map { formatOn(localTime(2026, 10, 4 + it, 12)) }, // from Sunday
        )
        val prefixes = FACTS.values.map { list -> list.map { it.id.replace(Regex("\\d{3}$"), "") }.toSet() }
        assertTrue("one prefix a format", prefixes.all { it.size == 1 } && prefixes.map { it.first() }.toSet().size == prefixes.size)
        assertEquals(sheets.size, sheets.map { it.id }.toSet().size)
        val texts = sheets.flatMap { listOfNotNull(it.text, it.back, it.m, it.f) }
        assertEquals(texts.size, texts.toSet().size)
        for ((format, list) in FACTS) {
            for (f in list) {
                assertTrue(f.id, (f.back != null) == (format == "Stimmt’s?") && (f.verdict != null) == (f.back != null))
                assertTrue(f.id, f.months == null || (format == "Wissen" && f.months.all { it in 1..12 }))
            }
        }
    }

    @Test
    fun `the cat calendar - a format's sheets in turn, the same all day, none again before all others, none out of its months`() {
        val shown = LinkedHashMap<String, MutableList<String>>()
        for (i in 0 until 3 * 365) {
            val d = localTime(2026, 10, 4 + i, 12)
            val f = factOn(d)
            assertTrue("${f.id} on $d", f in FACTS.getValue(formatOn(d)))
            assertTrue("${f.id} on $d", f.months == null || monthOf(d) in f.months)
            shown.getOrPut(formatOn(d)) { mutableListOf() }.add(f.id)
        }
        assertEquals(factOn(localTime(2026, 10, 6, 0, 10)), factOn(localTime(2026, 10, 6, 23, 50)))
        for ((format, ids) in shown) {
            val every = FACTS.getValue(format).filter { it.months == null }.map { it.id }
            val last = HashMap<String, Int>()
            ids.forEachIndexed { n, id ->
                val since = if (last.containsKey(id)) ids.subList(last.getValue(id) + 1, n).toSet() else emptySet()
                assertTrue("$format: $id again before all others", !last.containsKey(id) || every.all { it == id || it in since })
                last[id] = n
            }
        }
    }

    @Test
    fun `the cat calendar - a sheet a day, on a new day the last one seen hangs over today's until torn off, none on first use`() {
        val now = localTime(2026, 10, 6, 7, 30)
        val yesterday = hangingDay("2026-10-05", now)!!
        assertEquals(
            "first use, torn off today, a day ahead: nothing hangs",
            listOf(null, null, null),
            listOf(hangingDay(null, now), hangingDay("2026-10-06", now), hangingDay("2026-10-07", now)),
        )
        assertEquals("yesterday’s sheet, as it was all yesterday", dayKey(localTime(2026, 10, 5)), dayKey(yesterday))
        assertEquals(sheetOn(localTime(2026, 10, 5, 21)).sheet, sheetOn(yesterday).sheet)
        assertEquals("away for days: the last one seen", 1, dateOf(hangingDay("2026-10-01", now)!!))
    }

    @Test
    fun `the cat calendar speaks of the cat only where the household has one cat of known sex - its variant, its name, dein Kater`() {
        assertEquals(
            listOf("Schnurrsula", null, null, null),
            listOf(
                listOf(cat("m")),
                listOf(cat("f"), cat("m", "Tiger")),
                listOf(cat(null)),
                listOf(cat("x")),
            ).map { catOf(it)?.str("name") },
        )
        val paws = sheets.first { it.m != null }
        val nose = sheets.first { "{deine Katze}" in it.text }
        assertEquals(
            listOf(paws.m!!.replace("{name}", "Schnurrsula"), paws.f!!.replace("{name}", "Schnurrsula"), paws.text),
            listOf(sheetText(paws, cat("m")), sheetText(paws, cat("f")), sheetText(paws, null)),
        )
        assertTrue("the name escaped", "&lt;i&gt;Mo&lt;/i&gt;" in sheetText(paws, cat("m", "<i>Mo</i>")))
        assertEquals(
            listOf("dein Kater", "deine Katze", "deine Katze"),
            listOf(
                sheetText(nose, cat("m")),
                sheetText(nose, cat("f")),
                sheetText(nose, null),
            ).map { Regex("dein\\w* \\w+").find(it)!!.value },
        )
        assertEquals("Dein Kater weiß das.", sheetText(Sheet("x", "{Deine Katze} weiß das."), cat("m")))
        for (f in sheets) {
            for (c in listOf(null, cat("f"), cat("m"))) {
                for (back in if (f.back !=
                    null
                ) {
                    listOf(false, true)
                } else {
                    listOf(false)
                }) {
                    assertTrue(f.id, !Regex("[{}]").containsMatchIn(sheetText(f, c, back)))
                }
            }
        }
    }

    @Test
    fun `the sheets torn off, which 0_28 counted, are forgotten`() {
        val dir = tempDir()
        File(dir, "prefs.json").writeText("""{"torn":3}""")
        val p = phoneIn(dir)
        assertTrue(!p.prefs.toJson().containsKey("torn"))
        assertNull(p.prefs.sheetDay)
    }
}
