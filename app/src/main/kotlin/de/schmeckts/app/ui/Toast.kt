package de.schmeckts.app.ui

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.sign

private const val READ = 60L // ms per character, so a longer text stays until it is read
private const val AFTER = 1500L // ms it stays once the finger lets go
private const val SLOP = 8f // dp before a touch is a swipe

/** ic: an icon that leads a confirmation, in the colours of tone. html: msg is markup, escaped by the caller. */
class ToastMsg(
    val text: String,
    val undo: (() -> Unit)?,
    val icon: String,
    val tone: String,
    val html: Boolean,
    val n: Int,
)

class Toasts(
    private val scope: CoroutineScope,
) {
    var msg by mutableStateOf<ToastMsg?>(null)
        private set
    var show by mutableStateOf(false)
        private set
    var swipe by mutableFloatStateOf(0f)
    var dragging by mutableStateOf(false)
    private var count by mutableIntStateOf(0)
    private var timer: Job? = null
    private var ends = 0L
    private var left = 0L
    var down = false
        private set

    val undo: (() -> Unit)? get() = if (show) msg?.undo else null

    private fun waitFor(ms: Long) {
        timer?.cancel()
        ends = SystemClock.uptimeMillis() + ms
        timer =
            scope.launch {
                delay(ms)
                hideToast()
            }
    }

    fun toast(
        text: String,
        undo: (() -> Unit)? = null,
        icon: String = "",
        tone: String = "",
        html: Boolean = false,
    ) {
        val chars = if (html) plainOf(text).length else text.length
        msg = ToastMsg(text, undo, icon, tone, html, ++count)
        swipe = 0f
        show = true
        val ms = maxOf(if (undo != null) 5200L else 2600L, READ * chars)
        // a finger already on it: the new one waits for it to let go
        if (down) left = ms else waitFor(ms)
    }

    fun hideToast() {
        timer?.cancel()
        show = false
    }

    /** a sheet opening drops one with nothing to undo, which would lie over its last button */
    fun hidePlain() {
        if (msg?.undo == null) show = false
    }

    /** the toast's own button */
    fun undoNow(haptic: () -> Unit) {
        val u = undo
        hideToast()
        if (u != null) {
            haptic()
            u()
        }
    }

    internal fun pressed() {
        down = true
        left = ends - SystemClock.uptimeMillis()
        timer?.cancel()
    }

    internal fun released(
        swiped: Boolean,
        dx: Float,
        width: Float,
        v: Float,
        screen: Float,
    ) {
        down = false
        dragging = false
        if (swiped && (abs(dx) > width / 3 || (v > 0.5f && abs(dx) > 24f))) {
            swipe = sign(dx) * screen
            hideToast()
        } else {
            swipe = 0f
            if (show) waitFor(maxOf(left, AFTER))
        }
    }
}

