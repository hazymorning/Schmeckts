package de.schmeckts.app.views

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import de.schmeckts.app.DAY
import de.schmeckts.app.Evaluation
import de.schmeckts.app.GoodCount
import de.schmeckts.app.Insight
import de.schmeckts.app.Model
import de.schmeckts.app.Phone
import de.schmeckts.app.Ranking
import de.schmeckts.app.Sort
import de.schmeckts.app.TEXTURES
import de.schmeckts.app.TasteRow
import de.schmeckts.app.Time
import de.schmeckts.app.Trend
import de.schmeckts.app.Trial
import de.schmeckts.app.andList
import de.schmeckts.app.cap
import de.schmeckts.app.esc
import de.schmeckts.app.goodOf
import de.schmeckts.app.observationOf
import de.schmeckts.app.pname
import de.schmeckts.app.poorOf
import de.schmeckts.app.ratingsIn
import de.schmeckts.app.shopGroups
import de.schmeckts.app.ui.Badge
import de.schmeckts.app.ui.Card
import de.schmeckts.app.ui.CardHead
import de.schmeckts.app.ui.CardTitle
import de.schmeckts.app.ui.Gap
import de.schmeckts.app.ui.IconBtn
import de.schmeckts.app.ui.Label
import de.schmeckts.app.ui.ListRow
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.M
import de.schmeckts.app.ui.SheetBody
import de.schmeckts.app.ui.Sign
import de.schmeckts.app.ui.Size
import de.schmeckts.app.ui.Space
import de.schmeckts.app.ui.T
import de.schmeckts.app.ui.TMain
import de.schmeckts.app.ui.Type
import de.schmeckts.app.ui.colors
import de.schmeckts.app.ui.tone
import de.schmeckts.app.whenStr

// Evaluation card and page. The analysis is in Smart.kt, this only words it

private val TEXTURE_SAID =
    mapOf(
        "pastete" to "Pastete",
        "sosse" to "Stückchen in Soße",
        "gelee" to "Stückchen in Gelee",
        "mousse" to "Mousse",
        "block" to "fester Block",
        "suppe" to "Suppe",
    )

private fun ofN(
    good: Int,
    n: Int,
) = "$good von $n"

private fun better(gap: Double) = if (gap > 0) "besser" else "schlechter"

// a group against the rest, which is named where it is one group
private val REST = mapOf("marke" to "andere Marken", "konsistenz" to "anderes Nassfutter")

private fun compared(
    ic: String,
    x: Insight,
): Told {
    val name = { key: Any? -> esc(if (x.kind == "konsistenz") TEXTURE_SAID[key] else key as String?) }
    val a = name(x.a.key)
    val b = if (x.b.key != null) name(x.b.key) else REST.getValue(x.kind)
    return Told(
        ic,
        "Bisher kommt <b>$a</b> ${better(x.gap)} an als $b.",
        "${cap(a)} <b>${ofN(x.a.good, x.a.n)} Mal</b> gut gefressen, $b ${ofN(x.b.good, x.b.n)} Mal.",
    )
}

@Suppress("UNCHECKED_CAST")
fun insightSaid(x: Insight): Told {
    val a = x.a
    val b = x.b
    return when (x.kind) {
        "marke" -> compared("tag", x)
        "geschmack" ->
            Told(
                "fish",
                "Bisher kommt <b>${esc(a.key as String)}</b> ${better(x.gap)} an als andere Sorten derselben Marke.",
                "Mit ${esc(a.key)} <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, ohne ${ofN(b.good, b.n)} Mal.",
            )
        "konsistenz" -> compared("layers", x)
        "sosse" ->
            Told(
                "drop",
                "Bei Stückchen in Soße wird oft nur die Soße geleckt.",
                "<b>${x.k} von ${x.n} Mal</b> nur die Soße." +
                    (x.instead?.let { " ${cap(TEXTURE_SAID.getValue(it.key))} dagegen ${ofN(it.good, it.n)} Mal gut gefressen." } ?: ""),
            )
        "wiederholung" ->
            Told(
                "repeat",
                "Zweimal hintereinander dieselbe Sorte kommt schlechter an.",
                "Beim zweiten Mal <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, sonst ${ofN(b.good, b.n)} Mal.",
            )
        "neu" ->
            Told(
                "sparkle",
                if (x.gap >
                    0
                ) {
                    "Neue Sorten kommen beim ersten Mal besser an als danach."
                } else {
                    "Neue Sorten brauchen eine Weile, danach läuft es besser."
                },
                "Beim ersten Mal <b>${ofN(a.good, a.n)}</b>, danach ${ofN(b.good, b.n)} Mal gut gefressen.",
            )
        "tageszeit" ->
            Told(
                if (x.gap > 0) "sun" else "moon",
                if (x.gap >
                    0
                ) {
                    "Die erste Mahlzeit am Tag kommt besser an als die letzte."
                } else {
                    "Die letzte Mahlzeit am Tag kommt besser an als die erste."
                },
                "Bei der ersten <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, bei der letzten ${ofN(b.good, b.n)} Mal.",
            )
        "snack" ->
            Told(
                "r_verputzt",
                "Nach einem Snack bleibt beim nächsten Napf öfter etwas stehen.",
                "Nach Snacks <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, sonst ${ofN(b.good, b.n)} Mal.",
            )
        else -> {
            val first = esc(a.key as String)
            val rest = esc(andList(b.key as List<String>))
            Told(
                "person",
                "Bei <b>$first</b> kommen dieselben Sorten besser an als bei $rest.",
                "Bei $first <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, bei $rest ${ofN(b.good, b.n)} Mal.",
            )
        }
    }
}

