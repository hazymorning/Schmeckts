package de.schmeckts.app

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.printToString
import de.schmeckts.app.views.syncChip
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import org.junit.Test
import org.robolectric.Robolectric

// The screens as a person uses them: the old ui_test.py, case by case. Taps go through the views' buttons or their actions.

class UiStartTest : ScreenTest() {
    @Test
    fun `start - the splash goes once the home page is drawn, and a stuck start still loses it`() {
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        repeat(10) {
            org.robolectric.Shadows
                .shadowOf(android.os.Looper.getMainLooper())
                .idleFor(java.time.Duration.ofMillis(50))
        }
        val app = activity.application as App
        check(app.main.ui.splashGone, "splash hidden once the home page is drawn")
        check(!splashKept(false, 0, 2500) && splashKept(false, 0, 2400), "never drawn: the safety net still hides the splash")
        activity.finish()
    }
}

class UiTest : ScreenTest() {
    private fun demo(now: Long = at("2025-06-17T12:00")) {
        open(now = now)
        act("demo")
    }

    private val overview = listOf("settings", null, null)

    @Test
    fun `settings - one level per back, the pet editor is a level`() {
        demo()
        act("open-settings")
        act("settings-page", "v" to "backup")
        val deep = level
        act("settings-back")
        val up = level
        act("settings-page", "v" to "exchange")
        back()
        check(
            deep == listOf("settings", "backup", null) && up == overview && level == overview,
            "arrow and back button go one level $deep $up",
        )
        back()
        check(sheet == null, "back on the overview closes the settings")
        act("open-settings")
        act("edit-pet", "id" to db.pets[0].id)
        val editor = level
        back()
        check(editor == listOf("settings", "pet", null) && level == overview, "pet editor is one level $editor")
        act("edit-pet", "id" to db.pets[0].id)
        type("Name", "Mimi")
        act("save-pet")
        val saved = listOf(level, db.pets[0].str("name"))
        act("edit-pet", "id" to db.pets[0].id)
        act("arm", "then" to "delete-pet")
        act("arm", "then" to "delete-pet")
        val removed = listOf(level, db.pets.size)
        check(saved == listOf(overview, "Mimi") && removed == listOf(overview, 0), "save and remove return to the overview $saved $removed")
        back()
        act("open-server")
        val jump = level
        back()
        check(jump == listOf("settings", "house", null) && level == overview, "sync notice opens Haushalt, back to the overview $jump")
    }

