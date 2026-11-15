package de.schmeckts.app.views

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import de.schmeckts.app.Appetite
import de.schmeckts.app.Block
import de.schmeckts.app.DAY
import de.schmeckts.app.Differ
import de.schmeckts.app.Experiment
import de.schmeckts.app.Insight
import de.schmeckts.app.Model
import de.schmeckts.app.Move
import de.schmeckts.app.NEXT_NEWEST
import de.schmeckts.app.PetSummary
import de.schmeckts.app.Phone
import de.schmeckts.app.Pick
import de.schmeckts.app.Pt
import de.schmeckts.app.Ranking
import de.schmeckts.app.Side
import de.schmeckts.app.Sort
import de.schmeckts.app.Stat
import de.schmeckts.app.Summary
import de.schmeckts.app.TEXTURES
import de.schmeckts.app.TYPES
import de.schmeckts.app.Time
import de.schmeckts.app.Trait
import de.schmeckts.app.Trend
import de.schmeckts.app.Vorlieben
import de.schmeckts.app.andList
import de.schmeckts.app.cap
import de.schmeckts.app.cardTraits
import de.schmeckts.app.dayMonth
import de.schmeckts.app.esc
import de.schmeckts.app.goodOf
import de.schmeckts.app.jsRound
import de.schmeckts.app.likingOf
import de.schmeckts.app.mostly
import de.schmeckts.app.observationOf
import de.schmeckts.app.pets
import de.schmeckts.app.pname
import de.schmeckts.app.ranks
import de.schmeckts.app.ratingsIn
import de.schmeckts.app.shopGroups
import de.schmeckts.app.tallyOf
import de.schmeckts.app.typeOf
import de.schmeckts.app.ui.Badge
import de.schmeckts.app.ui.Btn
import de.schmeckts.app.ui.BtnKind
import de.schmeckts.app.ui.Card
import de.schmeckts.app.ui.CardBtn
import de.schmeckts.app.ui.CardHead
import de.schmeckts.app.ui.CardTitle
import de.schmeckts.app.ui.Chevron
import de.schmeckts.app.ui.Chip
import de.schmeckts.app.ui.Chips
import de.schmeckts.app.ui.Divider
import de.schmeckts.app.ui.Gap
import de.schmeckts.app.ui.Hint
import de.schmeckts.app.ui.Icon
import de.schmeckts.app.ui.Label
import de.schmeckts.app.ui.Link
import de.schmeckts.app.ui.ListRow
import de.schmeckts.app.ui.LocalLayer
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.M
import de.schmeckts.app.ui.Motion
import de.schmeckts.app.ui.Radius
import de.schmeckts.app.ui.SheetBody
import de.schmeckts.app.ui.Size
import de.schmeckts.app.ui.Space
import de.schmeckts.app.ui.T
import de.schmeckts.app.ui.TMain
import de.schmeckts.app.ui.Type
import de.schmeckts.app.ui.colors
import de.schmeckts.app.ui.minTap
import de.schmeckts.app.ui.plainOf
import de.schmeckts.app.ui.press
import de.schmeckts.app.ui.reduceMotion
import de.schmeckts.app.ui.tone
import de.schmeckts.app.ui.watch
import de.schmeckts.app.yearOf
import java.text.Collator
import java.util.Locale

// „Vorlieben“: the card on home and the page. Every finding comes from Smart.kt; this words and draws it.

private const val AWAY = 42 * DAY // a favourite unserved this long says since when
private const val FOLD_AT = 5 // a list this long shows FOLD_SHOWN rows until opened
private const val FOLD_SHOWN = 3
private const val CLEAR = 20 // wet ratings in the windows from which the last line names what showed nothing clear
private const val CARD_BUY = 3

private val FEEDING = setOf("wiederholung", "neu", "tageszeit", "snack", "feeder")

private val WORDS = listOf("eine", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf")

/** a count in words up to twelve: „Alle vier nicht mehr kaufen“ */
fun word(n: Int) = WORDS.getOrNull(n - 1) ?: "$n"

private fun bigWord(n: Int) = cap(word(n))

private fun sentence(s: String) = if (s.isEmpty() || s.last() in ".!?") s else "$s."

/** How a consistency is put: its varieties, what a finding may lie on, in and without it, after a brand, as „it“ */
private class Phrase(
    val sorts: String,
    val on: String,
    val inside: String,
    val without: String,
    val after: String,
    val it: String = "sie",
)

private val PHRASES =
    mapOf(
        "sosse" to Phrase("Sorten in Soße", "an der Soße", "in Soße", "ohne Soße", "in Soße"),
        "gelee" to Phrase("Sorten in Gelee", "am Gelee", "in Gelee", "ohne Gelee", "in Gelee"),
        "pastete" to Phrase("Sorten als Pastete", "an der Pastete", "als Pastete", "nicht als Pastete", "Pastete"),
        "mousse" to Phrase("Sorten als Mousse", "an der Mousse", "als Mousse", "nicht als Mousse", "Mousse"),
        "block" to Phrase("Sorten am Stück", "am festen Block", "am Stück", "nicht am Stück", "am Stück", "ihn"),
        "suppe" to Phrase("Sorten als Suppe", "an der Suppe", "als Suppe", "nicht als Suppe", "Suppe"),
    )

private val TEXTURE_SAID =
    mapOf(
        "sosse" to "Stückchen in Soße",
        "gelee" to "Stückchen in Gelee",
        "pastete" to "Pastete",
        "mousse" to "Mousse",
        "block" to "Fester Block",
        "suppe" to "Suppe",
    )

// as the food sheet names it: „In Soße“
private fun textureLabel(key: Any?) =
    TEXTURES
        .getValue(TYPES[0])
        .items
        .find { it.key == key }
        ?.label ?: (key as? String ?: "")

private val german: Collator = Collator.getInstance(Locale.GERMAN)

private fun brand(e: Sort) = (e.product.str("brand") ?: "").trim()

// adds the brand where another variety has the same name
private fun Phone.nameOf(e: Sort): String {
    val p = e.product
    val twins = db.products.count { pname(it) == pname(p) } > 1
    return pname(p) + if (twins && brand(e).isNotEmpty()) " von ${brand(e)}" else ""
}

// what a variety's line starts with: its brand, for anything but wet food its type too
private fun lead(e: Sort): String {
    val type = typeOf(e.product)
    return when {
        type == TYPES[0] -> brand(e)
        brand(e).isEmpty() -> type
        else -> "$type von ${brand(e)}"
    }
}

private fun joined(vararg parts: String) = cap(parts.filter { it.isNotEmpty() }.joinToString(", "))

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

// a pet on its own goes by any of its names; beside others by its own, so they stay apart
private fun Phone.petName(
    m: Model,
    id: String,
    place: String,
) = if (m.pets.size > 1) derive.getPet(id)?.str("name") ?: "" else derive.calledNames(listOf(id), place)

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

/** what the words of a line draw on; r is left out where only label and value are shown */
private class Ctx(
    val m: Model,
    val r: Ranking? = null,
    val weeks: List<Block> = emptyList(),
    val last: Map<String, Long> = emptyMap(),
    val now: Long = Time.now(),
)

/** A line of the Steckbrief in words: label and value plain, sub and note as markup, the sides it compares */
private class Said(
    val label: String,
    val value: String,
    val sub: String = "",
    val a: Compared? = null,
    val b: Compared? = null,
    val quiet: Boolean = false,
    val note: String = "",
)

private fun side(
    head: String,
    x: Side,
) = Compared("$head: ${times(x.good, x.n)} gut gefressen", x)

private fun better(gap: Double) = if (gap > 0) "Frisst lieber" else "Lässt öfter stehen"

private fun packLabel(p: de.schmeckts.app.BrandLine) = listOfNotNull(p.brand, p.texture?.let { PHRASES[it]?.after }).joinToString(" ")

// the brands a group of varieties comes from
private fun brandsOf(sorts: List<Sort>): String {
    val brands = sorts.map(::brand)
    val named = brands.filter { it.isNotEmpty() }.distinct()
    if (named.size == 1 && brands.all { it.isNotEmpty() }) return "${if (sorts.size == 2) "Beide" else "Alle"} von ${named[0]}."
    if (sorts.size == 2) return if (named.size == 2) "Von ${named[0]} und ${named[1]}." else ""
    val most = mostly(sorts)
    return when {
        most.isNotEmpty() -> "Die meisten von ${andList(most)}."
        named.size >= 2 -> "Von ${word(named.size)} Marken."
        else -> ""
    }
}

private fun Phone.away(
    e: Sort,
    c: Ctx,
): String {
    val at = c.last[e.id] ?: 0L
    return if (at > 0 && c.now - at >= AWAY) ", zuletzt vor ${lapse(at, c.now)}" else ""
}

// one variety by name, two by both, more by their count
private fun Phone.groupSaid(
    one: String,
    many: String,
    sorts: List<Sort>,
    c: Ctx,
    away: Boolean,
): Said =
    when (sorts.size) {
        1 -> sorts[0].let { e -> Said(one, nameOf(e), esc(joined(brand(e), lower(whyOf(e)) + if (away) away(e, c) else ""))) }
        2 -> Said(many, "${nameOf(sorts[0])} und ${nameOf(sorts[1])}", esc(brandsOf(sorts)))
        else -> Said(many, "${bigWord(sorts.size)} Sorten", esc(brandsOf(sorts)))
    }

private fun moveSaid(mv: Move) =
    "Vor einem Monat <b>${times(goodOf(mv.before.counts), mv.before.n)}</b> gut gefressen, seitdem ${esc(lower(evidenceOf(mv.since)))}."

private fun Phone.trendSaid(
    t: Trend,
    m: Model,
): String {
    val counts = "<b>${times(t.recent.good, t.recent.n)}</b> gut gefressen, in den acht davor ${times(t.before.good, t.before.n)}."
    val names = t.behind.mapNotNull { id -> m.byId[id]?.let { nameOf(it) } }
    return when {
        t.cause == "tier" -> "Auch bei den gewohnten Sorten: in den letzten vier Wochen $counts"
        t.cause == "futter" && names.isNotEmpty() ->
            "Bei den gewohnten Sorten wie vorher, ${if (t.dir < 0) "schlechter" else "besser"} nur bei neuen wie <b>${esc(
                andList(names),
            )}</b>."
        t.cause == "futter" -> "Bei den gewohnten Sorten wie vorher, anders nur bei neuen Sorten."
        else -> "In den letzten vier Wochen $counts"
    }
}

