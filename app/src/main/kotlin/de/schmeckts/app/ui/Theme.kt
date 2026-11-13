package de.schmeckts.app.ui

import android.animation.ValueAnimator
import android.os.Build
import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import de.schmeckts.app.R

// The design tokens: the old css/tokens.css, one CSS px a dp, type in sp so it follows the system's font size.

class Palette(
    val dark: Boolean,
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val ink: Color,
    val muted: Color,
    val faint: Color, // decoration only, never meaningful text
    val line: Color,
    val accent: Color,
    val accentInk: Color, // accent as text
    val accentSoft: Color,
    val onAccent: Color, // also on the red confirm button
    val good: Color,
    val goodSoft: Color,
    val mid: Color,
    val midSoft: Color,
    val sauce: Color,
    val sauceSoft: Color,
    val bad: Color,
    val badSoft: Color,
    val stink: Color,
    val stinkSoft: Color,
    val hungry: Color,
    val hungrySoft: Color,
    val tired: Color,
    val tiredSoft: Color,
    val happy: Color,
    val happySoft: Color,
    val vomit: Color,
    val vomitSoft: Color,
    val paper: Color,
    val paperInk: Color,
    val paperMuted: Color,
    val paperBind: Color,
    val paperTorn: Color,
    val paperUnder: Color,
    val paperEdge: Color,
    val paperEdgeLine: Color,
    val paperCurl: Color,
    val paperShade: Color,
    val segOn: Color,
    val toastAction: Color,
    val sheen: Color,
    val backdrop: Color,
    val shadowLow: Color,
    val shadowHigh: Color,
    val shadowHighNear: Color,
    val mood: Float,
) {
    // fill of a field, chip, box or soft button on the ground; cards set surface2
    val raise get() = surface
}

private fun c(rgb: Long) = Color(0xFF000000 or rgb)

// #rrggbbaa as CSS writes it
private fun ca(rgba: Long) = Color(((rgba and 0xFF) shl 24) or (rgba ushr 8))

val LIGHT =
    Palette(
        dark = false,
        bg = c(0xeeede7),
        surface = c(0xfafaf6),
        surface2 = c(0xe4e3da),
        ink = c(0x25261f),
        muted = c(0x62625a),
        faint = c(0x9d9d92),
        line = c(0xd8d7cd),
        accent = c(0x58603f),
        accentInk = c(0x4a5134),
        accentSoft = c(0xdee0d7),
        onAccent = c(0xffffff),
        good = c(0x476651),
        goodSoft = c(0xd9dfd8),
        mid = c(0x8a6822),
        midSoft = c(0xe5dece),
        sauce = c(0x7a5a43),
        sauceSoft = c(0xe2dcd4),
        bad = c(0x8f3f43),
        badSoft = c(0xe9dcd9),
        stink = c(0x257070),
        stinkSoft = c(0xd3eeee),
        hungry = c(0x81526d),
        hungrySoft = c(0xf7e1ec),
        tired = c(0x51628d),
        tiredSoft = c(0xe0e8fb),
        happy = c(0x5a6b3c),
        happySoft = c(0xe3ecd7),
        vomit = c(0x6d5884),
        vomitSoft = c(0xece3f7),
        paper = c(0xf7f0dd),
        paperInk = c(0x3a3326),
        paperMuted = c(0x6b5f45),
        paperBind = c(0x846446),
        paperTorn = c(0xfcfaf3),
        paperUnder = c(0xebe3cd),
        paperEdge = c(0xece5d1),
        paperEdgeLine = c(0xcdc3ab),
        paperCurl = c(0xfffdf7),
        paperShade = ca(0x3a332640),
        segOn = c(0xfafaf6),
        toastAction = c(0xa9b283),
        sheen = ca(0xfafaf680),
        backdrop = ca(0x25261f66),
        shadowLow = ca(0x25261f1a),
        shadowHigh = ca(0x25261f4d),
        shadowHighNear = ca(0x25261f14),
        mood = 0.16f,
    )

