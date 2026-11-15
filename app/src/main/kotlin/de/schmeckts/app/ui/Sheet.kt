package de.schmeckts.app.ui

import androidx.activity.BackEventCompat
import androidx.activity.compose.BackHandler
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/* Sheets and pages share one layer: a page is a sheet that fills the screen and moves sideways. A sheet opened from a
   page rises over it in a second layer, so the page keeps its state and scroll. `sheet` is the state of the top
   layer, which every action works on. */

private val PAGES = setOf("settings", "report", "evaluation")

/** What one sheet or page shows: its kind, the level it is on, and whatever its view keeps */
class SheetState(
    val kind: String,
    vararg values: Pair<String, Any?>,
) {
    private val m = HashMap<String, Any?>(values.toMap())

    operator fun get(k: String) = m[k]

    operator fun set(
        k: String,
        v: Any?,
    ) {
        if (v == null) m.remove(k) else m[k] = v
    }

    fun has(k: String) = m[k] != null

    fun str(k: String) = m[k] as? String ?: ""

    fun bool(k: String) = m[k] == true

    fun remove(k: String) = m.remove(k)

    fun keys(): Set<String> = m.keys

    fun assign(vararg values: Pair<String, Any?>) = values.forEach { (k, v) -> set(k, v) }

    var page: String?
        get() = m["page"] as? String
        set(v) = set("page", v)
    var step: String?
        get() = m["step"] as? String
        set(v) = set("step", v)
    var id: String?
        get() = m["id"] as? String
        set(v) = set("id", v)

    fun copy() = SheetState(kind, *m.toList().toTypedArray())
}

fun isPage(state: SheetState?) = state?.kind in PAGES

class Layer {
    var state by mutableStateOf<SheetState?>(null)
    val shown = Animatable(0f) // how far it has come in
    var key = ""
    var depth = 0 // levels back leads through before it closes
    var pageKeys = listOf<String>() // what openPage() added to the state, removed on the way back
    var closing: CompletableDeferred<Unit>? by mutableStateOf(null)
    var open by mutableStateOf(false)
    var slide: String? = null
    var hosted = false

    // the finger: sheets dragged down, the back gesture's share
    var drag by mutableFloatStateOf(0f)
    var back by mutableFloatStateOf(0f)
    var edge = BackEventCompat.EDGE_LEFT // the side the back gesture came from
    var leaving by mutableStateOf(true) // whether that gesture closes the layer, not only goes back a level
    var sheetHeight by mutableFloatStateOf(Float.MAX_VALUE)
    var settle: Job? = null // the spring back after a pull, stopped by the next touch
    var flung = 0f // px per second the finger let a closing sheet go with
    var armed = false // pulled far enough that letting go closes
    var held = -1 // the level a step holds, such as cropping: a pull only gives and lets go
    var scrolled by mutableStateOf(false)
    var titled by mutableStateOf(false)
    var level by mutableIntStateOf(0) // a new level starts at rest, at the top
    var kept: Pair<String, Int>? = null // the first level's key and scroll, to come back to
}