// each state on its own, so one that goes or comes costs nothing
private fun Phone.appetiteSaid(
    a: Appetite,
    c: Ctx,
): Said? {
    val w = a.week
    val said = { value: String, sub: String -> Said("Appetit", value, sub) }
    return when (a.state) {
        "tage" ->
            a.hint?.let { h ->
                said(
                    "Seit ein paar Tagen schwächer",
                    "In den letzten drei Tagen <b>${times(
                        h.good,
                        h.n,
                    )}</b> gut gefressen, in den 30 Tagen davor ${times(h.goodBefore, h.before)}.",
                )
            }
        "schlechter" -> a.trend?.let { said("Deutlich schlechter", trendSaid(it, c.m)) }
        "besser" -> a.trend?.let { said("Deutlich besser", trendSaid(it, c.m)) }
        "zuletzt-schwaecher", "zuletzt-besser" ->
            w?.let {
                said(
                    if (a.state == "zuletzt-besser") "Zuletzt besser" else "Zuletzt schwächer",
                    "Vom ${spanOf(w.from, w.to)} <b>${times(w.good, w.n)}</b> gut gefressen, " +
                        "bei diesen Sorten wären etwa ${jsRound(w.expected)} zu erwarten gewesen.",
                )
            }
        "wieder" ->
            w?.let {
                said(
                    "Wieder wie gewohnt",
                    "Vom ${spanOf(w.from, w.to)} ${if (a.dir < 0) "schwächer" else "besser"}, als es die Sorten erwarten ließen, " +
                        "seitdem wieder im Rahmen.",
                )
            }
        "unauffaellig" ->
            if (c.weeks.size < 2) {
                said("Unauffällig", "")
            } else {
                said(
                    "Unauffällig",
                    "In den letzten ${word(c.weeks.size)} Wochen <b>${times(c.weeks.sumOf { it.good }, c.weeks.sumOf { it.n })}</b> " +
                        "gut gefressen, keine Woche schlechter oder besser, als es die Sorten erwarten ließen.",
                )
            }
        else -> null
    }
}

