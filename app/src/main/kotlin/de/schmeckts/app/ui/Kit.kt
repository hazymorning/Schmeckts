package de.schmeckts.app.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.FlowRowScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em

// The recipes of the old css/app.css: each sets its box, type and colour, and nothing else does.

/** the fill of a field, chip, box or soft button: the surface on the ground, surface-2 in a card */
val LocalRaise = staticCompositionLocalOf<Color?> { null }

val raise: Color
    @Composable get() = LocalRaise.current ?: colors.surface

fun Modifier.shadowLow(shape: Shape) = composed { dropShadow(shape, Shadow(4.dp, colors.shadowLow, offset = DpOffset(0.dp, 1.dp))) }

fun Modifier.shadowHigh(shape: Shape) =
    composed {
        val p = colors
        dropShadow(shape, Shadow(34.dp, p.shadowHigh, spread = (-14).dp, offset = DpOffset(0.dp, 14.dp)))
            .dropShadow(shape, Shadow(6.dp, p.shadowHighNear, offset = DpOffset(0.dp, 2.dp)))
    }

/** A tap without Material's ripple: the control shrinks a little while pressed, as :active did */
fun Modifier.press(
    onClick: (() -> Unit)?,
    scale: Float = Motion.PRESS,
    enabled: Boolean = true,
    label: String? = null,
    role: Role = Role.Button,
): Modifier =
    if (onClick == null) {
        this
    } else {
        composed {
            val source = remember { MutableInteractionSource() }
            val pressed by source.collectIsPressedAsState()
            val k by animateFloatAsState(
                if (pressed && enabled) scale else 1f,
                if (reduceMotion) snap() else tween(Motion.FADE, easing = Motion.easeOut),
                label = "press",
            )
            graphicsLayer {
                scaleX = k
                scaleY = k
            }.clickable(source, null, enabled, role = role, onClick = onClick)
                .then(if (label != null) Modifier.semantics { contentDescription = label } else Modifier)
        }
    }

private fun TextStyle.wrap(balance: Boolean) = copy(lineBreak = if (balance) LineBreak.Heading else LineBreak.Simple)

/** Text in a type style, the current colour unless one is given */
@Composable
fun T(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
    align: TextAlign? = null,
    balance: Boolean = false,
    ellipsis: Boolean = maxLines != Int.MAX_VALUE,
) = T(AnnotatedString(text), style, modifier, color, maxLines, align, balance, ellipsis)

@Composable
fun T(
    text: AnnotatedString,
    style: TextStyle,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
    align: TextAlign? = null,
    balance: Boolean = false,
    ellipsis: Boolean = maxLines != Int.MAX_VALUE,
) {
    val c = if (color != Color.Unspecified) color else LocalContentColor.current
    androidx.compose.material3.Text(
        text,
        modifier,
        color = c,
        style = style.wrap(balance).let { if (align != null) it.copy(textAlign = align) else it },
        maxLines = maxLines,
        overflow = if (ellipsis) TextOverflow.Ellipsis else TextOverflow.Clip,
    )
}

/** text with <b> and entities; strong: the colour of the bold parts, where it differs */
@Composable
fun M(
    html: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
    align: TextAlign? = null,
    balance: Boolean = false,
    strong: Color = Color.Unspecified,
) = T(
    markup(
        html,
        androidx.compose.ui.text
            .SpanStyle(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = strong),
    ),
    style,
    modifier,
    color,
    maxLines,
    align,
    balance,
)

/** what is drawn inside takes this colour, as currentColor did */
@Composable
fun Ink(
    color: Color,
    content: @Composable () -> Unit,
) = CompositionLocalProvider(LocalContentColor provides color, content = content)

@Composable
fun Gap(h: Dp) = Spacer(Modifier.size(h))

// == Recipes ==

@Composable
fun Label(
    text: String,
    modifier: Modifier = Modifier,
    top: Dp = Space.s5,
) = T(text, Type.smallStrong, modifier.padding(top = top, bottom = Space.s2), colors.muted)

@Composable
fun Hint(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = colors.muted,
    bottom: Dp = Space.s3, // none as the last thing in a group
) = M(text, Type.small, modifier.padding(bottom = bottom), color)

