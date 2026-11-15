package de.schmeckts.app.views

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import de.schmeckts.app.Block
import de.schmeckts.app.GOOD
import de.schmeckts.app.House
import de.schmeckts.app.Model
import de.schmeckts.app.NO
import de.schmeckts.app.OBSERVATIONS
import de.schmeckts.app.PROVIDERS
import de.schmeckts.app.Phone
import de.schmeckts.app.Pt
import de.schmeckts.app.RATINGS
import de.schmeckts.app.Ratings
import de.schmeckts.app.Rec
import de.schmeckts.app.Shelf
import de.schmeckts.app.Side
import de.schmeckts.app.Sort
import de.schmeckts.app.Stat
import de.schmeckts.app.Tally
import de.schmeckts.app.VERDICTS
import de.schmeckts.app.addDays
import de.schmeckts.app.ago
import de.schmeckts.app.andList
import de.schmeckts.app.asString
import de.schmeckts.app.at
import de.schmeckts.app.cap
import de.schmeckts.app.clockStr
import de.schmeckts.app.dateOf
import de.schmeckts.app.dayKey
import de.schmeckts.app.dayLabel
import de.schmeckts.app.dayMonth
import de.schmeckts.app.esc
import de.schmeckts.app.imageOf
import de.schmeckts.app.isObservation
import de.schmeckts.app.jsRound
import de.schmeckts.app.monthOf
import de.schmeckts.app.observationOf
import de.schmeckts.app.pets
import de.schmeckts.app.pname
import de.schmeckts.app.rOf
import de.schmeckts.app.rateTone
import de.schmeckts.app.scaleOf
import de.schmeckts.app.score
import de.schmeckts.app.servedAt
import de.schmeckts.app.sideOf
import de.schmeckts.app.timeOf
import de.schmeckts.app.typeOf
import de.schmeckts.app.ui.Alpha
import de.schmeckts.app.ui.Badge
import de.schmeckts.app.ui.Btn
import de.schmeckts.app.ui.BtnKind
import de.schmeckts.app.ui.Divider
import de.schmeckts.app.ui.Gap
import de.schmeckts.app.ui.Icon
import de.schmeckts.app.ui.ListRow
import de.schmeckts.app.ui.LocalRaise
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.M
import de.schmeckts.app.ui.Palette
import de.schmeckts.app.ui.Radius
import de.schmeckts.app.ui.RateSlider
import de.schmeckts.app.ui.Seg
import de.schmeckts.app.ui.SegOption
import de.schmeckts.app.ui.Sign
import de.schmeckts.app.ui.Size
import de.schmeckts.app.ui.Skel
import de.schmeckts.app.ui.Space
import de.schmeckts.app.ui.T
import de.schmeckts.app.ui.TMain
import de.schmeckts.app.ui.Type
import de.schmeckts.app.ui.colors
import de.schmeckts.app.ui.photoSource
import de.schmeckts.app.ui.press
import de.schmeckts.app.ui.tone
import de.schmeckts.app.ui.watch
import de.schmeckts.app.whenStr
import de.schmeckts.app.yearOf
import androidx.compose.ui.geometry.Size as Area

// Building blocks shared by the views

fun times(
    k: Int,
    n: Int,
) = if (n == 1) {
    "einmal"
} else if (k < n) {
    "$k von $n Mal"
} else if (n == 2) {
    "beide Male"
} else {
    "alle $n Mal"
}

// Ratings in words, never as a percentage. Each falls on a side (good, poor, between); the majority side is named,
// by its level if it holds only one.
private val SIDES: List<Pair<(Int) -> Boolean, String>> =
    listOf(
        { v: Int -> v >= GOOD } to "gut gefressen",
        { v: Int -> v < NO } to "kaum gefressen",
        { v: Int -> v in NO until GOOD } to "nur zum Teil gefressen",
    )

fun evidenceOf(x: Tally): String {
    if (x.n == 0) return "Noch nicht bewertet"
    val levels = x.counts.keys.sortedByDescending { RATINGS.getValue(it).score }
    if (levels.size == 1) return cap("${times(x.n, x.n)} ${RATINGS.getValue(levels[0]).said}")
    if (x.n ==
        2
    ) {
        return "Einmal ${once(listOf(RATINGS.getValue(levels[0]).said, RATINGS.getValue(levels[1]).said)).joinToString(", einmal ")}"
    }
    val sides =
        SIDES
            .map { (on, word) ->
                val l = levels.filter { on(RATINGS.getValue(it).score) }
                l.sumOf { x.counts.getValue(it) } to (if (l.size == 1) RATINGS.getValue(l[0]).said else word)
            }.filter { it.first > 0 }
            .sortedByDescending { it.first }
    if (sides[0].first * 2 > x.n) return cap("${times(sides[0].first, x.n)} ${sides[0].second}")
    return "Mal so, mal so: ${once(sides.map { it.second }).mapIndexed { i, said -> "${sides[i].first}× $said" }.joinToString(", ")}"
}

// a closing word all phrases share is said once, at the end: „einmal fast alles, einmal die Hälfte gefressen“
private fun once(phrases: List<String>): List<String> {
    val end = " " + phrases.last().split(" ").last()
    return if (phrases.all { it.endsWith(end) }) {
        phrases.mapIndexed { i, p ->
            if (i <
                phrases.size - 1
            ) {
                p.dropLast(end.length)
            } else {
                p
            }
        }
    } else {
        phrases
    }
}

fun lower(t: String) = if (t.isEmpty()) t else t.substring(0, 1).lowercase() + t.substring(1)

// A variety's ratings in words, each pet counted on its own, or three meals for two would read as six. Only the pets
// that decided the verdict are told, unless all.
fun Phone.whyOf(
    e: Sort,
    all: Boolean = false,
): String {
    val rated = e.pets.keys.filter { (e.pets.getValue(it).n > 0) && derive.inFilter(it) && derive.getPet(it) != null }
    val by =
        if (all) {
            emptyList()
        } else if (e.verdict == "nachkaufen") {
            e.yes
        } else if (e.verdict == "nicht") {
            e.no
        } else {
            emptyList()
        }
    val ids = rated.filter { by.isEmpty() || it in by }
    if (ids.isEmpty()) return evidenceOf(e)
    if (rated.size < 2) return evidenceOf(e.pets.getValue(ids[0]))
    val said = ids.map { lower(evidenceOf(e.pets.getValue(it))) }
    if (said.all { it == said[0] }) return "Bei ${if (ids.size == 2 && rated.size == 2) "beiden" else derive.petNames(ids)} ${said[0]}"
    return cap(ids.mapIndexed { i, id -> "bei ${derive.getPet(id)!!.str("name")} ${said[i]}" }.joinToString(", "))
}