class Sheets(
    private val onOpen: () -> Unit = {},
    private val onShut: () -> Unit = {},
    val haptic: (String) -> Unit = {},
) {
    val base = Layer()
    val over = Layer()

    /** bumped by renderSheet(): what the views draw from changed */
    var tick by mutableIntStateOf(0)
        private set

    val sheet: SheetState? get() = top().state

    private fun top() = if (over.state != null) over else base

    fun anyOpen() = base.open

    fun topLayer(): Layer? =
        if (over.open) {
            over
        } else if (base.open) {
            base
        } else {
            null
        }

    /** a sheet over a page rises on top; anything else replaces what is open */
    fun openSheet(state: SheetState) {
        if (!isPage(state) && isPage(base.state) && base.closing == null) return openOn(over, state)
        if (over.state != null) shut(over)
        openOn(base, state)
    }

    private fun openOn(
        l: Layer,
        state: SheetState,
    ) {
        l.state = state
        l.pageKeys = emptyList()
        if (!l.open) {
            l.closing = null
            l.drag = 0f
            l.back = 0f
            l.kept = null
            l.open = true
            l.key = keyOf(state)
            l.level++
            l.depth = if (state.page != null) 2 else 1 // opened on a sub-page, so back goes to the overview first
            onOpen()
        }
        renderSheet()
    }

    /** Each level counts once, so the arrow and the back gesture take the same path. extra: keys the level needs,
     removed again on the way back. */
    fun openPage(
        page: String,
        vararg extra: Pair<String, Any?>,
    ) {
        val s = sheet ?: return
        if (s.page == page || over.state != null) return
        base.pageKeys = extra.map { it.first }
        s.assign(*extra)
        s.page = page
        base.slide = "fwd"
        base.depth++
        renderSheet()
    }

    fun backPage() {
        if (base.depth > 1) {
            base.depth--
            stepBack()
        } else {
            closeSheet()
        }
    }

    /** whether back closes the top layer, rather than going back a level */
    fun backCloses() = over.state != null || sheet?.page == null || base.depth <= 1

    /** the back button and gesture */
    fun sheetBack() {
        if (backCloses()) closeSheet() else backPage()
    }

    private fun stepBack() {
        val s = base.state ?: return
        if (s.page == null) return
        for (k in base.pageKeys) s.remove(k)
        base.pageKeys = emptyList()
        s.page = null
        base.slide = "back"
        renderSheet()
    }

    private fun keyOf(s: SheetState) = "${s.kind}:${s.page ?: ""}:${s.step ?: ""}:${s.id ?: ""}"

    /** draws the top layer anew from its state; a new level starts at the top */
    fun renderSheet() {
        for (l in listOf(base, over)) {
            val s = l.state ?: continue
            val key = keyOf(s)
            if (key != l.key) {
                l.key = key
                l.level++
                l.scrolled = false
                l.titled = false
            }
        }
        tick++
    }

    // a layer just shut still shows for a frame; a tap meant for it then is not one for what lies below
    private var shutAt = -1000L

    fun isClosing() = base.closing != null || over.closing != null || android.os.SystemClock.uptimeMillis() - shutAt < 100

    fun closeSheet(): CompletableDeferred<Unit> {
        val l = top()
        l.closing?.let { return it }
        if (!l.open) return CompletableDeferred(Unit)
        return closeLayers(listOf(l))
    }

    /** for what ends on the home page, such as serving */
    fun closeAll(): CompletableDeferred<Unit> {
        val open = listOf(over, base).filter { it.open && it.closing == null }
        val waits = listOfNotNull(over.closing, base.closing) + (if (open.isNotEmpty()) listOf(closeLayers(open)) else emptyList())
        val done = CompletableDeferred<Unit>()
        if (waits.all { it.isCompleted }) {
            done.complete(Unit)
        } else {
            waits.forEach { w -> w.invokeOnCompletion { if (waits.all { it.isCompleted }) done.complete(Unit) } }
        }
        return done
    }

    private fun closeLayers(layers: List<Layer>): CompletableDeferred<Unit> {
        val done = CompletableDeferred<Unit>()
        for (l in layers) {
            l.depth = 0
            l.closing = done
        }
        var left = layers.size
        for (l in layers) {
            val gone = {
                shut(l)
                if (--left == 0) done.complete(Unit)
            }
            if (l.hosted) l.onClosed = gone else gone()
        }
        return done
    }

    // redraws the page underneath, so the sheet's changes show there
    internal fun shut(l: Layer) {
        shutAt = android.os.SystemClock.uptimeMillis()
        l.onClosed = null
        l.settle?.cancel()
        l.open = false
        l.state = null
        l.key = ""
        l.pageKeys = emptyList()
        l.depth = 0
        l.drag = 0f
        l.back = 0f
        l.sheetHeight = Float.MAX_VALUE
        l.flung = 0f
        l.armed = false
        l.closing?.complete(Unit)
        l.closing = null
        onShut()
        tick++
    }
}

// set while the host animates a layer out; called once it is gone
internal var Layer.onClosed: (() -> Unit)?
    get() = closers[this]
    set(v) {
        if (v == null) closers.remove(this) else closers[this] = v
    }