/** A trait in words; null for one this version cannot word */
private fun Phone.traitSaid(
    t: Trait,
    c: Ctx,
): Said? {
    val m = c.m
    val sorts = t.ids.mapNotNull { m.byId[it] }
    val x = t.insight
    return when (t.kind) {
        "liebling" ->
            if (t.ids.isEmpty()) {
                Said(
                    "Lieblingssorte",
                    "Noch keine",
                    "Dafür muss eine Sorte mindestens dreimal gefüttert sein und dabei zwei von drei Mal gut ankommen.",
                    quiet = true,
                )
            } else if (sorts.isNotEmpty()) {
                groupSaid("Lieblingssorte", "Lieblingssorten", sorts, c, true)
            } else {
                null
            }
        "stehen" -> if (sorts.isNotEmpty()) groupSaid("Lässt meist stehen", "Lässt meist stehen", sorts, c, false) else null
        "sorten" -> {
            val r = c.r
            val l = if (r != null) r.top + r.mid + r.flop + r.split else emptyList()
            val sub =
                if (l.isEmpty()) {
                    ""
                } else {
                    "Die Sorten liegen so nah beieinander, wie es auch der Zufall ergäbe: " +
                        "zusammen ${times(l.sumOf { goodOf(it.counts) }, l.sumOf { it.n })} gut gefressen."
                }
            Said("Sorten", "Macht kaum Unterschiede", sub)
        }
        "pack" ->
            t.pack?.let { p ->
                val struck = p.sorts.all { derive.getProduct(it.id)?.str("kaufen") == "nicht" }
                val n = word(p.sorts.size)
                val said =
                    when {
                        p.a.good == 0 -> "Keine der $n Sorten gut gefressen."
                        else -> "Bei keiner der $n Sorten mehr als die Hälfte gut gefressen."
                    }
                val sub = said + if (struck) " Von dir gestrichen." else ""
                Said("Kommt gar nicht an", packLabel(p), sub, side("<b>${esc(packLabel(p))}</b>", p.a), side("Andere Sorten", p.b))
            }
        "marke" ->
            x?.let {
                val b = it.a.key as? String ?: ""
                Said(better(it.gap), b, "", side("<b>${esc(b)}</b>", it.a), side(esc(it.b.key as? String ?: "Andere Marken"), it.b))
            }
        "konsistenz" ->
            x?.let {
                val key = it.a.key as? String ?: ""
                val ph = PHRASES[key]
                val k = it.sorts.size
                val mixed =
                    if (t.mixed.isNotEmpty() && ph != null) {
                        "${if (k == 2) "Beide" else "Alle ${word(k)}"} ${ph.sorts} waren von ${andList(t.mixed, "oder")}, " +
                            "darum ist offen, ob es ${ph.on} liegt oder an der Marke."
                    } else {
                        ""
                    }
                val sauce = if (it.n > 0) "Oft nur die Soße geleckt: ${it.k} von ${it.n} Mal." else ""
                Said(
                    better(it.gap),
                    TEXTURE_SAID[key] ?: cap(key),
                    esc(listOf(mixed, sauce).filter { s -> s.isNotEmpty() }.joinToString(" ")),
                    side("<b>${esc(textureLabel(key))}</b>", it.a),
                    side(esc(it.b.key?.let(::textureLabel) ?: "Anderes Nassfutter"), it.b),
                )
            }
        "geschmack" ->
            x?.let {
                val g = esc(it.a.key as? String ?: "")
                Said(
                    better(it.gap),
                    it.a.key as? String ?: "",
                    "Verglichen mit Sorten derselben Marke und Konsistenz.",
                    side("<b>Mit $g</b>", it.a),
                    side("Ohne $g", it.b),
                )
            }
        "sosse" ->
            x?.let {
                Said(
                    "Bei Soße",
                    "Leckt oft nur die Soße",
                    a = Compared("<b>In Soße</b>: ${it.k} von ${it.n} Mal nur die Soße geleckt", it.a),
                    b = it.instead?.let { i -> side(esc(textureLabel(i.key)), it.b) },
                )
            }
        "snacks" -> t.treats?.let { Said("Snacks", "Immer aufgefressen", esc(evidenceOf(it)) + ".") }
        "appetit" -> t.appetite?.let { appetiteSaid(it, c) }
        "neuerdings" ->
            when (t.moves.size) {
                0 -> null
                1 ->
                    m.byId[t.moves[0].id]?.let { e ->
                        Said(if (t.warmed) "Kommt inzwischen gut an" else "Kommt nicht mehr so gut an", nameOf(e), moveSaid(t.moves[0]))
                    }
                else -> Said("Neuerdings anders", "${bigWord(t.moves.size)} Sorten")
            }
        "danach" ->
            t.link?.let { l ->
                m.byId[l.id]?.let { e ->
                    val ob = observationOf(l.kind)
                    Said(
                        "Danach öfter notiert",
                        nameOf(e),
                        "${esc(ob.label)}: nach <b>${l.after.hit} von ${l.after.n}</b> Mahlzeiten ${ob.after}, " +
                            "bei anderen Sorten nach ${l.other.hit} von ${l.other.n}.",
                    )
                }
            }
        "wiederholung" ->
            x?.let {
                Said(
                    "Abwechslung",
                    "Mag nicht zweimal hintereinander dasselbe",
                    a = side("<b>Gleiche Sorte wie davor</b>", it.a),
                    b = side("Andere Sorte als davor", it.b),
                )
            }
        "neu" ->
            x?.let {
                Said(
                    "Neues",
                    if (it.gap > 0) "Beim ersten Mal am liebsten" else "Braucht bei Neuem einen zweiten Versuch",
                    a = side("<b>Beim ersten Mal</b>", it.a),
                    b = side("Danach", it.b),
                )
            }
        "tageszeit" ->
            x?.let {
                Said(
                    "Tageszeit",
                    if (it.gap > 0) "Die erste Mahlzeit am Tag läuft besser" else "Die letzte Mahlzeit am Tag läuft besser",
                    a = side("<b>Erste Mahlzeit am Tag</b>", it.a),
                    b = side("Letzte Mahlzeit am Tag", it.b),
                )
            }
        "snack" ->
            x?.let {
                Said(
                    "Nach Snacks",
                    "Danach bleibt mehr stehen",
                    a = side("<b>Bis drei Stunden nach einem Snack</b>", it.a),
                    b = side("Sonst", it.b),
                )
            }
        "feeder" ->
            x?.let {
                val a = it.a.key as? String ?: ""
                val b = andList((it.b.key as? List<*>)?.filterIsInstance<String>().orEmpty())
                Said(
                    "Wer füttert",
                    "Frisst bei $a besser als bei $b",
                    "Bei denselben Sorten verglichen.",
                    side("<b>Von ${esc(a)} gefüttert</b>", it.a),
                    side("Von ${esc(b)} gefüttert", it.b),
                )
            }
        else -> null
    }
}

private fun tagOf(t: Trait) = "trait-" + if (t.kind == "pack" || t.kind == "danach") "${t.kind}-${t.key}" else t.kind

private fun foldOf(t: Trait) = "trait:${t.kind}" + (t.key?.let { ":$it" } ?: "")

// a line about one variety opens it, one about several opens what it rests on
private fun Ctx.oneOf(t: Trait): Sort? =
    if (t.kind in setOf("liebling", "stehen", "neuerdings", "danach")) t.ids.singleOrNull()?.let { m.byId[it] } else null

private fun grouped(t: Trait) =
    when (t.kind) {
        "liebling", "stehen", "neuerdings" -> t.ids.size > 1
        "pack", "marke", "konsistenz", "geschmack", "sosse" -> true
        else -> false
    }

@Composable
private fun isOpen(key: String) = (LocalLayer.current?.state?.get("open") as? Set<*>)?.contains(key) == true

@Composable
private fun unfold() = if (reduceMotion) tween<IntSize>(0) else tween(Motion.STEP, easing = Motion.easeOut)

/** a list that shows FOLD_SHOWN rows once it is FOLD_AT long, the rest behind a link */
@Composable
private fun <T> Folded(
    items: List<T>,
    key: String,
    at: Dp,
    row: @Composable (T) -> Unit,
) {
    watch()
    val ui = LocalUi.current
    val folds = items.size >= FOLD_AT
    val open = folds && isOpen(key)
    (if (folds) items.take(FOLD_SHOWN) else items).forEachIndexed { i, x ->
        if (i > 0) Divider(at)
        row(x)
    }
    if (!folds) return
    Column(Modifier.fillMaxWidth().animateContentSize(unfold())) {
        if (open) {
            for (x in items.drop(FOLD_SHOWN)) {
                Divider(at)
                row(x)
            }
        }
    }
    Link(
        if (open) "Weniger" else "Alle ${word(items.size)} zeigen",
        Modifier.minTap().testTag("fold-$key"),
        onClick =
            ui.on(
                "fold",
                "v" to key,
            ),
    )
}

/** A line of the Steckbrief: a press area with label, value and sub beside its picture, what it compares across the
 width; under it the week chart, an action and what it rests on. open: null without a proof. */
@Composable
private fun TraitRow(
    tag: String,
    said: Said,
    tap: (() -> Unit)? = null,
    open: Boolean? = null,
    end: (@Composable () -> Unit)? = null,
    visual: (@Composable () -> Unit)? = null,
    chart: (@Composable () -> Unit)? = null,
    action: (@Composable () -> Unit)? = null,
    proof: (@Composable () -> Unit)? = null,
) {
    watch()
    val words =
        (
            listOf("${said.label}: ${said.value}.", sentence(plainOf(said.sub)), sentence(plainOf(said.note))) +
                listOfNotNull(said.a, said.b).map { sentence(plainOf(it.text)) }
        ).filter { it.isNotEmpty() }.joinToString(" ")
    val turn by animateFloatAsState(
        if (open == true) 180f else 0f,
        if (reduceMotion) snap() else tween(Motion.STEP, easing = Motion.easeOut),
        label = "down",
    )
    Column(Modifier.fillMaxWidth()) {
        Column(
            Modifier
                .testTag(tag)
                .fillMaxWidth()
                .semantics(mergeDescendants = true) {
                    heading()
                    contentDescription = words
                    if (tap != null) {
                        if (open != null) stateDescription = if (open) "aufgeklappt" else "zugeklappt"
                        onClick(
                            when (open) {
                                null -> "Sorte öffnen"
                                true -> "Belege verbergen"
                                false -> "Belege zeigen"
                            },
                        ) {
                            tap()
                            true
                        }
                    }
                }.press(tap, Motion.PRESS_WIDE)
                .heightIn(min = Size.tap)
                .padding(top = Space.s3, bottom = if (chart != null) 0.dp else Space.s3),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                Column(Modifier.weight(1f)) {
                    T(said.label, Type.captionStrong, color = colors.muted)
                    T(said.value, Type.heading, color = if (said.quiet) colors.muted else colors.ink, balance = true)
                    if (said.sub.isNotEmpty()) M(said.sub, Type.small, Modifier.padding(top = Space.hair), colors.muted)
                }
                end?.invoke()
                if (tap != null) {
                    if (open == null) Chevron() else Icon("down", Modifier.rotate(turn), Size.iconS, colors.faint)
                }
            }
            if (visual != null || said.a != null) {
                Gap(Space.s2)
                visual?.invoke()
                if (said.a != null) CompareBars(said.a, said.b)
            }
            if (said.note.isNotEmpty()) M(said.note, Type.small, Modifier.padding(top = Space.s3), colors.muted)
        }
        if (chart != null) {
            Gap(Space.s2)
            chart()
        }
        action?.invoke()
        if (proof != null) {
            Column(Modifier.fillMaxWidth().animateContentSize(unfold())) { if (open == true) proof() }
        }
    }
}

