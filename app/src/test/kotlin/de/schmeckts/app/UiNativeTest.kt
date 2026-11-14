package de.schmeckts.app

import android.os.Looper
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
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
        rule.onRoot().performTouchInput { swipe(from, from + Offset(0f, 60 * d), 60) }
        val top = area().top
        var ms = 0L

        fun frames(until: Long) {
            while (ms < until) {
                rule.mainClock.advanceTimeByFrame()
                shadowOf(Looper.getMainLooper()).idle()
                ms += 16
            }
        }
        frames(50)
        val moved = (area().top - top) / d
        frames(350)
        val gone = sheet == null
        rule.mainClock.autoAdvance = true
        idle(100)
        check(moved >= 8f && gone, "no stop once the finger lets go: $moved dp in 50 ms, gone at once")
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
    }
}
