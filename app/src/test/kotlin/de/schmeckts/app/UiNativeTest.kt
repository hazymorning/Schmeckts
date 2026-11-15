package de.schmeckts.app

import android.os.Looper
import androidx.activity.BackEventCompat
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isFocused
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import de.schmeckts.app.ui.SheetState
import org.junit.Test
import org.robolectric.Shadows.shadowOf

// How the app handles under the finger, as a phone app does.

class UiSheetPullTest : ScreenTest() {
    private fun pane(kind: String) = SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle, kind)

    private val range = androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange

    // the scrolling body of the top layer
    private fun body() =
        rule.onAllNodes(SemanticsMatcher.keyIsDefined(range) and hasAnyAncestor(pane(sheet!!.kind)), useUnmergedTree = true)[0]

    private fun area() = body().fetchSemanticsNode().boundsInRoot

    private fun scrolled() = body().fetchSemanticsNode().config[range].value()

    // a finger put down in the sheet's middle and moved down by dy dp
    private fun pull(
        dy: Float,
        ms: Long = 400,
    ) {
        val d = rule.density.density
        val area = area()
        rule.onRoot().performTouchInput {
            val from = Offset(area.center.x, area.top + area.height / 3)
            swipe(from, from + Offset(0f, dy * d), ms)
        }
        idle(800)
    }

    // a finger put down at from, moved down slowly until the sheet has come down by dy dp, and kept there
    private fun pullTo(
        from: Offset,
        dy: Float,
    ) {
        rule.onRoot().performTouchInput { down(from) }
        moveTo(dy)
    }

    // the finger moved slowly until the sheet is down by dy dp
    private fun moveTo(dy: Float) {
        val d = rule.density.density
        val up = ui.sheets.base.drag > dy * d
        for (i in 0 until 400) {
            if (if (up) ui.sheets.base.drag <= dy * d else ui.sheets.base.drag >= dy * d) break
            rule.onRoot().performTouchInput { moveBy(Offset(0f, if (up) -d else d), 10) }
        }
    }

    // then moved by dy dp within ms and lifted, after a pause of hold ms
    private fun lift(
        dy: Float = 0f,
        ms: Long = 0,
        hold: Long = 0,
    ) {
        val d = rule.density.density
        rule.onRoot().performTouchInput {
            for (i in 0 until 6) moveBy(Offset(0f, dy * d / 6), ms / 6)
            if (hold > 0) moveBy(Offset.Zero, hold)
            up()
        }
    }

    private fun start() = area().let { Offset(it.center.x, it.top + it.height / 3) }

    // how bright the screen is drawn above where a sheet's top rests
    private fun shade(): Float {
        val d = rule.density.density
        val img = rule.onRoot().captureToImage().asAndroidBitmap()
        var sum = 0f
        var n = 0
        for (y in (60 * d).toInt() until (200 * d).toInt() step 6) {
            for (x in 0 until img.width step 6) {
                val c = img.getPixel(x, y)
                sum += android.graphics.Color.red(c) + android.graphics.Color.green(c) + android.graphics.Color.blue(c)
                n++
            }
        }
        return sum / n
    }

    @Test
    fun `sheet - pulled down anywhere it closes, a short pull springs back`() {
        open()
        act("demo")
        act("feed")
        pull(40f)
        check(sheet?.kind == "feed" && ui.sheets.base.drag == 0f, "a short pull: the sheet stays and settles back")
        pull(320f)
        check(sheet == null, "pulled far: the sheet closes")
        act("feed")
        pull(60f, 60)
        check(sheet == null, "flung down: the sheet closes")
    }

    @Test
    fun `sheet - scrolled down, a pull scrolls back up first`() {
        open()
        act("demo")
        act("open-product", "id" to db.products[0].id)
        body().performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.ScrollBy) { it(0f, 2000f) }
        idle(100)
        val down = scrolled()
        pull(80f)
        val after = scrolled()
        check(down > 0f && after < down && sheet?.kind == "product", "the content scrolls back before the sheet moves $down $after")
    }

    @Test
    fun `sheet - a swipe up on the title scrolls, it does not hold the sheet`() {
        open()
        act("demo")
        act("open-product", "id" to db.products[0].id)
        val title =
            rule
                .onAllNodes(hasText(pname(db.products[0])) and hasAnyAncestor(pane("product")), useUnmergedTree = true)
                .fetchSemanticsNodes()
                .minBy { it.boundsInRoot.top }
                .boundsInRoot
        rule.onRoot().performTouchInput { swipe(title.center, title.center - Offset(0f, 200 * rule.density.density), 300) }
        idle(800)
        check(sheet?.kind == "product" && scrolled() > 0f, "the content scrolls from the title up ${scrolled()}")
    }

    @Test
    fun `sheet - flicked down by the grip it closes`() {
        open()
        act("demo")
        act("feed")
        val grip = area().let { Offset(it.center.x, it.top - 10 * rule.density.density) }
        rule.onRoot().performTouchInput { swipe(grip, grip + Offset(0f, 60 * rule.density.density), 60) }
        idle(800)
        check(sheet == null, "a quick flick on the grip closes the sheet")
    }

    @Test
    fun `sheet - flung back up it stays and does not rise past its place`() {
        open(reduce = false)
        act("demo")
        act("feed")
        idle(600)
        pullTo(start(), 150f)
        lift(-60f, 60)
        val far = ui.sheets.base.drag / rule.density.density
        idle(800)
        check(far > 110f && sheet?.kind == "feed", "flung up from far down, the sheet stays $far")
        pullTo(start(), 40f)
        rule.mainClock.autoAdvance = false
        lift(-30f, 20)
        var lowest = Float.MAX_VALUE
        repeat(60) {
            rule.mainClock.advanceTimeByFrame()
            shadowOf(Looper.getMainLooper()).idle()
            lowest = minOf(lowest, ui.sheets.base.drag)
        }
        rule.mainClock.autoAdvance = true
        idle(800)
        check(lowest >= 0f && ui.sheets.base.drag == 0f && sheet?.kind == "feed", "it springs back, never above its place $lowest")
    }

    @Test
    fun `sheet - a short one closes once let go past half its height`() {
        open()
        act("demo")
        openSheet(SheetState("serving", "id" to "gone"))
        idle(100)
        val half = ui.sheets.base.sheetHeight / rule.density.density / 2
        val from = area().let { Offset(it.center.x, it.top) }
        pullTo(from, half - 8f)
        lift(hold = 200)
        idle(800)
        val short = sheet?.kind
        pullTo(from, half + 8f)
        lift(hold = 200)
        idle(800)
        check(half < 100f && short == "serving" && sheet == null, "short of half it springs back, past half it closes $half")
    }

    @Test
    fun `sheet - flicked down it goes on at the finger's speed`() {
        open(reduce = false)
        act("demo")
        act("feed")
        idle(600)
        val d = rule.density.density
        val from = start()
        rule.mainClock.autoAdvance = false
        val rest = area().top
        val height = ui.sheets.base.sheetHeight
        val dim = shade()
        rule.onRoot().performTouchInput { swipe(from, from + Offset(0f, 60 * d), 60) }
        // the sheet's top frame by frame until it is gone, and every few frames how much of it is on screen and how dim
        val tops = mutableListOf(area().top)
        val dims = mutableListOf<Pair<Float, Float>>()
        while (sheet != null && tops.size < 60) {
            rule.mainClock.advanceTimeByFrame()
            shadowOf(Looper.getMainLooper()).idle()
            if (sheet == null) break
            tops += area().top
            if (tops.size % 3 == 0) dims += (1 - (tops.last() - rest) / height) to shade()
        }
        rule.mainClock.autoAdvance = true
        idle(100)
        val clear = shade()
        val speeds = tops.zipWithNext { a, b -> (b - a) / d * 1000 / 16 }
        val still = speeds.indexOfFirst { it > 0f }
        check(still in 0..1 && speeds[still] in 700f..1300f, "it goes on at once at the finger's 1000 dp/s $still $speeds")
        check(sheet == null && speeds.size < 25, "and is gone soon ${speeds.size}")
        val off = dims.filter { it.first in 0.1f..0.9f }.map { (share, s) -> share - (clear - s) / (clear - dim) }
        check(off.size >= 2 && off.all { kotlin.math.abs(it) < 0.1f }, "the dimming goes as the sheet does $off")
        act("feed")
        idle(600)
        pullTo(start(), 150f)
        rule.mainClock.autoAdvance = false
        lift(10f, 100)
        var frames = 0
        while (sheet != null && frames < 60) {
            rule.mainClock.advanceTimeByFrame()
            shadowOf(Looper.getMainLooper()).idle()
            frames++
        }
        rule.mainClock.autoAdvance = true
        idle(100)
        check(frames < 25, "let go slowly far down, it does not linger $frames")
        act("feed")
        idle(600)
        pull(40f)
        check(sheet?.kind == "feed" && ui.sheets.base.drag == 0f, "a slow short pull still springs back")
    }

    private fun bumps() = calls("haptic").filter { it == "threshold" || it == "threshold-off" }

    @Test
    fun `sheet - the point from where letting go closes is felt both ways`() {
        open()
        act("demo")
        act("feed")
        pullTo(start(), 150f)
        lift(hold = 200)
        idle(800)
        val far = bumps()
        check(far == listOf("threshold") && sheet == null, "pulled past it: one bump, and the sheet closes $far")
        act("feed")
        platform.calls.clear()
        pullTo(start(), 150f)
        moveTo(40f)
        lift(hold = 200)
        idle(800)
        val back = bumps()
        check(back == listOf("threshold", "threshold-off") && sheet?.kind == "feed", "back above it: felt again, the sheet stays $back")
        platform.calls.clear()
        pull(40f)
        check(bumps().isEmpty() && sheet?.kind == "feed", "a short pull: nothing")
        pullTo(start(), 125f)
        lift(-10f, 100)
        idle(800)
        val drift = bumps()
        check(drift == listOf("threshold") && sheet == null, "past it, the finger drifting up as it lets go: still closes $drift")
    }
}