/** a row of a variety: its packaging, name, ratings and what they say; extra: what goes under that */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SortRow(
    m: Model,
    e: Sort,
    sub: String,
    label: String,
    tag: String = "sort-${e.id}",
    th: Th = Th.L,
    extra: (@Composable () -> Unit)? = null,
) {
    watch()
    val ui = LocalUi.current
    ListRow(Modifier.testTag(tag), onClick = ui.on("open-product", "id" to e.id), label = label) {
        Thumb(null, e.product, th)
        Column(Modifier.weight(1f)) {
            T(ui.phone.nameOf(e), Type.bodyStrong, maxLines = 2)
            FlowRow(
                Modifier.padding(top = Space.hair),
                horizontalArrangement = Arrangement.spacedBy(Space.s2),
                verticalArrangement = Arrangement.spacedBy(Space.s1),
            ) {
                DotLines(m, e, Modifier.align(Alignment.CenterVertically))
                if (sub.isNotEmpty()) T(sub, Type.small, Modifier.align(Alignment.CenterVertically), colors.muted)
            }
            extra?.invoke()
        }
        if (e.kaufen != null) Icon("pin", size = Size.iconS, color = colors.muted)
    }
}

private class RowSaid(
    val sub: String,
    val label: String,
)

// band: the Einkaufen group the row stands in, empty elsewhere; the brand is left out where the rows share it
private fun Phone.rowSaid(
    e: Sort,
    c: Ctx,
    band: String = "",
    branded: Boolean = true,
): RowSaid {
    val evidence = if (e.n == 0) "lange nicht bewertet" else lower(whyOf(e))
    val at = c.last[e.id] ?: 0L
    val extra =
        when {
            e.kaufen == null && e.choice == "gemischt" -> ", nur für ${derive.petNames(e.yes)}"
            band == "nachkaufen" && at > 0 && c.now - at >= AWAY -> ", zuletzt vor ${lapse(at, c.now)}"
            e.kaufen == "immer" && e.verdict == "nicht" -> ". Steht auf deiner Liste, kam zuletzt aber nicht gut an."
            e.kaufen == "nicht" && e.verdict == "nachkaufen" -> ". Von dir gestrichen, kommt inzwischen aber gut an."
            else -> ""
        }
    val b = brand(e)
    val label =
        sentence("${nameOf(e)}${if (b.isNotEmpty()) " von $b" else ""}. ${cap(evidence)}$extra") +
            if (e.kaufen != null) " Von dir festgelegt." else ""
    return RowSaid(joined(if (branded) lead(e) else "", evidence) + extra, label)
}

@Composable
private fun ProofRows(
    c: Ctx,
    list: List<Sort>,
    branded: Boolean = true,
    sub: ((Sort) -> String)? = null,
) {
    watch()
    val ph = LocalUi.current.phone
    list.forEachIndexed { i, e ->
        if (i > 0) Divider(Size.picM + Space.s3)
        val x = ph.rowSaid(e, c, branded = branded)
        SortRow(c.m, e, sub?.invoke(e) ?: x.sub, x.label, "proof-${e.id}", Th.M)
    }
}

/** brand by consistency: the varieties of a texture finding and the rest, so a brand that never came without it shows */
@Composable
private fun MixGrid(x: Insight) {
    watch()
    val p = colors
    val tone = p.tone(if (x.gap < 0) "bad" else "good")!!
    val key = x.a.key as? String
    val heads = listOf(textureLabel(key), x.b.key?.let(::textureLabel) ?: "Anderes Nassfutter")
    val said = listOf(PHRASES[key]?.inside ?: lower(heads[0]), x.b.key?.let { PHRASES[it]?.inside } ?: "anderes Nassfutter")
    val sides = listOf(x.sorts, x.rest).map { l -> l.groupBy(::brand) }
    val brands =
        (x.sorts + x.rest)
            .filter { it.n > 0 }
            .groupBy(::brand)
            .entries
            .sortedWith(
                compareByDescending<Map.Entry<String, List<Sort>>> { e ->
                    e.value.sumOf { it.n }
                }.thenComparing({ it.key }, german),
            ).map { it.key }
    Column(Modifier.fillMaxWidth().padding(bottom = Space.s3)) {
        Row(Modifier.fillMaxWidth().padding(bottom = Space.s2), verticalAlignment = Alignment.Bottom) {
            Spacer(Modifier.weight(1.2f))
            Column(Modifier.weight(1f).padding(horizontal = Space.s2)) {
                T(heads[0], Type.smallStrong, color = p.ink)
                Gap(Space.s1)
                Box(Modifier.fillMaxWidth().height(Size.stroke).background(tone.c))
            }
            T(heads[1], Type.smallStrong, Modifier.weight(1f).padding(horizontal = Space.s2), p.muted)
        }
        brands.forEachIndexed { i, b ->
            val cells = sides.map { s -> s[b]?.let { tallyOf(it) }?.takeIf { it.n > 0 } }
            val name = b.ifEmpty { "Ohne Marke" }
            var named = false
            val parts =
                cells.mapIndexed { j, s ->
                    if (s == null) {
                        "${said[j]} keine"
                    } else {
                        "${said[j]} ${s.good} von ${s.n} Mal" + if (named) "" else " gut gefressen".also { named = true }
                    }
                }
            val top = if (i == 0) Radius.s else 0.dp
            val bottom = if (i == brands.size - 1) Radius.s else 0.dp
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = Size.tap)
                    .height(IntrinsicSize.Min)
                    .semantics(mergeDescendants = true) { contentDescription = "$name: ${parts.joinToString(", ")}." },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                T(name, Type.small, Modifier.weight(1.2f).padding(vertical = Space.s2), p.ink)
                cells.forEachIndexed { j, s ->
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .then(
                                if (j == 0) {
                                    Modifier.clip(RoundedCornerShape(top, top, bottom, bottom)).background(tone.cs)
                                } else {
                                    Modifier
                                },
                            ).padding(Space.s2),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        if (s != null) {
                            Column {
                                T("${s.good} von ${s.n}", Type.small.copy(fontFeatureSettings = "tnum"), color = p.ink)
                                Gap(Space.s1)
                                OutcomeBar(s)
                            }
                        }
                    }
                }
            }
        }
        T(
            "Geprüft ist nur der Unterschied zwischen den Spalten, nicht der zwischen den Marken.",
            Type.small,
            Modifier.padding(top = Space.s2),
            p.muted,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WeekLegend() {
    watch()
    val p = colors
    FlowRow(
        Modifier.fillMaxWidth().padding(top = Space.s2),
        horizontalArrangement = Arrangement.spacedBy(Space.s3),
        verticalArrangement = Arrangement.spacedBy(Space.s1),
    ) {
        for ((tone, w) in listOf(
            "good" to "gut gefressen",
            "mid" to "die Hälfte",
            "sauce" to "ein bissl oder nur Soße",
            "bad" to "fast nix",
        )) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s1)) {
                Swatch(tone)
                T(w, Type.caption, color = p.muted)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s1)) {
            Canvas(Modifier.size(Size.dot)) {
                drawLine(p.ink, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), Size.stroke.toPx())
            }
            T("zu erwarten", Type.caption, color = p.muted)
        }
    }
}