// what a variety that goes down badly, or that nobody buys any more, has to show for itself when it is served
fun Phone.record(e: Sort?) = if (e != null && e.n > 0 && (e.choice == "nicht" || sideOf(e) == "flop")) whyOf(e) else ""

fun Phone.verdictLabel(x: Tally): String =
    if (x.verdict == "gemischt") {
        val (yes, no) =
            when (x) {
                is Sort -> x.yes to x.no
                is House -> x.yes to x.no
                else -> emptyList<String>() to emptyList()
            }
        "Gemischt: ${derive.petNames(yes)} ja, ${derive.petNames(no)} nein"
    } else {
        VERDICTS.getValue(x.verdict)
    }

// == Pieces of the screen ==

/** picture sizes, as the old .av modifiers: the side and the type of an initial */
enum class Av(
    val side: Dp,
) {
    XS(Size.picXs),
    S(Size.picS),
    M(Size.picM),
    L(Size.picL),
    XL(Size.picXl),
    XXL(Size.picXxl),
    XXXL(Size.picXxxl),
    ;

    val style: TextStyle
        get() =
            when (this) {
                XS -> Type.captionStrong
                S -> Type.smallStrong
                M -> Type.subheading
                L, XL -> Type.heading
                XXL, XXXL -> Type.title
            }
    val large get() = this == XXL || this == XXXL
}

