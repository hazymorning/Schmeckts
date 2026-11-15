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
import kotlinx.coroutines.launch
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
    private fun volume(
        action: Int = KeyEvent.ACTION_DOWN,
        repeat: Int = 0,
    ): Boolean {
        val taken = rule.activity.dispatchKeyEvent(KeyEvent(0L, 0L, action, KeyEvent.KEYCODE_VOLUME_DOWN, repeat))
        idle(10)
        return taken
    }

    @Test
    fun `camera - a volume key press takes one photo while the camera is open, and only then`() {
        platform.camera = true
        open()
        act("demo")
        act("feed")
        act("photo")
        idle(100)
        check(ui.camera.open && ui.camera.shutter != null, "the camera is shown with its shutter")
        var shots = 0
        ui.camera.shutter = { shots++ }
        check(volume() && shots == 1, "pressed: one photo $shots")
        check(volume(repeat = 1) && volume(KeyEvent.ACTION_UP) && shots == 1, "held and let go: no more, and no volume change $shots")
        tap("Auslösen")
        check(shots == 2, "the button is the same shutter $shots")
        tap("Abbrechen")
        idle(400)
        val shadow = org.robolectric.Shadows.shadowOf(rule.activity)
        shadow.nextStartedActivityForResult?.let { shadow.receiveResult(it.intent, android.app.Activity.RESULT_CANCELED, null) }
        idle(10)
        check(!ui.camera.open && ui.camera.shutter == null, "closed: the shutter let go")
        check(!volume() && shots == 2, "closed: the key is left to the phone $shots")
    }
}

class UiSwitchFeelTest : ScreenTest() {
    private fun felt(action: () -> Unit): List<Any?> {
        platform.calls.clear()
        action()
        idle(400)
        return calls("haptic")
    }

    @Test
    fun `haptic - switches feel on or off, a choice only when it changes, moving around not at all`() {
        open()
        act("demo")
        act("open-settings")
        idle(400)
        val lookup =
            felt {
                act("lookup")
                act("lookup")
            }
        check(lookup == listOf("on", "off") && !prefs.lookup, "on, then off $lookup")
        val same = felt { act("theme", "v" to prefs.theme) }
        val other = felt { act("theme", "v" to if (prefs.theme == "dark") "light" else "dark") }
        check(same.isEmpty() && other == listOf("tap"), "the theme already chosen: nothing; another: a tap $same $other")
        val around =
            felt {
                act("settings-page", "v" to "backup")
                idle(400)
                act("settings-back")
                idle(400)
                act("settings-page", "v" to "backup")
                idle(400)
                back()
            }
        check(around.isEmpty() && sheet?.page == null, "to Backup and back: nothing $around")
        platform.notifications.answer = "denied"
        val refused = felt { act("remind-on") }
        check(refused == listOf("reject") && prefs.remind == 0, "notifications refused: a no, and the switch stays off $refused")
        platform.notifications.answer = "granted"
        val allowed = felt { act("remind-on") }
        check(allowed == listOf("on") && prefs.remind > 0, "allowed: on $allowed")
    }
}

class UiResultFeelTest : ScreenTest() {
    private fun felt(action: () -> Unit): List<Any?> {
        platform.calls.clear()
        action()
        idle(600)
        return calls("haptic")
    }

    @Test
    fun `haptic - a short no for a refused tap, one firm click for a result, none for a tap outside the app`() {
        open(mapOf("db" to dbOf(listOf(pet("minka001")), listOf(product("sorte001")))))
        act("add-pet")
        val noName = felt { act("save-pet") }
        check(noName == listOf("reject") && shows("Wie heißt deine Katze?"), "a cat without a name: a no and why $noName")
        act("close")
        idle(400)
        val fed =
            felt {
                act("feed")
                act("new-product")
                type("Marke", "Miamor")
                type("Sorte", "Ragout in Gelee")
                act("save-name")
            }
        check(db.servings.size == 1 && fed == listOf("confirm"), "named and fed: one click $fed")
        platform.file = """{"kind":"etwas anderes"}"""
        val bad = felt { act("import") }
        check(bad == listOf("reject") && toast == "Diese Datei ist kein gültiges Backup.", "no backup: a no $bad")
        val sid = db.servings[0].id
        val reminder = felt { phone.scope.launch { main.logic.reminders.onAction("gut", sid, "minka001") } }
        val r = (db.servings[0].pets["minka001"] as JsonObject)["r"].asString
        check(reminder.isEmpty() && r == "gut", "rated from the reminder: nothing in the app $reminder")
    }
}