    @Test
    fun `tour - a walk through the demo data`() {
        demo()
        check(db.servings.size > 10, "demo data loaded")
        check(phone.syncChip() == null && !labelled("Haushalt in den Einstellungen öffnen"), "no sync chip without a server")
        act("feed")
        act("scan") // the scanner answers nothing: cancelled
        check(sheet?.kind == "feed" && shows("Barcode"), "scan cancelled: the sheet stays")
        val before = db.servings.size
        act(
            "serve",
            "id" to
                phone.derive
                    .quickProducts(3)
                    .first { typeOf(it.product) == "Nassfutter" }
                    .product.id,
        )
        idle(400)
        check(db.servings.size == before + 1, "a known variety served")
        val s = db.servings[0]
        println(
            "TREE " +
                rule
                    .onRoot(useUnmergedTree = true)
                    .printToString(100)
                    .lines()
                    .filter { "Text" in it }
                    .take(40)
                    .joinToString(" || "),
        )
        println(
            "DEBUG pend=${phone.derive.pendingServings().size} wie=${shows(
                "Wie war’s?",
            )} bew=${labelled("Bewertung")} sheet=$level alles=${labelled("Alles gefressen")}",
        )
        rule.onAllNodes(hasContentDescription(RATINGS.getValue("gut").label), useUnmergedTree = true)[0].performClick()
        idle(400)
        check((s.pets.values.first() as JsonObject)["r"].asString == "gut", "rated with one tap")
        act("open-evaluation")
        act("open-level", "v" to "shop")
        check(
            shopGroups(phone.derive.model()).nachkaufen.size >= 3 && shows("Nachkaufen"),
            "the cart on „Vorlieben“ leads to the varieties to buy",
        )
        act("settings-back")
        check(
            shows("Erkenntnisse") &&
                phone.derive
                    .evaluationModel()
                    .insights.size >= 2,
            "insights on „Vorlieben“, each with its counts",
        )
        act("settings-back")
        act("open-settings")
        act("theme", "v" to "dark")
        check(prefs.theme == "dark", "theme switched")
        act("settings-page", "v" to "house")
        check(shows("Mit Haushalt verbinden") && !labelled("Haushaltscode"), "Haushalt: only the way in")
        act("settings-back")
        act("settings-back")
        act(
            "open-product",
            "id" to
                phone.derive
                    .rankingModel()
                    .top[0]
                    .id,
        )
        check(level == listOf("product", null, null), "food sheet opens")
        act("close")
        act("open-serving", "id" to db.servings[1].id)
        act("close")
        check(sheet == null, "closed again")
    }

    @Test
    fun `flow - pets, photo, naming, rating, undo, back, backup, deep links, restart`() {
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        act("open-settings") // with one pet there is no pet bar
        act("add-pet")
        type("Name", "Tiger")
        act("save-pet")
        check(level == overview, "saving a pet returns to the settings overview")
        act("settings-back")
        check(db.pets.size == 2 && db.pets.all { it.str("species") == "Katze" }, "two pets, stored as cats for older versions")
        platform.photo = packJpeg()
        act("feed")
        act("photo")
        check(until { db.servings.firstOrNull()?.str("status") == "noserver" }, "photo stored")
        idle(300)
        check(
            db.servings[0].str("error") == null && sheet?.step == "name" && labelled("Marke"),
            "photo without a server: stored, naming opens at once",
        )
        type("Marke", "Sheba")
        type("Sorte", "Lachs in Soße")
        act("save-name")
        idle(400)
        check(
            sheet == null && toast?.startsWith("Lachs in Soße für ") == true,
            "named right after the photo: back on the home page, the toast as for any meal $toast",
        )
        act("open-serving", "id" to db.servings[0].id)
        val ids =
            db.servings[0]
                .pets.keys
                .toList()
        act("rate", "s" to db.servings[0].id, "p" to ids[0], "r" to "gut")
        act("rate", "s" to db.servings[0].id, "p" to ids[1], "r" to "sosse")
        check(
            db.servings[0]
                .pets.values
                .joinToString(",") { (it as JsonObject)["r"].asString ?: "" } == "gut,sosse",
            "both pets rated",
        )
        check(!db.servings[0].has("photo") && !db.servings[0].has("status"), "named: photo and status dropped from the meal")
        idle(2000)
        act("open-serving", "id" to db.servings[0].id)
        act("delete-serving")
        idle(400)
        check(db.servings.isEmpty(), "meal deleted")
        act("undo")
        check(db.servings.size == 1 && db.products.size == 1, "undo brings it back")
        act("feed")
        back()
        check(sheet == null, "back button closes the sheet")
        check(!back(), "back on the home page leaves it to Android, which sends the app to the background")
        act("open-settings")
        check(shows("Version 9.9.9"), "version from the app")
        act("settings-page", "v" to "backup")
        act("export")
        idle(100)
        check(platform.shared.any { it.first.startsWith("schmeckts-backup-") }, "backup through a file and the share menu")
        main.phone.scope.launch { main.logic.products.shareShopping() }
        idle(100)
        val listed = calls("shareText")
        check(listed.size == 1 && listed[0] == phone.derive.shoppingList().text, "shopping list shared as text")
        act("settings-back")
        act("settings-back")
        link("schmeckts://feed")
        idle(400)
        check(level == listOf("feed", null, null), "schmeckts://feed opens the feeding sheet")
        platform.photo = null
        val shots = calls("capture").size
        link("schmeckts://photo")
        idle(400)
        check(calls("capture").size > shots && level == listOf("feed", null, null), "schmeckts://photo cancelled: the feeding sheet stays")
        platform.photo = packJpeg()
        val before = db.servings.size
        link("schmeckts://photo")
        check(until { db.servings.size == before + 1 }, "served by the link")
        idle(400)
        check(
            db.servings[0].str("status") == "noserver" && db.servings[0].has("thumb") && sheet?.step == "name",
            "schmeckts://photo: served, naming",
        )
        act("undo")
        idle(400)
        check(db.servings.size == before && sheet == null, "undo removes it and closes the sheet")
        link("schmeckts://foto") // German links from before still sit in shortcuts
        check(until { db.servings.size == before + 1 }, "served by the old link")
        idle(400)
        act("undo")
        idle(400)
        link("schmeckts://fuettern")
        idle(400)
        check(level == listOf("feed", null, null), "legacy links schmeckts://foto and schmeckts://fuettern")
        act("close")
        idle(400)
        restart()
        check(db.pets.size == 2 && db.servings.size == 1, "restart: the data comes from the files")
        restart("schmeckts://feed")
        idle(400)
        check(level == listOf("feed", null, null), "cold start with schmeckts://feed opens the feeding sheet")
        back()
        check(sheet == null, "back closes it")
        prefs.activePet = db.pets[0].id
        phone.store.merge(
            listOf(
                Remote.of(
                    j(
                        mapOf(
                            "c" to "pets",
                            "r" to db.pets[0].id,
                            "f" to mapOf("_del" to mapOf("v" to true, "t" to "9999999999999-0000-anderes")),
                        ),
                    ),
                )!!,
            ),
        )
        idle(100)
        check(prefs.activePet == "all" && db.pets.size == 1, "pet deleted elsewhere: gone, the filter falls back to all")
        phone.store.merge(
            listOf(
                Remote.of(
                    j(
                        mapOf(
                            "c" to "servings",
                            "r" to db.servings[0].id,
                            "f" to
                                mapOf(
                                    "pets.${db.pets[0].id}" to
                                        mapOf("v" to mapOf("r" to "super", "at" to 1), "t" to "9999999999999-0001-anderes"),
                                ),
                        ),
                    ),
                )!!,
            ),
        )
        ui.update()
        idle(100)
        check(shows("Verlauf"), "an unknown rating from a newer app breaks nothing")
    }
}

