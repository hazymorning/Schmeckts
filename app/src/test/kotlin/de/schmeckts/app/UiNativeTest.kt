package de.schmeckts.app

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import org.junit.Test

// How the app handles under the finger, as a phone app does.

class UiSheetPullTest : ScreenTest() {
    private fun pane(kind: String) = SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle, kind)

    // a finger put down in the sheet's middle and moved down by dy dp
    private fun pull(
        dy: Float,
        ms: Long = 400,
    ) {
        val d = rule.density.density
        val area =
            rule
                .onAllNodes(
                    SemanticsMatcher.keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange) and
                        hasAnyAncestor(pane(sheet!!.kind)),
                    useUnmergedTree = true,
                )[0]
                .fetchSemanticsNode()
                .boundsInRoot
        rule.onRoot().performTouchInput {
            val from = Offset(area.center.x, area.top + area.height / 3)
            swipe(from, from + Offset(0f, dy * d), ms)
        }
        idle(800)
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
        val range = androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange
        val body =
            rule.onAllNodes(SemanticsMatcher.keyIsDefined(range) and hasAnyAncestor(pane("product")), useUnmergedTree = true)[0]
        body.performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.ScrollBy) { it(0f, 2000f) }
        idle(100)
        val down = body.fetchSemanticsNode().config[range].value()
        pull(80f)
        val after = body.fetchSemanticsNode().config[range].value()
        check(down > 0f && after < down && sheet?.kind == "product", "the content scrolls back before the sheet moves $down $after")
    }
}