@Composable
fun Avatar(
    pet: Rec?,
    av: Av = Av.M,
    modifier: Modifier = Modifier,
) {
    watch()
    if (pet == null) return
    val ui = LocalUi.current
    val img = imageOf(pet.str("photo"))
    Box(
        modifier
            .size(av.side)
            .clip(CircleShape)
            .background(colors.surface2),
        contentAlignment = Alignment.Center,
    ) {
        if (img != null) {
            Image(img, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            // two cats without a photo would look alike: their initials tell them apart
            val others =
                ui.phone.db.pets
                    .any { it.id != pet.id && it.str("photo").isNullOrEmpty() }
            val initial = (pet.str("name") ?: "").trim().take(1).uppercase()
            if (others && initial.isNotEmpty()) {
                T(initial, av.style, color = colors.muted)
            } else {
                Icon("cat", size = av.side * 0.58f, color = colors.muted, stroke = if (av.large) Size.STROKE_L else Size.STROKE)
            }
        }
    }
}

/** thumbnail sizes: m 40, the default 48, xl 56 */
enum class Th(
    val side: Dp,
) {
    M(Size.picM),
    L(Size.picL),
    XL(Size.picXl),
}

/** letter: the brand's initial where there is no photo; off where another packaging covers it */
@Composable
fun Thumb(
    s: Rec?,
    p: Rec?,
    th: Th = Th.L,
    modifier: Modifier = Modifier,
    letter: Boolean = true,
) {
    watch()
    val src = p?.str("thumb")?.ifEmpty { null } ?: s?.str("thumb")
    val img = imageOf(src)
    Box(
        modifier
            .size(th.side)
            .clip(RoundedCornerShape(Radius.s))
            .background(colors.surface2),
        contentAlignment = Alignment.Center,
    ) {
        when {
            img != null -> Image(img, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            p == null -> Icon("camera", size = th.side * 0.46f, color = colors.faint)
            !letter -> {}
            else ->
                T(
                    (p.str("brand")?.ifEmpty { null } ?: p.str("variety")?.ifEmpty { null } ?: "?").trim().take(1).uppercase(),
                    if (th == Th.M) Type.subheading else Type.heading,
                    color = colors.muted,
                )
        }
    }
}

fun photoKey(
    s: Rec?,
    p: Rec?,
) = "${s?.id ?: ""}|${p?.id ?: ""}"

/** the thumbnail, a button that opens the photo large where there is one */
@Composable
fun PhotoThumb(
    s: Rec?,
    p: Rec?,
    th: Th = Th.L,
) {
    watch()
    val ui = LocalUi.current
    if (!ui.phone.photos.hasPhoto(s, p)) return Thumb(s, p, th)
    val key = photoKey(s, p)
    Box(
        Modifier
            .press(ui.on("view-photo", "s" to (s?.id ?: ""), "p" to (p?.id ?: "")), label = "Foto vergrößern")
            .alpha(if (ui.photoBusy == key) Alpha.BUSY else 1f)
            .photoSource(ui.viewer, key),
    ) { Thumb(s, p, th) }
}

private fun seenText(via: String?) =
    when (via) {
        null -> ""
        "server" -> "vom Server erkannt"
        "phone" -> "auf dem Handy gelesen"
        else -> PROVIDERS[via]?.let { "von ${it.name} erkannt" } ?: ""
    }

/** a meal's name and what to say under it; in the sheet the type and who recognised the photo */
@Composable
fun RowScope.NameBlock(
    s: Rec,
    p: Rec?,
    inSheet: Boolean = false,
) {
    watch()
    val ph = LocalUi.current.phone
    val status = s.str("status")
    if (status == "recognizing" || status == "reading") {
        Column(Modifier.weight(1f)) {
            Skel(0.68f, height = 16.dp)
            T(
                if (status ==
                    "reading"
                ) {
                    "Packung wird gelesen …"
                } else {
                    "Sorte wird erkannt …"
                },
                Type.small,
                Modifier.padding(top = Space.hair),
                colors.muted,
            )
        }
        return
    }
    if (p == null) {
        val guess = s.obj("guess")
        val read = guess?.get("variety").asString?.ifEmpty { null } ?: guess?.get("brand").asString?.ifEmpty { null }
        val sub =
            if (read != null) {
                "Vermutlich <b>${esc(read)}</b>, tippen zum Bestätigen"
            } else {
                when (status) {
                    "waiting" -> "Wird erkannt, sobald der Server erreichbar ist"
                    "failed" -> "Nicht erkannt, tippen zum Benennen"
                    else -> "Tippen zum Benennen"
                }
            }
        // noserver is local mode, not an error
        TMain("Unbekannte Sorte", sub, if (status == "waiting" || status == "noserver") colors.muted else colors.bad)
        return
    }
    val meta =
        listOf(
            if (!p.str("variety").isNullOrEmpty()) p.str("brand") ?: "" else "",
            if (inSheet) typeOf(p) else whenStr(s.servedAt),
            if (inSheet) seenText(ph.recognize.seenBy[s.id]) else "",
        ).filter { it.isNotEmpty() }.joinToString(", ")
    TMain(esc(pname(p)), esc(meta))
}

@Composable
private fun RateBadge(r: String) {
    watch()
    val t = colors.tone(rateTone(r))
    Badge(RATINGS.getValue(r).label, Modifier.padding(bottom = Space.s2), icon = "r_$r", tone = t)
}

/** A level from another scale (the type changed) shows as a badge above the slider */
@Composable
fun RateSliderFor(
    s: Rec,
    pid: String,
) {
    watch()
    val ui = LocalUi.current
    val d = ui.phone.derive
    val scale = scaleOf(d.getProduct(s.str("productId")))
    val cur = rOf(s.pets[pid])
    val pet = if (ui.phone.db.pets.size > 1) d.getPet(pid) else null
    if (cur != null && cur !in scale) RateBadge(cur)
    RateSlider(scale, cur, if (pet != null) "Bewertung für ${pet.str("name")}" else "Bewertung", { ui.haptic("select") }) { r ->
        ui.act("rate", "s" to s.id, "p" to pid, "r" to r)
    }
}

@Composable
fun ScaleEnds(levels: List<String>) {
    watch()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        T(RATINGS.getValue(levels.first()).label, Type.caption, color = colors.muted)
        T(RATINGS.getValue(levels.last()).label, Type.caption, color = colors.muted)
    }
}

/** a ring around a small avatar, in the tone of its rating */
@Composable
private fun Mini(
    pet: Rec?,
    r: String?,
) {
    watch()
    val ring = r?.let { colors.tone(rateTone(it))?.c } ?: colors.line
    val ground = colors.surface
    Box(
        Modifier.drawBehind {
            val st = Size.stroke.toPx()
            drawCircle(ring, size.minDimension / 2 + 2 * st)
            drawCircle(ground, size.minDimension / 2 + st)
        },
    ) { Avatar(pet, Av.XS) }
}

@Composable
fun ResultBadges(s: Rec) {
    watch()
    val d = LocalUi.current.phone.derive
    val ids = d.servingPets(s)
    if (ids.size == 1) {
        val r = rOf(s.pets[ids[0]])
        Box(Modifier.semantics { contentDescription = if (r != null) RATINGS.getValue(r).label else "Noch nicht bewertet" }) {
            if (r != null) Icon("r_$r", color = colors.tone(rateTone(r))?.c ?: colors.muted) else Icon("unrated", color = colors.muted)
        }
        return
    }
    Row(Modifier.padding(horizontal = Space.s1), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
        for (pid in ids) Mini(d.getPet(pid), rOf(s.pets[pid]))
    }
}

/** no arming: it can be undone from the toast */
@Composable
fun DeleteMealBtn(id: String) {
    watch()
    val ui = LocalUi.current
    Btn("Eintrag löschen", BtnKind.QUIET, Modifier.padding(top = Space.s3), icon = "trash", onClick = ui.on("delete-serving", "id" to id))
}

fun Phone.forWhom(pet: String?) =
    if (db.pets.size >
        1
    ) {
        " für ${if (pet != null) esc(derive.getPet(pet)?.str("name")) else "alle Katzen"}"
    } else {
        ""
    }

/** option: value, label, icon, own action */
class Opt(
    val value: String,
    val label: String,
    val icon: String? = null,
    val action: String? = null,
)

@Composable
fun Segmented(
    action: String,
    options: List<Opt>,
    current: String?,
) {
    watch()
    val ui = LocalUi.current
    Seg(options.map { SegOption(it.value, it.label, it.icon, ui.on(it.action ?: action, "v" to it.value)) }, current) {}
}

/** tap twice instead of a confirmation dialog */
@Composable
fun ArmBtn(
    key: String,
    label: String,
    armedLabel: String,
    icon: String = "trash",
    kind: BtnKind = BtnKind.DANGER,
    modifier: Modifier = Modifier,
) {
    watch()
    val ui = LocalUi.current
    val on = ui.sheet?.get("armed") == key
    Btn(if (on) armedLabel else label, if (on) BtnKind.ARMED else kind, modifier, icon = icon, onClick = ui.on("arm", "then" to key))
}

// pets rated in one tone keep it, as Nur Soße and Ein bissl average out below it
private fun sameTone(rs: List<String>) = rs.all { rateTone(it) == rateTone(rs[0]) }

private fun toneOfScore(v: Double) =
    de.schmeckts.app
        .scoreCls(v)
        .removePrefix("r-")

// treats are not meals; anything else, unknown food included, counts as one
fun Phone.fedLabel(items: List<Rec>): String {
    val fed = items.filter { !isObservation(it) }
    val seen = items.size - fed.size
    val snacks = fed.count { !it.str("productId").isNullOrEmpty() && typeOf(derive.getProduct(it.str("productId"))) == "Snack" }
    val meals = fed.size - snacks
    return listOfNotNull(
        if (meals > 0) (if (meals == 1) "1\u00a0Mahlzeit" else "$meals\u00a0Mahlzeiten") else null,
        if (snacks > 0) (if (snacks == 1) "1\u00a0Snack" else "$snacks\u00a0Snacks") else null,
        if (seen > 0) (if (seen == 1) "1\u00a0Beobachtung" else "$seen\u00a0Beobachtungen") else null,
    ).joinToString(", ")
}

fun Phone.whoObserved(ids: List<String>) = andList(ids.mapNotNull { derive.getPet(it)?.str("name") }, "oder")

/** a meal as a bar: its height the points, averaged over the pets on it; or an open slot */
private class Bar(
    val tone: String?,
    val v: Double?,
)

private fun Phone.barOf(s: Rec): Bar {
    val rs = derive.servingPets(s).mapNotNull { rOf(s.pets[it]) }
    if (rs.isEmpty()) return Bar(null, null)
    val v = rs.sumOf { RATINGS.getValue(it).score }.toDouble() / rs.size
    return Bar(if (sameTone(rs)) rateTone(rs[0]) else toneOfScore(v), v / 100)
}

@Composable
private fun Bars(
    bars: List<Bar>,
    plus: Boolean,
    plusFirst: Boolean = false,
) {
    watch()
    val p = colors
    Row(Modifier.height(Size.meter), horizontalArrangement = Arrangement.spacedBy(Space.hair), verticalAlignment = Alignment.Bottom) {
        val more: @Composable () -> Unit = { T("+", Type.captionStrong, Modifier.align(Alignment.CenterVertically), p.muted) }
        if (plus && plusFirst) more()
        for (b in bars) {
            if (b.v == null) {
                Box(
                    Modifier
                        .width(Size.meterW)
                        .height(Size.meter)
                        .border(Size.hairline, p.muted, RoundedCornerShape(50)),
                )
            } else {
                Box(
                    Modifier
                        .width(Size.meterW)
                        .height(Size.meterW + (Size.meter - Size.meterW) * b.v.toFloat())
                        .clip(RoundedCornerShape(50))
                        .background(p.tone(b.tone)?.c ?: p.faint),
                )
            }
        }
        if (plus && !plusFirst) more()
    }
}

private val WEEKDAYS = listOf("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")

/** two weeks from last Monday, or with week the seven days up to today in one row */
@Composable
fun Calendar(
    list: List<Rec>,
    week: Boolean = false,
    modifier: Modifier = Modifier,
    top: Dp = Space.s4,
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val p = colors
    val byDay = LinkedHashMap<String, MutableList<Rec>>()
    for (s in list) byDay.getOrPut(dayKey(timeOf(s))) { mutableListOf() }.add(s)
    val now =
        de.schmeckts.app.Time
            .now()
    val noon = de.schmeckts.app.atHour(now, 12)
    val wd = (de.schmeckts.app.weekday(noon) + 6) % 7
    val first = addDays(noon, -(if (week) 6 else wd + 7))
    val todayKey = dayKey(now)
    val days = (0 until if (week) 7 else 14).map { addDays(first, it) }
    Column(modifier.padding(top = top, bottom = Space.s3)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.hair)) {
            for (d in days.take(7)) {
                T(
                    WEEKDAYS[(de.schmeckts.app.weekday(d) + 6) % 7],
                    Type.captionStrong,
                    Modifier.weight(1f).padding(bottom = Space.s1),
                    p.muted,
                    align = TextAlign.Center,
                )
            }
        }
        var future = false
        for (row in days.chunked(7)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.hair)) {
                for (d in row) {
                    val k = dayKey(d)
                    val items = byDay[k].orEmpty()
                    val today = k == todayKey
                    val label = dayLabel(d) + if (items.isNotEmpty()) ", " + ph.fedLabel(items) else ", nichts eingetragen"
                    val later = future
                    Column(
                        Modifier
                            .weight(1f)
                            .testTag("day-$k")
                            .clip(RoundedCornerShape(Radius.s))
                            .then(
                                if (items.isNotEmpty()) {
                                    Modifier.press(ui.on("jump-day", "day" to k), label = label)
                                } else {
                                    Modifier.semantics {
                                        contentDescription = label
                                        disabled() // a day without entries is no button
                                    }
                                },
                            ).alpha(if (later) de.schmeckts.app.ui.Alpha.DIM else 1f)
                            .padding(top = Space.s1, bottom = Space.s2),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(Space.s1),
                    ) {
                        Box(
                            Modifier
                                .size(Size.picS)
                                .then(if (today) Modifier.border(Size.stroke, p.ink, CircleShape) else Modifier),
                            contentAlignment = Alignment.Center,
                        ) {
                            T(
                                de.schmeckts.app
                                    .dateOf(d)
                                    .toString(),
                                (if (items.isNotEmpty() || today) Type.smallStrong else Type.small).copy(fontFeatureSettings = "tnum"),
                                color = if (items.isNotEmpty() || today) p.ink else p.muted,
                            )
                        }
                        Bars(items.take(3).map { if (isObservation(it)) Bar(null, null) else ph.barOf(it) }, items.size > 3)
                    }
                    if (today) future = true
                }
            }
        }
    }
}