private const val PLACES = 5
private const val AWAY = 42 * DAY // a top unserved this long shows since when
private const val JUDGE = 4 // settled varieties before the portrait calls a pet picky or easy to please
private const val PICKS = 2 // varieties a side shows on the card
private const val SHOP_SHOWN = 3
private const val INSIGHTS = 3
private const val TRIALS = 3
private const val SPLIT = 5
private const val MOVED = 2 // max varieties told as moved
private val SIDES = mapOf("top" to "Tops", "flop" to "Flops")

private fun brandOf(p: de.schmeckts.app.Rec) = if (!p.str("variety").isNullOrEmpty()) p.str("brand") ?: "" else ""

// adds the brand where another variety has the same name
private fun Phone.nameOf(e: Sort): String {
    val p = e.product
    val twins = db.products.count { pname(it) == pname(p) } > 1
    return esc(pname(p)) + if (twins && !p.str("brand").isNullOrEmpty()) " von ${esc(p.str("brand"))}" else ""
}

private fun Phone.named(e: Sort) = "<b>${nameOf(e)}</b>"

private fun Phone.petsOf(ids: List<String>) = esc(derive.petNames(ids)) // in a sentence that already has its bold

// a pet on its own goes by any of its names; beside others by its own, so they stay apart
private fun Phone.petName(
    m: Model,
    id: String,
    place: String,
) = if (m.pets.size > 1) derive.getPet(id)?.str("name") ?: "" else derive.calledNames(listOf(id), place)

// all ratings when most agree with the row's side, otherwise only those of the pets that decide it
private fun Phone.saidOf(
    e: Sort,
    side: String,
): String {
    val good = goodOf(e.counts)
    val left = poorOf(e.counts)
    val agree = if (side == "top") good * 2 > e.n else left * 2 > e.n || (e.n - good - left) * 2 > e.n
    return whyOf(e, agree)
}

private fun lapse(
    at: Long,
    now: Long,
): String {
    val days = Math.floorDiv(now - at, DAY)
    return when {
        days < 60 -> "${days / 7} Wochen"
        days < 365 -> "${days / 30} Monaten"
        days < 730 -> "über einem Jahr"
        else -> "${days / 365} Jahren"
    }
}

private fun Phone.forPet(
    t: Trial,
    several: Boolean,
) = if (several) " für ${esc(derive.getPet(t.pet)?.str("name"))}" else ""

// what: how the variety is named in the sentence
private fun Phone.needs(
    t: Trial,
    several: Boolean,
    what: String,
) = "${if (several) {
    esc(
        derive.getPet(t.pet)?.str("name"),
    ) + " "
} else {
    ""
}}noch ${if (t.need == 1) "einmal" else "zweimal"} $what füttern und bewerten, dann steht’s fest"

// lists, with their empty sides, show once a side or a settled variety exists
private fun listed(r: Ranking) = r.top.isNotEmpty() || r.flop.isNotEmpty() || (r.settled > 0 && !r.stale)

// the variety an empty Tops side names, so „Als Nächstes“ leaves it out
private fun candidate(r: Ranking) = if (r.top.isNotEmpty() || r.stale) null else r.trials.firstOrNull()

private fun Phone.toRate(
    t: Trial,
    several: Boolean,
) = "noch ${t.need}×${forPet(t, several)} bewerten"

private fun Phone.onTheWay(
    t: Trial,
    several: Boolean,
) = "Auf gutem Weg: ${named(t.e)}, ${toRate(t, several)}"