private val closers = HashMap<Layer, () -> Unit>()

val LocalLayer = compositionLocalOf<Layer?> { null }

/** One layer on screen: the dimming, the sheet or page sliding in, its level drawn by view. */
@Composable
fun SheetHost(
    sheets: Sheets,
    layer: Layer,
    view: @Composable (SheetState) -> Unit,
) {
    val state = layer.state
    val closing = layer.closing
    val still = reduceMotion
    val shown = layer.shown
    val focus = LocalFocusManager.current
    DisposableEffect(layer) {
        layer.hosted = true
        onDispose { layer.hosted = false }
    }
    LaunchedEffect(layer.open, closing) {
        if (layer.open && closing == null) {
            if (still) shown.snapTo(1f) else shown.animateTo(1f, tween(Motion.STEP, easing = Motion.easeOut))
        } else if (closing != null) {
            focus.clearFocus() // the keyboard goes down with the layer, not after it
            if (layer.flung > 0f) layer.settle?.join() // release() carries a flicked sheet off
            if (!still && layer.drag < layer.sheetHeight) shown.animateTo(0f, tween(Motion.STEP, easing = Motion.easeIn))
            shown.snapTo(0f)
            layer.onClosed?.invoke()
        } else {
            shown.snapTo(0f)
        }
    }
    if (!layer.open || state == null) return
    val page = isPage(state)
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val pull = remember(layer, still) { PullToClose(sheets, layer, density, still, scope) }
    val back = remember { Animatable(0f) }
    val rest = { scope.launch { back.animateTo(0f, tween(Motion.STEP, easing = Motion.easeOut)) { layer.back = value } } }
    PredictiveBackHandler(enabled = sheets.topLayer() == layer && closing == null) { events ->
        try {
            var first = true
            events.collect { e: BackEventCompat ->
                if (first) {
                    layer.edge = e.swipeEdge
                    layer.leaving = sheets.backCloses()
                }
                first = false
                back.snapTo(if (still) 0f else Motion.back.transform(e.progress))
                layer.back = back.value
            }
            // a closing layer leaves from where the finger had it; a page that only goes back a level grows again
            sheets.sheetBack()
            if (layer.closing == null) rest()
        } catch (e: CancellationException) {
            rest()
            throw e
        }
    }
    Box(Modifier.fillMaxSize().semantics { paneTitle = state.kind }) {
        // the dimming, as much as of the sheet is still on screen; a tap on it closes, as a tap beside the dialog did
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer {
                    val lit = shown.value - layer.drag / layer.sheetHeight
                    alpha = (if (page && layer.leaving) lit * (1f - 0.5f * layer.back) else lit).coerceIn(0f, 1f)
                }.background(colors.backdrop)
                .clickable(remember { MutableInteractionSource() }, null) { if (closing == null) sheets.closeSheet() },
        )
        BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
            val w = constraints.maxWidth.toFloat()
            val h = constraints.maxHeight.toFloat()
            // a tap beside a field ends typing; buttons, chips and fields take their own taps first
            val tapAside = Modifier.pointerInput(Unit) { detectTapGestures { focus.clearFocus() } }
            val frame =
                if (page) {
                    Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            val b = layer.back
                            val toward = if (layer.edge == BackEventCompat.EDGE_RIGHT) -1f else 1f
                            translationX = (1f - shown.value) * w + toward * b * maxOf(0f, w / 20 - Space.s2.toPx())
                            scaleX = 1f - 0.1f * b
                            scaleY = 1f - 0.1f * b
                            shape = RoundedCornerShape(Radius.l * b)
                            clip = b > 0f
                        }.background(colors.bg)
                        .then(tapAside)
                } else {
                    Modifier
                        .widthIn(max = Space.pageWidth)
                        .fillMaxWidth()
                        .heightIn(max = with(density) { (h * 0.92f).toDp() })
                        .onGloballyPositioned { layer.sheetHeight = it.size.height.toFloat() }
                        .nestedScroll(pull)
                        .graphicsLayer {
                            val all = if (layer.sheetHeight == Float.MAX_VALUE) h else layer.sheetHeight
                            translationY = (1f - shown.value) * all + layer.drag + layer.back * all * 0.1f
                            val k = 1f - 0.05f * layer.back
                            scaleX = k
                            scaleY = k
                            transformOrigin =
                                androidx.compose.ui.graphics
                                    .TransformOrigin(0.5f, 1f)
                        }.shadowHigh(RoundedCornerShape(topStart = Radius.l, topEnd = Radius.l))
                        .clip(RoundedCornerShape(topStart = Radius.l, topEnd = Radius.l))
                        .background(colors.bg)
                        .then(tapAside)
                }
            Column(frame) {
                if (page) {
                    Box(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
                } else {
                    Grip(sheets, layer, scope)
                }
                CompositionLocalProvider(LocalLayer provides layer) {
                    Levels(layer, state, page, still, view)
                }
            }
            // the toast's undo stays live in a closing sheet, nothing else does
            if (closing != null) {
                Box(Modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) {})
            }
        }
    }
}