class UiBackGestureTest : ScreenTest() {
    private val range = androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange
    private val dispatcher get() = rule.activity.onBackPressedDispatcher
    private val layer get() = ui.sheets.base

    // where the top layer's scrolling body is drawn now
    private fun body() =
        rule
            .onAllNodes(
                SemanticsMatcher.keyIsDefined(range) and
                    hasAnyAncestor(SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle, sheet!!.kind)),
                useUnmergedTree = true,
            )[0]
            .fetchSemanticsNode()
            .boundsInRoot

    private fun width() =
        rule
            .onRoot()
            .fetchSemanticsNode()
            .size.width

    private fun frames(n: Int) =
        repeat(n) {
            rule.mainClock.advanceTimeByFrame()
            shadowOf(Looper.getMainLooper()).idle()
        }

    // the system's back gesture begun from that edge and drawn on to progress
    private fun swipe(
        edge: Int,
        progress: Float,
    ) {
        rule.runOnUiThread {
            val x = if (edge == BackEventCompat.EDGE_LEFT) 0f else width().toFloat()
            dispatcher.dispatchOnBackStarted(BackEventCompat(x, 400f, 0f, edge))
            dispatcher.dispatchOnBackProgressed(BackEventCompat(x, 400f, progress, edge))
        }
        frames(2)
    }

    private fun commit() {
        rule.runOnUiThread { dispatcher.onBackPressed() }
        frames(1)
    }

    @Test
    fun `back gesture - the page leans toward the finger's side and leaves from where it is`() {
        open(reduce = false)
        act("open-settings")
        idle(600)
        val w = width()
        rule.mainClock.autoAdvance = false
        swipe(BackEventCompat.EDGE_RIGHT, 0.5f)
        val right = body()
        rule.runOnUiThread { dispatcher.dispatchOnBackCancelled() }
        frames(3)
        val easing = layer.back
        frames(40)
        val rest = layer.back
        swipe(BackEventCompat.EDGE_LEFT, 0.5f)
        val left = body()
        commit()
        val leaving = listOf(layer.back > 0f, layer.closing != null)
        rule.mainClock.autoAdvance = true
        idle(600)
        check(right.center.x < w / 2f && right.right <= w && right.left >= 0f, "from the right edge it leans left, on screen $right")
        check(easing > 0f && rest == 0f, "let go, it grows back over a few frames $easing")
        check(left.center.x > w / 2f && left.right <= w, "from the left edge it leans right $left")
        check(leaving == listOf(true, true) && sheet == null, "back: it closes from the pose the finger left it in $leaving")
    }

    @Test
    fun `back gesture - a sheet closes from where the finger had it, without motion nothing follows`() {
        open(reduce = false)
        act("demo")
        act("feed")
        idle(600)
        rule.mainClock.autoAdvance = false
        swipe(BackEventCompat.EDGE_LEFT, 0.5f)
        commit()
        val leaving = listOf(layer.back > 0f, layer.closing != null)
        rule.mainClock.autoAdvance = true
        idle(600)
        check(leaving == listOf(true, true) && sheet == null, "the sheet closes from its shrunken pose $leaving")
        open()
        act("open-settings")
        swipe(BackEventCompat.EDGE_LEFT, 0.5f)
        val still = layer.back
        commit()
        idle(100)
        check(still == 0f && sheet == null, "with reduced motion the page does not follow the finger $still")
    }
}

