package de.schmeckts.app

import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import de.schmeckts.app.ui.plainOf
import de.schmeckts.app.views.catOf
import de.schmeckts.app.views.insightSaid
import de.schmeckts.app.views.sheetOn
import de.schmeckts.app.views.sheetText
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

class UiReminderTest : ScreenTest() {
    private val notes get() = platform.notifications

    private fun due() = notes.planned.map { Triple(it.serving, it.body, it.at) }

    // a meal served ago minutes back, as the app enters it; its reminder follows from the data
    private fun plan(
        id: String,
        ago: Int,
        productId: String?,
    ): Long {
        val t = clock - ago * 60_000L
        db.servings.add(0, Rec(j(meal(id, productId, t, mapOf(db.pets[0].id to null))).obj()))
        phone.store.save()
        idle(400)
        return t
    }

    private fun rate(
        id: String,
        r: String,
    ) {
        val s = phone.derive.getServing(id)!!
        s["pets"] = kotlinx.serialization.json.JsonObject(s.pets.mapValues { j(mapOf("r" to r, "at" to 1)) })
        phone.store.save()
        idle(400)
    }

    @Test
    fun `reminders - permission, schedule, tap, cancel once rated, follow changes, own interval, reconcile at start`() {
        notes.answer = "denied"
        open()
        act("demo")
        idle(400)
        db.pets.add(Rec(j(pet("tigerpet01", "Tiger")).obj()))
        phone.store.save()
        act("open-settings")
        idle(400)
        check(prefs.remind == 0 && !inSheet("3 Std."), "off by default, no steps shown")
        act("remind-on")
        idle(400)
        check(
            calls("requestPermissions").size == 1 && prefs.remind == 0 && sheet?.get("denied") == "remind",
            "denied: asked once, stays off",
        )
        notes.granted = "prompt"
        notes.answer = "granted"
        act("remind-on")
        idle(400)
        check(prefs.remind == 180 && chosen("3 Std."), "granted: on with 3 hours")
        restart()
        act("feed")
        act(
            "serve",
            "id" to
                phone.derive
                    .quickProducts(3)[0]
                    .product.id,
        )
        idle(600)
        val s = db.servings[0]
        val n = notes.planned.firstOrNull()
        check(
            notes.planned.size == 1 &&
                n != null &&
                pname(phone.derive.getProduct(s.str("productId"))) in n.body &&
                n.at == s.servedAt + 180 * 60_000L &&
                n.serving == s.id &&
                n.id > 0,
            "serving schedules one inexact reminder, serving time plus 3 hours, naming the variety $n",
        )
        main.phone.scope.launch { main.logic.reminders.onAction("tap", n!!.serving, null) }
        idle(400)
        check(
            level == listOf("serving", null, null) && sheet?.id == s.id && tags("level-", sheet = true).size == 6 * s.pets.size,
            "a tap opens the meal",
        )
        var half = 1
        s.pets.keys.toList().forEachIndexed { i, pid ->
            if (i > 0) half = notes.planned.size
            act("rate", "s" to s.id, "p" to pid, "r" to "top")
            idle(400)
        }
        check(half == 1 && notes.planned.isEmpty(), "cancelled once all pets rated")
        idle(2000)
        val t0 = plan("ohnesorte001", 2, null)
        plan("zualt0000001", 11, null)
        check(due().map { it.first } == listOf("ohnesorte001"), "unknown food gets one, a meal older than 10 minutes none")
        val lachs = db.products[0]
        phone.derive.getServing("ohnesorte001")!!.let {
            it.put("productId", lachs.id)
            it["servedAt"] = num(it.servedAt - 5 * 60_000L)
        }
        phone.store.save()
        idle(400)
        val moved = due()
        check(
            moved.size == 1 && lachs.str("variety")!! in moved[0].second && moved[0].third == t0 - 5 * 60_000L + 180 * 60_000L,
            "it follows naming and time $moved",
        )
        act("open-settings")
        act("remind", "v" to "360")
        idle(400)
        val later = due()[0].third
        val asked = calls("requestPermissions").size
        act("remind-on")
        idle(400)
        check(
            later == t0 - 5 * 60_000L + 360 * 60_000L && notes.planned.isEmpty() && calls("requestPermissions").size == asked,
            "another step moves it, off cancels all",
        )
        act("remind-on")
        idle(400)
        check(prefs.remind == 360, "on again: the step chosen last")
        act("remind-own")
        idle(400)
        type("Stunden, 1 bis $REMIND_MAX_H", "5")
        idle(400)
        val own = prefs.remind
        for (bad in listOf("30", "0", "")) {
            type("Stunden, 1 bis $REMIND_MAX_H", bad)
            idle(400)
        }
        check(own == 300 && prefs.remind == 300, "own interval in hours, stored in minutes; out of range ignored")
        act("settings-back")
        idle(400)
        val t1 = plan("loeschen0001", 0, lachs.id)
        val planned = due().filter { it.first == "loeschen0001" }
        openSheet(
            de.schmeckts.app.ui
                .SheetState("serving", "id" to "loeschen0001"),
        )
        main.logic.editing.deleteServing("loeschen0001")
        idle(400)
        check(
            planned.map {
                it.third
            } == listOf(t1 + 300 * 60_000L) &&
                due().none { it.first == "loeschen0001" },
            "own interval scheduled; meal deleted: cancelled",
        )
        plan("bleibt000001", 1, lachs.id)
        rate("ohnesorte001", "top")
        restart()
        idle(400)
        main.phone.scope.launch { main.logic.reminders.onAction("tap", "bleibt000001", null) }
        idle(400)
        check(
            due().map { it.first } == listOf("bleibt000001"),
            "at start-up reminders without an open meal go, the open one stays ${due()}",
        )
        check(level == listOf("serving", null, null) && sheet?.id == "bleibt000001", "a tap on a cold start opens the meal")
        act("close")
        act("open-settings")
        idle(400)
        check(shows("5") && prefs.remind == 300, "the own interval survives a restart")
    }
}

