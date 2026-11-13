package de.schmeckts.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import de.schmeckts.app.Square
import kotlin.math.roundToInt
import androidx.compose.ui.geometry.Size as Area

/* Profile picture cropping: image size, zoom (1: the short side fills the stage) and the image pixel at the stage
   centre. */

const val ZOOM_MAX = 4.0

class Crop(
    val w: Double,
    val h: Double,
) {
    var z = 1.0
    var cx = w / 2
    var cy = h / 2

    /** redraws the stage after a move */
    var moved by mutableIntStateOf(0)
        private set

    private fun side() = minOf(w, h) / z // crop edge in image pixels

    private fun clamp() {
        z = z.coerceIn(1.0, ZOOM_MAX)
        val half = side() / 2
        cx = cx.coerceIn(half, w - half)
        cy = cy.coerceIn(half, h - half)
        moved++
    }

    fun rect() = Square((cx - side() / 2).roundToInt(), (cy - side() / 2).roundToInt(), side().roundToInt())

    /** dx, dy: px moved on the stage; stage: its width in px */
    fun move(
        dx: Double,
        dy: Double,
        stage: Double,
    ) {
        val k = side() / stage
        cx -= dx * k
        cy -= dy * k
        clamp()
    }

    /** (fx, fy): the stage point that stays put, 0 to 1 */
    fun zoom(
        to: Double,
        fx: Double = 0.5,
        fy: Double = 0.5,
    ) {
        val s0 = side()
        val px = cx + (fx - 0.5) * s0
        val py = cy + (fy - 0.5) * s0
        z = to.coerceIn(1.0, ZOOM_MAX)
        val s1 = side()
        cx = px - (fx - 0.5) * s1
        cy = py - (fy - 0.5) * s1
        clamp()
    }
}

/** The stage: the photo under a round window, moved and pinched by the fingers, and the zoom under it */
@Composable
fun CropStage(
    img: ImageBitmap,
    c: Crop,
) {
    val p = colors
    Box(
        Modifier
            .padding(top = Space.s4)
            .widthIn(max = 340.dp)
            .fillMaxWidth()
            .aspectRatio(1f)
            .clip(RoundedCornerShape(Radius.l))
            .background(p.surface2)
            .pointerInput(c) {
                detectTransformGestures { centroid, pan, zoom, _ ->
                    val stage = size.width.toDouble()
                    c.move(pan.x.toDouble(), pan.y.toDouble(), stage) // pan first, then zoom around the midpoint
                    if (zoom != 1f) c.zoom(c.z * zoom, centroid.x / stage, centroid.y / size.height.toDouble())
                }
            },
    ) {
        Canvas(Modifier.matchParentSize()) {
            if (c.moved < 0) return@Canvas // read, so a move draws anew
            val k = size.width / (minOf(c.w, c.h) / c.z)
            val r = c.rect()
            drawImage(
                img,
                dstOffset = IntOffset((-r.x * k).roundToInt(), (-r.y * k).roundToInt()),
                dstSize = IntSize((c.w * k).roundToInt(), (c.h * k).roundToInt()),
            )
            val ring =
                Path().apply {
                    addOval(
                        androidx.compose.ui.geometry
                            .Rect(Offset.Zero, size),
                    )
                }
            clipPath(ring, ClipOp.Difference) { drawRect(p.backdrop, Offset.Zero, Area(size.width, size.height)) }
        }
    }
    ZoomBar(c)
}

// the range input under the stage: a track in the accent up to the knob
@Composable
private fun ZoomBar(c: Crop) {
    val p = colors
    Box(
        Modifier
            .fillMaxWidth()
            .height(Size.tap)
            .semantics { contentDescription = "Zoom" }
            .pointerInput(c) {
                fun at(x: Float) = c.zoom(1.0 + (x / size.width).coerceIn(0f, 1f) * (ZOOM_MAX - 1))
                detectTapGestures { at(it.x) }
            }.pointerInput(c) {
                detectHorizontalDragGestures { change, _ ->
                    c.zoom(1.0 + (change.position.x / size.width).coerceIn(0f, 1f) * (ZOOM_MAX - 1))
                    change.consume()
                }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        Canvas(Modifier.matchParentSize()) {
            if (c.moved < 0) return@Canvas
            val y = size.height / 2
            val knob = 10.dp.toPx()
            val f = ((c.z - 1) / (ZOOM_MAX - 1)).toFloat()
            val x = knob + f * (size.width - 2 * knob)
            drawLine(p.line, Offset(knob, y), Offset(size.width - knob, y), 4.dp.toPx(), androidx.compose.ui.graphics.StrokeCap.Round)
            drawLine(p.accent, Offset(knob, y), Offset(x, y), 4.dp.toPx(), androidx.compose.ui.graphics.StrokeCap.Round)
            drawCircle(p.accent, knob, Offset(x, y))
        }
    }
}