private const val STRIP = 8

/** ratings oldest first; open: ratings the verdict still lacks, drawn hollow. The label says it in words. */
@Composable
fun Strip(
    r: Ratings,
    open: Int = 0,
) {
    watch()
    if (r.keys.isEmpty()) return
    val counts = r.keys.groupingBy { it }.eachCount()
    val said =
        evidenceOf(de.schmeckts.app.Counted(r.keys.size, counts)) +
            (if (open > 0) ", noch ${if (open == 1) "eine Bewertung" else "zwei Bewertungen"} offen" else "")
    Box(Modifier.semantics { contentDescription = said }) {
        Bars(
            r.keys.takeLast(STRIP).map { Bar(rateTone(it), RATINGS.getValue(it).score / 100.0) } + List(open) { Bar(null, null) },
            r.more || r.keys.size > STRIP,
            plusFirst = true,
        )
    }
}

// == Marks of „Vorlieben“: a rating is a dot filled as far as the bowl was eaten, a variety a square in its band's tone ==

private val OFTEN =
    listOf(
        "einmal",
        "zweimal",
        "dreimal",
        "viermal",
        "fünfmal",
        "sechsmal",
        "siebenmal",
        "achtmal",
        "neunmal",
        "zehnmal",
        "elfmal",
        "zwölfmal",
    )

fun often(n: Int) = if (n == 0) "nie" else OFTEN.getOrNull(n - 1) ?: "$n Mal"

/** days from, to exclusive: „4. bis 10. Oktober“, „27. September bis 3. Oktober“ */
fun spanOf(
    from: Long,
    to: Long,
): String {
    val last = addDays(to, -1)
    val head = if (monthOf(from) == monthOf(last) && yearOf(from) == yearOf(last)) "${dateOf(from)}." else dayMonth(from)
    return "$head bis ${dayMonth(last)}"
}

// what a mark stands on: the page or a card
private val groundColor: Color
    @Composable get() = if (LocalRaise.current != null) colors.surface else colors.bg