private class Level(
    val key: String,
    val n: Int,
    val frozen: SheetState,
    val slide: String?,
)

// A new level slides in as a page or rises in place; the old one is drawn from what its state was.
@Composable
private fun ColumnScope.Levels(
    layer: Layer,
    state: SheetState,
    page: Boolean,
    still: Boolean,
    view: @Composable (SheetState) -> Unit,
) {
    val n = layer.level
    val rise = with(LocalDensity.current) { 10.dp.roundToPx() }
    val target = remember(n) { Level(layer.key, n, state.copy(), layer.slide.also { layer.slide = null }) }
    val focus = LocalFocusManager.current
    DisposableEffect(target) {
        if (target.slide == "back") focus.clearFocus() // the keyboard goes with the level it was for
        onDispose {}
    }
    AnimatedContent(
        target,
        Modifier.weight(1f, fill = page),
        transitionSpec = {
            val how = targetState.slide
            if (still || initialState.n == targetState.n) {
                ContentTransform(EnterTransition.None, ExitTransition.None)
            } else if (page && how == "fwd") {
                slideInHorizontally(tween(Motion.STEP, easing = Motion.easeOut)) { it } togetherWith
                    slideOutHorizontally(tween(Motion.STEP, easing = Motion.easeOut)) { -it / 4 }
            } else if (page && how == "back") {
                (
                    slideInHorizontally(tween(Motion.STEP, easing = Motion.easeOut)) { -it / 4 } togetherWith
                        slideOutHorizontally(tween(Motion.STEP, easing = Motion.easeOut)) { it }
                ).apply { targetContentZIndex = -1f }
            } else if (page) {
                ContentTransform(EnterTransition.None, ExitTransition.None)
            } else {
                (
                    fadeIn(tween(Motion.STEP, easing = Motion.easeOut)) +
                        slideInVertically(tween(Motion.STEP, easing = Motion.easeOut)) { rise }
                ) togetherWith ExitTransition.None
            }
        },
        contentKey = { it.n },
        label = "level",
    ) { lvl ->
        Box(Modifier.background(colors.bg)) {
            view(if (lvl.n == layer.level) state else lvl.frozen)
        }
    }
}

/** Let go past closeAt, or flung down, the sheet closes; flung up or let go early, it springs back. v in px per second. */
internal suspend fun Layer.release(
    sheets: Sheets,
    density: Density,
    v: Float,
    still: Boolean,
) {
    armed = false
    val at = closeAt(density)
    // a flick needs some pull of its own, so a fling that only scrolled the content to its top does not close
    if (held != level && v / density.density > -300 && drag > minOf(24 * density.density, at) && drag + maxOf(0f, v) * 0.15f >= at) {
        flung = maxOf(0f, v)
        sheets.closeSheet()
        val way = sheetHeight - drag
        if (still || flung == 0f || closing == null || way <= 0f) return
        // on from the finger's speed, quicker if that was slow, so the sheet neither stops nor lingers before it is gone
        val ms = (way / flung * 1000).toInt().coerceAtMost(Motion.STEP)
        val s = flung * ms / 1000 / way
        animate(drag, sheetHeight, 0f, tween(ms, easing = { u -> s * u + (1 - s) * u * u })) { x, _ -> drag = x }
    } else if (still) {
        drag = 0f
    } else {
        animate(drag, 0f, v, spring(Spring.DampingRatioNoBouncy, Spring.StiffnessMediumLow)) { x, _ -> drag = maxOf(0f, x) }
    }
}