class UiReminderButtonsTest : ScreenTest() {
    private val notes get() = platform.notifications

    private fun note(sid: String) = notes.planned.find { it.serving == sid }

    private fun ask(
        id: String,
        pets: List<String>,
        productId: String,
    ) {
        db.servings.add(0, Rec(j(meal(id, productId, clock, pets.associateWith { null })).obj()))
        phone.store.save()
        idle(400)
    }

    private fun setRating(
        id: String,
        pet: String,
        r: String,
    ) {
        val s = phone.derive.getServing(id)!!
        s["pets"] = kotlinx.serialization.json.JsonObject(s.pets + (pet to j(mapOf("r" to r, "at" to clock))))
        phone.store.save()
        idle(400)
    }

    private fun press(
        action: String,
        n: Note,
    ) {
        main.phone.scope.launch { main.logic.reminders.onAction(action, n.serving, n.pet) }
        idle(400)
    }

    @Test
    fun `reminder buttons - the best, a middling and the worst level, one open pet only, a rated meal opens instead`() {
        val now = at("2025-06-17T12:00")
        val rated =
            listOf(
                "lachs00001" to "top",
                "lachs00001" to "gut",
                "lachs00001" to "top",
                "lachs00001" to "mittel",
                "lachs00001" to "gut",
            )
        val household =
            dbOf(
                listOf(pet(M), pet(T, "Tiger")),
                listOf(product("lachs00001"), product("trocken001", "Josera", "Rind", "Trockenfutter")),
                rated.mapIndexed { i, (pid, r) -> meal("altmeal00$i", pid, now - (i + 1) * DAY, mapOf(M to r)) },
            )
        open(mapOf("db" to household, "prefs" to j(mapOf("remind" to 180))), now)
        ask("einzeln0001", listOf(M), "lachs00001")
        val n = note("einzeln0001")!!
        check(
            n.rate == listOf("top", "mittel", "schlecht") && n.pet == M && "Minka" in n.body,
            "one open pet: a button for a good, a middling and a poor meal $n",
        )
        check(
            listOf("top", "mittel", "schlecht").map {
                RATINGS.getValue(it).short
            } == listOf("Alles", "Halb", "Nix"),
            "the buttons say the levels as the slider does",
        )
        val before = notes.planned.map { it.id to it.body }
        main.logic.reminders.syncReminders()
        idle(600)
        check(notes.planned.map { it.id to it.body } == before, "a reconcile leaves the reminder as it was")
        press("gut", n)
        val ratedNow = (phone.derive.getServing("einzeln0001")!!.pets[M] as kotlinx.serialization.json.JsonObject)["r"].asString
        check(
            ratedNow == "gut" &&
                toast != null &&
                ui.toasts.undo != null &&
                sheet == null &&
                "einzeln0001" !in tags("pend-") &&
                note("einzeln0001") == null,
            "a button rates the meal with a toast to undo, opens nothing, and the reminder goes ($toast)",
        )
        act("undo")
        check(
            (phone.derive.getServing("einzeln0001")!!.pets[M] as kotlinx.serialization.json.JsonObject)["r"].asString == null,
            "undone like a rating in the app",
        )
        setRating("einzeln0001", M, "top")
        press("gut", n)
        check(
            level == listOf("serving", null, null) &&
                (phone.derive.getServing("einzeln0001")!!.pets[M] as kotlinx.serialization.json.JsonObject)["r"].asString == "top",
            "rated meanwhile: the button opens the meal and changes nothing",
        )
        act("close")
        ask("zusammen01", listOf(M, T), "lachs00001")
        val both = note("zusammen01")!!
        setRating("zusammen01", T, "top")
        val left = note("zusammen01")!!
        check(
            both.rate.isEmpty() &&
                both.pet == null &&
                "Tiger" in both.body &&
                left.rate == listOf("top", "mittel", "schlecht") &&
                left.pet == M &&
                "Tiger" !in left.body,
            "two open pets: no buttons; once one is rated, buttons for the other, and the text names only it $both $left",
        )
        // a reminder already due that Android may not have shown yet, inexact as it is
        ask("ueberfaellig", listOf(M, T), "lachs00001")
        clock += 181 * 60_000L
        setRating("ueberfaellig", T, "gut")
        val kept = note("ueberfaellig")
        setRating("ueberfaellig", M, "gut")
        check(
            kept != null && kept.at < clock && note("ueberfaellig") == null,
            "a reminder already due stays while its meal is open, and goes once the meal is rated",
        )
        ask("trocken01", listOf(M), "trocken001") // another scale, buttons of its own
        check(note("trocken01")?.rate == quickOf(phone.derive.getProduct("trocken001")), "another scale: its own buttons")
    }
}