val DARK =
    Palette(
        dark = true,
        bg = c(0x1b1c17),
        surface = c(0x25261f),
        surface2 = c(0x30312a),
        ink = c(0xecece3),
        muted = c(0xa6a699),
        faint = c(0x77776c),
        line = c(0x3b3c34),
        accent = c(0xa9b283),
        accentInk = c(0xa9b283),
        accentSoft = c(0x393b2e),
        onAccent = c(0x1b1c17),
        good = c(0x93bba0),
        goodSoft = c(0x333a30),
        mid = c(0xd2ae62),
        midSoft = c(0x413c2a),
        sauce = c(0xc49c7e),
        sauceSoft = c(0x3e392e),
        bad = c(0xd98c8e),
        badSoft = c(0x3e342f),
        stink = c(0x89cccb),
        stinkSoft = c(0x203c3c),
        hungry = c(0xdfadc8),
        hungrySoft = c(0x44303b),
        tired = c(0xabbdeb),
        tiredSoft = c(0x2f3649),
        happy = c(0xb4c696),
        happySoft = c(0x333a26),
        vomit = c(0xc8b3e1),
        vomitSoft = c(0x3b3245),
        paper = c(0x322d25),
        paperInk = c(0xece3cd),
        paperMuted = c(0xab9f86),
        paperBind = c(0x100f0d),
        paperTorn = c(0x3d372e),
        paperUnder = c(0x29251f),
        paperEdge = c(0x2b2620),
        paperEdgeLine = c(0x181612),
        paperCurl = c(0x4b4438),
        paperShade = ca(0x000000a6),
        segOn = c(0x3b3c34),
        toastAction = c(0x4a5134),
        sheen = ca(0xecece333),
        backdrop = ca(0x0b0c09b3),
        shadowLow = ca(0x0b0c094d),
        shadowHigh = ca(0x0b0c09a6),
        shadowHighNear = ca(0x0b0c0959),
        mood = 0.26f,
    )

/** A rating's or an observation's colour and its soft fill */
class Tone(
    val c: Color,
    val cs: Color,
)

fun Palette.tone(name: String?): Tone? =
    when (name) {
        "good" -> Tone(good, goodSoft)
        "mid" -> Tone(mid, midSoft)
        "sauce" -> Tone(sauce, sauceSoft)
        "bad" -> Tone(bad, badSoft)
        "stink" -> Tone(stink, stinkSoft)
        "hungry" -> Tone(hungry, hungrySoft)
        "tired" -> Tone(tired, tiredSoft)
        "happy" -> Tone(happy, happySoft)
        "vomit" -> Tone(vomit, vomitSoft)
        else -> null
    }

object Space {
    val hair = 2.dp
    val s1 = 4.dp
    val s2 = 8.dp
    val s3 = 12.dp
    val s4 = 16.dp
    val s5 = 20.dp
    val s6 = 24.dp
    val s7 = 32.dp
    val gutter = s5 // side margin of pages and sheets, card inset
    val pageWidth = 600.dp
}

object Radius {
    val s = 12.dp // small and nested
    val m = 16.dp // controls and boxes you tap
    val l = 24.dp // containers
    val paperTop = 3.dp // the calendar sheet
    val paperBottom = 6.dp
    val stamp = 5.dp
}

object Size {
    val iconXs = 12.dp // in a medal
    val iconS = 20.dp // inside controls
    val icon = 24.dp // on its own
    val iconM = 28.dp // a level on the rating slider
    val iconL = 32.dp // a rating as the content
    const val STROKE = 1.8f // icons at 20 and 24, sketches
    const val STROKE_L = 1.4f // icons at 32
    val tapS = 44.dp // choices side by side
    val tap = 48.dp // smallest tap target
    val control = 52.dp
    val controlL = 56.dp // feeding button, settings row
    val bar = 56.dp
    val picBadge = 18.dp
    val picXs = 24.dp
    val picS = 32.dp
    val picM = 40.dp
    val picL = 48.dp
    val picXl = 56.dp
    val picXxl = 72.dp
    val picXxxl = 112.dp
    val meter = 16.dp
    val meterW = 4.dp
    val hairline = 1.dp
    val stroke = 2.dp // every emphasised line
    val fieldRoom = 44.dp // the side of a field that holds an icon
}

object Alpha {
    const val DIM = 0.35f // days to come
    const val BUSY = 0.6f
}

object Motion {
    const val FADE = 200
    const val STEP = 300
    const val LONG = 1200 // loops: shimmer, bowl
    const val PATIENCE = 400 // a wait this short shows no loader
    const val STAGGER = 50
    const val PRESS = 0.95f
    const val PRESS_WIDE = 0.98f // rows, boxes, full-width buttons
    val easeOut = CubicBezierEasing(0.22f, 1f, 0.36f, 1f) // to arrive
    val easeIn = CubicBezierEasing(0.5f, 0f, 0.75f, 0f) // to leave
    val spring = CubicBezierEasing(0.34f, 1.45f, 0.64f, 1f) // to confirm
}

val Figtree =
    FontFamily(
        Font(R.font.figtree_400, FontWeight.Normal),
        Font(R.font.figtree_600, FontWeight.SemiBold),
    )