/** r: null for a rating still to come */
@Composable
fun RatingDot(r: String?) {
    watch()
    val p = colors
    val c = r?.let { p.tone(rateTone(it))?.c }
    val share = if (r != null) score(r) / 100f else 0f
    Canvas(Modifier.size(Size.dot)) {
        val half = size.minDimension / 2
        if (c == null) {
            val w = Size.hairline.toPx()
            drawCircle(p.muted, half - w / 2, style = Stroke(w))
            return@Canvas
        }
        val w = Size.stroke.toPx()
        val inner = half - w / 2
        if (share > 0f) {
            clipPath(Path().apply { addOval(Rect(center, inner)) }) {
                val h = 2 * inner * share
                drawRect(c, Offset(0f, center.y + inner - h), Area(size.width, h))
            }
        }
        drawCircle(c, inner, style = Stroke(w))
    }
}

/** keys oldest first; open: ratings still to come; split: the dot after a wider gap; said: the row tells it in words */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DotRow(
    keys: List<String>,
    open: Int = 0,
    more: Boolean = false,
    split: Int = -1,
    said: Boolean = true,
    modifier: Modifier = Modifier,
) {
    watch()
    if (keys.isEmpty() && open == 0) return
    val words =
        if (said) {
            null
        } else {
            evidenceOf(de.schmeckts.app.Counted(keys.size, keys.groupingBy { it }.eachCount())) +
                (if (open > 0) ", noch ${if (open == 1) "eine Bewertung" else "zwei Bewertungen"} offen" else "")
        }
    FlowRow(
        modifier.clearAndSetSemantics { if (words != null) contentDescription = words },
        horizontalArrangement = Arrangement.spacedBy(Space.s1),
        verticalArrangement = Arrangement.spacedBy(Space.s1),
    ) {
        val mid = Modifier.align(Alignment.CenterVertically)
        if (more) T("+", Type.captionStrong, mid, colors.muted)
        keys.forEachIndexed { i, k -> Box(mid.padding(start = if (i == split) Space.s1 else 0.dp)) { RatingDot(k) } }
        repeat(open) { Box(mid) { RatingDot(null) } }
    }
}

/** A variety's ratings: one row for one cat, else a row for each cat that rated it, led by its picture. of: which of a
 cat's ratings, newest first. */
@Composable
fun DotLines(
    m: Model,
    e: Sort,
    modifier: Modifier = Modifier,
    open: Int = 0,
    pets: List<String> = m.pets,
    of: (Stat) -> List<Pt> = { it.window },
) {
    watch()
    val lines =
        pets.mapNotNull { pid ->
            val x = e.pets[pid] ?: return@mapNotNull null
            val l = of(x)
            if (l.isEmpty()) null else Triple(pid, l.reversed().map { it.r }, x.list.size > l.size)
        }
    if (m.pets.size <= 1) {
        val l = lines.firstOrNull()
        return DotRow(l?.second.orEmpty(), open, l?.third == true, modifier = modifier)
    }
    if (lines.isEmpty()) return
    val d = LocalUi.current.phone.derive
    Column(modifier.clearAndSetSemantics {}, verticalArrangement = Arrangement.spacedBy(Space.s1)) {
        for ((pid, keys, more) in lines) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(d.getPet(pid), Av.XS)
                Gap(Space.s2)
                DotRow(keys, more = more)
            }
        }
    }
}

private fun bands(s: Shelf) =
    listOf(
        Triple(s.buy, "nachkaufen", "good"),
        Triple(s.meh, "geht so", "mid"),
        Triple(s.stop, "nicht mehr kaufen", "bad"),
        Triple(s.open, "noch offen", null),
    )

/** a band's square, filled in its tone, or an open outline */
@Composable
fun Swatch(tone: String?) {
    watch()
    val p = colors
    val c = p.tone(tone)?.c
    Canvas(Modifier.size(Size.dot)) {
        if (c != null) {
            drawRect(c)
        } else {
            val w = Size.hairline.toPx()
            drawRect(p.muted, Offset(w / 2, w / 2), Area(size.width - w, size.height - w), style = Stroke(w))
        }
    }
}

/** The varieties of Einkaufen by band, a square each, or one bar where they would take more than two lines */
@Composable
fun ShelfBar(
    shelf: Shelf,
    legend: Boolean,
    modifier: Modifier = Modifier,
) {
    watch()
    val list = bands(shelf)
    val total = list.sumOf { it.first }
    if (total == 0) return
    val p = colors
    val said = "Von $total Sorten: ${list.filter { it.first > 0 }.joinToString(", ") { "${it.first} ${it.second}" }}."
    Column(modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = said }) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val per = ((maxWidth + Space.s1) / (Size.dot + Space.s1)).toInt().coerceAtLeast(1)
            if (total > 2 * per) {
                val last = list.indexOfLast { it.first > 0 }
                Canvas(Modifier.fillMaxWidth().height(Size.meter)) {
                    val w = Size.hairline.toPx()
                    val gap = Space.hair.toPx()
                    val h = size.height
                    drawRoundRect(p.muted, Offset(w / 2, w / 2), Area(size.width - w, h - w), CornerRadius((h - w) / 2), style = Stroke(w))
                    clipPath(Path().apply { addRoundRect(RoundRect(0f, 0f, size.width, h, CornerRadius(h / 2))) }) {
                        var x = 0f
                        list.forEachIndexed { i, (k, _, tone) ->
                            val seg = size.width * k / total
                            val c = p.tone(tone)?.c
                            if (k > 0 && c != null) drawRect(c, Offset(x, 0f), Area(seg - if (i < last) gap else 0f, h))
                            x += seg
                        }
                    }
                }
            } else {
                val rows = (total + per - 1) / per
                val fills = list.flatMap { (k, _, tone) -> List(k) { p.tone(tone)?.c } }
                Canvas(Modifier.fillMaxWidth().height(Size.dot * rows + Space.s1 * (rows - 1))) {
                    val d = Size.dot.toPx()
                    val step = d + Space.s1.toPx()
                    val w = Size.hairline.toPx()
                    fills.forEachIndexed { i, c ->
                        val at = Offset(i % per * step, i / per * step)
                        if (c != null) {
                            drawRect(c, at, Area(d, d))
                        } else {
                            drawRect(p.muted, at + Offset(w / 2, w / 2), Area(d - w, d - w), style = Stroke(w))
                        }
                    }
                }
            }
        }
        if (legend) {
            Gap(Space.s2)
            ShelfLegend(shelf)
        }
    }
}

