package de.schmeckts.app

import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import de.schmeckts.app.views.insightSaid
import de.schmeckts.app.views.syncChip
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import org.junit.Test
import org.robolectric.Robolectric
import org.robolectric.annotation.Config

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

class UiEvaluationTest : ScreenTest() {
    private fun dbFile(
        pets: List<Map<String, Any?>>,
        products: List<Map<String, Any?>>,
        meals: List<Map<String, Any?>>,
    ) = mapOf("db" to dbOf(pets, products, meals))

    private fun load(
        products: List<Map<String, Any?>>,
        meals: List<Map<String, Any?>>,
    ) {
        phone.store.replaceDb(dbRaw(dbOf(listOf(pet(M)), products, meals)))
        phone.store.save()
        ui.update()
        idle()
    }

    @Test
    fun `evaluation - the card shows what goes down well and what is left, a row opens its sheet, the page has levels`() {
        open()
        act("demo")
        val tops = tags("pick-", within = "sec-evaluation")
        val r = phone.derive.rankingModel()
        check(tops.isNotEmpty() && tops.size <= 4 && tops.first() == r.top.firstOrNull()?.id, "two sides of at most two rows $tops")
        check(
            tags("medal-", within = "sec-evaluation") ==
                listOfNotNull(if (r.top.isNotEmpty()) "good" else null, if (r.flop.isNotEmpty()) "bad" else null),
            "the best crowned and the worst with its bowl",
        )
        act("open-product", "id" to tops[0])
        check(sheet?.kind == "product" && sheet?.id == tops[0], "a row opens its food sheet")
        act("close")
        act("open-evaluation")
        val ranked = tags("place-", sheet = true)
        val names = ranked.mapNotNull { phone.derive.getProduct(it)?.let(::pname) }
        val m = phone.derive.model()
        val portrait = phone.derive.evaluationModel()
        check(
            names.isNotEmpty() &&
                names.none { n ->
                    shows("${db.pets[0].str("name")} ist wählerisch: $n")
                },
            "the portrait names none of the varieties the lists below show",
        )
        val taste = portrait.taste
        check(
            taste.marke.isEmpty() &&
                taste.konsistenz.isNotEmpty() &&
                taste.geschmack.isNotEmpty() &&
                listOf(taste.konsistenz, taste.geschmack).all { l ->
                    l.map { it.good.toDouble() / it.n } ==
                        l.map { it.good.toDouble() / it.n }.sortedDescending()
                } &&
                inSheet("Konsistenz") &&
                inSheet("Geschmack"),
            "the portrait’s taste profile: how often each consistency and flavour went down well, best first",
        )
        check(ranked.isNotEmpty() && m.pets.isNotEmpty(), "every row of a longer list shows its place")
        check(inSheet("Tops") && inSheet("Flops"), "Tops and Flops, the titles plain words")
    }