/** the packaging photo of the old tests, a JPEG as a camera hands it over */
fun packJpeg(): ByteArray = java.io.File(FIXTURES, "files-0.42/photos/mu9vscy1o8shs.jpg").readBytes()

const val M = "minka00001"
const val T = "tiger00001"

class UiShopTest : ScreenTest() {
    private fun demo() {
        open()
        act("demo")
    }

    @Test
    fun `buying - Kaufen in the food sheet is stored, honoured by the quick picker, auto drops it`() {
        demo()
        val pid =
            phone.derive
                .quickProducts(3)[0]
                .product.id
        val kaufen = { phone.derive.getProduct(pid)?.str("kaufen") }
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to pid),
        )
        act("buy", "v" to "nicht")
        check(kaufen() == "nicht" && chosen("Nicht mehr kaufen"), "„nicht“ stored")
        act("close")
        act("feed")
        check(phone.derive.quickProducts(3).none { it.product.id == pid }, "no longer bought: gone from the quick picker")
        act("close")
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to pid),
        )
        act("buy", "v" to "auto")
        check(phone.derive.getProduct(pid)?.has("kaufen") == false, "„auto“ drops the field")
    }

    @Test
    fun `cards - highest precedence first, buying from the hint with undo, hidden hints remembered`() {
        demo()
        val seen = mutableListOf<String>()
        val undone = mutableListOf<String>()
        var ok = true
        repeat(12) {
            val first =
                phone.derive
                    .model()
                    .hints
                    .firstOrNull() ?: return@repeat
            val key = hintKey(first)
            ok = ok && shows("Ausblenden")
            if (first.kind != "appetit") {
                act("open-product", "id" to first.id) // the variety as a row with its packaging, which opens it
                ok = ok && sheet?.kind == "product" && sheet?.id == first.id
                act("close")
            }
            seen.add(first.kind)
            if (first.kind in listOf("stop", "liebling") && seen.count { it == first.kind } == 1) {
                val kaufen = { phone.derive.getProduct(first.id)?.str("kaufen") }
                act("hint-buy", "id" to first.id, "v" to if (first.kind == "stop") "nicht" else "immer")
                ok =
                    ok &&
                    kaufen() == (if (first.kind == "stop") "nicht" else "immer") &&
                    phone.derive
                        .model()
                        .hints
                        .firstOrNull()
                        ?.let(::hintKey) != key
                act("undo")
                ok = ok &&
                    kaufen() == null &&
                    phone.derive
                        .model()
                        .hints
                        .firstOrNull()
                        ?.let(::hintKey) == key
                undone.add(first.kind)
                act("hint-buy", "id" to first.id, "v" to if (first.kind == "stop") "nicht" else "immer")
            } else {
                act("hide-hint", "v" to key)
                ok = ok && key in prefs.hiddenHints
            }
        }
        val order = listOf("stop", "sosse", "liebling")
        check(
            ok &&
                seen.containsAll(listOf("stop", "liebling")) &&
                seen == seen.sortedBy { order.indexOf(it) } &&
                phone.derive
                    .model()
                    .hints
                    .isEmpty(),
            "one hint at a time by precedence, settled or hidden the next follows $seen",
        )
        check(
            undone.sorted() == listOf("liebling", "stop"),
            "buying from the hint says so in a toast whose undo brings the hint back $undone",
        )
    }

    @Test
    fun `shop - a level of Vorlieben from the bar, the list shared as derive builds it, a row opens its food sheet over the page`() {
        demo()
        val want = phone.derive.shoppingList()
        act("open-evaluation")
        act("open-level", "v" to "shop")
        val lvl = level
        act("settings-back")
        check(
            lvl == listOf("evaluation", "shop", null) && level == listOf("evaluation", null, null),
            "the cart in the bar opens it as a level, back returns to „Vorlieben“ $lvl",
        )
        act("open-level", "v" to "shop")
        platform.copies = true
        act("share-list")
        check(toast == "Liste kopiert", "without a share menu the list goes to the clipboard")
        platform.copies = false
        act("share-list")
        check(calls("shareText").last() == want.text && calls("shareTitle").last() == want.title, "the share menu gets title and text")
        val pid = shopGroups(phone.derive.model()).nachkaufen[0].id
        act("open-product", "id" to pid)
        val over =
            listOf(
                ui.sheets.base.state
                    ?.kind,
                ui.sheets.over.open,
                level,
            )
        act("close")
        idle(400)
        check(
            over == listOf("evaluation", true, listOf("product", null, null)) &&
                ui.sheets.base.state
                    ?.kind == "evaluation" &&
                !ui.sheets.over.open,
            "a row opens over the page and closes back $over",
        )
    }

    @Test
    fun `shop folds - what is no longer bought shows its first three at once, the rest behind one tap`() {
        val now = at("2025-06-17T12:00")
        val left = (0 until 5).map { "stehen%04d".format(it) }
        open(
            mapOf(
                "db" to
                    dbOf(
                        listOf(pet(M)),
                        (left + "unklar0001").mapIndexed { n, i -> product(i, "Sheba", "Sorte $n") },
                        left.flatMap { i -> (0 until 2).map { n -> meal("$i-$n", i, now - (n + 1) * DAY, mapOf(M to "schlecht")) } } +
                            meal("unklar0001-0", "unklar0001", now - DAY, mapOf(M to "mittel")),
                    ),
            ),
            now,
        )
        openSheet(
            de.schmeckts.app.ui
                .SheetState("evaluation", "page" to "shop"),
        )
        val rows = { (0 until 6).count { inSheet("Sorte $it") } }
        val shut = rows()
        act("fold", "v" to "nicht")
        check(
            listOf(shut, rows()) == listOf(4, 6) && !shows("Alle 1 zeigen"),
            "three at once, the rest after a tap; a short list has nothing to unfold ${listOf(shut, rows())}",
        )
    }

    @Test
    fun `dry food - no ranking, the Vorlieben card still leads to what to buy again`() {
        val now = at("2025-06-17T12:00")
        open(
            mapOf(
                "db" to
                    dbOf(
                        listOf(pet(M)),
                        listOf(product("trocken0001", "Josera", "Huhn", "Trockenfutter")),
                        (0 until 3).map { meal("meal$it", "trocken0001", now - (it + 1) * DAY, mapOf(M to "gern")) },
                    ),
            ),
            now,
        )
        check(shows("Nachkaufen") && shows("Huhn"), "the card on the home page names it")
        act("open-evaluation")
        check(labelled("Einkaufen"), "the page leads to the shopping list")
    }
}