/** how far a pull let go at rest has to reach to close, in px: 110 dp, at most half the sheet */
internal fun Layer.closeAt(density: Density) = minOf(110 * density.density, sheetHeight / 2)

// the finger moved the sheet by dy px; the point from where letting go closes it is felt both ways
private fun Layer.pullBy(
    sheets: Sheets,
    dy: Float,
    density: Density,
) {
    val give = 120 * density.density
    drag = maxOf(0f, drag + if (held == level && dy > 0f) dy * give / (give + drag) else dy)
    val on = held != level && drag >= closeAt(density)
    if (on != armed) {
        armed = on
        sheets.haptic(if (on) "threshold" else "threshold-off")
    }
}

// Content scrolled to its top hands a downward pull to the sheet, and takes an upward one back first
private class PullToClose(
    val sheets: Sheets,
    val layer: Layer,
    val density: Density,
    val still: Boolean,
    val scope: CoroutineScope,
) : NestedScrollConnection {
    private fun mine() = sheets.topLayer() == layer && layer.closing == null

    override fun onPreScroll(
        available: Offset,
        source: NestedScrollSource,
    ): Offset {
        if (source != NestedScrollSource.UserInput) return Offset.Zero
        layer.settle?.cancel()
        if (available.y >= 0 || layer.drag <= 0f) return Offset.Zero
        val used = maxOf(available.y, -layer.drag)
        layer.pullBy(sheets, used, density)
        return Offset(0f, used)
    }

    override fun onPostScroll(
        consumed: Offset,
        available: Offset,
        source: NestedScrollSource,
    ): Offset {
        if (source != NestedScrollSource.UserInput || available.y <= 0 || !mine()) return Offset.Zero
        layer.pullBy(sheets, available.y, density)
        return Offset(0f, available.y)
    }

    // returns at once, so the content takes the next touch while the sheet still settles
    override suspend fun onPreFling(available: Velocity): Velocity {
        if (layer.drag <= 0f) return Velocity.Zero
        layer.settle = scope.launch { layer.release(sheets, density, available.y, still) }
        return available
    }
}

private class HideKeys(
    val focus: FocusManager,
) : NestedScrollConnection {
    override fun onPostScroll(
        consumed: Offset,
        available: Offset,
        source: NestedScrollSource,
    ): Offset {
        if (source == NestedScrollSource.UserInput && consumed.y != 0f) focus.clearFocus()
        return Offset.Zero
    }
}

@Composable
private fun Grip(
    sheets: Sheets,
    layer: Layer,
    scope: CoroutineScope,
) {
    val still = reduceMotion
    val density = LocalDensity.current
    Box(
        Modifier
            .fillMaxWidth()
            .draggable(
                rememberDraggableState { dy ->
                    if (sheets.topLayer() == layer && layer.closing == null) layer.pullBy(sheets, dy, density)
                },
                Orientation.Vertical,
                onDragStarted = { layer.settle?.cancel() },
                onDragStopped = { v ->
                    if (layer.drag > 0f) layer.settle = scope.launch { layer.release(sheets, density, v, still) }
                },
            ).padding(vertical = Space.s2),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(40.dp, 5.dp)
                .clip(RoundedCornerShape(50))
                .background(colors.line),
        )
    }
}