class UiLevelScrollTest : ScreenTest() {
    private val range = androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange

    private fun body() =
        rule.onAllNodes(
            SemanticsMatcher.keyIsDefined(range) and
                hasAnyAncestor(SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle, sheet!!.kind)),
            useUnmergedTree = true,
        )[0]

    private fun scrolled() = body().fetchSemanticsNode().config[range].value()

    private fun scrollDown(): Float {
        body().performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.ScrollBy) { it(0f, 2000f) }
        idle(100)
        return scrolled()
    }

    @Test
    fun `levels - back on a page it is where it was left, a level ahead and a page opened anew start at the top`() {
        open()
        act("demo")
        act("open-settings")
        val was = scrollDown()
        act("settings-page", "v" to "backup")
        val ahead = scrolled()
        scrollDown()
        act("settings-back")
        val back = scrolled()
        act("settings-page", "v" to "backup")
        val again = scrolled()
        act("settings-back")
        act("edit-pet", "id" to db.pets[0].id)
        act("settings-back")
        val pet = scrolled()
        act("close")
        idle(100)
        act("open-settings")
        val anew = scrolled()
        check(was > 0f && back == was && pet == was, "back from Backup and from a cat the overview is where it was $was $back $pet")
        check(ahead == 0f && again == 0f && anew == 0f, "Backup and settings opened anew start at the top $ahead $again $anew")
        act("close")
        idle(100)
        act("open-evaluation")
        val eval = scrollDown()
        act("open-level", "v" to "shop")
        act("settings-back")
        check(eval > 0f && scrolled() == eval, "the same in Vorlieben after Einkaufen $eval ${scrolled()}")
    }
}