class UiUpdateTest : ScreenTest() {
    private val apk = "https://github.com/hazymorning/Schmeckts/releases/download/v10.0.0/schmeckts.apk"
    private var tag = "v10.0.0"
    private val asked = mutableListOf<String>()

    private fun github() =
        http.route("https://api.github.com/repos/hazymorning/Schmeckts/releases/latest") { _, url, _ ->
            asked.add(url)
            Http.Answer(200, """{"tag_name":"$tag","assets":[{"name":"schmeckts.apk","browser_download_url":"$apk"}]}""")
        }

    @Test
    fun `update - a newer version found at start, installed from its card or the settings, not asked with the switch off`() {
        github()
        open(mapOf("db" to savedDb()))
        check(until { shows("Version 10.0.0 ist da.") }, "found at start")
        act("update-install")
        idle(400)
        check(calls("install") == listOf(apk) && asked.size == 1, "the card hands the APK to the installer")
        check(shows("Aktualisieren"), "back from the installer without updating, the card offers it again")
        platform.installError = "update failed"
        act("update-install")
        check(until { toast?.startsWith("Das Update ließ sich nicht laden") == true }, "a failed download says so")
        act("update-later")
        check(
            !shows("Version 10.0.0 ist da.") && shows("Ans Bewerten erinnern?"),
            "„Später“ takes the card away and the next question comes",
        )
        act("open-settings")
        val row = inSheet("Version 10.0.0 installieren")
        act("update-auto")
        check(row && !prefs.updates, "the settings offer it too, and the check at start goes off")
        restart()
        idle(400)
        check(asked.size == 1 && !shows("Version 10.0.0 ist da."), "with the switch off nothing is asked at start")
        tag = "v9.9.9"
        act("open-settings")
        act("update-check")
        check(until { inSheet("Du hast die neueste Version") } && asked.size == 2, "searched by hand: the same version is no update")
    }
}