@Composable
fun Card(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.l))
            .background(colors.surface)
            .padding(start = Space.gutter, top = Space.gutter, end = Space.gutter, bottom = Space.s2),
    ) {
        CompositionLocalProvider(LocalRaise provides colors.surface2) { content() }
    }
}

/** a card under its label, as in the settings: rows with icons, or pad for anything else */
@Composable
fun Group(
    modifier: Modifier = Modifier,
    pad: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.l))
            .background(colors.surface)
            .padding(if (pad) PaddingValues(Space.s4) else PaddingValues(Space.s4, Space.s1)),
    ) {
        CompositionLocalProvider(LocalRaise provides colors.surface2) { content() }
    }
}

@Composable
fun LabelledGroup(
    label: String,
    pad: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    if (label.isNotEmpty()) Label(label)
    Group(pad = pad, content = content)
}

/** a hairline from where the text column starts, so pictures form a column of their own */
@Composable
fun Divider(at: Dp = 0.dp) {
    Box(
        Modifier
            .padding(start = at)
            .fillMaxWidth()
            .size(height = Size.hairline, width = 0.dp)
            .fillMaxWidth()
            .background(colors.line),
    )
}

/** rows in a list, a divider between them from text */
@Composable
fun <T> Rows(
    items: List<T>,
    at: (T) -> Dp = { 0.dp },
    row: @Composable (T) -> Unit,
) {
    items.forEachIndexed { i, x ->
        if (i > 0) Divider(at(x))
        row(x)
    }
}

/** .row: a picture, the text, an end; a button when it has an action */
@Composable
fun ListRow(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    label: String? = null,
    minHeight: Dp = Size.tap,
    top: Boolean = false,
    gap: Dp = Space.s3,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier
            .fillMaxWidth()
            .press(onClick, Motion.PRESS_WIDE, label = label)
            .heightIn(min = minHeight)
            .padding(vertical = Space.s3),
        horizontalArrangement = Arrangement.spacedBy(gap),
        verticalAlignment = if (top) Alignment.Top else Alignment.CenterVertically,
        content = content,
    )
}

/** the title in at most two lines, the line under it wraps */
@Composable
fun RowScope.TMain(
    title: String,
    sub: String = "",
    subColor: Color = colors.muted,
    subLines: Int = Int.MAX_VALUE,
    extra: @Composable ColumnScope.() -> Unit = {},
) {
    Column(Modifier.weight(1f)) {
        M(title, Type.bodyStrong, maxLines = 2)
        if (sub.isNotEmpty()) {
            M(
                sub,
                Type.small,
                Modifier.padding(top = Space.hair),
                subColor,
                maxLines = subLines,
            )
        }
        extra()
    }
}

/** an icon in the lead column of a settings row */
@Composable
fun Lead(
    icon: String,
    width: Dp = Size.picS,
    color: Color = colors.muted,
) {
    Box(Modifier.width(width), contentAlignment = Alignment.Center) { Icon(icon, color = color) }
}

/** an icon in place of a picture: a circle in its tone */
@Composable
fun Sign(
    icon: String,
    tone: Tone? = null,
) {
    Box(
        Modifier
            .size(Size.picM)
            .clip(CircleShape)
            .background(tone?.cs ?: raise),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, color = tone?.c ?: colors.muted) }
}

@Composable
fun Chevron() = Icon("chevron", size = Size.iconS, color = colors.faint)

enum class BtnKind { PRIMARY, SOFT, QUIET, PLAIN, DANGER, ARMED }

