package de.schmeckts.app

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import org.junit.Test

// Asking, merging, form errors, the mood picture and toasts: the rest of the old ui_test.py.

private fun ScreenTest.onePet() {
    open()
    act("add-pet")
    type("Name", "Minka")
    act("save-pet")
    idle(400)
}

private fun ScreenTest.serveNew(pid: String) {
    db.products.add(Rec(j(product(pid) + ("createdAt" to Time.now())).obj()))
    phone.store.save()
    main.logic.feeding.serveProduct(pid)
    idle(400)
}

class UiRemindAskTest : ScreenTest() {
    private val card get() = "question" in tags("sec-") && shows("Ans Bewerten erinnern?")

    @Test
    fun `remind_ask - yes turns it on and plans the meal just fed`() {
        onePet()
        val before = card
        serveNew("lachs00001")
        val asked = card
        act("remind-yes")
        idle(400)
        val got = listOf(before, asked, prefs.remind, calls("requestPermissions").size, platform.notifications.planned.size)
        check(
            got == listOf(false, true, 180, 1, 1),
            "$got not before the first meal; yes asks for notifications, turns the reminder on and plans it for the meal just fed",
        )
        prefs.remind = 0
        phone.store.savePrefs()
        restart()
        check(!card && REMIND_ASKED in prefs.hiddenHints, "answered yes: never asked again, even with the reminder off")
    }

    @Test
    fun `remind_ask - no leaves it off and is never asked again`() {
        onePet()
        serveNew("lachs00001")
        act("hide-hint", "v" to REMIND_ASKED)
        idle(400)
        check(prefs.remind == 0 && calls("requestPermissions").isEmpty(), "no leaves the reminder off")
        restart()
        check(!card && REMIND_ASKED in prefs.hiddenHints, "answered no: never asked again, even with the reminder off")
    }

    @Test
    fun `remind_ask - never beside sample data, with the reminder on, or once set in the settings`() {
        open()
        act("demo")
        idle(400)
        check(!card, "never beside sample data")
        close()
        dir.deleteRecursively()
        open(mapOf("prefs" to j(mapOf("remind" to 180))))
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
        serveNew("lachs00001")
        check(!card && db.servings.size == 1, "the reminder already on: not asked")
        close()
        onePet()
        act("open-settings")
        act("remind-on")
        act("remind-on")
        ui.sheets.closeAll()
        idle(400)
        serveNew("lachs00001")
        check(!card, "set in the settings before, on or off: not asked")
    }
}

class UiMergeTest : ScreenTest() {
    @Test
    fun `merge - renaming a variety into one the suggestions offer merges the two only on a second tap`() {
        open()
        val now = Time.now()
        phone.store.replaceDb(
            dbRaw(
                dbOf(
                    listOf(pet(M)),
                    listOf(product("lachs00001", "Sheba", "Lachs"), product("rind000001", "Sheba", "Rind")),
                    listOf(
                        meal("meal000001", "lachs00001", now - 3_600_000, mapOf(M to "gut")),
                        meal("meal000002", "rind000001", now - 7_200_000, mapOf(M to "gut")),
                    ),
                ),
            ),
        )
        phone.store.save()
        ui.update()
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to "rind000001"),
        )
        act("rename-product")
        type("Sorte", "Lac")
        act("arm", "then" to "merge", "id" to "lachs00001")
        val armed = listOf(db.products.size, inSheet("Nochmal tippen: zusammenführen"))
        act("arm", "then" to "merge", "id" to "lachs00001")
        idle(400)
        check(
            armed == listOf(2, true) && db.products.size == 1 && db.servings.all { it.str("productId") == "lachs00001" },
            "the first tap asks again, the second merges $armed",
        )
        db.products.add(Rec(j(product("huhn000001", "Sheba", "Huhn")).obj()))
        db.servings[1]["productId"] = j("huhn000001")
        phone.store.save()
        ui.sheets.closeAll()
        idle(400)
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to "huhn000001"),
        )
        act("rename-product")
        type("Sorte", "lachs")
        act("save-name")
        val typed = listOf(db.products.size, inSheet("zusammenführen"))
        act("save-name")
        idle(400)
        check(typed == listOf(2, true) && db.products.size == 1, "the name of another variety typed in: saving asks again too $typed")
    }
}

class UiFormErrorsTest : ScreenTest() {
    private fun focused(label: String) =
        rule
            .onAllNodes(
                androidx.compose.ui.test
                    .hasContentDescription(label) and
                    androidx.compose.ui.test
                        .hasSetTextAction() and
                    androidx.compose.ui.test
                        .isFocused(),
            ).fetchSemanticsNodes()
            .isNotEmpty()