class UiNewsTest : ScreenTest() {
    private val keys = NEWS.map { "neu:" + it.v }.distinct()

    @Test
    fun `news - a new phone has seen all news`() {
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        restart()
        check(
            keys.isNotEmpty() &&
                keys.all {
                    it in prefs.hiddenHints
                } &&
                !shows(NEWS[0].title),
            "a new phone has seen all news ${prefs.hiddenHints}",
        )
    }

    @Test
    fun `news - an update with own pets brings the newest, once the reminder question is answered, hidden for good`() {
        open(mapOf("db" to savedDb()))
        val first = listOf(shows("Ans Bewerten erinnern?"), shows(NEWS[0].title))
        act("hide-hint", "v" to REMIND_ASKED)
        check(first == listOf(true, false) && shows(NEWS[0].title), "one question at a time $first")
        act("hide-hint", "v" to "neu:${NEWS[0].v}")
        restart()
        check(!shows(NEWS[0].title), "hidden, also after a restart")
    }

    @Test
    fun `news - many hidden hints, the oldest go, what is said once stays`() {
        val many = keys + "tipp:beobachtung" + (0 until 330).map { d -> "appetit:lxpet00001:2025-%02d-%02d".format(d / 28 + 1, d % 28 + 1) }
        open(mapOf("db" to savedDb(), "prefs" to j(mapOf("hiddenHints" to many))))
        val kept = prefs.hiddenHints
        check(
            !shows(NEWS[0].title) && kept.size == 300 + keys.size + 1 && kept.containsAll(keys + "tipp:beobachtung"),
            "the oldest go, what is said once stays",
        )
    }

    @Test
    fun `news - only sample data, no news`() {
        val saved = savedDb()
        val demo =
            j(
                saved +
                    mapOf(
                        "pets" to j(listOf(pet("demopet0001", "Mau"))),
                        "servings" to
                            j(saved["servings"].asArray!!.map { it.obj() + ("pets" to j(mapOf("demopet0001" to mapOf("r" to "gut")))) }),
                    ),
            )
        open(mapOf("db" to demo))
        check(!shows(NEWS[0].title), "only sample data: no news")
    }
}

class UiFeedRemindTest : ScreenTest() {
    private val notes get() = platform.notifications

    private fun t(x: Long): String {
        val c =
            java.util.Calendar
                .getInstance()
                .apply { timeInMillis = x }
        return "%02d-%02d %02d:%02d".format(
            c.get(java.util.Calendar.MONTH) + 1,
            c.get(java.util.Calendar.DAY_OF_MONTH),
            c.get(java.util.Calendar.HOUR_OF_DAY),
            c.get(java.util.Calendar.MINUTE),
        )
    }

    private fun plan() = notes.feedSet.map { listOf(it.key, t(it.at), t(it.since)) }.sortedBy { it.joinToString() }