val Faustina =
    FontFamily(
        Font(R.font.faustina_600, FontWeight.SemiBold),
        Font(R.font.faustina_650, FontWeight(650)),
    )

// line height as CSS sets it: the leading split above and below, nothing added by the font
private fun type(
    family: FontFamily,
    weight: Int,
    size: Int,
    height: Float,
    track: Float = 0f,
) = TextStyle(
    fontFamily = family,
    fontWeight = FontWeight(weight),
    fontSize = size.sp,
    lineHeight = height.em,
    letterSpacing = track.em,
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None),
    platformStyle = PlatformTextStyle(includeFontPadding = false),
)

object Type {
    val title = type(Faustina, 650, 30, 1.1f, -0.015f)
    val heading = type(Faustina, 600, 21, 1.25f)
    val subheading = type(Faustina, 600, 16, 1.25f)
    val body = type(Figtree, 400, 16, 1.5f)
    val bodyStrong = type(Figtree, 600, 16, 1.5f)
    val small = type(Figtree, 400, 14, 1.4f) // secondary text
    val smallStrong = type(Figtree, 600, 14, 1.4f) // labels and small controls
    val caption = type(Figtree, 400, 12, 1.25f)
    val captionStrong = type(Figtree, 600, 12, 1.25f)
    const val TRACK_CODE = 0.14f // household code field
    const val TRACK_STAMP = 0.12f // the calendar's rubber stamp
}

val LocalPalette = staticCompositionLocalOf { LIGHT }
val LocalReduceMotion = staticCompositionLocalOf { false }

val colors: Palette
    @Composable @ReadOnlyComposable
    get() = LocalPalette.current

val reduceMotion: Boolean
    @Composable @ReadOnlyComposable
    get() = LocalReduceMotion.current

/** Animations switched off in the system's settings: then nothing moves */
fun motionOff(context: android.content.Context): Boolean =
    if (Build.VERSION.SDK_INT >= 26) {
        !ValueAnimator.areAnimatorsEnabled()
    } else {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }

/** theme: system, light or dark, as prefs keep it */
@Composable
fun isDark(theme: String) = if (theme == "system") isSystemInDarkTheme() else theme == "dark"

/** Material underneath, coloured through by the palette so none of its own defaults show */
@Composable
fun SchmecktsTheme(
    theme: String,
    content: @Composable () -> Unit,
) {
    val p = if (isDark(theme)) DARK else LIGHT
    val scheme =
        (if (p.dark) darkColorScheme() else lightColorScheme()).copy(
            primary = p.accent,
            onPrimary = p.onAccent,
            primaryContainer = p.accentSoft,
            onPrimaryContainer = p.accentInk,
            secondary = p.accent,
            onSecondary = p.onAccent,
            secondaryContainer = p.accentSoft,
            onSecondaryContainer = p.accentInk,
            tertiary = p.accent,
            onTertiary = p.onAccent,
            tertiaryContainer = p.accentSoft,
            onTertiaryContainer = p.accentInk,
            background = p.bg,
            onBackground = p.ink,
            surface = p.surface,
            onSurface = p.ink,
            surfaceVariant = p.surface2,
            onSurfaceVariant = p.muted,
            surfaceTint = Color.Transparent,
            surfaceBright = p.surface,
            surfaceDim = p.bg,
            surfaceContainerLowest = p.surface,
            surfaceContainerLow = p.surface,
            surfaceContainer = p.surface,
            surfaceContainerHigh = p.surface2,
            surfaceContainerHighest = p.surface2,
            inverseSurface = p.ink,
            inverseOnSurface = p.bg,
            inversePrimary = p.toastAction,
            error = p.bad,
            onError = p.onAccent,
            errorContainer = p.badSoft,
            onErrorContainer = p.bad,
            outline = p.line,
            outlineVariant = p.line,
            scrim = p.backdrop,
        )
    val typography =
        Typography(
            displayLarge = Type.title,
            displayMedium = Type.title,
            displaySmall = Type.title,
            headlineLarge = Type.title,
            headlineMedium = Type.heading,
            headlineSmall = Type.heading,
            titleLarge = Type.heading,
            titleMedium = Type.subheading,
            titleSmall = Type.smallStrong,
            bodyLarge = Type.body,
            bodyMedium = Type.body,
            bodySmall = Type.small,
            labelLarge = Type.smallStrong,
            labelMedium = Type.captionStrong,
            labelSmall = Type.caption,
        )
    val off = motionOff(LocalContext.current)
    CompositionLocalProvider(LocalPalette provides p, LocalReduceMotion provides off) {
        MaterialTheme(colorScheme = scheme, typography = typography, content = content)
    }
}