    @Test
    fun `insights - the three strongest on the card, all on its page for buying and for feeding, each with its counts`() {
        val sorts =
            listOf(
                product("a", "Sheba", "Lachs in Soße"),
                product("b", "Sheba", "Huhn in Soße"),
                product("c", "Felix", "Lachs in Gelee"),
                product("d", "Felix", "Huhn in Gelee"),
                product("treat", "Dreamies", "Käse", "Snack"),
            )
        // a morning meal in jelly, eaten up; in the evening one in sauce two hours after a treat, licked
        val meals =
            (1..8).flatMap { d ->
                listOf(
                    meal("m$d", "cd"[d % 2].toString(), at("2026-06-0${d}T07:00"), mapOf(M to "top")),
                    meal("t$d", "treat", at("2026-06-0${d}T17:00"), mapOf(M to "verputzt")),
                    meal("e$d", "ab"[d % 2].toString(), at("2026-06-0${d}T19:00"), mapOf(M to "sosse")),
                )
            }
        open(now = at("2026-06-12T12:00"))
        load(sorts, meals)
        act("open-evaluation")
        val card =
            listOf(
                "Bisher kommt <b>Stückchen in Gelee</b> besser an als Stückchen in Soße." to
                    "Stückchen in Gelee <b>8 von 8 Mal</b> gut gefressen, Stückchen in Soße 8 von 8 Mal.",
            )
        val said =
            phone.derive
                .evaluationModel()
                .insights
                .map { insightSaid(it) }
        val plain =
            said.map {
                de.schmeckts.app.ui
                    .plainOf(it.say) to
                    de.schmeckts.app.ui
                        .plainOf(it.why)
            }
        check(
            plain.take(3) ==
                listOf(
                    "Bisher kommt Stückchen in Gelee besser an als Stückchen in Soße." to
                        "Stückchen in Gelee 8 von 8 Mal gut gefressen, Stückchen in Soße 0 von 8 Mal.",
                    "Bei Stückchen in Soße wird oft nur die Soße geleckt." to
                        "8 von 8 Mal nur die Soße. Stückchen in Gelee dagegen 8 von 8 Mal gut gefressen.",
                    "Die erste Mahlzeit am Tag kommt besser an als die letzte." to
                        "Bei der ersten 8 von 8 Mal gut gefressen, bei der letzten 0 von 8 Mal.",
                ) &&
                plain.take(3).all { (a, b) -> inSheet(a) && inSheet(b) } &&
                !inSheet(plain[3].first),
            "the card: the three strongest, each a sentence over its counts $plain ${card.size}",
        )
        act("open-level", "v" to "insights")
        val lvl = level
        val page = plain.all { (a, b) -> inSheet(a) && inSheet(b) } && inSheet("Beim Kaufen") && inSheet("Beim Füttern")
        act("settings-back")
        check(
            lvl == listOf("evaluation", "insights", null) &&
                page &&
                plain[3] ==
                (
                    "Nach einem Snack bleibt beim nächsten Napf öfter etwas stehen." to
                        "Nach Snacks 0 von 8 Mal gut gefressen, sonst 8 von 8 Mal."
                ) &&
                level == listOf("evaluation", null, null),
            "„Mehr“ leads to all of them, for buying and for feeding, and back",
        )
    }

    @Test
    fun `candidate - no Top yet, the card names the variety closest to it, which Als Naechstes then leaves out`() {
        val now = at("2025-06-17T12:00")
        val rated =
            listOf(
                "ladenhueter" to listOf("schlecht", "schlecht", "mittel"),
                "naechste1" to listOf("top", "gut"),
                "naechste2" to listOf("top"),
            )
        val products = rated.map { (i, _) -> product(i, "Sheba", i.replaceFirstChar { it.uppercase() }) }
        val meals =
            rated.flatMapIndexed { k, (i, levels) ->
                levels.mapIndexed { n, r ->
                    meal(
                        "$i-$n",
                        i,
                        now - (n + 1) * DAY - k * 3_600_000L,
                        mapOf(M to r),
                    )
                }
            }
        open(dbFile(listOf(pet(M)), products, meals), now)
        check(
            tags("pick-", within = "sec-evaluation") == listOf("naechste1", "ladenhueter"),
            "the closest variety stands under „Tops“, then the Flops",
        )
        check(
            shows("Sheba, noch 1× bewerten") &&
                shows("Sheba, 2 von 3 Mal fast nix gefressen") &&
                tags("medal-", within = "sec-evaluation") == listOf("bad"),
            "with what it lacks, uncrowned",
        )
        act("open-evaluation")
        check(
            inSheet("Auf gutem Weg") && inSheet("Naechste2") && tags("place-", sheet = true) == listOf("ladenhueter"),
            "its card names it before the Flops, „Als Nächstes“ only the others",
        )
        act("settings-back")
        load(products.take(1), meals.take(3))
        check(!shows("Tops") && shows("Flops"), "nothing that goes down well: only what is left")
    }