    @Test
    fun `feed remind - the usual times handed to the phone, with the server when connected`() {
        val whenAt = (3..9).flatMap { d -> listOf("07:15", "18:30").map { at("2026-06-%02dT%s".format(d, it)) } }
        open(
            mapOf(
                "db" to
                    dbOf(
                        listOf(pet(M)),
                        listOf(product("nass000001"), product("snack000001", "Sheba", "Käse", "Snack")),
                        whenAt.mapIndexed { i, w -> meal("meal%04d".format(i), "nass000001", w, mapOf(M to "gut")) },
                    ),
            ),
            at("2026-06-10T12:00"),
        )
        act("open-settings")
        notes.answer = "denied"
        act("feed-remind")
        idle(400)
        val denied = listOf(prefs.feedRemind, plan())
        notes.answer = "granted"
        notes.granted = "prompt"
        act("feed-remind")
        idle(400)
        check(denied == listOf(false, emptyList<List<String>>()) && prefs.feedRemind, "needs the permission, on once granted")
        val plan = plan()
        val slots = mapOf("1110" to listOf("19:15", "17:30"), "435" to listOf("08:00", "06:15"))
        check(
            plan.take(5) ==
                listOf(
                    listOf("2026-06-10|1110", "06-10 19:15", "06-10 17:30"),
                    listOf("2026-06-11|1110", "06-11 19:15", "06-11 17:30"),
                    listOf("2026-06-11|435", "06-11 08:00", "06-11 06:15"),
                    listOf("2026-06-12|1110", "06-12 19:15", "06-12 17:30"),
                    listOf("2026-06-12|435", "06-12 08:00", "06-12 06:15"),
                ) &&
                plan.all { (k, a, s) -> listOf(a.drop(6), s.drop(6)) == slots[k.split("|")[1]] } &&
                notes.feedServer.isEmpty() &&
                notes.feedCode.isEmpty(),
            "one per usual time and day, 45 minutes late, from an hour before, none for this morning; no server alone ${plan.size}",
        )
        act("settings-back")
        prefs.code = "K7PM-3QXD"
        prefs.server = "http://192.168.178.20:8486"
        main.logic.reminders.syncReminders()
        idle(400)
        val house = listOf(notes.feedServer, notes.feedCode, notes.feedSet.size)
        prefs.code = ""
        prefs.server = ""
        main.logic.reminders.syncReminders()
        idle(400)
        check(
            house == listOf("http://192.168.178.20:8486", "K7PM-3QXD", plan.size) && notes.feedServer.isEmpty(),
            "server and code handed over while connected",
        )
        clock = at("2026-06-10T18:00")
        main.logic.feeding.serveProduct("snack000001")
        idle(400)
        val snack = listOf(plan().size, notes.feedDismiss.size)
        main.logic.feeding.serveProduct("nass000001")
        idle(400)
        check(
            snack == listOf(plan.size, 0) && plan().map { it[0] } == plan.drop(1).map { it[0] } && notes.feedDismiss.size == 2,
            "a treat changes nothing; a meal at the usual time drops today’s and dismisses shown ones $snack",
        )
        link("schmeckts://feed")
        idle(400)
        check(level == listOf("feed", null, null), "its tap opens the feeding sheet through schmeckts://feed")
        act("close")
        act("open-settings")
        act("feed-remind")
        idle(400)
        check(plan().isEmpty() && !prefs.feedRemind, "off: the phone holds none")
    }
}

class UiPetsTest : ScreenTest() {
    private fun clockOf(field: String) =
        phone.store.state.clocks["pets"]
            ?.get(db.pets[0].id)
            ?.get(field)

    private fun onePet() {
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
    }

