package de.schmeckts.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.vector.RenderVectorGroup
import androidx.compose.ui.graphics.vector.VectorConfig
import androidx.compose.ui.graphics.vector.VectorProperty
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.drawscope.Stroke as DrawStroke

private val vectors = HashMap<String, ImageVector>()

// the part named fill grows from its own bottom edge, as transform-box: fill-box did it
fun iconVector(
    name: String,
    stroke: Float = Size.STROKE,
): ImageVector =
    vectors.getOrPut("$name/$stroke") {
        val b = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)
        for (s in ICONS[name].orEmpty()) {
            val nodes = PathParser().parsePathString(s.d).toNodes()
            val box = PathParser().parsePathString(s.d).toPath().getBounds()
            b.addGroup(
                name = s.part,
                pivotX = box.center.x + s.dx,
                pivotY = box.bottom + s.dy,
                translationX = s.dx,
                translationY = s.dy,
            )
            b.addPath(
                nodes,
                name = s.part,
                fill = if (s.fill) SolidColor(Color.Black) else null,
                fillAlpha = s.fillAlpha,
                stroke = if (s.stroke) SolidColor(Color.Black) else null,
                strokeLineWidth = stroke,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
            b.clearGroup()
        }
        b.build()
    }

/** An icon from icons.js in the current colour; fill: the bowl's fill as height share and opacity, for the loaders */
@Composable
fun Icon(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = Size.icon,
    color: Color = LocalContentColor.current,
    stroke: Float = Size.STROKE,
    fill: (() -> Pair<Float, Float>)? = null,
) {
    val image = iconVector(name, stroke)
    val painter =
        if (fill == null) {
            rememberVectorPainter(image)
        } else {
            val config =
                remember(fill) {
                    object : VectorConfig {
                        @Suppress("UNCHECKED_CAST")
                        override fun <T> getOrDefault(
                            property: VectorProperty<T>,
                            defaultValue: T,
                        ): T =
                            when (property) {
                                VectorProperty.ScaleY -> fill().first as T
                                VectorProperty.FillAlpha -> fill().second as T
                                else -> defaultValue
                            }
                    }
                }
            rememberVectorPainter(
                defaultWidth = image.defaultWidth,
                defaultHeight = image.defaultHeight,
                viewportWidth = image.viewportWidth,
                viewportHeight = image.viewportHeight,
                name = image.name,
                tintColor = Color.Unspecified,
                tintBlendMode = BlendMode.SrcIn,
                autoMirror = false,
            ) { _, _ -> RenderVectorGroup(image.root, mapOf("fill" to config)) }
        }
    Image(painter, null, modifier.size(size), colorFilter = ColorFilter.tint(color))
}

private class Drawn(
    val path: androidx.compose.ui.graphics.Path,
    val s: Stroke,
)

private val sketches = HashMap<String, List<Drawn>>()

/** An empty-state drawing on a 64 grid, dashed where it says */
@Composable
fun Sketch(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = Size.picL,
    color: Color = LocalContentColor.current,
) {
    val parts = sketches.getOrPut(name) { SKETCHES[name].orEmpty().map { Drawn(PathParser().parsePathString(it.d).toPath(), it) } }
    Canvas(modifier.size(size)) {
        val k = this.size.width / 64f
        scale(k, k, pivot = androidx.compose.ui.geometry.Offset.Zero) {
            for (p in parts) {
                translate(p.s.dx, p.s.dy) {
                    if (p.s.fill) drawPath(p.path, color, alpha = p.s.fillAlpha, style = Fill)
                    if (p.s.stroke) {
                        val dash =
                            p.s.dash
                                .split(" ")
                                .mapNotNull { it.toFloatOrNull() }
                        drawPath(
                            p.path,
                            color,
                            style =
                                DrawStroke(
                                    width = Size.STROKE,
                                    cap = StrokeCap.Round,
                                    join = StrokeJoin.Round,
                                    pathEffect = if (dash.size == 2) PathEffect.dashPathEffect(dash.toFloatArray()) else null,
                                ),
                        )
                    }
                }
            }
        }
    }
}