/** shelf: each band with its count; null: the words alone, under several tallies */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ShelfLegend(shelf: Shelf?) {
    watch()
    val list =
        if (shelf != null) {
            bands(shelf).filter { it.first > 0 }
        } else {
            bands(Shelf(0, 0, 0, 0)).map { if (it.third == null) it.copy(second = "offen") else it }
        }
    FlowRow(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Space.s3),
        verticalArrangement = Arrangement.spacedBy(Space.s1),
    ) {
        for ((k, word, tone) in list) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s1)) {
                Swatch(tone)
                if (shelf != null) {
                    T("$k $word", Type.small.copy(fontFeatureSettings = "tnum"), color = colors.ink)
                } else {
                    T(word, Type.caption, color = colors.muted)
                }
            }
        }
    }
}

/** how one side's meals went down, by tone, each in proportion */
@Composable
fun OutcomeBar(
    x: Side,
    modifier: Modifier = Modifier,
) {
    watch()
    val p = colors
    val parts = listOf(x.good to p.good, x.mid to p.mid, x.sauce to p.sauce, x.bad to p.bad).filter { it.first > 0 }
    Canvas(modifier.fillMaxWidth().height(Size.meter).clip(RoundedCornerShape(50))) {
        val n = parts.sumOf { it.first }
        if (n == 0) return@Canvas
        val gap = Space.hair.toPx()
        val room = size.width - gap * (parts.size - 1)
        var at = 0f
        for ((k, c) in parts) {
            val w = room * k / n
            drawRect(c, Offset(at, 0f), Area(w, size.height))
            at += w + gap
        }
    }
}

/** one side of a comparison: what it says, as markup, and its meals */
class Compared(
    val text: String,
    val side: Side,
)

@Composable
fun CompareBars(
    a: Compared,
    b: Compared?,
) {
    watch()
    Column(verticalArrangement = Arrangement.spacedBy(Space.s3)) {
        for (l in listOfNotNull(a, b)) {
            Column {
                M(l.text, Type.small, color = colors.ink)
                Gap(Space.s1)
                OutcomeBar(l.side)
            }
        }
    }
}

private fun weekSaid(w: Block): String {
    val head = "Woche vom ${spanOf(w.from, w.to)}: "
    if (w.n == 0) return head + "nichts bewertet."
    val ate =
        listOfNotNull(
            "${often(w.n)} bewertet",
            if (w.good > 0) "${often(w.good)} gut gefressen" else null,
            if (w.mid > 0) "${often(w.mid)} die Hälfte" else null,
            if (w.sauce + w.bad > 0) "${often(w.sauce + w.bad)} kaum" else null,
        )
    val noted =
        OBSERVATIONS.keys.mapNotNull { k ->
            val label = observationOf(k).label
            w.seen[k]?.let { "${often(it)} ${if (k == "stink") label else lower(label)}" }
        }
    return head + ate.joinToString(", ") + ". Zu erwarten waren etwa ${jsRound(w.expected)}." +
        (if (noted.isNotEmpty()) " Notiert: ${noted.joinToString(", ")}." else "")
}

// bottom up good, mid, sauce, bad, as tall as its share of the busiest week; the line what its varieties led to expect
private fun DrawScope.drawWeek(
    w: Block,
    most: Int,
    p: Palette,
    ground: Color,
) {
    val h = size.height
    val gap = Space.hair.toPx()
    val parts = listOf(w.good to p.good, w.mid to p.mid, w.sauce to p.sauce, w.bad to p.bad).filter { it.first > 0 }
    val room = h * w.n / most - gap * (parts.size - 1).coerceAtLeast(0)
    var y = h
    for ((k, c) in parts) {
        val s = room * k / w.n
        drawRect(c, Offset(0f, y - s), Area(size.width, s))
        y -= s + gap
    }
    if (!w.judged) {
        val l = Size.hairline.toPx()
        drawRect(p.muted, Offset(l / 2, l / 2), Area(size.width - l, h - l), style = Stroke(l))
    }
    if (w.n == 0) return
    val at = h - (h * w.expected / most).toFloat()
    val over = Space.s1.toPx()
    val st = Size.stroke.toPx()
    drawLine(ground, Offset(-over, at), Offset(size.width + over, at), st + 2 * Size.hairline.toPx())
    drawLine(p.ink, Offset(-over, at), Offset(size.width + over, at), st)
}

/** a column a week, oldest first, the notes of each under it */
@Composable
fun WeekChart(
    weeks: List<Block>,
    ground: Color = groundColor,
) {
    watch()
    if (weeks.isEmpty()) return
    val p = colors
    val most = weeks.maxOf { it.n }.coerceAtLeast(1)
    val first = weeks[0].from
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val k = weeks.size
        val col = minOf((maxWidth - Space.s2 * (k - 1)) / k, Size.picXl)
        Column(Modifier.width(col * k + Space.s2 * (k - 1))) {
            Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                weeks.forEachIndexed { i, w ->
                    Canvas(
                        Modifier
                            .width(col)
                            .height(Size.chart)
                            .testTag("week-${k - 1 - i}")
                            .semantics { contentDescription = weekSaid(w) },
                    ) { drawWeek(w, most, p, ground) }
                }
            }
            Box(Modifier.fillMaxWidth().height(Size.hairline).background(p.line))
            if (weeks.any { it.seen.isNotEmpty() }) {
                Row(Modifier.padding(top = Space.s1), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                    for (w in weeks) {
                        Column(
                            Modifier.width(col),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(Space.hair),
                        ) {
                            for (kind in OBSERVATIONS.keys) {
                                val n = w.seen[kind] ?: continue
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(Space.hair),
                                ) {
                                    Icon(observationOf(kind).icon, size = Size.iconXs, color = p.tone(kind)?.c ?: p.muted)
                                    if (n > 1) T("$n", Type.caption.copy(fontFeatureSettings = "tnum"), color = p.muted)
                                }
                            }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = Space.s1), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                T("ab ${dateOf(first)}.${monthOf(first)}.", Type.caption.copy(fontFeatureSettings = "tnum"), Modifier.weight(1f), p.muted)
                T("bis heute", Type.caption, color = p.muted)
            }
        }
    }
}

private const val PACK_SHOWN = 4