class UiHistoryTest : ScreenTest() {
    private fun seed(
        now: String,
        meals: List<Triple<String, String, List<String>>>,
        pets: List<String> = listOf(M),
    ): List<String> {
        clock = at(now)
        prefs.activePet = "all"
        val db =
            dbRaw(
                dbOf(
                    pets.map { pet(it, it.take(5)) },
                    listOf(product("sorte00000")),
                    meals.map { (i, t, who) -> meal(i, "sorte00000", at(t), who.associateWith { "gut" }) },
                ),
            )
        phone.store.replaceDb(db)
        phone.store.save()
        ui.update()
        idle()
        return hist()
    }

    private fun hist() = tags("row-", within = "sec-hist")

    private val owner =
        listOf(
            Triple("m1", "2026-06-12T07:00", listOf(M)),
            Triple("m2", "2026-06-11T07:30", listOf(M)),
            Triple("m3", "2026-06-11T12:00", listOf(M)),
            Triple("m4", "2026-06-11T18:30", listOf(M)),
            Triple("m5", "2026-06-10T08:00", listOf(M)),
        )

    @Test
    fun `history on the home page - today, else yesterday, within the pet filter`() {
        open(now = at("2026-06-12T10:00"))
        check(seed("2026-06-12T10:00", owner) == listOf("m1"), "served today: only today")
        check(
            shows("Sheba, 7:00") && labelled(RATINGS.getValue("gut").label),
            "a row as in any card, the time in its small line, its rating at the end",
        )
        val s = db.servings[0]
        s["pets"] = kotlinx.serialization.json.JsonObject(s.pets.mapValues { petMap(listOf(it.key)).getValue(it.key) })
        phone.store.save()
        ui.update()
        idle()
        check(labelled("Noch nicht bewertet"), "a meal not rated yet with its own sign")
        check(tags("pend-") == listOf("m1"), "the meal not rated yet waits in the rating card")
        check(seed("2026-06-12T05:30", owner.drop(1)) == listOf("m4", "m3", "m2"), "nothing yet today: yesterday, newest first")
        check(
            seed("2026-06-14T10:00", owner).isEmpty() && shows("Heute noch nicht gefüttert") && labelled("Alle Einträge"),
            "neither today nor yesterday: an empty line, the way to the whole history stays",
        )
        val house =
            listOf(
                Triple("t1", "2026-06-12T08:00", listOf(T)),
                Triple("k1", "2026-06-11T08:00", listOf(M)),
                Triple("k2", "2026-06-11T18:00", listOf(M)),
            )
        val everyone = seed("2026-06-12T10:00", house, listOf(M, T, "mauz000001"))
        val mine =
            listOf(M, "mauz000001").map {
                act("filter", "id" to it)
                hist()
            }
        check(
            listOf(everyone) + mine == listOf(listOf("t1"), listOf("k2", "k1"), emptyList()) && shows("Noch nichts eingetragen"),
            "within the filter $mine",
        )
        check(
            seed("2026-06-12T00:05", listOf(Triple("n1", "2026-06-11T23:50", listOf(M)))) == listOf("n1"),
            "just after midnight the evening meal is yesterday",
        )
        val future = listOf(Triple("f1", "2026-06-13T09:00", listOf(M)), Triple("f2", "2026-06-12T07:00", listOf(M)))
        check(seed("2026-06-12T10:00", future) == listOf("f2"), "a meal stamped in the future by another clock does not push today away")
        val today3 = (0 until 3).map { Triple("h$it", "2026-06-12T0${7 + it}:00", listOf(M)) }
        val long =
            today3 +
                (0 until 20).flatMap { d ->
                    (0 until 3).map { i -> Triple("d$d-$i", "2026-05-%02dT%02d:00".format(11 + d, 8 + 4 * i), listOf(M)) }
                }
        check(seed("2026-06-12T12:00", long) == listOf("h2", "h1", "h0"), "a long history: still only today")
        seed("2026-06-12T05:30", owner.drop(1))
        act("feed")
        act("serve", "id" to "sorte00000")
        idle(400)
        val served = hist()
        act("undo")
        check(
            served.size == 1 && served[0] !in listOf("m2", "m3", "m4") && hist() == listOf("m4", "m3", "m2"),
            "serving replaces yesterday, undo brings it back",
        )
        val cal =
            today3 +
                (0 until 11).flatMap { d ->
                    (0 until 3).map { i -> Triple("c$d-$i", "2026-06-%02dT%02d:00".format(1 + d, 8 + 4 * i), listOf(M)) }
                }
        seed("2026-06-12T12:00", cal)
        val week = tags("day-", within = "sec-hist")
        check(
            week.size == 7 && week.last() == "2026-06-12" && labelled("Heute, 3"),
            "the home calendar: the last seven days in one row, today last $week",
        )
        val jumps =
            listOf("2026-06-12", "2026-06-06").map { day ->
                act("jump-day", "day" to day)
                idle(400)
                val seen = sheet?.kind to tags("d-", sheet = true).contains(day)
                act("settings-back")
                seen
            }
        check(jumps == listOf("report" to true, "report" to true), "a calendar day opens the history there $jumps")
    }

