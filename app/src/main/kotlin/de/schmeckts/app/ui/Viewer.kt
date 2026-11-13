package de.schmeckts.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import kotlin.math.min
import kotlin.math.roundToInt

// The packaging photo full screen, always dark; it grows out of its thumbnail and back into it.

class Viewer(
    private val decode: (String) -> ImageBitmap?,
    private val darkBars: (Boolean) -> Unit,
) {
    var image by mutableStateOf<ImageBitmap?>(null)
        private set
    var open by mutableStateOf(false)
        private set
    var closing by mutableStateOf(false)
        private set
    private var opening = false
    private var closeLater = false
    private var run = 0
    var from: String? = null // to find the thumbnail again on close
        private set
    var hosted = false

    /** where each photo button's picture is on screen, by its key; kept while it is drawn */
    val thumbs = HashMap<String, Rect>()
    var level by mutableIntStateOf(0)

    fun viewerOpen() = opening || closing || open

    /** load: a data URL or null. Returns true: open, false: nothing to show, null: busy or cut short */
    suspend fun openViewer(
        load: suspend () -> String?,
        key: String,
    ): Boolean? {
        if (viewerOpen()) return null
        val mine = ++run
        opening = true
        closeLater = false
        val img =
            try {
                load()?.let(decode)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                de.schmeckts.app.report("opening the photo", e)
                null
            }
        if (mine != run) return null
        if (img == null) {
            opening = false
            closeLater = false
            return false
        }
        from = key
        image = img
        open = true
        level++
        darkBars(true)
        opening = false
        if (closeLater) {
            closeLater = false
            closeViewer()
        }
        return true
    }

    /** true when it took the back button */
    fun closeViewer(): Boolean {
        if (opening) {
            closeLater = true
            return true
        }
        if (closing) return true
        if (!open) return false
        closing = true
        if (!hosted) shut()
        return true
    }

    internal fun shut() {
        open = false
        closing = false
        image = null // frees the decoded photo
        darkBars(false)
    }

    /** something else takes the screen, and the viewer must not open beneath it */
    fun dropViewer() {
        if (!viewerOpen()) return
        run++
        if (open) shut()
        opening = false
        closeLater = false
    }
}

/** marks a thumbnail as the place its photo zooms from */
fun Modifier.photoSource(
    viewer: Viewer,
    key: String,
) = onGloballyPositioned { viewer.thumbs[key] = it.boundsInWindow() }

@Composable
fun ViewerHost(viewer: Viewer) {
    val img = viewer.image ?: return
    val still = reduceMotion
    val zoom = remember(viewer.level) { Animatable(0f) }
    DisposableHosted(viewer)
    LaunchedEffect(viewer.level, viewer.closing) {
        if (viewer.closing) {
            if (!still) zoom.animateTo(0f, tween(Motion.STEP, easing = Motion.easeOut))
            viewer.shut()
        } else if (still) {
            zoom.snapTo(1f)
        } else {
            zoom.animateTo(1f, tween(Motion.STEP, easing = Motion.easeOut))
        }
    }
    BackHandler(enabled = true) { viewer.closeViewer() }
    SchmecktsTheme("dark") {
        Box(
            Modifier
                .fillMaxSize()
                .clickable(remember { MutableInteractionSource() }, null) { viewer.closeViewer() },
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .alpha(zoom.value)
                    .background(colors.bg),
            )
            BoxWithConstraints(
                Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(vertical = Size.bar),
                contentAlignment = Alignment.Center,
            ) {
                val ar = img.width.toFloat() / img.height
                val boxW = constraints.maxWidth.toFloat()
                val boxH = constraints.maxHeight.toFloat()
                val w = min(boxW, boxH * ar)
                val h = w / ar
                var at by remember { mutableStateOf(Rect.Zero) }
                Image(
                    img,
                    "Foto der Packung",
                    Modifier
                        .size(w, h)
                        .onGloballyPositioned { at = it.boundsInWindow() }
                        .graphicsLayer {
                            // from the thumbnail's middle square to the photo's box
                            val thumb = viewer.from?.let { viewer.thumbs[it] }
                            val f = zoom.value
                            if (thumb == null || at == Rect.Zero) {
                                alpha = f
                            } else {
                                val side = min(w, h)
                                val k = thumb.width / side
                                val s = k + (1f - k) * f
                                scaleX = s
                                scaleY = s
                                translationX = (thumb.center.x - at.center.x) * (1f - f)
                                translationY = (thumb.center.y - at.center.y) * (1f - f)
                                clip = f < 1f
                                shape =
                                    androidx.compose.foundation.shape
                                        .RoundedCornerShape(Radius.s * (1f - f))
                            }
                        },
                    contentScale = ContentScale.Fit,
                )
            }
            IconBtn(
                "close",
                "Schließen",
                Modifier
                    .align(Alignment.TopEnd)
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(Space.s1)
                    .alpha(zoom.value),
            ) { viewer.closeViewer() }
        }
    }
}

@Composable
private fun DisposableHosted(viewer: Viewer) =
    androidx.compose.runtime.DisposableEffect(viewer) {
        viewer.hosted = true
        onDispose { viewer.hosted = false }
    }

private fun Modifier.size(
    w: Float,
    h: Float,
) = this.then(
    Modifier.semantics { contentDescription = "Foto der Packung" }.layoutSize(w, h),
)

private fun Modifier.layoutSize(
    w: Float,
    h: Float,
) = layout { m, _ ->
    val p =
        m.measure(
            androidx.compose.ui.unit.Constraints
                .fixed(w.roundToInt(), h.roundToInt()),
        )
    layout(p.width, p.height) { p.place(0, 0) }
}