@Composable
private fun AppetiteChart(
    weeks: List<Block>,
    m: Model,
) {
    watch()
    val noted = weeks.any { it.seen.isNotEmpty() }
    val other = m.sorts.any { it.total > 0 && !ranks(it.product) }
    Column(Modifier.fillMaxWidth().padding(bottom = Space.s3)) {
        WeekChart(weeks)
        WeekLegend()
        if (noted) T("Unter den Wochen steht, was notiert wurde.", Type.caption, Modifier.padding(top = Space.s1), colors.muted)
        if (other) T("Ohne Snacks und Trockenfutter.", Type.caption, Modifier.padding(top = Space.s1), colors.muted)
    }
}

@Composable
private fun TraitBlock(
    t: Trait,
    said: Said,
    c: Ctx,
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val m = c.m
    val one = c.oneOf(t)
    val key = foldOf(t)
    val open = if (grouped(t)) isOpen(key) else null
    val sorts = t.ids.mapNotNull { m.byId[it] }
    val worstFirst = compareBy<Sort> { likingOf(it) }
    val x = t.insight
    val end: (@Composable () -> Unit)? =
        when {
            one != null -> {
                { Thumb(null, one.product, Th.L) }
            }
            t.kind in setOf("liebling", "stehen", "neuerdings", "pack") && sorts.size > 1 -> {
                { PackThumbs(t.ids) }
            }
            else -> null
        }
    val visual: (@Composable () -> Unit)? =
        when {
            one == null || t.kind == "danach" -> null
            t.kind == "neuerdings" -> {
                {
                    val r = ratingsIn(m, listOf(one.id))
                    val split =
                        t.moves
                            .firstOrNull()
                            ?.let { r.keys.size - it.since.n }
                            ?.takeIf { it in 1 until r.keys.size } ?: -1
                    DotRow(r.keys, more = r.more, split = split)
                }
            }
            else -> {
                { DotLines(m, one) }
            }
        }
    val chart: (@Composable () -> Unit)? =
        if (t.kind == "appetit" && c.weeks.count { it.judged } >= 2) {
            { AppetiteChart(c.weeks, m) }
        } else {
            null
        }
    val pack = t.pack
    val action: (@Composable () -> Unit)? =
        if (pack != null && pack.sorts.any { ph.derive.getProduct(it.id)?.str("kaufen") != "nicht" }) {
            {
                Btn(
                    "Alle ${word(pack.sorts.size)} nicht mehr kaufen",
                    BtnKind.SOFT,
                    Modifier.padding(bottom = Space.s3).testTag("stop-${pack.brand}"),
                    fill = false,
                    onClick =
                        ui.on(
                            "buy-many",
                            "ids" to pack.sorts.joinToString(",") { it.id },
                            "v" to "nicht",
                            "label" to packLabel(pack),
                        ),
                )
            }
        } else {
            null
        }
    val proof: (@Composable () -> Unit)? =
        if (open == null) {
            null
        } else {
            {
                when {
                    pack != null -> ProofRows(c, pack.sorts.sortedWith(worstFirst), branded = false)
                    t.kind == "neuerdings" -> {
                        val by = t.moves.associateBy { it.id }
                        ProofRows(c, sorts) { e -> by[e.id]?.let { plainOf(moveSaid(it)) } ?: "" }
                    }
                    x != null -> {
                        val list = x.sorts.sortedWith(if (x.gap < 0 || t.kind == "sosse") worstFirst else worstFirst.reversed())
                        val phrase = PHRASES[x.a.key as? String]?.sorts
                        if (t.kind == "konsistenz") MixGrid(x)
                        if (t.kind == "konsistenz" && phrase != null) {
                            Label(if (list.size == 2) "Beide $phrase" else "Die ${word(list.size)} $phrase", top = Space.s2)
                        }
                        ProofRows(c, list, branded = t.kind != "marke")
                    }
                    else -> ProofRows(c, sorts)
                }
            }
        }
    TraitRow(
        tagOf(t),
        said,
        tap =
            when {
                one != null -> ui.on("open-product", "id" to one.id)
                open != null -> ui.on("fold", "v" to key)
                else -> null
            },
        open = open,
        end = end,
        visual = visual,
        chart = chart,
        action = action,
        proof = proof,
    )
}

/** every line of the Steckbrief, the feeding ones under their label, then what showed nothing clear */
@Composable
private fun Traits(
    traits: List<Trait>,
    c: Ctx,
    last: Boolean = true,
) {
    watch()
    val ph = LocalUi.current.phone
    val said = traits.mapNotNull { t -> ph.traitSaid(t, c)?.let { t to it } }
    var feeding = false
    said.forEachIndexed { i, (t, s) ->
        if (t.kind in FEEDING && !feeding) {
            feeding = true
            Label("Beim Füttern")
        } else if (i > 0) {
            Divider()
        }
        TraitBlock(t, s, c)
    }
    val wet =
        c.m.sorts
            .filter { typeOf(it.product) == TYPES[0] }
            .sumOf { it.n }
    val shown = said.map { it.first.kind }.toSet()
    val topics =
        listOf(
            "Marke" to setOf("marke", "pack"),
            "Konsistenz" to setOf("konsistenz", "sosse"),
            "Geschmack" to setOf("geschmack"),
            "Tageszeit" to setOf("tageszeit"),
            "Neuem" to setOf("neu"),
        )
    val missing = topics.filter { (_, kinds) -> kinds.none { it in shown } }.map { it.first }
    val end =
        when {
            !last -> ""
            wet < CLEAR -> "Für mehr reicht es noch nicht. Mit jeder Bewertung kommt etwas dazu."
            missing.isNotEmpty() -> "Noch nichts Deutliches bei ${andList(missing)}."
            else -> ""
        }
    if (end.isNotEmpty()) T(end, Type.small, Modifier.padding(top = Space.s3), colors.muted)
}

private fun thousands(n: Int) = if (n < 1000) "$n" else String.format(Locale.GERMAN, "%,d", n)

private fun since(t: Long) = dayMonth(t) + if (yearOf(t) != yearOf(Time.now())) " ${yearOf(t)}" else ""

@Composable
private fun Header(
    pet: de.schmeckts.app.Rec?,
    d: de.schmeckts.app.Diary,
) {
    watch()
    val name = pet?.str("name") ?: ""
    val said =
        when (d.n) {
            0 -> "Noch nichts bewertet"
            1 -> "Eine Bewertung vom ${since(d.first)}"
            else -> "${thousands(d.n)} Bewertungen seit dem ${since(d.first)}"
        }
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = "$name, $said." },
        horizontalArrangement = Arrangement.spacedBy(Space.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(pet, Av.L)
        Column(Modifier.weight(1f)) {
            T(name, Type.subheading, color = colors.ink)
            T(said, Type.small, color = colors.muted)
        }
    }
}

