package de.schmeckts.app

import android.view.HapticFeedbackConstants.CLOCK_TICK
import android.view.HapticFeedbackConstants.CONFIRM
import android.view.HapticFeedbackConstants.CONTEXT_CLICK
import android.view.HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE
import android.view.HapticFeedbackConstants.GESTURE_THRESHOLD_DEACTIVATE
import android.view.HapticFeedbackConstants.LONG_PRESS
import android.view.HapticFeedbackConstants.REJECT
import android.view.HapticFeedbackConstants.SEGMENT_TICK
import android.view.HapticFeedbackConstants.TOGGLE_OFF
import android.view.HapticFeedbackConstants.TOGGLE_ON
import android.view.HapticFeedbackConstants.VIRTUAL_KEY
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import org.junit.Assert.assertEquals
import org.junit.Test

// What a tap feels like: the phone's feedback says what happened.

class HapticTest {
    private val levels = listOf("tick", "tap", "on", "off", "threshold", "threshold-off", "confirm", "reject", "heavy")

    private fun on(sdk: Int) = levels.map { hapticOf(it, sdk) }

    @Test
    fun `haptic - each level gets the system's own feedback where the Android version has it`() {
        val key = VIRTUAL_KEY
        assertEquals(listOf(null, key, key, key, key, null, key, LONG_PRESS, LONG_PRESS), on(24))
        val click = CONTEXT_CLICK
        assertEquals(listOf(CLOCK_TICK, click, click, click, click, null, key, LONG_PRESS, LONG_PRESS), on(29))
        assertEquals(listOf(CLOCK_TICK, click, click, click, click, null, CONFIRM, REJECT, LONG_PRESS), on(30))
        assertEquals(on(30), on(33))
        assertEquals(
            listOf(
                SEGMENT_TICK,
                click,
                TOGGLE_ON,
                TOGGLE_OFF,
                GESTURE_THRESHOLD_ACTIVATE,
                GESTURE_THRESHOLD_DEACTIVATE,
                CONFIRM,
                REJECT,
                LONG_PRESS,
            ),
            on(34),
        )
        for (sdk in listOf(24, 30, 34)) {
            val old = listOf("select", "success", "strong").map { hapticOf(it, sdk) }
            assertEquals("the old names stay", listOf("tap", "confirm", "reject").map { hapticOf(it, sdk) }, old)
        }
    }
}

class UiHeavyTest : ScreenTest() {
    @Test
    fun `haptic - deleting feels firm, not like something that failed`() {
        open()
        act("demo")
        val meal = db.servings[0].id
        act("open-serving", "id" to meal)
        platform.calls.clear()
        tap("Eintrag löschen")
        idle(600)
        val felt = calls("haptic")
        check(db.servings.none { it.id == meal } && "heavy" in felt && "strong" !in felt && "reject" !in felt, "a firm click $felt")
    }
}

class UiPressTest : ScreenTest() {
    @Test
    fun `press - a quick tap in the scrolling page shows on the control, which springs back`() {
        open(reduce = false)
        act("demo")
        idle(2000)
        val head = rule.onNode(hasContentDescription("Alle Einträge"), useUnmergedTree = true)
        head.performScrollTo()
        rule.onAllNodes(hasScrollAction())[0].performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, 900f) } // clear of the feed button
        idle(500)
        val rest = head.fetchSemanticsNode().boundsInRoot.width
        rule.mainClock.autoAdvance = false
        head.performTouchInput {
            down(center)
            advanceEventTime(40)
            up()
        }
        var least = rest
        repeat(6) {
            rule.mainClock.advanceTimeByFrame()
            least = minOf(least, head.fetchSemanticsNode().boundsInRoot.width)
        }
        rule.mainClock.autoAdvance = true
        idle(1000)
        val after = head.fetchSemanticsNode().boundsInRoot.width
        check(least < rest - 1f && kotlin.math.abs(after - rest) < 0.5f, "it gives and comes back $rest $least $after")
    }
}