class UiSettingsSlideTest : ScreenTest() {
    private fun halfway(action: () -> Unit): Pair<Boolean, Boolean> {
        rule.mainClock.autoAdvance = false
        action()
        androidx.compose.runtime.snapshots.Snapshot
            .sendApplyNotifications()
        rule.mainClock.advanceTimeByFrame()
        rule.mainClock.advanceTimeBy(de.schmeckts.app.ui.Motion.STEP / 2L)
        val both = shows("Dein Name") to shows("Mit Haushalt verbinden")
        rule.mainClock.autoAdvance = true
        idle(1000)
        return both
    }

    @Test
    fun `settings - a sub-page slides in over the overview, and back, each drawn as itself`() {
        open(reduce = false)
        act("open-settings")
        idle(1000)
        val there = halfway { ui.act("settings-page", "v" to "house") }
        check(there == (true to true), "on the way to Haushalt both pages show $there")
        check(!shows("Dein Name") && shows("Mit Haushalt verbinden"), "then only Haushalt")
        val back = halfway { ui.act("settings-back") }
        check(back == (true to true), "on the way back both pages show $back")
        check(shows("Dein Name") && !shows("Mit Haushalt verbinden"), "then only the overview")
    }
}

class UiHomeRoomTest : ScreenTest() {
    private fun sec(name: String) = rule.onNode(hasTestTag("sec-$name"), useUnmergedTree = true).fetchSemanticsNode()

    private fun top(sec: String) = sec(sec).positionInRoot.y

    // the space between a card and the one above it
    private fun gapAbove(sec: String): Float {
        val all = tags("sec-")
        val above = sec(all[all.indexOf(sec) - 1])
        return top(sec) - above.positionInRoot.y - above.size.height
    }

    // the card's top, frame by frame, for ms after the action
    private fun frames(
        sec: String,
        ms: Int = 1000,
        action: () -> Unit,
    ): List<Float> {
        rule.mainClock.autoAdvance = false
        val before = top(sec)
        action()
        val ys =
            listOf(before) +
                List(ms / 16) {
                    androidx.compose.runtime.snapshots.Snapshot
                        .sendApplyNotifications()
                    org.robolectric.Shadows
                        .shadowOf(android.os.Looper.getMainLooper())
                        .idleFor(java.time.Duration.ofMillis(16))
                    rule.mainClock.advanceTimeByFrame()
                    top(sec)
                }
        rule.mainClock.autoAdvance = true
        idle(1000)
        return ys
    }

    private fun steps(ys: List<Float>) = ys.zipWithNext { a, b -> kotlin.math.abs(b - a) }

    // moved up by more than least, no frame taking more than a fifth of the way
    private fun glides(
        ys: List<Float>,
        least: Float,
    ) = (ys.first() - ys.last()).let { it > least && steps(ys).max() < it / 5 }

    private fun unrated() = db.servings.filter { s -> s.pets.values.any { !(it as JsonObject)["r"].truthy } }

    private fun rateAll(s: Rec) {
        for ((pid, v) in s.pets) if (!(v as JsonObject)["r"].truthy) ui.act("rate", "s" to s.id, "p" to pid, "r" to "gut")
    }

    @Test
    fun `home - the last meal rated, its card closes up and the cards below follow it smoothly`() {
        open(reduce = false)
        act("demo")
        idle(2000)
        val dp = rule.density.density
        unrated().drop(1).forEach { rateAll(it) }
        idle(3000)
        val last = unrated().single()
        check(tags("sec-").contains("pend") && tags("pend-") == listOf(last.id), "one meal left to rate")
        val ys = frames("hist", 3000) { rateAll(last) }
        check(glides(ys, 50 * dp), "the cards below glide up ${ys.map { (it / dp).toInt() }}")
        check("pend" !in tags("sec-") && tags("pend-").isEmpty(), "the card is gone")
        val gap = gapAbove("hist")
        restart()
        idle(1000)
        check(gap == gapAbove("hist"), "and the cards end where they always were $gap ${gapAbove("hist")}")
    }

    @Test
    fun `home - a hint hidden, its card closes and the cards below glide up`() {
        open(reduce = false)
        act("demo")
        idle(2000)
        val dp = rule.density.density
        val hints = { phone.derive.model().hints }
        check(hints().isNotEmpty() && "question" in tags("sec-"), "a hint card")
        while (hints().size > 1) {
            act("hide-hint", "v" to hintKey(hints()[0]))
            idle(1000)
        }
        val ys = frames("hist") { ui.act("hide-hint", "v" to hintKey(hints()[0])) }
        check(glides(ys, 50 * dp), "the cards below glide up ${ys.map { (it / dp).toInt() }}")
        check("question" !in tags("sec-"), "the card is gone")
    }
}