class UiSheetSizeTest : ScreenTest() {
    private val range = androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange

    private fun top() =
        rule
            .onAllNodes(
                SemanticsMatcher.keyIsDefined(range) and
                    hasAnyAncestor(SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle, sheet!!.kind)),
                useUnmergedTree = true,
            )[0]
            .fetchSemanticsNode()
            .boundsInRoot.top

    @Test
    fun `sheet - its height glides when what it shows changes`() {
        open(reduce = false)
        act("demo")
        act("feed")
        idle(600)
        val before = top()
        rule.mainClock.autoAdvance = false
        rule
            .onAllNodes(hasContentDescription("Marke oder Sorte suchen") and hasSetTextAction())[0]
            .performTextReplacement(db.products[0].str("variety") ?: "")
        repeat(4) {
            rule.mainClock.advanceTimeByFrame()
            shadowOf(Looper.getMainLooper()).idle()
        }
        val between = top()
        rule.mainClock.autoAdvance = true
        idle(1000)
        val after = top()
        check(after > before && between > before && between < after, "the top moves down in steps, not at once $before $between $after")
    }
}

class UiTypingTest : ScreenTest() {
    private fun field(label: String) = rule.onAllNodes(hasContentDescription(label) and hasSetTextAction())[0]

    // one key at a time, as the keyboard sends them
    private fun keys(
        label: String,
        vararg keys: String,
    ) = keys.forEach {
        field(label).performTextInput(it)
        idle(10)
    }