private fun noneYet(r: Ranking) = "Bisher kommt keine Sorte${if (r.split.isNotEmpty()) " bei allen" else ""} richtig gut an."

private fun Phone.waiting(
    m: Model,
    r: Ranking,
): String =
    when {
        r.stale -> "Die letzten Bewertungen sind über ein halbes Jahr alt. Nach ein paar neuen steht hier wieder, was ankommt."
        r.settled > 0 && r.mid.isEmpty() ->
            "${esc(
                derive.petNames(
                    m.pets.filter { pid ->
                        r.split.any { (it.pets[pid]?.n ?: 0) > 0 }
                    },
                ),
            )} sind sich bisher bei keiner Sorte einig."
        r.settled > 0 -> "Bisher ist keine Sorte ein klarer Treffer oder Reinfall."
        else -> "Noch steht keine Sorte fest."
    }

/** the packaging, with a medal or a place on its corner */
@Composable
private fun Ranked(
    p: de.schmeckts.app.Rec,
    side: String,
    medal: Boolean = false,
    place: Int = 0,
) {
    val (ic, tone) = SIDE.getValue(side)
    val c = colors.tone(tone)!!.c
    val surface = colors.surface
    Box {
        Thumb(null, p)
        if (medal) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .offset(Space.s2, Space.s2)
                    .size(Size.picBadge)
                    .drawBehind { drawCircle(surface, size.minDimension / 2 + Size.stroke.toPx()) }
                    .clip(CircleShape)
                    .background(c),
                contentAlignment = Alignment.Center,
            ) {
                de.schmeckts.app.ui
                    .Icon(ic, size = Size.iconXs, color = colors.onAccent)
            }
        }
        if (place > 0) {
            Box(
                Modifier
                    .align(Alignment.TopStart)
                    .offset(-Space.s2, -Space.s2)
                    .heightIn(min = Size.picBadge)
                    .widthIn(min = Size.picBadge)
                    .drawBehind {
                        drawRoundRect(
                            surface,
                            androidx.compose.ui.geometry
                                .Offset(-Size.stroke.toPx(), -Size.stroke.toPx()),
                            androidx.compose.ui.geometry
                                .Size(size.width + 2 * Size.stroke.toPx(), size.height + 2 * Size.stroke.toPx()),
                            androidx.compose.ui.geometry
                                .CornerRadius(size.height),
                        )
                    }.clip(RoundedCornerShape(50))
                    .background(c),
                contentAlignment = Alignment.Center,
            ) { T("$place", Type.captionStrong.copy(fontFeatureSettings = "tnum"), color = colors.onAccent) }
        }
    }
}

/** A variety on the card: its packaging, the best of a side marked, how it went down, its ratings. t: a candidate for
 the Tops, which says what it lacks instead. */
@Composable
private fun SideRow(
    m: Model,
    e: Sort,
    side: String,
    first: Boolean,
    t: Trial? = null,
) {
    val ui = LocalUi.current
    val ph = ui.phone
    val p = e.product
    val brand = brandOf(p)
    val several = m.pets.size > 1
    val said = if (t != null) ph.toRate(t, several) else ph.saidOf(e, side)
    val label = "${pname(p)}${if (brand.isNotEmpty()) " von $brand" else ""}. ${cap(markupless(said))}."
    ListRow(onClick = ui.on("open-product", "id" to e.id), label = label) {
        Ranked(p, side, medal = first)
        TMain(esc(pname(p)), esc(cap(listOf(brand, lower(markupless(said))).filter { it.isNotEmpty() }.joinToString(", "))))
        Strip(ratingsIn(m, listOf(e.id)), if (t != null && !several) t.need else 0)
    }
}

private fun markupless(html: String) =
    de.schmeckts.app.ui
        .plainOf(html)

// what goes down well and what is left, a side only where it has a variety; without a Top the closest one
@Composable
private fun SideList(
    m: Model,
    r: Ranking,
    side: String,
) {
    val t = if (side == "top") candidate(r) else null
    val list = r.side(side).take(PICKS)
    if (t == null && list.isEmpty()) return
    val c = colors.tone(SIDE.getValue(side).second)!!
    Row(
        Modifier.fillMaxWidth().padding(top = Space.s2),
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        T(SIDES.getValue(side), Type.smallStrong, color = c.c)
        Box(Modifier.weight(1f).height(Size.hairline).background(c.cs))
    }
    if (t != null) {
        SideRow(m, t.e, side, false, t)
    } else {
        list.forEachIndexed { i, e -> SideRow(m, e, side, i == 0) }
    }
}