/** At the foot of the screen, over everything; in a sheet lower, where the feeding button is not. */
@Composable
fun ToastHost(
    toasts: Toasts,
    inSheet: Boolean,
    haptic: () -> Unit,
) {
    val m = toasts.msg ?: return
    val p = colors
    val still = reduceMotion
    val shown = remember { Animatable(0f) }
    LaunchedEffect(toasts.show, m.n) {
        if (toasts.show) {
            shown.snapTo(0f)
            if (still) shown.snapTo(1f) else shown.animateTo(1f, tween(Motion.STEP, easing = Motion.easeOut))
        } else if (still) {
            shown.snapTo(0f)
        } else {
            shown.animateTo(0f, tween(Motion.FADE, easing = Motion.easeIn))
        }
    }
    val slide = remember { Animatable(0f) }
    LaunchedEffect(toasts.swipe, toasts.dragging) {
        if (toasts.dragging ||
            still
        ) {
            slide.snapTo(toasts.swipe)
        } else {
            slide.animateTo(toasts.swipe, tween(Motion.FADE, easing = Motion.easeOut))
        }
    }
    val tone = p.tone(m.tone.removePrefix("r-").removePrefix("o-"))
    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(bottom = if (inSheet) Space.s5 else Space.s5 + Size.controlL + Space.s4),
        contentAlignment = Alignment.BottomCenter,
    ) {
        val screen = constraints.maxWidth.toFloat()
        var long by remember(m.n) { mutableStateOf(false) }
        var width by remember { mutableFloatStateOf(1f) }
        val a = shown.value
        Box(
            Modifier
                .testTag("toast")
                .widthIn(max = minOf(maxWidth * 0.92f, 520.dp))
                .graphicsLayer {
                    alpha = a
                    val k = if (toasts.show) 1f else 0.96f + 0.04f * a
                    scaleX = k
                    scaleY = k
                    translationY = (1f - a) * Space.s3.toPx()
                    translationX = slide.value
                    width = size.width
                }.then(
                    if (toasts.show) {
                        Modifier.pointerInput(m.n) {
                            awaitEachGesture {
                                val first = awaitFirstDown(requireUnconsumed = false)
                                toasts.pressed()
                                var t = first.uptimeMillis
                                var dx = 0f
                                var swiped = false
                                while (true) {
                                    val e = awaitPointerEvent(PointerEventPass.Initial)
                                    val c = e.changes.firstOrNull { it.id == first.id } ?: break
                                    if (!c.pressed) break
                                    dx += c.positionChange().x
                                    t = c.uptimeMillis
                                    if (!swiped && abs(dx) > SLOP * density) {
                                        swiped = true
                                        toasts.dragging = true
                                    }
                                    if (swiped) {
                                        toasts.swipe = dx
                                        c.consume()
                                    }
                                }
                                val v = abs(dx) / density / maxOf(1L, t - first.uptimeMillis)
                                toasts.released(swiped, dx, width, v, screen)
                            }
                        }
                    } else {
                        Modifier
                    },
                ).shadowHigh(RoundedCornerShape(Radius.m))
                .clip(RoundedCornerShape(Radius.m))
                .background(p.ink)
                .heightIn(min = Size.control)
                .semantics { liveRegion = LiveRegionMode.Polite }
                .padding(
                    start = if (m.icon.isNotEmpty()) Space.s2 else Space.gutter,
                    end = if (m.undo == null) Space.gutter else Space.s2,
                    top = Space.s2,
                    bottom = Space.s2,
                ),
        ) {
            val icon: @Composable () -> Unit = {
                if (m.icon.isNotEmpty()) {
                    Disc(Size.picS, tone?.cs ?: p.accentSoft, Modifier.padding(end = Space.s1)) {
                        Icon(m.icon, size = Size.iconS, color = tone?.c ?: p.accentInk)
                    }
                }
            }
            val said: @Composable (Modifier) -> Unit = { mod ->
                T(
                    if (m.html) {
                        markup(m.text)
                    } else {
                        androidx.compose.ui.text
                            .AnnotatedString(m.text)
                    },
                    Type.small,
                    mod.padding(top = Space.s1, bottom = Space.s1, end = Space.s2),
                    p.bg,
                )
            }
            val button: @Composable () -> Unit = {
                if (m.undo != null) {
                    Row(
                        Modifier
                            .press({ toasts.undoNow(haptic) })
                            .clip(RoundedCornerShape(Radius.s))
                            .heightIn(min = Size.tapS)
                            .padding(horizontal = Space.s4, vertical = Space.s2),
                        horizontalArrangement = Arrangement.spacedBy(Space.s2),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Ink(p.toastAction) {
                            Icon("undo", size = Size.iconS)
                            T("Rückgängig", Type.smallStrong)
                        }
                    }
                }
            }
            if (long) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        icon()
                        said(Modifier)
                    }
                    Box(Modifier.align(Alignment.End)) { button() }
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    icon()
                    androidx.compose.material3.Text(
                        if (m.html) {
                            markup(m.text)
                        } else {
                            androidx.compose.ui.text
                                .AnnotatedString(m.text)
                        },
                        Modifier.weight(1f, fill = false).padding(top = Space.s1, bottom = Space.s1, end = Space.s2),
                        color = p.bg,
                        style = Type.small,
                        onTextLayout = { if (m.undo != null && it.lineCount > 2) long = true },
                    )
                    button()
                }
            }
        }
    }
}