/** What one cat is like as an eater, on the page's ground. household: nobody has rated anything yet. */
@Composable
private fun Steckbrief(
    s: PetSummary,
    traits: List<Trait>,
    c: Ctx,
    r: Ranking,
    household: Boolean,
) {
    watch()
    val ui = LocalUi.current
    val pet = ui.phone.derive.getPet(s.pet)
    val name = esc(pet?.str("name") ?: "")
    Column(Modifier.fillMaxWidth().testTag("profile")) {
        Header(pet, s.diary)
        Gap(Space.s4)
        if (s.diary.n == 0) {
            if (household) {
                M(
                    "Bewerte nach dem Füttern, wie viel $name gefressen hat. Ab drei Bewertungen einer Sorte steht hier, ob sie ankommt.",
                    Type.body,
                    color = colors.ink,
                )
                Gap(Space.s4)
                Btn("Füttern", BtnKind.PRIMARY, icon = "feed", onClick = ui.on("feed"))
            } else {
                M("Für $name ist noch nichts bewertet.", Type.body, color = colors.ink)
            }
        } else {
            ShelfBar(s.shelf, legend = true)
            Gap(Space.s5)
            if (r.stale) {
                M(
                    "Die letzten Bewertungen sind über ein halbes Jahr alt. Nach ein paar neuen steht hier wieder, was $name mag.",
                    Type.body,
                    color = colors.ink,
                )
            } else if (r.rated == 0) {
                Traits(traits, c, last = false)
                M(
                    "Bewertet sind bisher nur Trockenfutter und Snacks. Was davon ankommt, steht unten beim Einkaufen.",
                    Type.body,
                    Modifier.padding(top = Space.s3),
                    colors.ink,
                )
            } else {
                Traits(traits, c)
            }
        }
    }
}

private class PickSaid(
    val e: Sort,
    val rest: String,
    val status: String,
    val open: Int,
    val pets: List<String>,
    val of: (Stat) -> List<Pt>,
) {
    val sub get() = joined(brand(e), rest)
}

private fun Phone.pickSaid(
    m: Model,
    p: Pick,
    now: Long,
): PickSaid? {
    val several = m.pets.size > 1
    val e = m.byId[p.id] ?: return null
    p.trial?.let { t ->
        val then = if (t.need == 1 && goodOf(e.counts) == e.n) "kommt sie auf die Einkaufsliste" else "steht’s fest"
        val again = if (t.need == 1) "einmal" else "zweimal"
        val status =
            if (several) {
                "Für ${derive.getPet(
                    t.pet,
                )?.str("name")} noch $again füttern, dann $then."
            } else {
                "Noch $again füttern, dann $then."
            }
        return PickSaid(e, "bisher ${lower(whyOf(e, true))}", status, if (several) 0 else t.need, m.pets) { it.window }
    }
    p.missed?.let { v ->
        val rated = m.pets.count { pid -> (e.pets[pid]?.list?.size ?: 0) > 0 }
        val by = if (several && v.by.size < rated) "bei ${derive.petNames(v.by)} " else ""
        return PickSaid(e, "davor $by${lower(evidenceOf(v))}", "Gab es seit ${lapse(v.at, now)} nicht mehr.", 0, v.by) {
            it.list.take(NEXT_NEWEST)
        }
    }
    p.retry?.let { x ->
        val first = e.pets[x.pet] ?: return null
        return PickSaid(
            e,
            "beim ersten Mal ${lower(evidenceOf(first))}",
            "${petName(m, x.pet, "next")} braucht bei Neuem oft einen zweiten Versuch.",
            0,
            listOf(x.pet),
        ) { it.list.take(1) }
    }
    return null
}

/** what to feed next and why, with its button under the text; dots: as on the page, else the card's short form */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NextRow(
    m: Model,
    s: PickSaid,
    tag: String,
    dots: Boolean = true,
) {
    watch()
    val ui = LocalUi.current
    val e = s.e
    val name = ui.phone.nameOf(e)
    val b = brand(e)
    Column(Modifier.fillMaxWidth()) {
        ListRow(
            Modifier.testTag(tag + e.id),
            onClick = ui.on("open-product", "id" to e.id),
            top = true,
            label = "$name${if (b.isNotEmpty()) " von $b" else ""}. ${sentence(cap(s.rest))} ${s.status}",
        ) {
            Thumb(null, e.product, Th.L)
            Column(Modifier.weight(1f)) {
                T(name, Type.bodyStrong, maxLines = 2)
                if (dots) {
                    FlowRow(
                        Modifier.padding(top = Space.hair),
                        horizontalArrangement = Arrangement.spacedBy(Space.s2),
                        verticalArrangement = Arrangement.spacedBy(Space.s1),
                    ) {
                        DotLines(m, e, Modifier.align(Alignment.CenterVertically), s.open, s.pets, s.of)
                        T(s.sub, Type.small, Modifier.align(Alignment.CenterVertically), colors.muted)
                    }
                }
                T(s.status, Type.small, Modifier.padding(top = Space.hair), if (dots) colors.ink else colors.muted)
            }
        }
        Btn(
            "Füttern",
            BtnKind.SOFT,
            Modifier
                .padding(start = Size.picL + Space.s3, bottom = Space.s3)
                .testTag("feed-${e.id}")
                .semantics { contentDescription = "$name füttern" },
            icon = "feed",
            fill = false,
            nowrap = true,
            onClick = ui.on("serve", "id" to e.id),
        )
    }
}

@Composable
private fun TestMeal(x: Experiment) {
    watch()
    val ph = PHRASES[x.texture] ?: return
    val brands = andList(x.brands, "oder")
    val body =
        if (x.worse) {
            "Mal eine Sorte ${ph.without} von $brands${x.liked?.let { ", oder eine ${ph.inside} von $it" } ?: ""}."
        } else {
            "Mal eine Sorte ${ph.inside} von einer anderen Marke als $brands, oder eine von ${x.brands[0]} ${ph.without}."
        }
    Column(Modifier.fillMaxWidth().testTag("next-versuch")) {
        T(body, Type.body, color = colors.ink)
        Hint(
            esc("Alles ${ph.inside} war bisher von $brands. So zeigt sich, ob es ${ph.on} liegt oder an der Marke."),
            Modifier.padding(top = Space.s1),
        )
    }
}

@Composable
private fun NextCard(
    m: Model,
    picks: List<PickSaid>,
    x: Experiment?,
) {
    watch()
    Card(Modifier.testTag("next")) {
        CardTitle("Als Nächstes füttern")
        Folded(picks, "next", Size.picL + Space.s3) { NextRow(m, it, "next-") }
        if (x != null) {
            if (picks.isNotEmpty()) Divider()
            Label("Ein Versuch", top = if (picks.isEmpty()) Space.s2 else Space.s5)
            TestMeal(x)
        }
    }
}

/** a band of Einkaufen: its square and its name */
@Composable
private fun BandLabel(
    text: String,
    tone: String?,
    first: Boolean = false,
) {
    watch()
    Row(
        Modifier.padding(top = if (first) Space.s2 else Space.s5).semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Swatch(tone)
        Gap(Space.s2)
        T(text, Type.smallStrong, color = colors.ink)
    }
}

private class Bands(
    val buy: List<Sort>,
    val meh: List<Sort>,
    val stop: List<Sort>,
    val open: List<Sort>,
) {
    val empty get() = buy.isEmpty() && meh.isEmpty() && stop.isEmpty() && open.isEmpty()
}

// by type first; Geht so by how well each goes down, Noch offen the last served first and without what Als Nächstes holds
private fun bandsOf(
    v: Vorlieben,
    shown: Set<String>,
): Bands {
    val g = v.shop
    val type = compareBy<Sort> { TYPES.indexOf(typeOf(it.product)) }
    return Bands(
        g.nachkaufen.sortedWith(type),
        g.geht.sortedWith(type.thenByDescending { likingOf(it) }),
        g.nicht.sortedWith(type),
        g.neu.filter { it.id !in shown }.sortedWith(type.thenByDescending { v.last[it.id] ?: 0L }),
    )
}