/** the packagings of a group fanned out, the first on top */
@Composable
fun PackThumbs(
    ids: List<String>,
    ground: Color = groundColor,
) {
    watch()
    val d = LocalUi.current.phone.derive
    val list = ids.take(PACK_SHOWN)
    Box(Modifier.clearAndSetSemantics {}) {
        list.forEachIndexed { i, id ->
            Thumb(
                null,
                d.getProduct(id),
                Th.M,
                Modifier
                    .zIndex((list.size - i).toFloat())
                    .padding(start = Space.s3 * i)
                    .drawBehind {
                        val st = Size.stroke.toPx()
                        drawRoundRect(
                            ground,
                            Offset(-st, -st),
                            Area(size.width + 2 * st, size.height + 2 * st),
                            CornerRadius(
                                Radius.s.toPx() + st,
                            ),
                        )
                    },
                letter = i == 0,
            )
        }
    }
}

class DayGroup(
    val key: String,
    val t: Long,
    val items: MutableList<Rec>,
)

fun dayGroups(list: List<Rec>): List<DayGroup> {
    val groups = mutableListOf<DayGroup>()
    for (s in list) {
        val k = dayKey(timeOf(s))
        val g = groups.lastOrNull()
        if (g != null && g.key == k) g.items.add(s) else groups.add(DayGroup(k, timeOf(s), mutableListOf(s)))
    }
    return groups
}

/** a day's line: its name, what it holds */
@Composable
fun DayLine(
    g: DayGroup,
    modifier: Modifier = Modifier,
) {
    watch()
    val ph = LocalUi.current.phone
    Row(
        modifier
            .fillMaxWidth()
            .padding(top = Space.s3, bottom = Space.hair)
            .padding(bottom = Space.hair),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        T(dayLabel(g.t), Type.subheading, Modifier.weight(1f, fill = false).padding(end = Space.s2))
        T(ph.fedLabel(g.items), Type.small, color = colors.muted)
    }
}

// the columns of the history page's timeline, time and then the node on the line, in em of the small type, so the
// line stays centred on the dot at any font size
private val tlTime: Dp
    @Composable get() = with(androidx.compose.ui.platform.LocalDensity.current) { (Type.small.fontSize.toPx() * 3.5f).toDp() }
private val tlNode: Dp
    @Composable get() = with(androidx.compose.ui.platform.LocalDensity.current) { (Type.small.fontSize.toPx() * 2f).toDp() }

/** plain: rows as in any card, the time in the small line; else the history page's timeline of times and dots */
@Composable
fun DayItems(
    g: DayGroup,
    multiHouse: Boolean = false,
    plain: Boolean = false,
) {
    watch()
    val p = colors
    val x0 = tlTime + tlNode / 2
    Column {
        g.items.forEachIndexed { i, x ->
            if (plain && i > 0) Divider(Size.picM + Space.s3)
            val line =
                if (plain) {
                    Modifier
                } else {
                    Modifier.drawBehind {
                        val mid = x0.toPx()
                        val w = Size.stroke.toPx()
                        if (i > 0) drawLine(p.line, Offset(mid, 0f), Offset(mid, size.height / 2), w)
                        if (i < g.items.size - 1) drawLine(p.line, Offset(mid, size.height / 2), Offset(mid, size.height), w)
                    }
                }
            Box(line) {
                if (isObservation(x)) ObservationItem(x, multiHouse, plain) else ServingItem(x, multiHouse, plain)
            }
        }
    }
}

@Composable
private fun TimeNode(
    t: Long,
    node: @Composable () -> Unit,
) {
    watch()
    T(
        clockStr(t),
        Type.smallStrong.copy(fontFeatureSettings = "tnum"),
        Modifier.width(tlTime),
        colors.muted,
        align = TextAlign.End,
        maxLines = 1,
    )
    Box(Modifier.width(tlNode), contentAlignment = Alignment.Center) { node() }
}

@Composable
private fun Node(tone: String?) {
    watch()
    val p = colors
    val ground = p.surface
    val c = p.tone(tone)?.c
    Box(
        Modifier
            .size(12.dp)
            .drawBehind {
                val r = size.minDimension / 2
                drawCircle(ground, r + Size.stroke.toPx())
                if (c != null) drawCircle(c, r) else drawCircle(p.faint, r - Size.stroke.toPx() / 2, style = Stroke(Size.stroke.toPx()))
            },
    )
}

@Composable
private fun ObservationItem(
    o: Rec,
    multiHouse: Boolean,
    plain: Boolean,
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val kind = observationOf(o.str("kind"))
    val ids = ph.derive.observedPets(o)
    val meta =
        listOf(
            if (plain) clockStr(o.at) else "",
            if (multiHouse || ids.size > 1) ph.whoObserved(ids) else "",
            o.str("by")?.let { if (it.isNotEmpty()) "von $it" else "" } ?: "",
        ).filter { it.isNotEmpty() }.joinToString(", ")
    ListRow(Modifier.testTag("row-${o.id}"), onClick = ui.on("open-observation", "id" to o.id), gap = if (plain) Space.s3 else 0.dp) {
        if (!plain) TimeNode(o.at) { Node(null) }
        Box(Modifier.padding(start = if (plain) 0.dp else Space.s2, end = if (plain) 0.dp else Space.s3)) {
            Sign(kind.icon, colors.tone(o.str("kind")))
        }
        TMain(esc(kind.label), esc(meta))
    }
}

@Composable
private fun ServingItem(
    s: Rec,
    multiHouse: Boolean,
    plain: Boolean,
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val p = ph.derive.getProduct(s.str("productId"))
    val ids = ph.derive.servingPets(s)
    val meta =
        listOf(
            if (p != null && !p.str("variety").isNullOrEmpty()) p.str("brand") ?: "" else "",
            if (plain) clockStr(s.servedAt) else "",
            if (multiHouse) "für " + ph.derive.petNames(ids) else "",
            s.str("by")?.let { if (it.isNotEmpty()) "von $it" else "" } ?: "",
        ).filter { it.isNotEmpty() }.joinToString(", ")
    val title =
        if (p != null) {
            esc(pname(p))
        } else {
            when (s.str("status")) {
                "recognizing" -> "Wird erkannt …"
                "reading" -> "Wird gelesen …"
                else -> "Unbekannte Sorte"
            }
        }
    val note = s.str("note") ?: ""
    ListRow(Modifier.testTag("row-${s.id}"), onClick = ui.on("open-serving", "id" to s.id), gap = if (plain) Space.s3 else 0.dp) {
        if (!plain) TimeNode(s.servedAt) { ph.barOf(s).let { Node(it.tone) } }
        Box(Modifier.padding(start = if (plain) 0.dp else Space.s2, end = if (plain) 0.dp else Space.s3)) { Thumb(s, p, Th.M) }
        Column(Modifier.weight(1f).padding(end = if (plain) 0.dp else Space.s2)) {
            M(title, Type.bodyStrong, maxLines = 2)
            if (meta.isNotEmpty()) M(esc(meta), Type.small, Modifier.padding(top = Space.hair), colors.muted)
            if (note.isNotEmpty()) {
                T("„$note“", Type.small.copy(fontStyle = FontStyle.Italic), Modifier.padding(top = Space.hair), colors.muted)
            }
        }
        ResultBadges(s)
    }
}