/** what scrolls under a bar fades into it */
@Composable
fun FadeEdge(
    on: Boolean,
    modifier: Modifier = Modifier,
    over: Dp = Space.s5,
    up: Boolean = false,
) {
    val a by androidx.compose.animation.core.animateFloatAsState(
        if (on) 1f else 0f,
        if (reduceMotion) {
            androidx.compose.animation.core
                .snap()
        } else {
            tween(Motion.FADE, easing = Motion.easeOut)
        },
        label = "edge",
    )
    val bg = colors.bg
    Box(
        modifier
            .fillMaxWidth()
            .size(height = over, width = 0.dp)
            .fillMaxWidth()
            .alpha(a)
            .background(
                Brush.verticalGradient(
                    (
                        if (up) {
                            listOf(bg.copy(alpha = 0f), bg.copy(alpha = 0.14f), bg.copy(alpha = 0.42f), bg.copy(alpha = 0.78f), bg)
                        } else {
                            listOf(bg, bg.copy(alpha = 0.78f), bg.copy(alpha = 0.42f), bg.copy(alpha = 0.14f), bg.copy(alpha = 0f))
                        }
                    ),
                ),
            ),
    )
}

// The first level of a layer is where back returns to, so it comes back scrolled as it was left; the others start at
// the top. Kept only while it is the level shown: on its way out a view may already draw the next level's content.
@Composable
private fun rememberLevelScroll(): ScrollState {
    val layer = LocalLayer.current
    val first = remember { layer?.state?.let { it.page == null && it.step == null } == true }
    val key = remember { layer?.key ?: "" }
    val scroll = rememberScrollState(layer?.kept?.takeIf { first && it.first == key }?.second ?: 0)
    if (first && layer != null) {
        LaunchedEffect(scroll) { snapshotFlow { scroll.value }.collect { if (layer.key == key) layer.kept = key to it } }
    }
    return scroll
}

/** The head and body of a sheet or a page, decided by the layer, so one view can be both. back: for a step that is
 not a level of its own, such as cropping. step: such a step; back ends it, and a pull cannot close the layer.
 end: a button at the end of the bar. hideKeysOnScroll: a swipe through the content puts the keyboard away, as in a list
 of hits. */