@Composable
private fun ShopCard(
    c: Ctx,
    g: Bands,
    next: Boolean,
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val at = Size.picL + Space.s3
    val row: @Composable (Sort, String) -> Unit = { e, band ->
        val x = ph.rowSaid(e, c, band)
        SortRow(c.m, e, x.sub, x.label)
    }
    Card(Modifier.testTag("shop")) {
        CardTitle("Einkaufen")
        BandLabel("Nachkaufen", "good", first = true)
        if (g.buy.isEmpty()) {
            Hint("Noch nichts zum Nachkaufen.", Modifier.padding(top = Space.s2))
        } else {
            Folded(g.buy, "shop:nachkaufen", at) { row(it, "nachkaufen") }
        }
        if (g.meh.isNotEmpty()) {
            BandLabel("Geht so", "mid")
            Folded(g.meh, "shop:geht", at) { row(it, "geht") }
        }
        if (g.stop.isNotEmpty()) {
            BandLabel("Nicht mehr kaufen", "bad")
            Folded(g.stop, "shop:nicht", at) { row(it, "nicht") }
        }
        if (g.open.isNotEmpty()) {
            val n = g.open.size
            val open = isOpen("shop:offen")
            BandLabel("Noch offen", null)
            Hint(
                when {
                    next -> "Dazu ${word(n)} weitere, noch zu wenig bewertet."
                    n == 1 -> "Eine Sorte, noch zu wenig bewertet."
                    else -> "${bigWord(n)} Sorten, noch zu wenig bewertet."
                },
                Modifier.padding(top = Space.s2),
                bottom = 0.dp,
            )
            Column(Modifier.fillMaxWidth().animateContentSize(unfold())) {
                if (open) {
                    g.open.forEachIndexed { i, e ->
                        if (i > 0) Divider(at)
                        row(e, "offen")
                    }
                }
            }
            Link(
                if (open) "Weniger" else "Zeigen",
                Modifier.minTap().testTag("fold-shop:offen"),
                onClick =
                    ui.on(
                        "fold",
                        "v" to "shop:offen",
                    ),
            )
        }
        if (g.buy.isNotEmpty()) CardBtn("Einkaufsliste teilen", icon = "share", onClick = ui.on("share-list"))
    }
}

// label muted, value ink, in one line of text
private fun saidLine(
    s: Said,
    muted: androidx.compose.ui.graphics.Color,
) = buildAnnotatedString {
    withStyle(SpanStyle(color = muted)) { append("${s.label}: ") }
    append(s.value)
}

/** each cat in short: two lines of its Steckbrief and its tally; a tap shows the cat's page */
@Composable
private fun CatsBlock(sum: Summary) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    Column(Modifier.fillMaxWidth().testTag("cats")) {
        sum.pets.forEachIndexed { i, s ->
            if (i > 0) Divider()
            val pet = d.getPet(s.pet)
            val name = pet?.str("name") ?: ""
            val c = Ctx(d.modelFor(s.pet))
            val lines = cardTraits(s.traits, null).mapNotNull { ph.traitSaid(it, c) }
            val counts = s.shelf.let { "${it.buy} nachkaufen, ${it.meh} geht so, ${it.stop} nicht mehr kaufen, ${it.open} noch offen" }
            val said = lines.joinToString(" ") { "${it.label}: ${it.value}." }.ifEmpty { "Noch steht nichts fest." }
            ListRow(
                Modifier.testTag("cat-${s.pet}"),
                onClick = ui.on("filter", "id" to s.pet),
                top = true,
                label = "$name: $counts. $said Ansehen.",
            ) {
                Avatar(pet, Av.M)
                Column(Modifier.weight(1f)) {
                    T(name, Type.subheading, color = colors.ink)
                    if (lines.isEmpty()) {
                        T("Noch steht nichts fest.", Type.small, Modifier.padding(top = Space.hair), colors.muted)
                    } else {
                        for (l in lines) T(saidLine(l, colors.muted), Type.small, Modifier.padding(top = Space.hair), colors.ink)
                    }
                    Gap(Space.s2)
                    ShelfBar(s.shelf, legend = false)
                }
                Chevron()
            }
        }
        Gap(Space.s1)
        ShelfLegend(null)
    }
}

@Composable
private fun DifferRow(x: Differ) {
    watch()
    val d = LocalUi.current.phone.derive
    val a = d.getPet(x.a)?.str("name") ?: ""
    val b = d.getPet(x.b)?.str("name") ?: ""
    val ph = x.key?.let { PHRASES[it] }
    val (label, value) =
        when (x.kind) {
            "konsistenz" -> "Konsistenz" to (TEXTURE_SAID[x.key] ?: x.key ?: "")
            "marke" -> "Marke" to (x.key ?: "")
            else -> "Insgesamt" to "Bei denselben Mahlzeiten"
        }
    val sub = if (x.kind == "alles") "$b lässt öfter etwas stehen als $a." else "$a frisst ${ph?.it ?: "sie"} lieber als $b."
    val where =
        when (x.kind) {
            "konsistenz" -> ph?.let { " ${it.inside}" } ?: ""
            "marke" -> " von ${x.key}"
            else -> ""
        }
    val note = "Bei ${x.shared} Mahlzeiten$where für beide hat ${often(x.ab)} $a gut gefressen und $b kaum, umgekehrt ${often(x.ba)}."
    TraitRow(
        "differ-${x.kind}${x.key?.let { "-$it" } ?: ""}",
        Said(
            label,
            value,
            esc(sub),
            Compared("<b>${esc(a)}</b>: ${times(x.aGood, x.shared)} gut gefressen", x.aSide),
            Compared("${esc(b)}: ${times(x.bGood, x.shared)} gut gefressen", x.bSide),
            note = esc(note),
        ),
    )
}

// a badge for each cat with ratings of its own, the verdict in its words
@Composable
private fun Verdicts(
    m: Model,
    e: Sort,
) {
    watch()
    val d = LocalUi.current.phone.derive
    Chips(Modifier.padding(top = Space.s2)) {
        for (pid in m.pets) {
            val x = e.pets[pid]?.takeIf { it.n > 0 } ?: continue
            val name = d.getPet(pid)?.str("name") ?: continue
            when (x.verdict) {
                "nachkaufen" -> Badge("$name: ja", icon = "champ", tone = colors.tone("good"))
                "nicht" -> Badge("$name: nein", icon = "flop", tone = colors.tone("bad"))
                "geht" -> Badge("$name: geht so", icon = "r_mittel", tone = colors.tone("mid"))
                else -> Badge("$name: offen")
            }
        }
    }
}

private fun verdictWords(
    ph: Phone,
    m: Model,
    e: Sort,
) = m.pets.mapNotNull { pid ->
    val x = e.pets[pid]?.takeIf { it.n > 0 } ?: return@mapNotNull null
    val name = ph.derive.getPet(pid)?.str("name") ?: return@mapNotNull null
    when (x.verdict) {
        "nachkaufen" -> "$name: ja"
        "nicht" -> "$name: nein"
        "geht" -> "$name: geht so"
        else -> "$name: offen"
    }
}

private fun agrees(m: Model) = m.sorts.count { e -> m.pets.count { pid -> (e.pets[pid]?.verdict ?: "neu") != "neu" } >= 2 } >= 3