@Composable
fun Btn(
    label: String,
    kind: BtnKind,
    modifier: Modifier = Modifier,
    icon: String? = null,
    enabled: Boolean = true,
    busy: Boolean = false,
    fill: Boolean = true,
    nowrap: Boolean = false,
    onClick: () -> Unit,
) {
    val p = colors
    val (bg, fg) =
        when (kind) {
            BtnKind.PRIMARY -> p.accent to p.onAccent
            BtnKind.SOFT -> raise to p.ink
            BtnKind.QUIET -> Color.Transparent to p.bad
            BtnKind.PLAIN -> Color.Transparent to p.accentInk
            BtnKind.DANGER -> p.badSoft to p.bad
            BtnKind.ARMED -> p.bad to p.onAccent
        }
    val on = enabled && !busy
    Row(
        modifier
            .then(if (fill) Modifier.fillMaxWidth() else Modifier)
            .press(onClick, Motion.PRESS_WIDE, on)
            .alpha(if (on) 1f else Alpha.BUSY)
            .clip(RoundedCornerShape(Radius.m))
            .background(bg)
            .heightIn(min = Size.control)
            .padding(horizontal = Space.s4, vertical = Space.s3),
        horizontalArrangement = Arrangement.spacedBy(Space.s2, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Ink(fg) {
            if (busy) {
                Wait()
            } else if (icon != null) {
                Icon(icon, size = Size.iconS)
            }
            T(label, Type.bodyStrong, align = TextAlign.Center, maxLines = if (nowrap) 1 else Int.MAX_VALUE, ellipsis = false)
        }
    }
}

@Composable
fun IconBtn(
    icon: String,
    label: String,
    modifier: Modifier = Modifier,
    color: Color = colors.muted,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .size(Size.tap)
            .press(onClick, label = label)
            .clip(CircleShape),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, color = color) }
}

/** the knob springs over, the colour follows */
@Composable
fun Switch(on: Boolean) {
    val p = colors
    val move = if (reduceMotion) snap() else tween<Float>(Motion.STEP, easing = Motion.spring)
    val x by animateFloatAsState(if (on) 18f else 0f, move, label = "knob")
    val fade = if (reduceMotion) snap() else tween<Color>(Motion.FADE, easing = Motion.easeOut)
    val track by animateColorAsState(if (on) p.accent else p.surface, fade, label = "track")
    val knob by animateColorAsState(if (on) p.onAccent else p.muted, fade, label = "knob colour")
    Box(
        Modifier
            .size(46.dp, 28.dp)
            .clip(RoundedCornerShape(50))
            .background(track)
            .then(if (on) Modifier else Modifier.border(Size.hairline, p.line, RoundedCornerShape(50))),
    ) {
        Box(
            Modifier
                .offset(3.dp + x.dp, 3.dp)
                .size(22.dp)
                .clip(CircleShape)
                .background(knob),
        )
    }
}