    @Test
    fun `petbar - only from two pets on, and it filters`() {
        open()
        act("demo")
        check(tags("pets").isEmpty(), "one pet: no pet bar")
        act("open-settings")
        act("add-pet")
        type("Name", "Tiger")
        act("save-pet")
        act("settings-back")
        idle(400)
        val ids = db.pets.map { it.id }
        val bar = listOf("Alle", db.pets[0].str("name")!!, "Tiger").map { labelled(it) }
        check(
            tags("pets").size == 1 &&
                bar.all { it } &&
                chosen("Alle") ||
                rule
                    .onAllNodes(
                        hasContentDescription("Alle") and
                            androidx.compose.ui.test
                                .isSelected(),
                    ).fetchSemanticsNodes()
                    .isNotEmpty(),
            "two pets: the bar",
        )
        act("filter", "id" to ids[0])
        check(prefs.activePet == ids[0], "the bar filters")
        openSheet(
            de.schmeckts.app.ui
                .SheetState("pet", "id" to ids[1]),
        )
        main.logic.pets.deletePet()
        idle(400)
        check(tags("pets").isEmpty(), "back to one pet: no bar")
    }

    @Test
    fun `several - told apart without a photo, each counted on its own, each named at its slider`() {
        val now = at("2025-06-17T12:00")
        open(
            mapOf(
                "db" to
                    dbOf(
                        listOf(pet(M), pet(T, "Tiger")),
                        listOf(product("lachs00001")),
                        (0 until 3).map { meal("meal$it", "lachs00001", now - (it + 1) * DAY, mapOf(M to "top", T to "top")) } +
                            meal("offen", "lachs00001", now - 3_600_000L, mapOf(M to null)),
                    ),
            ),
            now,
        )
        check(within("pets", "M") && within("pets", "T"), "two cats without a photo go by their initials")
        check(within("pend-offen", "Minka") && !within("pend-offen", "Tiger"), "a meal for one of them names it at its slider")
        act("open-evaluation")
        check(inSheet("Sheba, bei beiden alle 3 Mal alles gefressen"), "three meals for both read as three, not six")
    }

    @Test
    fun `nicknames - added with Enter or the button, each once, a typed one kept on saving, the home card uses them in turn`() {
        onePet()
        act("open-settings")
        act("edit-pet", "id" to db.pets[0].id)
        val field =
            rule.onNode(
                hasContentDescription("Spitzname") and
                    androidx.compose.ui.test
                        .hasSetTextAction(),
            )
        field.performClick()
        for (name in listOf("Mimi", "mimi", "Minka")) {
            field.performTextReplacement(name)
            field.performImeAction()
            idle(50)
        }
        val focused = field.fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.Focused]
        type("Spitzname", "Schnurrli")
        act("add-nick")
        val chips = listOf("Mimi", "Schnurrli", "Minka").filter { labelled("$it entfernen") }
        type("Spitzname", "Minki")
        act("save-pet")
        val stored = { db.pets[0]["nicknames"].asArray?.map { it.asString } }
        check(
            chips == listOf("Mimi", "Schnurrli") && stored() == listOf("Mimi", "Schnurrli", "Minki"),
            "each name once, never the pet’s own, one typed but not added comes along $chips",
        )
        check(focused, "Enter keeps the field and its keyboard")
        act("edit-pet", "id" to db.pets[0].id)
        act("drop-nick", "v" to "Schnurrli")
        act("save-pet")
        check(stored() == listOf("Mimi", "Minki"), "a tap on one removes it")
        act("settings-back")
        db.products.add(Rec(j(product("sorte00001")).obj()))
        for (d in 1..7) {
            db.servings.add(
                0,
                Rec(j(meal("meal00000$d", "sorte00001", at("2026-06-0${d}T08:00"), mapOf(db.pets[0].id to "gut"))).obj()),
            )
        }
        phone.store.save()
        val said =
            (1..7).map { day ->
                clock = at("2026-06-%02dT12:00".format(day))
                ui.update()
                idle()
                listOf("Minka", "Mimi", "Minki").filter { within("sec-overview", it) }
            }
        check(
            said.all {
                it.isNotEmpty()
            } &&
                said.any { "Mimi" in it || "Minki" in it },
            "the card names the pet each day, now and then by a nickname $said",
        )
        act("open-settings")
        act("edit-pet", "id" to db.pets[0].id)
        act("drop-nick", "v" to "Mimi")
        act("drop-nick", "v" to "Minki")
        act("save-pet")
        check(!db.pets[0].has("nicknames"), "all removed: the field goes")
    }

    @Test
    fun `birthday - from before 0_33 stays in the data, no field for it`() {
        onePet()
        db.pets[0].put("birthday", "2022-06-12")
        phone.store.save()
        idle(100)
        val before = clockOf("birthday")
        act("open-settings")
        act("edit-pet", "id" to db.pets[0].id)
        val field = labelled("Geburtstag")
        type("Name", "Minka II")
        act("save-pet")
        check(
            !field && db.pets[0].str("name") == "Minka II" && db.pets[0].str("birthday") == "2022-06-12" && clockOf("birthday") == before,
            "no birthday field; the stored one is kept and not sent again",
        )
    }

    @Test
    fun `sex - none at first, saved, back to none drops the field, a field the editor does not know stays`() {
        onePet()
        act("open-settings")
        act("edit-pet", "id" to db.pets[0].id)
        val none = chosen("Keine Angabe")
        act("set-sex", "v" to "f")
        act("save-pet")
        check(none && db.pets[0].str("sex") == "f", "none given at first, „Weiblich“ saved")
        act("edit-pet", "id" to db.pets[0].id)
        val shown = chosen("Weiblich")
        act("set-sex", "v" to "")
        act("save-pet")
        check(shown && !db.pets[0].has("sex"), "shown again in the editor, „Keine Angabe“ drops the field")
        db.pets[0].put("zukunft", "x")
        phone.store.save()
        idle(100)
        val before = clockOf("zukunft")
        act("edit-pet", "id" to db.pets[0].id)
        type("Name", "Minka II")
        act("save-pet")
        check(
            db.pets[0].str("name") == "Minka II" && db.pets[0].str("zukunft") == "x" && clockOf("zukunft") == before,
            "a field the editor does not know stays as it is, and is not sent again",
        )
    }
}