    @Test
    fun `form_errors - a form missing what it needs says so at the field, not in a toast, until something is typed`() {
        onePet()
        act("open-settings")
        act("add-pet")
        act("save-pet")
        val petSaid = listOf(sheet!!.str("error"), focused("Name"), toast != null)
        val shownThen = shows(petSaid[0] as String)
        type("Spitzname", "Mausi")
        val kept = sheet!!.str("error").takeIf { shows(it) }
        type("Name", "T")
        val gone = sheet!!.str("error").isEmpty() && !shows(petSaid[0] as String)
        type("Name", "")
        act("save-pet")
        val again = sheet!!.str("error").takeIf { shows(it) }
        act("settings-back")
        act("settings-back")
        idle(400)
        openSheet(
            de.schmeckts.app.ui
                .SheetState("new", "brand" to "", "variety" to "", "type" to "Nassfutter"),
        )
        act("save-name")
        val nameSaid = listOf(sheet!!.str("error"), focused("Marke"), toast != null)
        check(
            shownThen &&
                petSaid == listOf("Wie heißt deine Katze?", true, false) &&
                nameSaid == listOf("Bitte Marke oder Sorte eintragen.", true, false) &&
                shows(nameSaid[0] as String),
            "under the field, which takes the focus $petSaid $nameSaid",
        )
        check(
            kept == petSaid[0] && gone && again == petSaid[0],
            "another field leaves it, typing in its own takes it away, and it comes back on the next try",
        )
        check(db.pets.size == 1 && db.products.isEmpty(), "nothing saved")
    }
}

class UiMoodTest : ScreenTest() {
    private fun pic(color: Int): String {
        val b = android.graphics.Bitmap.createBitmap(300, 200, android.graphics.Bitmap.Config.ARGB_8888)
        b.eraseColor(color)
        val out = java.io.ByteArrayOutputStream().also { b.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, it) }
        return "data:image/jpeg;base64," +
            java.util.Base64
                .getEncoder()
                .encodeToString(out.toByteArray())
    }

    private val mood get() = tags("mood-").singleOrNull()

    @Test
    fun `mood - the photo of the chosen pet, always, with no switch for it`() {
        open()
        val pets =
            listOf(
                pet("petminka001", "Minka", "photo" to pic(android.graphics.Color.RED)),
                pet("pettiger001", "Tiger", "photo" to pic(android.graphics.Color.GREEN)),
                pet("petkiwi001", "Kiwi"),
            )
        phone.store.replaceDb(dbRaw(dbOf(pets)))
        phone.store.save()
        val shown =
            listOf("all", "petminka001", "pettiger001", "petkiwi001").map {
                prefs.activePet = it
                ui.update()
                idle(100)
                mood
            }
        check(
            shown == listOf(null, "petminka001", "pettiger001", null),
            "the chosen pet’s photo; none for all pets or a pet without one $shown",
        )
        db.pets.subList(1, db.pets.size).clear()
        prefs.activePet = "all"
        phone.store.save()
        ui.update()
        idle(100)
        check(mood == "petminka001", "one pet: its photo")
        act("open-settings")
        check(!shows("Hintergrund") && !shows("Stimmungsbild"), "no switch for it in the settings")
    }

    @Test
    fun `mood - switched off before, shown now, the setting gone`() {
        val d = savedDb().toMutableMap()
        d["pets"] = j(listOf(savedDb()["pets"]!!.asArray!![0].obj() + ("photo" to j(pic(android.graphics.Color.RED)))))
        open(mapOf("db" to kotlinx.serialization.json.JsonObject(d), "prefs" to j(mapOf("backdrop" to false))))
        check(mood == "lxpet00001" && "backdrop" !in saved("prefs")!!.obj(), "switched off before: shown now, the setting gone")
    }
}

class UiToastTimeTest : ScreenTest() {
    private fun lasts(
        msg: String,
        undo: Boolean = true,
    ): Long {
        ui.toast(msg, if (undo) ({}) else null)
        idle()
        var ms = 0L
        while (toast != null && ms < 20_000) {
            idle(100)
            ms += 100
        }
        return ms
    }

    @Test
    fun `toast_time - the usual time, longer for a long text`() {
        open()
        val short = lasts("Hunger notiert.")
        val plain = lasts("Hunger notiert.", false)
        val long = lasts("Stunk notiert. Fenster auf! " + "Ein langer Satz, der etwas länger zu lesen ist. ".repeat(3))
        check(plain < short && short < long && long - short > 1500, "short with undo, short without, long: $short $plain $long ms")
    }
}