    @Test
    fun `record - a variety's tally where it is served, who it goes down best with`() {
        val now = at("2026-06-12T12:00")
        val rated =
            linkedMapOf(
                "lachs" to listOf("top", "top", "gut"),
                "zaeh" to listOf("mittel", "mittel", "schlecht"),
                "nie" to listOf("schlecht", "schlecht"),
            )
        val prods =
            listOf(
                product("lachs", "Sheba", "Lachs in Soße"),
                product("zaeh", "Gourmet", "Rind Pastete"),
                product("nie", "Whiskas", "Huhn"),
            )
        val meals =
            rated.entries.flatMapIndexed { k, (i, levels) ->
                levels.mapIndexed { n, r ->
                    meal(
                        "$i-$n",
                        i,
                        now - (n + 1) * DAY - k * 3_600_000L,
                        mapOf(M to r),
                    )
                }
            } +
                meal("offen", "lachs", now - 2 * 3_600_000L, mapOf(M to null))
        open(now = now)
        load(prods, meals) // ids as short as these only as the old tests put them in place
        check(shows("heute um 10:00"), "the open meal says its time as the feeding sheet does")
        act("feed")
        check(
            inSheet("2 von 3 Mal die Hälfte gefressen") && !inSheet("Whiskas"),
            "a variety that goes down badly shows its record in the list, one that goes down well does not",
        )
        act("close")
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to "nie"),
        )
        act("serve", "id" to "nie")
        idle(400)
        val told = toast ?: ""
        act("undo")
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to "lachs"),
        )
        act("serve", "id" to "lachs")
        idle(400)
        val plain = toast ?: ""
        check(
            "Zuletzt beide Male fast nix gefressen" in told && "Zuletzt" !in plain,
            "the toast tells the record of one nobody buys any more ($told / $plain)",
        )
        val two = listOf(product("lachs", "Sheba", "Lachs in Soße"), product("zaeh", "Gourmet", "Rind Pastete"))
        val byWho =
            (1 until 15).flatMap { d ->
                listOf("Anna" to 4, "Jonas" to -6).map { (who, h) ->
                    meal(
                        "f$d-$who",
                        listOf("lachs", "zaeh")[d % 2],
                        now - d * DAY - h * 3_600_000L,
                        mapOf(
                            M to if (who == "Anna" || d % 3 == 0) "top" else "sosse",
                        ),
                        "by" to who,
                    )
                }
            }
        load(two, byWho)
        act("open-evaluation")
        val card =
            inSheet("Bei Anna kommen dieselben Sorten besser an als bei Jonas.") &&
                inSheet("Bei Anna 14 von 14 Mal gut gefressen, bei Jonas 4 von 14 Mal.")
        act("settings-back")
        load(two, byWho.map { it + ("by" to "Anna") })
        act("open-evaluation")
        check(
            card && !inSheet("dieselben Sorten"),
            "who serves among the insights where several people feed and one clearly does better, never with one person",
        )
    }

    @Test
    fun `scales - dry food and treats have their own levels`() {
        val now = at("2026-06-10T23:30")
        val rated =
            listOf(
                Triple("trocken", null, 1),
                Triple("snack", null, 2),
                Triple("trocken", "gut", 20),
                Triple("trocken", "gern", 21),
                Triple("trocken", "liegen", 23),
            )
        open(
            dbFile(
                listOf(pet(M)),
                listOf(product("trocken0001", "Josera", "", "Trockenfutter"), product("snack0001", "Dreamies", "", "Snack")),
                rated.mapIndexed { i, (p, r, ago) -> meal("meal00000$i", p + "0001", now - ago * 3_600_000L, mapOf(M to r)) },
            ),
            now,
        )
        val dry = listOf("gern", "normal", "wenig", "liegen")
        val treat = listOf("verputzt", "spaeter", "angeknabbert", "unberuehrt")
        val levels = listOf(tags("level-", within = "pend-meal000000"), tags("level-", within = "pend-meal000001"))
        act("open-serving", "id" to "meal000001")
        val inSheetLevels = tags("level-", sheet = true)
        act("close")
        check(
            levels + listOf(inSheetLevels) == listOf(dry, treat, treat) && tags("pend-") == listOf("meal000000", "meal000001"),
            "own scales for dry food and treats; every open meal keeps its scale on the home page $levels",
        )
        act("open-serving", "id" to "meal000002") // rated on another scale
        act("rate", "s" to "meal000002", "p" to M, "r" to "liegen")
        check(
            (phone.derive.getServing("meal000002")!!.pets[M] as kotlinx.serialization.json.JsonObject)["r"].asString == "liegen",
            "a tap replaces a level from another scale",
        )
        idle(2000)
        check(sheet != null, "a rating put right: the sheet stays open")
        act("close")
        act("open-serving", "id" to "meal000000")
        act("rate", "s" to "meal000000", "p" to M, "r" to "normal")
        check(until(5000) { sheet == null }, "the last open pet rated: the sheet closes by itself")
    }
}