    @Test
    fun `report - every meal reachable by scrolling, the pet filter, its calendar grows the list`() {
        val noon = at("2026-06-12T12:00")
        val meals =
            (0 until 20).flatMap { d ->
                (0 until 3).map { n ->
                    meal(
                        "meal$d-$n",
                        "sorte1",
                        noon - d * DAY - n * 3_600_000L,
                        mapOf(M to "top") + if (n == 0 && d % 2 == 0) mapOf(T to "gut") else emptyMap(),
                    )
                }
            }
        open(mapOf("db" to dbOf(listOf(pet(M), pet(T, "Tiger")), listOf(product("sorte1")), meals)), at("2026-06-12T15:00"))
        act("open-report")
        val oldest = tags("day-", sheet = true).first { d -> meals.any { dayKey((it["servedAt"] as Long)) == d } }
        act("jump-day", "day" to oldest)
        idle(600)
        check(tags("d-", sheet = true).contains(oldest), "a calendar day not drawn yet grows the list to it")
        check(scrolledRows() == 60, "every meal reachable by scrolling")
        act("settings-back")
        act("filter", "id" to T)
        act("open-report")
        check(scrolledRows() == 10, "with a pet chosen, only its meals")
    }

    // the history page scrolled to its end, the rows seen on the way
    private fun scrolledRows(): Int {
        val seen = HashSet<String>()
        val list =
            rule.onAllNodes(
                androidx.compose.ui.test
                    .hasScrollToIndexAction(),
            )[0]
        var i = 0
        while (runCatching { list.performScrollToIndex(i) }.isSuccess) {
            idle()
            seen.addAll(tags("row-", sheet = true))
            i += 2
        }
        return seen.size
    }
}