fun Phone.hasEvaluationCard(m: Model): Boolean {
    val r = derive.rankingModel()
    return r.rated > 0 || shopGroups(m).nachkaufen.isNotEmpty()
}

@Composable
fun hasEvaluationCard(m: Model) = LocalUi.current.phone.hasEvaluationCard(m)

// without a ranking, as for a pet on dry food only, the card shows what to buy again
@Composable
fun EvaluationCard(m: Model) {
    val ui = LocalUi.current
    val ph = ui.phone
    val r = ph.derive.rankingModel()
    val buy = if (r.rated > 0) emptyList() else shopGroups(m).nachkaufen
    Card {
        CardHead("Vorlieben", label = "Alle Vorlieben", onMore = ui.on("open-evaluation"))
        when {
            r.rated == 0 -> {
                Label("Nachkaufen", top = Space.s2)
                buy.take(SHOP_SHOWN).forEachIndexed { i, e ->
                    if (i > 0) {
                        de.schmeckts.app.ui
                            .Divider(Size.picL + Space.s3)
                    }
                    ShopRow(m, e)
                }
            }
            r.top.isNotEmpty() || r.flop.isNotEmpty() -> {
                SideList(m, r, "top")
                SideList(m, r, "flop")
            }
            else -> {
                val t = if (r.stale) null else r.trials.firstOrNull()
                val next =
                    when {
                        t != null -> "Am weitesten ist ${ph.named(t.e)}: ${ph.needs(t, m.pets.size > 1, "damit")}."
                        r.settled > 0 || r.stale -> ""
                        else -> "Ab drei Bewertungen einer Sorte steht hier, was am besten ankommt und was stehen bleibt."
                    }
                M(ph.waiting(m, r), Type.body, Modifier.padding(top = Space.hair, bottom = Space.s3), colors.ink)
                if (next.isNotEmpty()) M(next, Type.small, Modifier.padding(bottom = Space.s3), colors.muted)
            }
        }
    }
}

// == The page ==

/** a card with its heading, as on the page */
@Composable
private fun PageCard(
    title: String,
    content: @Composable () -> Unit,
) {
    Card {
        CardTitle(title)
        content()
    }
}

@Composable
private fun SayLine(text: String) = M(text, Type.body, Modifier.padding(top = Space.hair, bottom = Space.s3), colors.ink)

@Composable
private fun HintLine(text: String) = M(text, Type.small, Modifier.padding(bottom = Space.s3), colors.muted)

// each brand, consistency and flavour with how many of its meals went down well, all of it in the words beside the bar
@Composable
private fun TasteBlock(t: de.schmeckts.app.Taste) {
    val names = TEXTURES.getValue("Nassfutter").items.associate { it.key to it.label }
    var first = true
    val side: @Composable (String, List<TasteRow>, (String) -> String) -> Unit = { title, list, name ->
        if (list.isNotEmpty()) {
            // after a bar its 12 and the heading's 16 collapse, as in CSS
            val top = if (first) Space.s4 else Space.s4 - Space.s3
            first = false
            Row(Modifier.fillMaxWidth().padding(top = top, bottom = Space.s2), horizontalArrangement = Arrangement.SpaceBetween) {
                T(title, Type.smallStrong, color = colors.muted)
                T("gut gefressen", Type.smallStrong, color = colors.muted)
            }
            for (x in list) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                    T(name(x.key), Type.small, Modifier.weight(1f))
                    T("${x.good} von ${x.n}", Type.small, color = colors.muted)
                }
                val good = colors.good
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = Space.s1, bottom = Space.s3)
                        .height(Size.meterW)
                        .clip(RoundedCornerShape(50))
                        .background(colors.goodSoft)
                        .drawBehind {
                            drawRoundRect(
                                good,
                                size = size.copy(width = size.width * x.good / x.n),
                                cornerRadius =
                                    androidx.compose.ui.geometry
                                        .CornerRadius(size.height / 2),
                            )
                        },
                )
            }
        }
    }
    side("Marke", t.marke) { it }
    side("Konsistenz", t.konsistenz) { names[it] ?: it }
    side("Geschmack", t.geschmack) { it }
}