class UiNarrowTest : ScreenTest() {
    // text off the screen, or cut by its box; rails scroll, and a row's title is cut to two lines on purpose
    private fun cut(): List<String> {
        val width =
            rule
                .onAllNodes(
                    androidx.compose.ui.test
                        .isRoot(),
                )[0]
                .fetchSemanticsNode()
                .boundsInRoot.width
        val rail =
            androidx.compose.ui.test.hasAnyAncestor(
                androidx.compose.ui.test.SemanticsMatcher.keyIsDefined(
                    androidx.compose.ui.semantics.SemanticsProperties.HorizontalScrollAxisRange,
                ),
            )
        val text =
            androidx.compose.ui.test.SemanticsMatcher
                .keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.Text)
        val bad = mutableListOf<String>()
        for (n in rule.onAllNodes(text and !rail, useUnmergedTree = true).fetchSemanticsNodes()) {
            val what = n.config[androidx.compose.ui.semantics.SemanticsProperties.Text].joinToString().take(40)
            if (n.boundsInRoot.width <= 0f) continue
            if (n.boundsInRoot.left < -0.5f || n.boundsInRoot.right > width + 0.5f) bad.add("off the screen: $what")
            val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
            n.config
                .getOrElseNullable(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { null }
                ?.action
                ?.invoke(layouts)
            val l = layouts.firstOrNull() ?: continue
            if (l.layoutInput.maxLines == 2) continue
            if (l.hasVisualOverflow) bad.add("cut: $what")
        }
        return bad
    }

    private fun walk(big: Boolean) {
        if (big) org.robolectric.RuntimeEnvironment.setFontScale(1.3f)
        open()
        act("demo")
        val pet = db.pets[0].id
        db.products.add(Rec(j(product("trocken0001", "Josera", "Huhn", "Trockenfutter")).obj()))
        db.products.add(Rec(j(product("snack0001", "Dreamies", "Käse", "Snack")).obj()))
        listOf("trocken0001", "snack0001").forEachIndexed { i, p ->
            db.servings.add(Rec(j(meal("narrow$i", p, clock - (i + 1) * 60_000L, mapOf(pet to null))).obj()))
        }
        db.servings.sortByDescending { it.servedAt }
        phone.store.save()
        ui.update()
        idle()
        val found = LinkedHashMap<String, List<String>>()
        val look = { name: String -> cut().takeIf { it.isNotEmpty() }?.let { found[name] = it } }
        val closed = {
            ui.sheets.closeAll()
            idle(400)
        }
        look("home")
        for (a in listOf("open-evaluation", "open-report", "feed")) {
            act(a)
            idle(400)
            look(a)
            if (a != "feed") closed()
        }
        act("new-product")
        look("new-product")
        closed()
        act("open-serving", "id" to db.servings.first { it.str("productId") != null && !it.str("productId").isNullOrEmpty() }.id)
        look("serving")
        closed()
        act("open-settings")
        look("settings")
        for (page in listOf("house", "exchange", "backup", "privacy")) {
            act("settings-page", "v" to page)
            look(page)
            act("settings-back")
        }
        closed()
        act(
            "open-product",
            "id" to
                phone.derive
                    .rankingModel()
                    .top[0]
                    .id,
        )
        look("variety")
        closed()
        val meals = phone.derive.pendingServings().map { it.id }
        for (m in meals) {
            act("open-serving", "id" to m)
            look(m)
            closed()
        }
        check(meals.size >= 3 && found.isEmpty(), "nothing cut${if (big) " with a large font" else ""}, with all three scales $found")
    }

