package de.schmeckts.app.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.TextAlign
import de.schmeckts.app.RATINGS
import de.schmeckts.app.rateTone
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.abs

/* The rating slider, modelled on an Android slider inside a scrolling list: a tap rates where it lands, a finger
   moved sideways slides over the levels, one moved up or down scrolls the page instead. */

private const val SLOP = 8f // dp before a touch slides or scrolls
private const val REST = 100L // ms, Android's tap timeout

@Composable
fun RateSlider(
    scale: List<String>,
    current: String?,
    label: String,
    haptic: () -> Unit,
    modifier: Modifier = Modifier,
    onRate: (String) -> Unit,
) {
    val p = colors
    val n = scale.size
    var pointing by remember { mutableStateOf<String?>(null) }
    val shown = pointing ?: current?.takeIf { it in scale }
    val at = scale.indexOf(shown)
    val tone = shown?.let { p.tone(rateTone(it)) }
    val still = reduceMotion
    val pop = remember { Animatable(1f) }
    var last by remember { mutableStateOf(current) }
    LaunchedEffect(current) {
        if (current != last && current != null && !still) {
            pop.animateTo(
                1f,
                keyframes {
                    durationMillis = Motion.STEP
                    1.06f at (Motion.STEP * 0.35f).toInt() using Motion.spring
                },
            )
        }
        last = current
    }
    Column(modifier.fillMaxWidth().semantics { contentDescription = label }) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val w = maxWidth
            val stop = (w - Space.s1 * 2 - Space.hair * (n - 1)) / n
            val x = Space.s1 + (stop + Space.hair) * maxOf(at, 0) + (stop - Size.tapS) / 2
            val moved by animateFloatAsState(x.value, if (still) snap() else tween(Motion.STEP, easing = Motion.easeOut), label = "thumb")
            val wash =
                scale.mapIndexed { i, r -> (i + 0.5f) / n to (p.tone(rateTone(r))?.cs ?: p.surface2) }.toTypedArray()
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(50))
                    .background(p.surface2)
                    .background(Brush.horizontalGradient(*wash))
                    .pointerInput(scale, current) {
                        val stopPx = stop.toPx()
                        val gap = Space.hair.toPx()
                        val pad = Space.s1.toPx()

                        fun nearest(px: Float) = scale.indices.minBy { i -> abs(px - (pad + i * (stopPx + gap) + stopPx / 2)) }
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false)
                            var slid = false

                            fun slide(px: Float) {
                                val r = scale[nearest(px)]
                                if (r == pointing) return
                                pointing = r
                                slid = true
                                haptic()
                            }
                            var lastX = down.position.x
                            // held still for the tap timeout: it shows where it lands
                            val first =
                                withTimeoutOrNull(REST) {
                                    awaitPointerEvent(PointerEventPass.Main)
                                }
                            if (first == null) slide(lastX)
                            var event = first
                            var up = false
                            var scrolled = false
                            while (true) {
                                val e = event ?: awaitPointerEvent(PointerEventPass.Main)
                                event = null
                                val c = e.changes.firstOrNull { it.id == down.id } ?: break
                                if (!c.pressed) {
                                    up = true
                                    lastX = c.position.x
                                    break
                                }
                                val dx = abs(c.position.x - down.position.x)
                                val dy = abs(c.position.y - down.position.y)
                                lastX = c.position.x
                                if (slid || (dx > SLOP * density && dx > dy)) {
                                    slide(lastX)
                                    c.consume()
                                } else if (dy > SLOP * density || c.isConsumed) {
                                    scrolled = true // vertical: the page scrolls
                                    break
                                }
                            }
                            val r = if (up && !scrolled) scale[nearest(lastX)] else null
                            pointing = null
                            if (r != null && r != current) onRate(r)
                        }
                    }.padding(Space.s1),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(Space.hair)) {
                    for (r in scale) {
                        val t = p.tone(rateTone(r))
                        Box(
                            Modifier
                                .weight(1f)
                                .testTag("level-$r")
                                .height(Size.tapS)
                                .semantics {
                                    role = Role.Button
                                    contentDescription = RATINGS.getValue(r).label
                                    selected = r == current
                                    onClick {
                                        if (r != current) onRate(r)
                                        true
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) { Icon("r_$r", size = Size.iconM, color = t?.c ?: p.muted) }
                    }
                }
                if (shown != null && tone != null) {
                    val ring by animateColorAsState(
                        tone.c,
                        if (still) snap() else tween(Motion.FADE, easing = Motion.easeOut),
                        label = "ring",
                    )
                    Box(
                        Modifier
                            .offset(
                                x =
                                    androidx.compose.ui.unit
                                        .Dp(moved) - Space.s1,
                            ).size(Size.tapS)
                            .graphicsLayer {
                                scaleX = pop.value
                                scaleY = pop.value
                            }.then(if (pointing != null) Modifier.shadowHigh(CircleShape) else Modifier.shadowLow(CircleShape))
                            .clip(CircleShape)
                            .background(p.surface)
                            .border(Size.stroke * 2, ring, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Icon("r_$shown", size = Size.iconM, color = tone.c) }
                }
            }
        }
        Row(
            Modifier
                .fillMaxWidth()
                .padding(top = Space.s2, start = Space.s1, end = Space.s1),
            horizontalArrangement = Arrangement.spacedBy(Space.hair),
        ) {
            scale.forEachIndexed { i, r ->
                val on = i == at
                T(
                    RATINGS.getValue(r).short,
                    (if (on) Type.smallStrong else Type.small).copy(hyphens = Hyphens.Auto),
                    Modifier.weight(1f),
                    if (on) p.tone(rateTone(r))?.c ?: p.muted else p.muted,
                    align = TextAlign.Center,
                )
            }
        }
    }
}