// the lists below name the varieties, so this only says how many of all settled ones go down well; several pets can
// be told apart only by „Geschmackssache“, so only one pet is called picky or easy to please
@Composable
private fun Portrait(
    m: Model,
    r: Ranking,
    x: Evaluation,
) {
    val ph = LocalUi.current.phone
    val ids = m.pets
    val several = ids.size > 1
    val pets = ids.mapNotNull { ph.derive.getPet(it) }
    val who = esc(if (several) "" else ph.petName(m, ids[0], "portrait"))
    val k = r.top.size
    val n = r.settled
    val good = { few: String ->
        "Von $n Sorten ${if (k > 1) "kommen" else "kommt"} ${if (k > 0) few + (if (k == 1) "eine" else "$k") else "keine"}${if (several) " bei allen" else ""} meist gut an."
    }
    val said = mutableListOf<String>()
    when {
        k == 0 && r.flop.isEmpty() -> said.add(ph.waiting(m, r))
        n < JUDGE -> said.add("Bisher ${if (n == 1) "steht erst eine Sorte" else "stehen erst $n Sorten"} fest.")
        several -> said.add(good(""))
        k * 3 >= n * 2 -> said.add("$who frisst fast alles gern: ${good("")}")
        k * 3 <= n -> said.add("$who ist wählerisch: ${good("nur ")}")
        else -> said.add(good(""))
    }
    if (k == 0 && r.flop.isEmpty() && r.settled == 0 && !r.stale) {
        said.add("Ab drei Bewertungen einer Sorte steht hier, was am besten ankommt und was stehen bleibt.")
    }
    Card {
        Row(horizontalArrangement = Arrangement.spacedBy(Space.s4), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.padding(bottom = Space.s3)) {
                if (several) {
                    Box(Modifier.size(Size.picXxl)) {
                        val ground = colors.surface
                        pets.take(2).forEachIndexed { i, pet ->
                            Avatar(
                                pet,
                                Av.L,
                                Modifier
                                    .align(if (i == 0) Alignment.TopStart else Alignment.BottomEnd)
                                    .then(
                                        if (i ==
                                            1
                                        ) {
                                            Modifier.drawBehind { drawCircle(ground, size.minDimension / 2 + Size.stroke.toPx()) }
                                        } else {
                                            Modifier
                                        },
                                    ),
                            )
                        }
                    }
                } else {
                    Avatar(pets.firstOrNull(), Av.XXL)
                }
            }
            Column(Modifier.weight(1f).padding(bottom = Space.s3)) {
                M(esc(ph.derive.petNames(ids)), Type.heading, Modifier.padding(bottom = Space.hair), colors.ink)
                M(said.joinToString(" "), Type.body, color = colors.ink)
            }
        }
        TasteBlock(x.taste)
    }
}

// x.moves.fresh: varieties that came onto their side within the last 30 days; place: 0 for the only one
@Composable
private fun PlaceRow(
    m: Model,
    x: Evaluation,
    e: Sort,
    place: Int,
    side: String,
) {
    val ui = LocalUi.current
    val ph = ui.phone
    val p = e.product
    val brand = brandOf(p)
    val said = markupless(ph.saidOf(e, side))
    val fresh = e.id in x.moves.fresh
    val now = Time.now()
    val at = if (side == "top") x.last[e.id] ?: 0L else 0L
    val away = if (at > 0 && now - at >= AWAY) "zuletzt vor ${lapse(at, now)}" else ""
    val label =
        "${if (place > 0) "Platz $place: " else ""}${pname(p)}${if (brand.isNotEmpty()) " von $brand" else ""}. $said." +
            (if (away.isNotEmpty()) " ${cap(away)}." else "") + (if (fresh) " Neu dabei." else "")
    ListRow(onClick = ui.on("open-product", "id" to e.id), label = label) {
        Ranked(p, side, place = place)
        Column(Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(Space.s2), verticalAlignment = Alignment.CenterVertically) {
                T(pname(p), Type.bodyStrong, Modifier.weight(1f, fill = false), maxLines = 2)
                if (fresh) Badge("neu")
            }
            T(
                cap(listOf(brand, lower(said), away).filter { it.isNotEmpty() }.joinToString(", ")),
                Type.small,
                Modifier.padding(top = Space.hair),
                colors.muted,
            )
        }
        Strip(ratingsIn(m, listOf(e.id)))
    }
}

// a place is only worth showing beside another
@Composable
private fun Places(
    m: Model,
    x: Evaluation,
    list: List<Sort>,
    side: String,
) {
    list.forEachIndexed { i, e ->
        if (i > 0) {
            de.schmeckts.app.ui
                .Divider(Size.picL + Space.s3)
        }
        PlaceRow(m, x, e, if (list.size > 1) i + 1 else 0, side)
    }
}