    @Test
    fun `typing - a note, the name and the hours keep every key, a value set from elsewhere still shows`() {
        val now = at("2025-06-17T12:00")
        open(mapOf("prefs" to j(mapOf("remind" to 300))), now)
        val meals = listOf(meal("meal000001", "lachs00001", now - 3_600_000, mapOf(M to "gut")))
        phone.store.replaceDb(dbRaw(dbOf(listOf(pet(M)), listOf(product("lachs00001")), meals)))
        phone.store.save()
        act("open-serving", "id" to "meal000001")
        keys("Notiz", "n", "e", "u")
        val note = fieldText("Notiz")
        idle(500)
        check(note == "neu" && db.servings[0].str("note") == "neu", "the note keeps each key $note ${db.servings[0].str("note")}")
        act("close")
        idle(400)
        act("open-settings")
        keys("Dein Name", "A", "n", " ", "n", "a")
        check(fieldText("Dein Name") == "An na" && prefs.name == "An na", "the name keeps each key ${fieldText("Dein Name")} ${prefs.name}")
        field("Stunden, 1 bis 24").performTextClearance()
        idle(10)
        keys("Stunden, 1 bis 24", "1", "2")
        idle(100)
        check(
            fieldText("Stunden, 1 bis 24") == "12" && prefs.remind == 720,
            "the hours too ${fieldText("Stunden, 1 bis 24")} ${prefs.remind}",
        )
        field("Stunden, 1 bis 24").performTextClearance()
        field("Stunden, 1 bis 24").performImeAction()
        idle(50)
        val cleared = fieldText("Stunden, 1 bis 24")
        keys("Stunden, 1 bis 24", "0")
        field("Stunden, 1 bis 24").performImeAction()
        idle(50)
        check(
            cleared == "12" && fieldText("Stunden, 1 bis 24") == "12" && prefs.remind == 720,
            "once typing is done the field shows the hours in effect $cleared ${fieldText("Stunden, 1 bis 24")} ${prefs.remind}",
        )
        act("close")
        idle(400)
        act("new-product")
        keys("Marke", "S", "h")
        act("pack-line", "field" to "brand", "v" to "Sheba")
        check(fieldText("Marke") == "Sheba", "a value set from elsewhere replaces what was typed ${fieldText("Marke")}")
    }
}

class UiKeyboardTest : ScreenTest() {
    private fun field(label: String) = rule.onAllNodes(hasContentDescription(label) and hasSetTextAction())[0]

    private fun focused() =
        rule
            .onAllNodes(hasSetTextAction() and isFocused())
            .fetchSemanticsNodes()
            .mapNotNull { it.config.getOrElseNullable(SemanticsProperties.ContentDescription) { null }?.first() }

    // the keyboard as the system reports it to the screen, dp high
    private fun keyboard(dp: Int) {
        val px = (dp * rule.density.density).toInt()
        rule.runOnUiThread {
            val content = rule.activity.findViewById<android.view.ViewGroup>(android.R.id.content)
            val view = (content.getChildAt(0) as android.view.ViewGroup).getChildAt(0)
            val ime = WindowInsetsCompat.Type.ime()
            ViewCompat.dispatchApplyWindowInsets(
                view,
                WindowInsetsCompat
                    .Builder()
                    .setInsets(ime, Insets.of(0, 0, 0, px))
                    .setVisible(ime, dp > 0)
                    .build(),
            )
        }
        idle(100)
    }