    @Test
    @Config(qualifiers = "w360dp-h800dp-xxhdpi")
    fun `narrow - at 360dp nothing is cut off on the home page, the pages and sheets, every rating scale`() = walk(false)

    @Test
    @Config(qualifiers = "w360dp-h800dp-xxhdpi")
    fun `narrow - with a large system font nothing is cut off either`() = walk(true)
}

class UiMotionTest : ScreenTest() {
    // a picture of the node now and once it has settled; they differ while it moves
    private fun moves(
        text: String,
        action: () -> Unit,
    ): Boolean {
        rule.mainClock.autoAdvance = false
        action()
        rule.mainClock.advanceTimeByFrame()
        rule.mainClock.advanceTimeBy(48)
        val mid = rule.onAllNodes(hasText(text) or hasContentDescription(text))[0].captureToImage().asAndroidBitmap()
        rule.mainClock.advanceTimeBy(1000)
        val end = rule.onAllNodes(hasText(text) or hasContentDescription(text))[0].captureToImage().asAndroidBitmap()
        rule.mainClock.autoAdvance = true
        return !mid.sameAs(end)
    }

    @Test
    fun `controls - a switch, a segment or a chip moves to its new state as if changed in place`() {
        open(reduce = false)
        act("demo")
        idle(1000)
        act("open-settings")
        idle(1000)
        val switch = moves("Katzenkalender") { ui.act("calendar") }
        val seg = moves("Dunkel") { ui.act("theme", "v" to "dark") }
        check(switch && seg, "the knob slides over and the track takes its colour, the segment its fill $switch $seg")
    }
}

class UiSlideTest : ScreenTest() {
    private lateinit var meal: String

    private fun rated() =
        (
            phone.derive
                .getServing(meal)
                ?.pets
                ?.values
                ?.first() as? JsonObject
        )?.get("r").asString

    private fun level(r: String) =
        rule.onNode(
            androidx.compose.ui.test
                .hasTestTag("level-$r") and
                androidx.compose.ui.test
                    .hasAnyAncestor(
                        androidx.compose.ui.test
                            .hasTestTag("pend-$meal"),
                    ),
            useUnmergedTree = true,
        )

    private fun center(r: String) = level(r).fetchSemanticsNode().boundsInRoot.center

    private fun reopen() {
        val s = phone.derive.getServing(meal)!!
        s["pets"] = petMap(s.pets.keys.toList())
        phone.store.save()
        ui.home.held.clear()
        ui.update()
        idle(2000)
    }

    // a finger from one level towards another, steps moves of it, dy off the line; lifted unless cancel
    private fun slide(
        from: String,
        to: String,
        steps: Int = 5,
        dy: Float = 0f,
        cancel: Boolean = false,
    ) {
        val a = center(from)
        val b = center(to)
        level(from).performTouchInput {
            down(center)
            for (i in 1..steps) {
                moveBy(
                    androidx.compose.ui.geometry
                        .Offset((b.x - a.x) / steps, if (i == 1) dy else 0f),
                )
            }
            if (cancel) cancel() else up()
        }
        idle(400)
    }