// never padded to five with varieties that do not belong there
@Composable
private fun Lists(
    m: Model,
    r: Ranking,
    x: Evaluation,
) {
    if (r.rated == 0) {
        return PageCard("Noch nichts bewertet") { SayLine("Bewerte ein paar Mahlzeiten, dann steht hier, was ankommt und was nicht.") }
    }
    if (!listed(r)) return // the first card says why
    val top = r.top.take(PLACES)
    val flop = r.flop.take(PLACES)
    PageCard(SIDES.getValue("top")) {
        when {
            top.isNotEmpty() -> {
                if (r.flat) SayLine("Die Sorten liegen noch so nah beieinander, dass die Reihenfolge Zufall sein kann.")
                Places(m, x, top, "top")
            }
            candidate(r) != null -> TrialRow(m, candidate(r)!!, true)
            else -> SayLine(noneYet(r))
        }
    }
    Gap(Space.s4)
    PageCard(SIDES.getValue("flop")) {
        if (flop.isNotEmpty()) {
            Places(m, x, flop, "flop")
        } else {
            SayLine(
                when {
                    r.settled < 3 -> "Dafür ist noch zu wenig bewertet."
                    r.settled == r.top.size -> "Alles, was feststeht, kommt gut an."
                    else -> "Keine Sorte bleibt regelmäßig stehen."
                },
            )
        }
    }
}

private fun Phone.weeks(
    recent: GoodCount,
    before: GoodCount,
) = "In den letzten vier Wochen <b>${times(recent.good, recent.n)}</b> gut gefressen, in den acht davor ${times(before.good, before.n)}."

private fun Phone.petLine(
    m: Model,
    t: Trend,
): String {
    val who = "<b>${esc(petName(m, t.pet, "trend"))}</b>"
    val worse = t.dir < 0
    val behind =
        if (t.behind.isNotEmpty()) {
            " Das liegt wohl an <b>${andList(
                t.behind.mapNotNull { id ->
                    m.byId[id]?.let { nameOf(it) }
                },
            )}</b>."
        } else {
            ""
        }
    return when {
        t.kind == "gleich" -> "Bei $who läuft’s wie gehabt."
        t.kind == "etwas" && worse -> "$who frisst zuletzt etwas schlechter, aber noch im Rahmen."
        t.kind == "etwas" -> "$who frisst zuletzt etwas besser."
        t.cause == "tier" ->
            "$who frisst ${if (worse) "seit ein paar Wochen deutlich schlechter" else "gerade deutlich besser"}, auch bei den gewohnten Sorten."
        t.cause == "futter" ->
            "$who frisst zuletzt deutlich ${if (worse) "schlechter" else "besser"}, bei den gewohnten Sorten aber wie vorher.$behind"
        else -> "$who frisst ${if (worse) "seit ein paar Wochen deutlich schlechter" else "gerade deutlich besser"}."
    }
}

@Composable
private fun TrendCard(
    m: Model,
    x: Evaluation,
) {
    val ph = LocalUi.current.phone
    val lines = x.trend
    val rows = mutableListOf<@Composable () -> Unit>()
    if (lines.isNotEmpty() && lines.all { it.kind == "gleich" }) {
        val sum = { recent: Boolean ->
            GoodCount(lines.sumOf { (if (recent) it.recent else it.before).n }, lines.sumOf { (if (recent) it.recent else it.before).good })
        }
        val who = if (lines.size > 1) ph.petsOf(lines.map { it.pet }) else esc(ph.petName(m, lines[0].pet, "trend"))
        rows.add { ToldRow({ Sign("paw") }, "Bei $who läuft’s wie gehabt.", ph.weeks(sum(true), sum(false))) }
    } else {
        for (t in lines) {
            val several = m.pets.size > 1
            rows.add {
                ToldRow(
                    {
                        if (several) {
                            Avatar(ph.derive.getPet(t.pet))
                        } else {
                            Sign(if (t.kind == "deutlich") (if (t.dir < 0) "fall" else "rise") else "paw")
                        }
                    },
                    ph.petLine(m, t),
                    ph.weeks(t.recent, t.before),
                )
            }
        }
    }
    // skip varieties whose move the pet's own change already explains
    val pet = { dir: Int -> lines.any { it.cause == "tier" && it.dir == dir } }
    val moved =
        (
            (if (pet(-1)) emptyList() else x.moves.cooled.map { it to "kommt nicht mehr so gut an wie vor einem Monat" }) +
                (if (pet(1)) emptyList() else x.moves.warmed.map { it to "kommt inzwischen gut an" })
        ).take(MOVED)
    for ((v, text) in moved) {
        val e = m.byId[v.id] ?: continue
        rows.add {
            ToldBtn(
                v.id,
                "${ph.named(e)} $text.",
                "Davor <b>${times(goodOf(v.before.counts), v.before.n)}</b> gut gefressen, seitdem ${lower(evidenceOf(v.since))}.",
            )
        }
    }
    val few = if (lines.isNotEmpty()) m.pets.filter { pid -> lines.none { it.pet == pid } } else emptyList()
    if (rows.isEmpty()) return
    Gap(Space.s4)
    PageCard("Wie läuft’s gerade?") {
        ToldList(rows)
        if (few.isNotEmpty()) HintLine("Bei ${ph.petsOf(few)} reicht es noch nicht für einen Vergleich.")
    }
}