    // how far above the screen's bottom the field ends, in dp
    private fun above(label: String): Float {
        val root =
            rule
                .onRoot()
                .fetchSemanticsNode()
                .size.height
        return (root - field(label).fetchSemanticsNode().boundsInRoot.bottom) / rule.density.density
    }

    @Test
    fun `keyboard - the field typed in stays above it, a new variety and a new cat start typing`() {
        open()
        act("demo")
        act("open-settings")
        ui.focus("f-me")
        idle()
        keyboard(300)
        idle(400)
        val page = above("Dein Name")
        keyboard(0)
        act("close")
        idle(400)
        act("open-serving", "id" to db.servings[0].id)
        field("Notiz").performClick()
        idle()
        keyboard(300)
        idle(400)
        val sheet = above("Notiz")
        keyboard(0)
        check(page >= 300f && sheet >= 300f, "on a page and in a sheet the field moves up over the keyboard $page $sheet")
        act("close")
        idle(400)
        act("new-product")
        val brand = focused()
        act("close")
        idle(400)
        act("add-pet")
        val cat = focused()
        act("close")
        idle(400)
        act("open-pet", "id" to db.pets[0].id)
        check(
            brand == listOf("Marke") && cat == listOf("Name") && focused().isEmpty(),
            "where typing is the point the keyboard comes $brand $cat",
        )
    }

    @Test
    fun `keyboard - goes down with the sheet, and before the camera or the photo opens`() {
        platform.camera = true
        open(reduce = false)
        act("demo")
        act("feed")
        idle(600)
        ui.focus("f-search")
        idle()
        val typing = focused()
        rule.mainClock.autoAdvance = false
        ui.act("close")
        repeat(2) {
            rule.mainClock.advanceTimeByFrame()
            shadowOf(Looper.getMainLooper()).idle()
        }
        val closing = listOf(ui.sheets.base.closing != null, focused().isEmpty())
        rule.mainClock.autoAdvance = true
        idle(600)
        check(typing == listOf("Marke oder Sorte suchen") && closing == listOf(true, true), "the keyboard goes as the sheet does $closing")
        act("feed")
        idle(600)
        ui.focus("f-search")
        idle()
        act("photo")
        val camera = listOf(ui.camera.open, focused().isEmpty())
        ui.camera.close(null)
        idle(400)
        check(camera == listOf(true, true), "not over the shutter $camera")
        platform.camera = false
        platform.pictures = AndroidPictures()
        platform.photo = jpegOf(1920, 1440)
        act("photo")
        check(until { sheet?.step == "name" }, "on to naming")
        ui.focus("f-brand")
        idle()
        val naming = focused()
        act("view-photo", "s" to sheet!!.id, "p" to "")
        check(until { ui.viewer.open }, "the photo opens")
        check(naming == listOf("Marke") && focused().isEmpty(), "not over the photo $naming")
    }

    // the field focused and its key on the keyboard pressed: who had the focus before, and who has it after
    private fun enter(
        id: String,
        label: String,
    ): List<List<String>> {
        ui.focus(id)
        idle()
        val before = focused()
        field(label).performImeAction()
        idle(50)
        return listOf(before, focused())
    }

    private fun tapText(text: String) {
        rule.onAllNodes(hasText(text), useUnmergedTree = true)[0].performClick()
        idle(50)
    }