@Composable
fun SheetBody(
    title: String,
    sheets: Sheets,
    onBack: () -> Unit = { sheets.backPage() },
    end: (@Composable RowScope.() -> Unit)? = null,
    step: Boolean = false,
    scroll: ScrollState = rememberLevelScroll(),
    hideKeysOnScroll: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val layer = LocalLayer.current
    val page = isPage(layer?.state)
    val focus = LocalFocusManager.current
    val keys = if (hideKeysOnScroll) Modifier.nestedScroll(remember(focus) { HideKeys(focus) }) else Modifier
    if (step && layer != null) {
        val mine = remember { layer.level }
        // composed after the layer's own back handler, so it comes first
        BackHandler(layer.level == mine && sheets.topLayer() == layer && layer.closing == null) { onBack() }
        DisposableEffect(layer) {
            layer.held = mine
            onDispose { if (layer.held == mine) layer.held = -1 }
        }
    }
    var titleBottom by remember { mutableFloatStateOf(Float.MAX_VALUE) }
    val scrolled by remember { derivedStateOf { scroll.value > 0 } }
    val titled by remember { derivedStateOf { scroll.value > 0 && scroll.value >= titleBottom } }
    LaunchedEffect(scrolled, titled) {
        layer?.scrolled = scrolled
        layer?.titled = titled
    }
    if (page) {
        Column(Modifier.fillMaxSize()) {
            Box {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(colors.bg)
                        .heightIn(min = Size.bar)
                        .padding(horizontal = Space.gutter),
                    horizontalArrangement = Arrangement.spacedBy(Space.s1),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconBtn("back", "Zurück", Modifier.offset(x = -Space.s3), onClick = onBack)
                    val a by androidx.compose.animation.core.animateFloatAsState(
                        if (titled) 1f else 0f,
                        if (reduceMotion) {
                            androidx.compose.animation.core
                                .snap()
                        } else {
                            tween(Motion.FADE, easing = Motion.easeOut)
                        },
                        label = "bar title",
                    )
                    M(title, Type.heading, Modifier.weight(1f).alpha(a), maxLines = 1)
                    if (end != null) Row(Modifier.offset(x = Space.s3), verticalAlignment = Alignment.CenterVertically) { end() }
                }
                FadeEdge(scrolled, Modifier.align(Alignment.BottomCenter).offset(y = Space.s5))
            }
            Column(
                Modifier
                    .weight(1f)
                    .imePadding()
                    .then(keys)
                    .verticalScroll(scroll)
                    .padding(horizontal = Space.gutter),
            ) {
                M(
                    title,
                    Type.title,
                    Modifier
                        .padding(bottom = if (layer?.state?.kind in setOf("report", "evaluation")) Space.s4 else Space.s2)
                        .onGloballyPositioned { titleBottom = it.size.height.toFloat() },
                    colors.ink,
                    balance = true,
                )
                content()
                Box(Modifier.size(Space.s7))
                Box(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
            }
        }
    } else {
        // the content's own height glides, the keyboard's room follows the keyboard and keeps the field in view above it
        Column(
            Modifier
                .imePadding()
                .then(keys)
                .verticalScroll(scroll)
                .then(
                    if (reduceMotion) {
                        Modifier
                    } else {
                        Modifier.animateContentSize(
                            spring(stiffness = Spring.StiffnessMediumLow, visibilityThreshold = IntSize.VisibilityThreshold),
                        )
                    },
                ).padding(start = Space.gutter, end = Space.gutter, top = Space.s1),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(bottom = Space.s3),
                horizontalArrangement = Arrangement.spacedBy(Space.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                M(title, Type.heading, Modifier.weight(1f), colors.ink, balance = true)
                if (end != null) end()
                IconBtn("close", "Schließen", Modifier.offset(x = Space.s3)) { sheets.closeSheet() }
            }
            content()
            Box(Modifier.size(Space.s7))
            Box(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
        }
    }
}

/** the head of a sheet that is no list: title in the middle, no close button */
@Composable
fun PlainTitle(text: String) = M(text, Type.heading, Modifier.fillMaxWidth(), colors.ink, align = TextAlign.Center, balance = true)

/** A page whose body is a lazy list, for the long history: the bar, the title as its first item, then the rest.
 stuck: a sticky line is under the bar and draws the edge itself. */
@Composable
fun PageList(
    title: String,
    onBack: () -> Unit,
    state: androidx.compose.foundation.lazy.LazyListState,
    stuck: Boolean = false,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    val layer = LocalLayer.current
    val scrolled by remember { derivedStateOf { state.firstVisibleItemIndex > 0 || state.firstVisibleItemScrollOffset > 0 } }
    val titled by remember { derivedStateOf { state.firstVisibleItemIndex > 0 } }
    LaunchedEffect(scrolled, titled) {
        layer?.scrolled = scrolled
        layer?.titled = titled
    }
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.zIndex(1f)) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(colors.bg)
                    .heightIn(min = Size.bar)
                    .padding(horizontal = Space.gutter),
                horizontalArrangement = Arrangement.spacedBy(Space.s1),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconBtn("back", "Zurück", Modifier.offset(x = -Space.s3), onClick = onBack)
                val a by androidx.compose.animation.core.animateFloatAsState(
                    if (titled) 1f else 0f,
                    if (reduceMotion) {
                        androidx.compose.animation.core
                            .snap()
                    } else {
                        tween(Motion.FADE, easing = Motion.easeOut)
                    },
                    label = "bar title",
                )
                M(title, Type.heading, Modifier.weight(1f).alpha(a), maxLines = 1)
            }
            FadeEdge(scrolled && !stuck, Modifier.align(Alignment.BottomCenter).offset(y = Space.s5))
        }
        androidx.compose.foundation.lazy.LazyColumn(
            Modifier.weight(1f).imePadding(),
            state,
            contentPadding =
                androidx.compose.foundation.layout
                    .PaddingValues(horizontal = Space.gutter),
        ) {
            item(key = "title") { M(title, Type.title, Modifier.padding(bottom = Space.s4), colors.ink, balance = true) }
            content()
            item(key = "foot") {
                Box(Modifier.size(Space.s7))
                Box(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
            }
        }
    }
}