private val OFTEN = "ein zwei drei vier fünf sechs sieben acht neun zehn elf zwölf".split(" ")

private fun often(n: Int) = OFTEN.getOrNull(n - 1)?.let { it + "mal" } ?: "$n Mal"

@Composable
private fun ObservedCard(x: Evaluation) {
    val ph = LocalUi.current.phone
    val o = x.observed
    if (o.kinds.isEmpty() && o.links.isEmpty()) return
    val rows = mutableListOf<@Composable () -> Unit>()
    for (k in o.kinds) {
        val ob = observationOf(k.kind)
        rows.add {
            ToldRow(
                { Sign(ob.icon, colors.tone(k.kind)) },
                "${ob.label}, <b>${often(k.n)}</b> in den letzten vier Wochen.",
                "Zuletzt ${whenStr(k.last)}${if (k.before > 0) ", in den acht Wochen davor ${often(k.before)}" else ""}.",
            )
        }
    }
    for (l in o.links) {
        val ob = observationOf(l.kind)
        rows.add {
            ToldBtn(
                l.id,
                "Nach <b>${esc(pname(ph.derive.getProduct(l.id)))}</b> öfter notiert: ${ob.label}.",
                "Nach <b>${l.after.hit} von ${l.after.n}</b> Mahlzeiten ${ob.after}, bei anderen Sorten nach ${l.other.hit} von ${l.other.n}.",
            )
        }
    }
    Gap(Space.s4)
    PageCard("Beobachtungen") { ToldList(rows) }
}

@Composable
private fun SplitCard(
    m: Model,
    r: Ranking,
) {
    val ph = LocalUi.current.phone
    if (m.pet != null || r.split.isEmpty()) return
    val rows =
        r.split.take(SPLIT).map { e ->
            @Composable {
                ToldBtn(
                    e.id,
                    "${ph.petsOf(e.yes)} ${if (e.yes.size > 1) "mögen" else "mag"} ${ph.named(e)}, ${ph.petsOf(e.no)} nicht.",
                    esc(
                        cap(
                            (e.yes + e.no).joinToString(
                                ", ",
                            ) { pid -> "${ph.derive.getPet(pid)?.str("name")} ${lower(evidenceOf(e.pets.getValue(pid)))}" },
                        ),
                    ) +
                        ".",
                )
            }
        }
    val more = r.split.size - SPLIT
    Gap(Space.s4)
    PageCard("Geschmackssache") {
        ToldList(rows)
        if (more > 0) HintLine("Dazu ${if (more == 1) "eine" else "$more"} weitere.")
    }
}

@Composable
private fun InsightRows(list: List<Insight>) =
    ToldList(
        list.map { x ->
            @Composable {
                val t = insightSaid(x)
                ToldRow({ Sign(t.icon) }, t.say, t.why)
            }
        },
    )

@Composable
private fun InsightsCard(x: Evaluation) {
    val ui = LocalUi.current
    val list = x.insights
    if (list.isEmpty()) return
    Gap(Space.s4)
    Card {
        if (list.size > INSIGHTS) {
            CardHead("Erkenntnisse", "Mehr", "Alle Erkenntnisse", ui.on("open-level", "v" to "insights"))
        } else {
            CardTitle("Erkenntnisse")
        }
        InsightRows(list.take(INSIGHTS))
    }
}

private val BUYING = setOf("marke", "geschmack", "konsistenz", "sosse")

@Composable
fun InsightsPage() {
    val ui = LocalUi.current
    val list =
        ui.phone.derive
            .evaluationModel()
            .insights
    SheetBody("Erkenntnisse", ui.sheets, onBack = ui.on("settings-back")) {
        var first = true
        for ((title, buying) in listOf("Beim Kaufen" to true, "Beim Füttern" to false)) {
            val rows = list.filter { (it.kind in BUYING) == buying }
            if (rows.isEmpty()) continue
            if (!first) Gap(Space.s4)
            first = false
            PageCard(title) { InsightRows(rows) }
        }
    }
}