class UiToastSwipeTest : ScreenTest() {
    private var undone = 0

    private val shown get() = ui.toasts.show

    private fun show(text: String = "Hunger notiert."): androidx.compose.ui.geometry.Rect {
        ui.toast(text, { undone++ })
        idle(400)
        return box()
    }

    private fun box() =
        rule
            .onNode(
                androidx.compose.ui.test
                    .hasTestTag("toast"),
                useUnmergedTree = true,
            ).fetchSemanticsNode()
            .boundsInRoot

    private fun root() = rule.onRoot()

    private fun drag(
        x: Float,
        y: Float,
        dx: Float,
    ) {
        root().performTouchInput {
            down(Offset(x, y))
            repeat(5) { moveBy(Offset(dx / 5, 0f)) }
            up()
        }
        idle(400)
    }

    @Test
    fun `toast_swipe - swiped sideways it goes without undoing, held it stays, a tap on Rückgängig still undoes`() {
        open()
        var b = show()
        root().performTouchInput { down(Offset(b.left + 20, b.center.y)) }
        idle(20_000)
        val held = shown
        root().performTouchInput { up() }
        idle(1000)
        val after = shown
        idle(20_000)
        check(held && after && !shown, "held it stays, let go it goes after a while")

        b = show()
        root().performTouchInput {
            down(Offset(b.left + 20, b.center.y))
            moveBy(Offset(b.width / 4, 0f))
        }
        idle(50)
        show()
        idle(20_000)
        val under = shown
        root().performTouchInput {
            moveBy(Offset(b.width / 6, 0f))
            up()
        }
        idle(400)
        check(
            under && shown && undone == 0,
            "a toast that comes while the finger is on the last one waits for it and takes no part of its swipe",
        )

        b = show()
        drag(b.left + 20, b.center.y, 20f)
        val back = listOf(shown, ui.toasts.swipe)
        drag(b.left + 20, b.center.y, b.width / 2)
        check(back == listOf(true, 0f) && !shown, "a short move snaps back, a long one sends it away $back")

        show()
        rule
            .onNode(
                androidx.compose.ui.test
                    .hasText("Rückgängig"),
                useUnmergedTree = true,
            ).performClick()
        idle(400)
        val tapped = undone
        b = show()
        val button =
            rule
                .onNode(
                    androidx.compose.ui.test
                        .hasText("Rückgängig"),
                    useUnmergedTree = true,
                ).fetchSemanticsNode()
                .boundsInRoot
        drag(button.center.x, button.center.y, -b.width / 2)
        check(tapped == 1 && undone == 1 && !shown, "a tap on its button undoes, a swipe that begins there does not")
    }

    // lines of the toast's text, and whether its button stands under it
    private fun layout(text: String): List<Any> {
        ui.toast(text, {})
        idle(400)
        val t =
            rule.onNode(
                androidx.compose.ui.test
                    .hasText(text),
                useUnmergedTree = true,
            )
        val lines = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        t.performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(lines) }
        val button =
            rule
                .onNode(
                    androidx.compose.ui.test
                        .hasText("Rückgängig"),
                    useUnmergedTree = true,
                ).fetchSemanticsNode()
                .boundsInRoot
        return listOf(lines[0].lineCount, button.top >= t.fetchSemanticsNode().boundsInRoot.bottom - 1)
    }

    @Test
    fun `toast_swipe - two lines at most, the sheet drops a toast with nothing to undo, undo works while it closes`() {
        open()
        val sizes =
            listOf("Eintrag gelöscht", "Notiert bei Minka oder Felix: extra hungrig. Vielleicht war die Portion knapp.").map { layout(it) }
        check(sizes == listOf(listOf(1, false), listOf(2, true)), "beside the button, or over it where it needs the room $sizes")
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
        val kept =
            listOf(false, true).map { undo ->
                ui.toast("Willkommen, Minka!", if (undo) ({}) else null)
                idle(100)
                act("feed")
                idle(400)
                val k = shown
                ui.sheets.closeAll()
                idle(400)
                k
            }
        check(kept == listOf(false, true), "a sheet opening drops a toast with nothing to undo, which would cover its last button $kept")
        act("feed")
        idle(400)
        var done = false
        ui.toast("Alles gefressen.", { done = true })
        idle(100)
        ui.sheets.closeSheet()
        act("undo")
        idle(400)
        check(done, "its undo works while the sheet it sits in closes")
    }
}
