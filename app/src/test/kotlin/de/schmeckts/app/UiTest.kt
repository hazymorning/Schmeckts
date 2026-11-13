package de.schmeckts.app

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
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