/** a row that tells: its picture, what it says and why, as markup */
@Composable
fun ToldRow(
    pic: @Composable () -> Unit,
    say: String,
    why: String = "",
) {
    watch()
    ListRow(top = true) {
        pic()
        Column(Modifier.weight(1f)) {
            M(say, Type.body)
            if (why.isNotEmpty()) M(why, Type.small, Modifier.padding(top = Space.hair), colors.muted)
        }
    }
}

@Composable
fun ToldList(rows: List<@Composable () -> Unit>) {
    watch()
    rows.forEachIndexed { i, r ->
        if (i > 0) Divider(Size.picM + Space.s3)
        r()
    }
}

private fun waitingText(n: Int) = if (n > 0) "$n ${if (n == 1) "Änderung wartet" else "Änderungen warten"}" else ""

private val ERROR_TITLE = mapOf("auth" to "Code prüfen", "protocol" to "Update nötig", "locked" to "Kurz gesperrt")

// collections held back until the server is updated
private val HELD = mapOf("observations" to "Beobachtungen")

private fun Phone.heldText(): String {
    val kinds = sync.held().map { HELD[it.c] ?: "Neue Einträge" }.distinct()
    return if (kinds.isNotEmpty()) "${andList(kinds)} warten auf ein Update des Servers" else ""
}

class SyncInfo(
    val tone: String,
    val title: String,
    val detail: String,
)

fun Phone.syncInfo(): SyncInfo {
    val st = sync.status
    val wait = waitingText(sync.pending().size)
    return when (st.state) {
        "off" -> SyncInfo("off", "Nicht verbunden", "") // the foot says where the data stays
        "error" -> SyncInfo("bad", ERROR_TITLE[st.kind] ?: "Abgleich gestört", st.message)
        "offline" ->
            SyncInfo(
                "off",
                "Server nicht erreichbar",
                listOf(
                    wait,
                    if (st.lastOk >
                        0
                    ) {
                        "zuletzt abgeglichen " + ago(st.lastOk)
                    } else {
                        ""
                    },
                ).filter { it.isNotEmpty() }
                    .joinToString(", ")
                    .ifEmpty { "Bist du im WLAN zu Hause oder ist WireGuard an?" },
            )
        "wait" -> SyncInfo("ok", "Verbinde …", wait.ifEmpty { "Der Abgleich läuft." })
        else -> {
            val later = heldText()
            SyncInfo(
                "ok",
                "Verbunden",
                if (wait.isNotEmpty()) {
                    "$wait, wird gesendet …"
                } else if (later.isNotEmpty()) {
                    "Abgeglichen. $later."
                } else {
                    "Alles abgeglichen"
                },
            )
        }
    }
}

class ChipInfo(
    val label: String,
    val icon: String,
    val bad: Boolean,
)

fun Phone.syncChip(): ChipInfo? {
    val st = sync.status
    val n = sync.pending().size
    if (st.state == "error") return ChipInfo(ERROR_TITLE[st.kind] ?: "Abgleich gestört", "alert", true)
    if (st.state == "offline" && n > 0) return ChipInfo(waitingText(n), "clock", false)
    return null
}

/** A field of the sheet: what is typed goes to the sheet under key and to the control layer, as data-field did; id
 names it for the focus and for Enter. */
@Composable
fun SheetField(
    id: String,
    key: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    kind: de.schmeckts.app.ui.FieldKind = de.schmeckts.app.ui.FieldKind.NORMAL,
    keyboard: androidx.compose.foundation.text.KeyboardOptions =
        androidx.compose.foundation.text
            .KeyboardOptions(capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Sentences),
    label: String? = null,
    enabled: Boolean = true,
    maxLength: Int = Int.MAX_VALUE,
    password: Boolean = false,
    initial: String? = null,
    channel: String = "field",
    search: Boolean = false,
) {
    watch()
    val ui = LocalUi.current
    val s = ui.sheet
    val stored = if (channel == "field") (s?.get(key) as? String) ?: initial ?: "" else initial ?: ""
    val typed =
        de.schmeckts.app.ui
            .rememberTyped(s ?: ui, "$id/$channel", stored)
    val focus =
        androidx.compose.runtime.remember {
            androidx.compose.ui.focus
                .FocusRequester()
        }
    androidx.compose.runtime.LaunchedEffect(ui.wantFocus) {
        if (ui.wantFocus == id) {
            ui.wantFocus = null
            runCatching { focus.requestFocus() }
        }
    }
    de.schmeckts.app.ui.Field(
        typed.value,
        { v ->
            val changed = v.text != typed.value.text
            typed.value = v
            if (changed) {
                if (channel == "field") s?.set(key, v.text)
                ui.input(channel, key, v.text)
            }
        },
        modifier,
        placeholder,
        kind,
        keyboard,
        onDone = { ui.enter(id) },
        focus = focus,
        label = label,
        enabled = enabled,
        maxLength = maxLength,
        password = password,
        lead = if (search) ({ Icon("search", size = Size.iconS, color = colors.faint) }) else null,
        end =
            if (search && typed.value.text.isNotEmpty()) {
                {
                    Icon(
                        "close",
                        Modifier.press({
                            typed.value =
                                androidx.compose.ui.text.input
                                    .TextFieldValue("")
                            ui.input(channel, key, "")
                        }, label = "Leeren"),
                        Size.iconS,
                        colors.muted,
                    )
                }
            } else {
                null
            },
    )
}
