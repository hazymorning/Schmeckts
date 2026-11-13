package de.schmeckts.app.ui

import androidx.activity.BackEventCompat
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
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
    var scrolled by mutableStateOf(false)
    var titled by mutableStateOf(false)
    var level by mutableIntStateOf(0) // a new level starts at rest, at the top
}

class Sheets(
    private val onOpen: () -> Unit = {},
    private val onShut: () -> Unit = {},
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

    /** the back button and gesture */
    fun sheetBack() {
        if (over.state == null && sheet?.page != null) backPage() else closeSheet()
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
        l.open = false
        l.state = null
        l.key = ""
        l.pageKeys = emptyList()
        l.depth = 0
        l.drag = 0f
        l.back = 0f
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
    val shown = remember { Animatable(0f) }
    DisposableEffect(layer) {
        layer.hosted = true
        onDispose { layer.hosted = false }
    }
    LaunchedEffect(layer.open, closing) {
        if (layer.open && closing == null) {
            if (still) shown.snapTo(1f) else shown.animateTo(1f, tween(Motion.STEP, easing = Motion.easeOut))
        } else if (closing != null) {
            if (!still) shown.animateTo(0f, tween(Motion.STEP, easing = Motion.easeIn))
            shown.snapTo(0f)
            layer.onClosed?.invoke()
        } else {
            shown.snapTo(0f)
        }
    }
    if (!layer.open || state == null) return
    val page = isPage(state)
    val scope = rememberCoroutineScope()
    PredictiveBackHandler(enabled = sheets.topLayer() == layer && closing == null) { events ->
        try {
            events.collect { e: BackEventCompat -> layer.back = e.progress }
            layer.back = 0f
            sheets.sheetBack()
        } catch (e: CancellationException) {
            scope.launch { layer.back = 0f }
            throw e
        }
    }
    Box(Modifier.fillMaxSize().semantics { paneTitle = state.kind }) {
        // the dimming; a tap on it closes, as a tap beside the dialog did
        Box(
            Modifier
                .fillMaxSize()
                .alpha(shown.value)
                .background(colors.backdrop)
                .clickable(remember { MutableInteractionSource() }, null) { if (closing == null) sheets.closeSheet() },
        )
        BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
            val w = constraints.maxWidth.toFloat()
            val h = constraints.maxHeight.toFloat()
            val density = LocalDensity.current
            var sheetHeight by remember { mutableFloatStateOf(h) }
            val frame =
                if (page) {
                    Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            val b = layer.back
                            translationX = (1f - shown.value) * w + b * w * 0.1f
                            scaleX = 1f - 0.1f * b
                            scaleY = 1f - 0.1f * b
                            shape = RoundedCornerShape(Radius.l * b)
                            clip = b > 0f
                        }.background(colors.bg)
                } else {
                    Modifier
                        .widthIn(max = Space.pageWidth)
                        .fillMaxWidth()
                        .heightIn(max = with(density) { (h * 0.92f).toDp() })
                        .onGloballyPositioned { sheetHeight = it.size.height.toFloat() }
                        .graphicsLayer {
                            translationY = (1f - shown.value) * sheetHeight + layer.drag + layer.back * sheetHeight * 0.1f
                            val k = 1f - 0.05f * layer.back
                            scaleX = k
                            scaleY = k
                            transformOrigin =
                                androidx.compose.ui.graphics
                                    .TransformOrigin(0.5f, 1f)
                        }.shadowHigh(RoundedCornerShape(topStart = Radius.l, topEnd = Radius.l))
                        .clip(RoundedCornerShape(topStart = Radius.l, topEnd = Radius.l))
                        .background(colors.bg)
                        .clickable(remember { MutableInteractionSource() }, null) {}
                }
            Column(frame) {
                if (page) {
                    Box(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
                } else {
                    Grip(sheets, layer)
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

// swiping down closes a sheet; a page leaves only by the arrow or back
fun Modifier.dragToClose(
    sheets: Sheets,
    layer: Layer,
) = pointerInput(layer) {
    val velocity = VelocityTracker()
    var t0 = 0L
    detectVerticalDragGestures(
        onDragStart = {
            velocity.resetTracking()
            t0 = System.currentTimeMillis()
        },
        onDragEnd = {
            val dy = layer.drag / density
            val v = dy / maxOf(1L, System.currentTimeMillis() - t0)
            if (dy > 110 || (v > 0.5f && dy > 24)) sheets.closeSheet() else layer.drag = 0f
        },
        onDragCancel = { layer.drag = 0f },
    ) { change, dy ->
        if (sheets.topLayer() != layer || layer.closing != null) return@detectVerticalDragGestures
        velocity.addPosition(change.uptimeMillis, change.position)
        layer.drag = maxOf(0f, layer.drag + dy)
        change.consume()
    }
}

@Composable
private fun Grip(
    sheets: Sheets,
    layer: Layer,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .dragToClose(sheets, layer)
            .padding(vertical = Space.s2),
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

/** The head and body of a sheet or a page, decided by the layer, so one view can be both. back: for a step that is
 not a level of its own, such as cropping. end: a button at the end of the bar. */
@Composable
fun SheetBody(
    title: String,
    sheets: Sheets,
    onBack: () -> Unit = { sheets.backPage() },
    end: (@Composable RowScope.() -> Unit)? = null,
    scroll: ScrollState = rememberScrollState(),
    content: @Composable ColumnScope.() -> Unit,
) {
    val layer = LocalLayer.current
    val page = isPage(layer?.state)
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
                    .verticalScroll(scroll)
                    .imePadding()
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
        Column(
            Modifier
                .verticalScroll(scroll)
                .imePadding()
                .padding(start = Space.gutter, end = Space.gutter, top = Space.s1),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .then(if (layer != null) Modifier.dragToClose(sheets, layer) else Modifier)
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