    @Test
    @Config(qualifiers = "w360dp-h800dp-xxhdpi")
    fun `slide - one rating per gesture under a finger or the keyboard, none when scrolling or cancelled`() {
        open()
        act("demo")
        meal = phone.derive.pendingServings()[0].id
        idle(3000)
        val y0 = center("gut").y
        level("gut").performTouchInput {
            down(center)
            advanceEventTime(250) // a resting finger
            up()
        }
        idle(400)
        check(rated() == "gut", "lifting the finger rates once")
        check(kotlin.math.abs(center("gut").y - y0) < 1, "the row stays under the finger, whatever the rating changes above it")
        slide("gut", "top")
        check(rated() == "top", "while the card stays, a slide puts it right")
        act("undo")
        check(rated() == "gut", "undo brings back the level before")
        reopen()
        slide("top", "eager", 10, 2f)
        check(rated() == "eager", "a slide rates the level it ends on, once")
        reopen()
        val list =
            rule.onAllNodes(
                androidx.compose.ui.test
                    .hasScrollAction(),
            )[0]
        level("mittel").performTouchInput {
            down(center)
            for (dy in 10 until 130 step 10) {
                moveBy(
                    androidx.compose.ui.geometry
                        .Offset(1f, -10f),
                )
            }
            up()
        }
        idle(400)
        check(
            rated() == null &&
                list.fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange].value() > 0f,
            "moving up scrolls and rates nothing",
        )
        slide("gut", "eager", cancel = true)
        check(rated() == null, "a cancelled slide rates nothing")
        level("gut").performTouchInput { down(center) }
        ui.update()
        idle(50)
        level("gut").performTouchInput { up() }
        idle(400)
        check(rated() == "gut", "a redraw waits for the finger to lift, so the rating counts")
        reopen()
        level("mittel").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        idle(400)
        check(rated() == "mittel", "keyboard and screen readers: the focused level rates")
    }
}

class UiNamingTest : ScreenTest() {
    private fun load(
        products: List<Map<String, Any?>>,
        meals: List<Map<String, Any?>>,
    ) {
        phone.store.replaceDb(dbRaw(dbOf(listOf(pet(M)), products, meals)))
        phone.store.save()
        ui.update()
        idle()
    }

    private val brands = listOf("Sheba", "Felix", "Gourmet", "Whiskas", "Animonda", "Miamor", "Cosma", "Purizon", "Bozita", "Schesir")

    // n varieties of their own brand, one meal each, days apart (0: an hour)
    private fun sorts(
        n: Int,
        days: Int,
    ) {
        val levels = listOf("top", "gut", "mittel", "sosse", "schlecht")
        load(
            (0 until n).map { product("sorte%05d".format(it), brands[it % 10], "Sorte ${it + 1}", "Nassfutter", "createdAt" to it) },
            (0 until n).map {
                meal(
                    "meal%06d".format(it),
                    "sorte%05d".format(it),
                    clock - 3_600_000L - (
                        it * (
                            if (days ==
                                0
                            ) {
                                DAY / 24
                            } else {
                                days * DAY
                            }
                        )
                    ),
                    mapOf(M to levels[it % 5]),
                )
            },
        )
    }

    private fun names() = tags("serve-", sheet = true).map { phone.derive.getProduct(it)!!.str("variety") }