@Composable
private fun DifferCard(
    c: Ctx,
    r: Ranking,
    differ: List<Differ>,
) {
    watch()
    val ph = LocalUi.current.phone
    val m = c.m
    Card(Modifier.testTag("differ")) {
        CardTitle("Da sind sie sich uneinig")
        if (differ.isEmpty() && r.split.isEmpty()) {
            Hint("Bisher mögen sie dieselben Sorten.", Modifier.padding(top = Space.s2))
        } else {
            differ.forEachIndexed { i, x ->
                if (i > 0) Divider()
                DifferRow(x)
            }
            if (r.split.isNotEmpty()) {
                Label("Sorten", top = if (differ.isEmpty()) Space.s2 else Space.s5)
                Folded(r.split, "differ", Size.picL + Space.s3) { e ->
                    val b = brand(e)
                    val label =
                        sentence("${ph.nameOf(e)}${if (b.isNotEmpty()) " von $b" else ""}. ${verdictWords(ph, m, e).joinToString(", ")}")
                    SortRow(m, e, lead(e), label) { Verdicts(m, e) }
                }
            }
        }
    }
}

@Composable
private fun CatChips() {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val cur = ph.prefs.activePet.takeIf { ph.derive.getPet(it) != null } ?: "all"
    Chips(
        Modifier.semantics {
            isTraversalGroup = true
            contentDescription = "Katze auswählen"
        },
    ) {
        Chip(
            "Alle",
            Modifier.heightIn(min = Size.tap).testTag("chip-all"),
            pressed = cur == "all",
            icon = "paw",
            onClick = if (cur == "all") null else ui.on("filter", "id" to "all"),
        )
        for (pet in ph.db.pets) {
            Chip(
                pet.str("name") ?: "",
                Modifier.heightIn(min = Size.tap).testTag("chip-${pet.id}"),
                pressed = cur == pet.id,
                lead = { Avatar(pet, Av.XS) },
                onClick = if (cur == pet.id) null else ui.on("filter", "id" to pet.id),
            )
        }
    }
}

fun Phone.hasEvaluationCard(m: Model): Boolean {
    val r = derive.rankingModel()
    return r.rated > 0 || shopGroups(m).nachkaufen.isNotEmpty()
}

@Composable
fun hasEvaluationCard(m: Model) = LocalUi.current.phone.hasEvaluationCard(m)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CardTrait(
    kind: String,
    s: Said,
) {
    watch()
    FlowRow(
        Modifier
            .fillMaxWidth()
            .testTag("card-trait-$kind")
            .padding(top = Space.s1)
            .semantics(mergeDescendants = true) { contentDescription = "${s.label}: ${s.value}" },
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
    ) {
        T(s.label, Type.small, Modifier.alignByBaseline(), colors.muted)
        T(s.value, Type.bodyStrong, Modifier.alignByBaseline(), if (s.quiet) colors.muted else colors.ink)
    }
}

/** hintId: the variety the question card above names, so the card does not say it twice */
@Composable
fun EvaluationCard(
    m: Model,
    hintId: String? = null,
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val r = d.rankingModel()
    val sum = d.summaryModel()
    val now = Time.now()
    val pick = sum.pick?.let { ph.pickSaid(m, it, now) }
    Card {
        CardHead("Vorlieben", label = "Alle Vorlieben", onMore = ui.on("open-evaluation"))
        if (sum.pets.size >= 2) {
            sum.pets.forEachIndexed { i, s ->
                if (i > 0) Divider(Size.picM + Space.s3)
                val pet = d.getPet(s.pet)
                val name = pet?.str("name") ?: ""
                val c = Ctx(d.modelFor(s.pet))
                val said =
                    cardTraits(s.traits, hintId)
                        .mapNotNull { ph.traitSaid(it, c) }
                        .joinToString(" ") { "${it.label}: ${it.value}." }
                        .ifEmpty { "Noch steht nichts fest." }
                ListRow(Modifier.testTag("card-cat-${s.pet}"), onClick = ui.on("open-evaluation", "pet" to s.pet), label = "$name. $said") {
                    Avatar(pet, Av.M)
                    TMain(esc(name), esc(said))
                    Chevron()
                }
            }
            if (pick != null) {
                Divider()
                NextRow(m, pick, "pick-", dots = false)
            }
            return@Card
        }
        val s = sum.pets.firstOrNull()
        val c = Ctx(if (s != null) d.modelFor(s.pet) else m)
        val lines = s?.let { cardTraits(it.traits, hintId).mapNotNull { t -> ph.traitSaid(t, c)?.let { x -> t.kind to x } } }.orEmpty()
        val body: @Composable (
            String,
        ) -> Unit = { text -> M(text, Type.body, Modifier.padding(top = Space.hair, bottom = Space.s3), colors.ink) }
        when {
            r.rated == 0 -> {
                if (s != null) ShelfBar(s.shelf, legend = true, Modifier.padding(top = Space.s2))
                Label("Nachkaufen", top = Space.s4)
                shopGroups(m).nachkaufen.take(CARD_BUY).forEachIndexed { i, e ->
                    if (i > 0) Divider(Size.picL + Space.s3)
                    val x = ph.rowSaid(e, c, "nachkaufen")
                    SortRow(m, e, x.sub, x.label)
                }
            }
            r.stale -> {
                body("Die letzten Bewertungen sind über ein halbes Jahr alt.")
                if (s != null) ShelfBar(s.shelf, legend = true)
                if (pick != null && sum.pick?.missed != null) {
                    Gap(Space.s3)
                    Divider()
                    NextRow(m, pick, "pick-", dots = false)
                } else {
                    Gap(Space.s3)
                }
            }
            lines.isEmpty() && pick == null -> body(ph.waiting(m, r))
            else -> {
                val shown = lines.ifEmpty { listOfNotNull(ph.traitSaid(Trait("liebling"), c)?.let { "liebling" to it }) }
                for ((kind, x) in shown) CardTrait(kind, x)
                if (s != null) {
                    Gap(Space.s3)
                    ShelfBar(s.shelf, legend = true)
                }
                Gap(Space.s3)
                if (pick != null) {
                    Divider()
                    NextRow(m, pick, "pick-", dots = false)
                }
            }
        }
    }
}

@Composable
fun EvaluationPage() {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val m = d.model()
    val r = d.rankingModel()
    val v = d.vorliebenModel()
    val sum = d.summaryModel()
    val c = Ctx(m, r, v.weeks, v.last)
    val scroll = rememberScrollState()
    val still = reduceMotion
    LaunchedEffect(ph.prefs.activePet) { if (still) scroll.scrollTo(0) else scroll.animateScrollTo(0) }
    val one = sum.pets.singleOrNull()
    val picks = v.picks.mapNotNull { ph.pickSaid(m, it, c.now) }
    val bands = bandsOf(v, v.picks.map { it.id }.toSet())
    val experiment = if (one != null) v.experiment else null
    val household = ph.db.servings.none { s -> s.pets.values.any { de.schmeckts.app.rOf(it) != null } }
    SheetBody("Vorlieben", ui.sheets, onBack = ui.on("settings-back"), scroll = scroll) {
        if (ph.db.pets.size >= 2) {
            CatChips()
            Gap(Space.s4)
        }
        if (one != null) Steckbrief(one, v.traits, c, r, household) else CatsBlock(sum)
        val cards =
            listOfNotNull(
                if (one == null && (v.differ.isNotEmpty() || r.split.isNotEmpty() || agrees(m))) "differ" else null,
                if (picks.isNotEmpty() || experiment != null) "next" else null,
                if (!bands.empty && !(household && one != null)) "shop" else null,
            )
        cards.forEachIndexed { i, k ->
            Gap(if (i == 0) Space.s6 else Space.s4)
            when (k) {
                "differ" -> DifferCard(c, r, v.differ)
                "next" -> NextCard(m, picks, experiment)
                else -> ShopCard(c, bands, picks.isNotEmpty())
            }
        }
    }
}
