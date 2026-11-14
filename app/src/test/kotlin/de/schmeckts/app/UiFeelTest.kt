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
import android.view.KeyEvent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import kotlinx.serialization.json.JsonObject
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

class UiSlideFeelTest : ScreenTest() {
    private fun level(r: String) =
        rule.onNode(
            hasTestTag("level-$r") and hasAnyAncestor(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "serving")),
            useUnmergedTree = true,
        )

    private fun rated() =
        (
            (
                db.servings[0]
                    .pets.values
                    .first() as JsonObject
            )["r"]
        ).asString

    @Test
    fun `slide - one detent per level passed, nothing for the level it already holds`() {
        val now = at("2025-06-17T12:00")
        val m = meal("meal0001", "sorte001", now - 3_600_000, mapOf("minka001" to "gut"))
        open(mapOf("db" to dbOf(listOf(pet("minka001")), listOf(product("sorte001")), listOf(m))), now)
        act("open-serving", "id" to "meal0001")
        idle(600)
        platform.calls.clear()
        level("gut").performTouchInput {
            down(center)
            advanceEventTime(250)
            up()
        }
        idle(400)
        check(calls("haptic").isEmpty() && rated() == "gut", "resting on the level it holds: nothing ${calls("haptic")}")
        val a = level("gut").fetchSemanticsNode().boundsInRoot.center
        val b = level("schlecht").fetchSemanticsNode().boundsInRoot.center
        level("gut").performTouchInput {
            down(center)
            repeat(30) { moveBy(Offset((b.x - a.x) / 30, 0f), 20) }
            up()
        }
        idle(400)
        check(
            calls("haptic") == listOf("tick", "tick", "tick", "tick", "confirm") && rated() == "schlecht",
            "mittel, eager, sosse, schlecht, then the rating ${calls("haptic")}",
        )
    }
}

class UiCameraKeyTest : ScreenTest() {
    private fun volume() = rule.activity.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN))

    @Test
    fun `camera - a volume key is the shutter while the camera is open, and only then`() {
        platform.camera = true
        open()
        act("demo")
        act("feed")
        act("photo")
        idle(100)
        val taken = volume()
        check(ui.camera.open && taken, "the camera takes the key")
        tap("Abbrechen")
        idle(400)
        val shadow = org.robolectric.Shadows.shadowOf(rule.activity)
        shadow.nextStartedActivityForResult?.let { shadow.receiveResult(it.intent, android.app.Activity.RESULT_CANCELED, null) }
        idle(10)
        check(!ui.camera.open && !volume(), "closed: the key is left to the phone")
    }
}