@Composable
fun Chip(
    label: String,
    modifier: Modifier = Modifier,
    pressed: Boolean = false,
    icon: String? = null,
    iconColor: Color? = null,
    lead: (@Composable () -> Unit)? = null,
    end: (@Composable () -> Unit)? = null,
    toned: Tone? = null,
    onClick: (() -> Unit)?,
) {
    val p = colors
    val fade = if (reduceMotion) snap() else tween<Color>(Motion.FADE, easing = Motion.easeOut)
    val on = if (toned != null) toned.cs else p.accent
    val bg by animateColorAsState(if (pressed) on else raise, fade, label = "chip")
    val fg by animateColorAsState(if (pressed && toned == null) p.onAccent else p.ink, fade, label = "chip ink")
    val ring by animateColorAsState(if (pressed && toned != null) toned.c else Color.Transparent, fade, label = "chip ring")
    Row(
        modifier
            .press(onClick)
            .semantics { selected = pressed }
            .clip(RoundedCornerShape(50))
            .background(bg)
            .border(Size.stroke, ring, RoundedCornerShape(50))
            .heightIn(min = Size.tapS)
            .padding(horizontal = Space.s4, vertical = Space.s2),
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Ink(fg) {
            lead?.invoke()
            if (icon != null) Icon(icon, size = Size.iconS, color = if (pressed && toned == null) fg else iconColor ?: fg)
            T(label, Type.smallStrong, maxLines = 1)
            end?.invoke()
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Chips(
    modifier: Modifier = Modifier,
    content: @Composable FlowRowScope.() -> Unit,
) = FlowRow(
    modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.spacedBy(Space.s2),
    verticalArrangement = Arrangement.spacedBy(Space.s2),
    content = content,
)

/** Scrolls sideways edge to edge in its card; fades out where a chip is cut off */
@Composable
fun Rail(
    modifier: Modifier = Modifier,
    gutter: Dp = Space.gutter,
    content: @Composable RowScope.() -> Unit,
) {
    val scroll = rememberScrollState()
    val fade = Space.s7
    Row(
        modifier
            .padding(horizontal = 0.dp)
            .offset(x = 0.dp)
            .layoutWide(gutter)
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()
                val f = fade.toPx()
                val start = (scroll.value.toFloat() / f).coerceIn(0f, 1f) * f
                val end = ((scroll.maxValue - scroll.value).toFloat() / f).coerceIn(0f, 1f) * f
                if (start > 0f) {
                    drawRect(
                        Brush.horizontalGradient(listOf(Color.Transparent, Color.Black), 0f, start),
                        size = this.size.copy(width = start),
                        blendMode = BlendMode.DstIn,
                    )
                }
                if (end > 0f) {
                    drawRect(
                        Brush.horizontalGradient(listOf(Color.Black, Color.Transparent), size.width - end, size.width),
                        topLeft =
                            androidx.compose.ui.geometry
                                .Offset(size.width - end, 0f),
                        size = this.size.copy(width = end),
                        blendMode = BlendMode.DstIn,
                    )
                }
            }.horizontalScroll(scroll)
            .padding(horizontal = gutter),
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/** wider than its parent by the gutter on both sides, as a negative margin made it */
fun Modifier.layoutWide(gutter: Dp) =
    layout { measurable, constraints ->
        val extra = (gutter * 2).roundToPx()
        val wide =
            if (constraints.hasBoundedWidth) {
                constraints.copy(minWidth = constraints.minWidth + extra, maxWidth = constraints.maxWidth + extra)
            } else {
                constraints
            }
        val p = measurable.measure(wide)
        layout(p.width - extra, p.height) { p.place(-(gutter.roundToPx()), 0) }
    }

/** equal parts; a long word takes the room it needs, and what no longer fits goes to a second line */
class SegOption(
    val value: String,
    val label: String,
    val icon: String? = null,
    val onClick: (() -> Unit)? = null,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Seg(
    options: List<SegOption>,
    current: String?,
    modifier: Modifier = Modifier,
    onPick: (String) -> Unit,
) {
    val p = colors
    FlowRow(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.m))
            .background(p.surface2)
            .padding(Space.s1),
        horizontalArrangement = Arrangement.spacedBy(Space.s1),
        verticalArrangement = Arrangement.spacedBy(Space.s1),
    ) {
        for (o in options) {
            val on = o.value == current
            val fade = if (reduceMotion) snap() else tween<Color>(Motion.FADE, easing = Motion.easeOut)
            val bg by animateColorAsState(if (on) p.segOn else Color.Transparent, fade, label = "seg")
            val fg by animateColorAsState(if (on) p.ink else p.muted, fade, label = "seg ink")
            Row(
                Modifier
                    .weight(1f)
                    .press(o.onClick ?: { onPick(o.value) })
                    .semantics { selected = on }
                    .then(if (on) Modifier.shadowLow(RoundedCornerShape(Radius.s)) else Modifier)
                    .clip(RoundedCornerShape(Radius.s))
                    .background(bg)
                    .heightIn(min = Size.tapS)
                    .padding(horizontal = Space.s1, vertical = Space.s2),
                horizontalArrangement = Arrangement.spacedBy(Space.s2, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Ink(fg) {
                    if (o.icon != null) Icon(o.icon, size = Size.iconS)
                    T(o.label, Type.smallStrong, align = TextAlign.Center)
                }
            }
        }
    }
}

@Composable
fun Link(
    text: String,
    modifier: Modifier = Modifier,
    icon: String? = null,
    onClick: () -> Unit,
) {
    Row(
        modifier.press(onClick).padding(vertical = Space.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Ink(colors.accentInk) {
            if (icon != null) {
                Icon(icon, size = Size.iconS)
                Gap(Space.s2)
            }
            T(text, Type.smallStrong)
        }
    }
}

/** a card's heading with the way to its page at its end */
@Composable
fun CardHead(
    title: String,
    more: String = "Alle",
    label: String? = null,
    onMore: (() -> Unit)?,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .capTrim(Type.heading)
            .padding(bottom = Space.s1),
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
    ) {
        M(title, Type.heading, Modifier.weight(1f).alignByBaseline(), colors.ink, balance = true)
        if (onMore != null) {
            // the tap area reaches into the card's padding above, so the heading line keeps its height
            Row(
                Modifier
                    .alignByBaseline()
                    .bleed(Space.s3, Space.s2)
                    .offset(x = Space.s3)
                    .press(onMore, label = label)
                    .clip(RoundedCornerShape(Radius.m))
                    .heightIn(min = Size.tap)
                    .padding(horizontal = Space.s3),
                horizontalArrangement = Arrangement.spacedBy(Space.hair),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Ink(colors.accentInk) {
                    T(more, Type.smallStrong)
                    Icon("chevron", size = Size.iconS)
                }
            }
        }
    }
}

/** a card's heading, its room above the capitals trimmed so the inset looks as wide as at the sides */
@Composable
fun CardTitle(text: String) = M(text, Type.heading, Modifier.capTrim(Type.heading).padding(bottom = Space.s1), colors.ink, balance = true)

/** the line's room above the capitals cut away, as text-box: trim-start cap did */
fun Modifier.capTrim(style: TextStyle) =
    layout { m, c ->
        val p = m.measure(c)
        val base = p[androidx.compose.ui.layout.FirstBaseline]
        val cap = if (style.fontFamily == Faustina) 0.648f else 0.7f
        val trim =
            if (base ==
                androidx.compose.ui.layout.AlignmentLine.Unspecified
            ) {
                0
            } else {
                maxOf(0, (base - cap * style.fontSize.toPx()).toInt())
            }
        layout(p.width, p.height - trim) { p.place(0, -trim) }
    }

/** taller than the room it takes, as negative margins made it */
fun Modifier.bleed(
    top: Dp,
    bottom: Dp,
) = layout { m, c ->
    val p = m.measure(c)
    val t = top.roundToPx()
    layout(p.width, maxOf(0, p.height - t - bottom.roundToPx())) { p.place(0, -t) }
}

/** what ends a card: a line above, the action under it */
@Composable
fun CardBtn(
    label: String,
    icon: String? = null,
    onClick: () -> Unit,
) {
    Column(Modifier.padding(top = Space.s3)) {
        Divider()
        Row(
            Modifier
                .fillMaxWidth()
                .press(onClick, Motion.PRESS_WIDE)
                .heightIn(min = Size.controlL)
                .padding(vertical = Space.s3),
            horizontalArrangement = Arrangement.spacedBy(Space.s1, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Ink(colors.accentInk) {
                if (icon != null) Icon(icon, size = Size.iconS)
                T(label, Type.smallStrong)
            }
        }
    }
}

@Composable
fun Badge(
    text: String,
    modifier: Modifier = Modifier,
    icon: String? = null,
    tone: Tone? = null,
    bg: Color = colors.surface2,
    fg: Color = colors.ink,
) {
    Row(
        modifier
            .clip(RoundedCornerShape(50))
            .background(bg)
            .heightIn(min = Size.iconS + Space.s2)
            .padding(horizontal = Space.s2, vertical = Space.s1),
        horizontalArrangement = Arrangement.spacedBy(Space.s1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(icon, Modifier.offset(x = -Space.s1), Size.iconS, tone?.c ?: colors.muted)
        T(text, Type.captionStrong, color = fg, maxLines = 1)
    }
}

/** .box: a tappable block on the raise colour, or the accent */
@Composable
fun BoxBtn(
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    onClick: (() -> Unit)?,
    content: @Composable RowScope.() -> Unit,
) {
    val p = colors
    Row(
        modifier
            .fillMaxWidth()
            .press(onClick, Motion.PRESS_WIDE)
            .clip(RoundedCornerShape(Radius.m))
            .background(if (primary) p.accent else raise)
            .padding(Space.s3),
        horizontalArrangement = Arrangement.spacedBy(Space.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) { Ink(if (primary) p.onAccent else p.ink) { content() } }
}

@Composable
fun Banner(
    html: String,
    modifier: Modifier = Modifier,
) {
    M(
        html,
        Type.small,
        modifier
            .padding(bottom = Space.s4)
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.m))
            .background(colors.midSoft)
            .padding(Space.s3),
        colors.ink,
    )
}

enum class FieldKind { NORMAL, BARE, IN_ROW, CODE }

/** A text field as the old .field: the raise colour, an accent frame while it has the focus */
@Composable
fun Field(
    value: TextFieldValue,
    onChange: (TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    kind: FieldKind = FieldKind.NORMAL,
    keyboard: KeyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
    onDone: (() -> Unit)? = null,
    focus: FocusRequester? = null,
    label: String? = null,
    lead: (@Composable () -> Unit)? = null,
    end: (@Composable () -> Unit)? = null,
    enabled: Boolean = true,
    maxLength: Int = Int.MAX_VALUE,
    password: Boolean = false,
) {
    val p = colors
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val bare = kind == FieldKind.BARE
    val fade = if (reduceMotion) snap() else tween<Color>(Motion.FADE, easing = Motion.easeOut)
    val frame by animateColorAsState(if (focused && !bare) p.accent else Color.Transparent, fade, label = "frame")
    val bg by animateColorAsState(
        if (bare) {
            Color.Transparent
        } else if (focused) {
            p.surface
        } else {
            raise
        },
        fade,
        label = "field",
    )
    val code = kind == FieldKind.CODE
    val style =
        (if (code) Type.bodyStrong.copy(letterSpacing = Type.TRACK_CODE.em) else Type.body).copy(color = p.ink)
    val shape = RoundedCornerShape(Radius.m)
    BasicTextField(
        value,
        { if (it.text.length <= maxLength) onChange(if (code) it.copy(text = it.text.uppercase()) else it) },
        modifier
            .then(if (kind == FieldKind.IN_ROW) Modifier.width(130.dp) else Modifier.fillMaxWidth())
            .then(if (focus != null) Modifier.focusRequester(focus) else Modifier)
            .then(if (label != null) Modifier.semantics { contentDescription = label } else Modifier),
        enabled = enabled,
        textStyle = style,
        keyboardOptions = if (code) keyboard.copy(capitalization = KeyboardCapitalization.Characters) else keyboard,
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }, onGo = { onDone?.invoke() }, onSearch = { onDone?.invoke() }),
        singleLine = true,
        interactionSource = source,
        cursorBrush = SolidColor(p.accent),
        visualTransformation =
            if (password) {
                androidx.compose.ui.text.input
                    .PasswordVisualTransformation()
            } else {
                VisualTransformation.None
            },
        decorationBox = { inner ->
            Row(
                Modifier
                    .clip(shape)
                    .background(bg)
                    .border(if (bare) 0.dp else Size.stroke, frame, shape)
                    .heightIn(
                        min =
                            when (kind) {
                                FieldKind.BARE -> Size.tap
                                FieldKind.IN_ROW -> Size.tapS
                                else -> Size.control
                            },
                    ).padding(
                        when (kind) {
                            FieldKind.BARE -> PaddingValues(0.dp)
                            FieldKind.IN_ROW -> PaddingValues(Space.s4, Space.s2)
                            else -> PaddingValues(start = if (lead != null) Space.s3 else Space.s4, end = Space.s4)
                        },
                    ),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.s3),
            ) {
                lead?.invoke()
                Box(Modifier.weight(1f).padding(vertical = if (bare) 0.dp else Space.s1)) {
                    if (value.text.isEmpty() && placeholder.isNotEmpty()) {
                        T(placeholder, Type.body, color = p.muted, maxLines = 1)
                    }
                    inner()
                }
                end?.invoke()
            }
        },
    )
}

/** a search field: the magnifier inside at the start, a clear button once there is text */
@Composable
fun Search(
    value: TextFieldValue,
    onChange: (TextFieldValue) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    focus: FocusRequester? = null,
    onDone: (() -> Unit)? = null,
) {
    Field(
        value,
        onChange,
        modifier,
        placeholder,
        keyboard =
            KeyboardOptions(
                capitalization = KeyboardCapitalization.Sentences,
                imeAction = androidx.compose.ui.text.input.ImeAction.Search,
            ),
        focus = focus,
        onDone = onDone,
        lead = { Icon("search", size = Size.iconS, color = colors.faint) },
        end =
            if (value.text.isNotEmpty()) {
                { Icon("close", Modifier.press({ onChange(TextFieldValue("")) }, label = "Leeren"), Size.iconS, colors.muted) }
            } else {
                null
            },
    )
}

fun numberKeys() = KeyboardOptions(keyboardType = KeyboardType.Number)

/** waiting: a small bowl that fills again and again, or stands filled when nothing may move; nothing for a short wait */
@Composable
fun Wait(
    modifier: Modifier = Modifier,
    color: Color = LocalContentColor.current,
) {
    val still = reduceMotion
    val t = rememberInfiniteTransition(label = "wait")
    val shown by t.animateFloat(
        0f,
        1f,
        infiniteRepeatable(
            keyframes {
                durationMillis = Motion.PATIENCE + Motion.FADE + 3_600_000
                0f at Motion.PATIENCE
                1f at Motion.PATIENCE + Motion.FADE
                1f at durationMillis
            },
            RepeatMode.Restart,
        ),
        label = "shown",
    )
    val loop by t.animateFloat(
        0f,
        1f,
        InfiniteRepeatableSpec(tween(Motion.LONG, Motion.PATIENCE, LinearEasing), RepeatMode.Restart),
        label = "bowl",
    )
    Icon(
        "wait",
        modifier.alpha(shown),
        Size.iconS,
        color,
        fill = { if (still) 1f to Alpha.BUSY else bowlFill(loop) },
    )
}

// the bowl fills, stays, then fades: height share and opacity at a point of its loop
fun bowlFill(f: Float): Pair<Float, Float> {
    val ease = { x: Float -> Motion.easeOut.transform(x) }
    return when {
        f < 0.3f -> ease(f / 0.3f) to 0.9f * Alpha.BUSY
        f < 0.75f -> 1f to 0.9f * Alpha.BUSY
        else -> 1f to 0.9f * (1f - ease((f - 0.75f) / 0.25f)) * Alpha.BUSY
    }
}

/** a sheen running over a placeholder while it loads; still when nothing may move */
fun Modifier.shimmer(
    base: Color,
    light: Color,
    phase: () -> Float,
) = drawWithContent {
    val w = size.width * 2.2f
    val x = -w + (1.2f - phase() * 2.2f) * size.width
    drawRect(
        Brush.horizontalGradient(
            0.2f to base,
            0.45f to light,
            0.7f to base,
            startX = x + size.width,
            endX = x + size.width + w,
        ),
    )
}

@Composable
fun shimmerPhase(): () -> Float {
    if (reduceMotion) return { 0.5f }
    val t = rememberInfiniteTransition(label = "shimmer")
    val f = t.animateFloat(0f, 1f, infiniteRepeatable(tween(Motion.LONG, easing = LinearEasing)), label = "phase")
    return { f.value }
}

/** a line of text still to come, as tall as the text */
@Composable
fun Skel(
    width: Float,
    modifier: Modifier = Modifier,
    height: Dp = 13.dp,
) {
    val p = colors
    val phase = shimmerPhase()
    Box(
        modifier
            .padding(vertical = Space.s1)
            .fillMaxWidth(width)
            .size(height = height, width = 0.dp)
            .fillMaxWidth(width)
            .clip(RoundedCornerShape(Radius.s))
            .shimmer(p.surface2, p.line, phase),
    )
}

/** an empty state: a sketch beside a line */
@Composable
fun Empty(
    text: String,
    sketch: String = "empty",
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.padding(top = Space.hair, bottom = Space.s3),
        horizontalArrangement = Arrangement.spacedBy(Space.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Sketch(sketch, color = colors.faint)
        M(text, Type.body, Modifier.weight(1f), colors.muted)
    }
}

/** a fixed-size circle in a tone, holding what is given */
@Composable
fun Disc(
    size: Dp,
    bg: Color,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) = Box(
    modifier
        .size(size)
        .clip(CircleShape)
        .background(bg),
    contentAlignment = Alignment.Center,
    content = content,
)

fun Modifier.minTap() = defaultMinSize(Size.tap, Size.tap)

fun Modifier.page() = widthIn(max = Space.pageWidth)