class UiCalendarTest : ScreenTest() {
    private fun text(t: Long) = sheetText(sheetOn(t).sheet, catOf(db.pets))

    private fun back(t: Long) = sheetOn(t).sheet

    private fun day(at: String) {
        clock = at(at)
        ui.update()
        idle()
    }

    private fun cal(s: String) = within("sec-cal", s)

    @Test
    fun `calendar - a format a weekday, a sheet a day, the last one seen hanging over today's until torn off`() {
        open(now = at("2026-09-28T12:00")) // a Monday, the calendar's first day on this phone
        act("demo")
        val monday = text(clock)
        act("turn")
        check(
            cal("Montag, 28. September") &&
                cal("KATZENLOGIK") &&
                cal(plainOf(monday)) &&
                !cal("Zum Abreißen tippen") &&
                prefs.sheetDay == "2026-09-28" &&
                ui.home.turned == null,
            "first use: Monday’s Katzenlogik, nothing hanging over it, a tap does nothing",
        )
        val order = tags("sec-")
        check(order.take(3) == listOf("overview", "pend", "cal"), "the overview, the meals to rate, then the calendar $order")
        day("2026-09-29T08:00") // Tuesday morning
        val tuesday = back(clock)
        check(
            cal("Dienstag, 29. September") &&
                cal("STIMMT’S?") &&
                cal("Montag, 28. September") &&
                cal("Zum Abreißen tippen") &&
                labelled("Gestriges Blatt abreißen"),
            "a new day: yesterday’s sheet hangs over today’s as it was, its foot saying to tear it off",
        )
        act("tear")
        check(
            !cal("Montag, 28. September") && prefs.sheetDay == "2026-09-29" && labelled("Auflösung zeigen"),
            "a tap tears it off, at once under reduced motion, and marks the day",
        )
        ui.update()
        idle()
        check(!cal("Zum Abreißen tippen"), "the same day nothing hangs any more")
        act("turn")
        val answer = cal(plainOf(sheetText(tuesday, catOf(db.pets), true))) && cal("${tuesday.verdict}.") && labelled("Behauptung zeigen")
        ui.update()
        idle()
        val kept = cal("${tuesday.verdict}.")
        act("turn")
        check(
            answer && kept && labelled("Auflösung zeigen") && !cal("${tuesday.verdict}."),
            "today’s Stimmt’s? turns over to its answer led by the verdict, which stays, and back",
        )
        day("2026-08-08T12:00") // a Saturday, the clock put back
        val saturday = cal("Samstag, 8. August") && cal("SPRACHE") && !cal("Zum Abreißen tippen")
        day("2026-08-11T12:00") // three days later
        val away = cal("Samstag, 8. August") && cal("Zum Abreißen tippen")
        act("tear")
        check(
            saturday &&
                away &&
                !cal("Samstag, 8. August") &&
                prefs.sheetDay == "2026-08-11" &&
                prefs.hiddenHints.none { it.startsWith("blatt:") },
            "the clock put back: nothing hangs; days away, the last one seen hangs and the days between are gone",
        )
        act("open-settings")
        act("calendar")
        act("settings-back")
        val off = tags("sec-cal").isEmpty()
        act("open-settings")
        act("calendar")
        act("settings-back")
        check(off && tags("sec-cal").size == 1, "its switch in the settings takes it away and back")
    }