    @Test
    fun `keyboard - goes once typing is done - its own key, a tap beside the field, a swipe through the hits`() {
        open()
        act("demo")
        act("open-serving", "id" to db.servings[0].id)
        val note = enter("f-note", "Notiz")
        act("close")
        idle(400)
        act("feed")
        val search = enter("f-search", "Marke oder Sorte suchen")
        act("close")
        idle(400)
        act("open-settings")
        val name = enter("f-me", "Dein Name")
        check(
            listOf(note, search, name) == listOf("Notiz", "Marke oder Sorte suchen", "Dein Name").map { listOf(listOf(it), emptyList()) },
            "the done and search keys end typing $note $search $name",
        )
        ui.focus("f-me")
        idle()
        tapText("Teilen")
        check(focused().isEmpty() && level == listOf("settings", null, null), "a tap beside it on a page ends typing, the page stays")
        act("close")
        idle(400)
        act("new-product")
        tapText("Trockenfutter")
        val chip = listOf(sheet!!.str("type"), focused())
        tapText("Neue Sorte")
        check(
            chip == listOf("Trockenfutter", listOf("Marke")) && focused().isEmpty() && sheet?.kind == "new",
            "a chip takes its own tap and leaves the keyboard, a tap on the title puts it away $chip",
        )
        act("close")
        idle(400)
        act("feed")
        keyboard(300)
        field("Marke oder Sorte suchen").performTextReplacement("e")
        ui.focus("f-search")
        idle(400)
        val range = SemanticsProperties.VerticalScrollAxisRange
        val feed = SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "feed")
        val body = rule.onAllNodes(SemanticsMatcher.keyIsDefined(range) and hasAnyAncestor(feed), useUnmergedTree = true)[0]
        val typing = focused()
        val area = body.fetchSemanticsNode().boundsInRoot
        rule.onRoot().performTouchInput { swipe(area.center, area.center - Offset(0f, 150 * rule.density.density), 300) }
        idle(400)
        val scrolled = body.fetchSemanticsNode().config[range].value()
        keyboard(0)
        check(
            typing.isNotEmpty() && focused().isEmpty() && scrolled > 0f,
            "a swipe through the hits scrolls them and puts the keyboard away $scrolled",
        )
    }
}

class UiHomeAsideTest : ScreenTest() {
    // where the home page's first section starts on screen
    private fun x() =
        rule
            .onAllNodes(hasTestTag("sec-" + tags("sec-").first()), useUnmergedTree = true)[0]
            .fetchSemanticsNode()
            .positionInRoot.x

    @Test
    fun `home - steps aside under a page and comes back with a back gesture that closes it`() {
        open(reduce = false)
        act("demo")
        idle(1000)
        val w =
            rule
                .onRoot()
                .fetchSemanticsNode()
                .size.width
        val rest = x()
        act("open-settings")
        idle(600)
        val aside = x() - rest
        act("settings-page", "v" to "backup")
        idle(600)
        val d = rule.activity.onBackPressedDispatcher
        rule.mainClock.autoAdvance = false

        fun frame() {
            rule.mainClock.advanceTimeByFrame()
            shadowOf(Looper.getMainLooper()).idle()
        }

        fun gesture() {
            rule.runOnUiThread {
                d.dispatchOnBackStarted(BackEventCompat(0f, 400f, 0f, BackEventCompat.EDGE_LEFT))
                d.dispatchOnBackProgressed(BackEventCompat(200f, 400f, 0.5f, BackEventCompat.EDGE_LEFT))
            }
            repeat(2) { frame() }
        }
        gesture()
        var furthest = x() - rest
        rule.runOnUiThread { d.onBackPressed() }
        repeat(30) {
            frame()
            if (kotlin.math.abs(x() - rest - aside) > kotlin.math.abs(furthest - aside)) furthest = x() - rest
        }
        val overview = level
        gesture()
        val drawn = x() - rest
        rule.runOnUiThread { d.onBackPressed() }
        rule.mainClock.autoAdvance = true
        idle(600)
        check(sheet == null && x() == rest, "the page gone, home is back in place")
        check(aside < -w / 4f + 2f && aside > -w / 4f - 2f, "under the page home lies a quarter aside $aside")
        check(
            overview == listOf("settings", null, null) && kotlin.math.abs(furthest - aside) < 2f,
            "back from Backup it stays aside $furthest",
        )
        check(drawn > aside && drawn < 0f, "the back gesture draws it part of the way back $drawn")
    }
}