// a variety still in its trial, with the ratings it has and the ones it lacks; best: the one closest to the Tops
@Composable
private fun TrialRow(
    m: Model,
    t: Trial,
    best: Boolean = false,
) {
    val ph = LocalUi.current.phone
    val several = m.pets.size > 1
    ToldBtn(
        t.e.id,
        "${if (best) ph.onTheWay(t, several) else cap(ph.needs(t, several, "mit ${ph.named(t.e)}"))}.",
        esc("Bisher ${lower(ph.whyOf(t.e, true))}."),
    ) { Strip(ratingsIn(m, listOf(t.e.id)), if (several) 0 else t.need) }
}

@Composable
private fun NextCard(
    m: Model,
    r: Ranking,
    x: Evaluation,
) {
    val ph = LocalUi.current.phone
    val now = Time.now()
    val several = m.pets.size > 1
    val rows = mutableListOf<@Composable () -> Unit>()
    for (v in x.next.missed) {
        val e = m.byId[v.id] ?: continue
        val rated = m.pets.count { pid -> (e.pets[pid]?.list?.size ?: 0) > 0 }
        val by = if (several && v.by.size < rated) "bei ${ph.derive.petNames(v.by)} " else ""
        rows.add { ToldBtn(v.id, "${ph.named(e)} gab es seit ${lapse(v.at, now)} nicht mehr.", esc("Davor $by${lower(evidenceOf(v))}.")) }
    }
    val trials = r.trials.drop(if (listed(r) && candidate(r) != null) 1 else 0)
    for (t in trials.take(TRIALS)) rows.add { TrialRow(m, t) }
    for (v in x.next.retry) {
        val e = m.byId[v.id] ?: continue
        rows.add {
            ToldBtn(
                v.id,
                "${ph.named(e)} blieb beim ersten Mal stehen.",
                "${esc(ph.petName(m, v.pet, "next"))} braucht bei Neuem oft Anlauf, ein zweiter Versuch kann sich lohnen.",
            )
        }
    }
    val more = trials.size - TRIALS
    if (rows.isEmpty()) return
    Gap(Space.s4)
    PageCard("Als Nächstes") {
        ToldList(rows)
        if (more > 0) {
            HintLine(if (more == 1) "Dazu eine weitere, die noch im Test ist." else "Dazu $more weitere, die noch im Test sind.")
        }
    }
}

private val LEFT = mapOf("Snack" to "Snacks", "Trockenfutter" to "Trockenfutter")

@Composable
private fun Foot(
    m: Model,
    x: Evaluation,
) {
    val b = x.basis
    val parts = mutableListOf<String>()
    if (b.n > 0) {
        val year = de.schmeckts.app.yearOf(b.first)
        val date = de.schmeckts.app.dayMonth(b.first) + if (year == de.schmeckts.app.yearOf(Time.now())) "" else " $year"
        parts.add(
            "Tops und Flops beruhen auf <b>${b.n} Bewertungen</b> seit dem $date, pro Sorte${if (m.pets.size > 1) " und Katze" else ""} auf den neuesten acht aus dem letzten halben Jahr.",
        )
    }
    if (b.left.isNotEmpty()) {
        parts.add(
            "${andList(
                b.left.map { LEFT.getValue(it) },
            )} ${if (b.left.size > 1 || b.left[0] == "Snack") "zählen" else "zählt"} dabei nicht mit.",
        )
    }
    if (parts.isEmpty()) return
    M(
        parts.joinToString(" "),
        Type.small,
        Modifier.fillMaxWidth().padding(top = Space.s6),
        colors.muted,
        align = androidx.compose.ui.text.style.TextAlign.Center,
    )
}

@Composable
fun EvaluationPage() {
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val m = d.model()
    val r = d.rankingModel()
    val x = d.evaluationModel()
    SheetBody(
        "Vorlieben" + ph.forWhom(m.pet),
        ui.sheets,
        onBack = ui.on("settings-back"),
        end = { IconBtn("cart", "Einkaufen", onClick = ui.on("open-level", "v" to "shop")) },
    ) {
        if (r.rated > 0) {
            Portrait(m, r, x)
            Gap(Space.s4)
        }
        Lists(m, r, x)
        TrendCard(m, x)
        ObservedCard(x)
        SplitCard(m, r)
        InsightsCard(x)
        NextCard(m, r, x)
        Foot(m, x)
    }
}