    @Test
    fun `calendar - a count of sheets torn off and old milestones do no harm and go`() {
        open(mapOf("db" to savedDb(), "prefs" to j(mapOf("torn" to 3, "milestones" to listOf("meals:50")))))
        phone.store.savePrefs()
        val p = saved("prefs")!!.obj()
        check(
            tags("sec-cal").size == 1 && "torn" !in p && "milestones" !in p,
            "a count of sheets torn off, as 0.28 kept it, and the milestones shown up to 0.32 go",
        )
    }

    @Test
    fun `calendar - the sheet turns over and is stamped, one torn off falls over the card below`() {
        open(now = at("2026-09-29T12:00"), reduce = false) // a Tuesday
        act("demo")
        idle(2000)
        val turned = changes("sec-cal") { ui.act("turn") }
        idle(1000)
        check(turned && cal(plainOf(sheetText(back(clock), catOf(db.pets), true))), "Stimmt’s? turns over, then its answer shows")
        day("2026-09-30T12:00")
        idle(1000)
        rule.mainClock.autoAdvance = false
        ui.act("tear")
        rule.mainClock.advanceTimeBy(300)
        val below = tags("sec-").let { it[it.indexOf("cal") + 1] }
        val over =
            rule
                .onNode(
                    androidx.compose.ui.test
                        .hasTestTag("sec-$below"),
                ).captureToImage()
                .asAndroidBitmap()
        rule.mainClock.advanceTimeBy(2000)
        val bare =
            rule
                .onNode(
                    androidx.compose.ui.test
                        .hasTestTag("sec-$below"),
                ).captureToImage()
                .asAndroidBitmap()
        rule.mainClock.autoAdvance = true
        idle(500)
        check(!over.sameAs(bare), "the sheet torn off falls over the card below, not behind it")
        check(!cal("Dienstag, 29. September") && prefs.sheetDay == "2026-09-30", "once it has fallen, today’s sheet is left")
    }

    // a picture of the tagged node a moment after the action and once all has settled; they differ while it moves
    private fun changes(
        tag: String,
        action: () -> Unit,
    ): Boolean {
        rule.mainClock.autoAdvance = false
        action()
        rule.mainClock.advanceTimeBy(100)
        val mid =
            rule
                .onNode(
                    androidx.compose.ui.test
                        .hasTestTag(tag),
                ).captureToImage()
                .asAndroidBitmap()
        rule.mainClock.advanceTimeBy(1500)
        val end =
            rule
                .onNode(
                    androidx.compose.ui.test
                        .hasTestTag(tag),
                ).captureToImage()
                .asAndroidBitmap()
        rule.mainClock.autoAdvance = true
        return !mid.sameAs(end)
    }
}