    @Test
    fun `texture - set, cleared, replaced, gone with a type change, filled from keywords only when empty`() {
        open()
        val foods = listOf(product("nass0001"), product("trocken0001", "Josera", "Huhn in Soße", "Trockenfutter"))
        load(foods, foods.mapIndexed { i, p -> meal("meal$i", p["id"] as String, clock - (i + 30) * 3_600_000L, mapOf(M to "top")) })
        val tex = { phone.derive.getProduct("nass0001")!!.str("texture") }
        val on = {
            TEXTURES
                .getValue("Nassfutter")
                .items
                .filter { chosen(it.label) }
                .map { it.key }
        }
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to "nass0001"),
        )
        val got =
            listOf(listOf("block"), listOf("block"), listOf("gelee", "pastete")).map { picks ->
                picks.forEach { act("set-texture", "v" to it) }
                tex() to on()
            }
        check(
            got == listOf("block" to listOf("block"), null to emptyList(), "pastete" to listOf("pastete")),
            "a tap sets it, a second drops the field, another replaces it $got",
        )
        act("close")
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to "trocken0001"),
        )
        check(!inSheet("Fester Block"), "dry food: no choice")
        act("close")
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to "nass0001"),
        )
        act("rename-product")
        act("set-type", "v" to "Snack")
        val snack = on()
        act("set-type", "v" to "Sonstiges")
        act("save-name")
        val p = phone.derive.getProduct("nass0001")!!
        check(snack.isEmpty() && p.str("type") == "Sonstiges" && !p.has("texture"), "another type drops it")
        act("close")

        fun nameNew(
            variety: String,
            pick: String? = null,
            twice: Boolean = false,
            kind: String = "Nassfutter",
        ): String? {
            act("feed")
            act("new-product")
            type("Marke", "Miamor")
            type("Sorte", variety)
            act("set-type", "v" to kind)
            repeat((if (pick != null) 1 else 0) + (if (twice) 1 else 0)) { act("set-texture", "v" to pick) }
            act("save-name")
            idle(400)
            return db.products.find { it.str("variety") == variety }?.str("texture")
        }
        val named =
            listOf(
                nameNew("Ragout in Gelee"),
                nameNew("Filet in Soße", "mousse"),
                nameNew("Huhn in Jelly", "gelee", twice = true),
                nameNew("Knusperkissen", kind = "Snack"),
                nameNew("Kaninchen"),
            )
        check(
            named == listOf("gelee", "mousse", null, "knusprig", null),
            "keywords fill an empty field only, a choice or a cleared field stays $named",
        )
        val products = main.logic.products

        fun make(
            variety: String,
            texture: String?,
            type: String = "Nassfutter",
        ) = products
            .newProduct(
                de.schmeckts.app.logic
                    .Details("Test", variety, type, texture),
            ).str("texture")
        val old =
            products.newProduct(
                de.schmeckts.app.logic
                    .Details("Test", "Pute", "Nassfutter", "suppe"),
            )
        products.applyTexture(
            old,
            de.schmeckts.app.logic
                .Details(texture = "gelee"),
        )
        val made =
            listOf(
                make("Huhn in Soße", "gelee"),
                make("Rind in Soße", "knusprig"),
                make("Ente in Soße", null),
                make("Sticks", "weich", "Snack"),
                make("Kroketten in Soße", "sosse", "Trockenfutter"),
                old.str("texture"),
            )
        check(made == listOf("gelee", "sosse", "sosse", "weich", null, "suppe"), "a fitting recognised value beats keywords $made")
    }

    @Test
    fun `suggestions - at most eight hits, a new variety from the search`() {
        open()
        sorts(3, 0)
        act("feed")
        check(names() == listOf("Sorte 1", "Sorte 2", "Sorte 3") && !labelled("Marke oder Sorte suchen"), "three: all suggested, no search")
        act("close")
        sorts(12, 0)
        act("feed")
        check(names() == listOf("Sorte 1", "Sorte 2", "Sorte 3"), "twelve: the three fed last")
        type("Marke oder Sorte suchen", "Sorte")
        check(names().size == 8, "at most eight hits")
        type("Marke oder Sorte suchen", "sheba sorte 11")
        val hit = names()
        type("Marke oder Sorte suchen", "")
        check(
            hit == listOf("Sorte 11") && names() == listOf("Sorte 1", "Sorte 2", "Sorte 3"),
            "brand and variety together; empty: suggestions $hit",
        )
        act("close")
        db.products.first { it.str("variety") == "Sorte 2" }.put("kaufen", "nicht")
        phone.store.save()
        act("feed")
        val offered = names()
        type("Marke oder Sorte suchen", "sorte 2")
        check(
            offered == listOf("Sorte 1", "Sorte 3", "Sorte 4") && names() == listOf("Sorte 12", "Sorte 2"),
            "a variety no longer bought is not suggested, the search still finds it, last $offered ${names()}",
        )
        val meals = db.servings.size
        rule
            .onNode(
                androidx.compose.ui.test
                    .hasTestTag("serve-sorte00011"),
            ).performTouchInput {
                click()
                click()
            }
        idle(600)
        check(db.servings.size == meals + 1, "a quick second tap does not feed twice")
        act("feed")
        type("Marke oder Sorte suchen", "gibtsnicht")
        act("new-product", "v" to "gibtsnicht")
        check(sheet?.str("variety") == "gibtsnicht" && labelled("Sorte"), "no hit: what was typed becomes a new variety")
    }
}
