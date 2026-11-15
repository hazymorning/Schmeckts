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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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
import de.schmeckts.app.OBSERVATIONS
import de.schmeckts.app.PetSummary
import de.schmeckts.app.Phone
import de.schmeckts.app.Pick
import de.schmeckts.app.Pt
import de.schmeckts.app.RATINGS
import de.schmeckts.app.Ranking
import de.schmeckts.app.Shelf
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
import de.schmeckts.app.allGood
import de.schmeckts.app.andList
import de.schmeckts.app.cap
import de.schmeckts.app.cardTraits
import de.schmeckts.app.dayMonth
import de.schmeckts.app.esc
import de.schmeckts.app.flavoursOf
import de.schmeckts.app.goodOf
import de.schmeckts.app.jsRound
import de.schmeckts.app.likingOf
import de.schmeckts.app.mostly
import de.schmeckts.app.observationOf
import de.schmeckts.app.ownGroups
import de.schmeckts.app.pets
import de.schmeckts.app.pname
import de.schmeckts.app.ratingsIn
import de.schmeckts.app.tallyOf
import de.schmeckts.app.textureKey
import de.schmeckts.app.trialOf
import de.schmeckts.app.typeOf
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
import de.schmeckts.app.ui.IconBtn
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
private const val FOLD_REST = 4 // a band's rows that ask nothing fold from this many, fewer show at once
private const val CLEAR = 20 // wet ratings in the windows from which the last line names what showed nothing clear
private const val CARD_BUY = 3
private const val SKETCH = 3 // varieties with a verdict before the cat is put in a sentence
private const val BRANDS = 0.9f // the grid's brand column beside each of its two, so „nie bekommen“ keeps one line at 360dp

private val FEEDING = setOf("wiederholung", "neu", "tageszeit", "snack", "feeder")

// lines that ask nothing of anyone, told in a word, in this order: no favourite yet before the findings, the rest after
private val QUIET = listOf("liebling", "snacks", "appetit")

private fun quietOf(t: Trait) =
    (t.kind == "appetit" && t.key == "unauffaellig") || t.kind == "snacks" || (t.kind == "liebling" && t.ids.isEmpty())

private val WORDS = listOf("eine", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf")

/** a count in words up to twelve: „Alle vier nicht mehr kaufen“ */
fun word(n: Int) = WORDS.getOrNull(n - 1) ?: "$n"

private fun bigWord(n: Int) = cap(word(n))

private fun sentence(s: String) = if (s.isEmpty() || s.last() in ".!?") s else "$s."

/** How a consistency is put: its varieties, what a finding may lie on, in and without it, after a brand, what a cat
 likes, as „it“ */
private class Phrase(
    val sorts: String,
    val on: String,
    val inside: String,
    val without: String,
    val after: String,
    val liked: String,
    val it: String = "sie",
)

private val PHRASES =
    mapOf(
        "sosse" to Phrase("Sorten in Soße", "an der Soße", "in Soße", "ohne Soße", "in Soße", "die Soße"),
        "gelee" to Phrase("Sorten in Gelee", "am Gelee", "in Gelee", "ohne Gelee", "in Gelee", "das Gelee"),
        "pastete" to Phrase("Sorten als Pastete", "an der Pastete", "als Pastete", "nicht als Pastete", "Pastete", "die Pastete"),
        "mousse" to Phrase("Sorten als Mousse", "an der Mousse", "als Mousse", "nicht als Mousse", "Mousse", "die Mousse"),
        "block" to Phrase("Sorten am Stück", "am festen Block", "am Stück", "nicht am Stück", "am Stück", "den festen Block", "ihn"),
        "suppe" to Phrase("Sorten als Suppe", "an der Suppe", "als Suppe", "nicht als Suppe", "Suppe", "die Suppe"),
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

// a variety saved without a name of its own goes by its brand, so its line does not name the brand again
private fun unnamed(e: Sort) = e.product.str("variety").isNullOrEmpty()

// adds the brand where another variety has the same name
private fun Phone.nameOf(e: Sort): String {
    val p = e.product
    val twins = db.products.count { pname(it) == pname(p) } > 1
    return pname(p) + if (twins && brand(e).isNotEmpty() && !unnamed(e)) " von ${brand(e)}" else ""
}

// what a variety's line starts with: its brand, for anything but wet food its type too
private fun lead(e: Sort): String {
    val type = typeOf(e.product)
    return when {
        type == TYPES[0] -> if (unnamed(e)) "" else brand(e)
        brand(e).isEmpty() || unnamed(e) -> type
        else -> "$type von ${brand(e)}"
    }
}

// the variety read out with its brand: „Lachs von Sheba.“
private fun Phone.heard(e: Sort) = "${nameOf(e)}${if (brand(e).isNotEmpty() && !unnamed(e)) " von ${brand(e)}" else ""}."

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
        r.settled > 0 && r.mid.isEmpty() && r.split.isNotEmpty() ->
            "${esc(
                derive.petNames(
                    m.pets.filter { pid ->
                        r.split.any { (it.pets[pid]?.n ?: 0) > 0 }
                    },
                ),
            )} sind sich bisher bei keiner Sorte einig."
        r.settled > 0 -> "Noch ist keine Sorte ein klarer Treffer oder Reinfall."
        else -> "Noch steht keine Sorte fest."
    }

/** what the words of a line draw on; r is left out where only label and value are shown */
private class Ctx(
    val m: Model,
    val r: Ranking? = null,
    val weeks: List<Block> = emptyList(),
    val last: Map<String, Long> = emptyMap(),
    val now: Long = Time.now(),
    val experiment: Experiment? = null,
)

/** A line of the Steckbrief in words: label and value plain, sub and note as markup, the sides it compares; brand: the
 value names a brand */
private class Said(
    val label: String,
    val value: String,
    val sub: String = "",
    val a: Compared? = null,
    val b: Compared? = null,
    val quiet: Boolean = false,
    val note: String = "",
    val brand: Boolean = false,
)

private fun side(
    head: String,
    x: Side,
) = Compared("$head: ${times(x.good, x.n)} gut gefressen", x)

private fun better(gap: Double) = if (gap > 0) "Frisst lieber" else "Lässt öfter stehen"

private fun packLabel(p: de.schmeckts.app.BrandLine) = listOfNotNull(p.brand, p.texture?.let { PHRASES[it]?.after }).joinToString(" ")

// the side a consistency is set against: a named one, the rest without it, or the rest where some have none on record;
// rest: how that rest is put
private fun otherLabel(
    x: Insight,
    rest: String = "Andere Sorten",
) = x.b.key?.let(::textureLabel)
    ?: PHRASES[x.a.key]?.takeIf { x.rest.all { textureKey(it.product).isNotEmpty() } }?.let { cap(it.without) }
    ?: rest

// what a failing line in its consistency leaves open: the others in it, or that there were none
private fun lineSaid(
    p: de.schmeckts.app.BrandLine,
    x: Insight,
): String {
    val ph = PHRASES[x.a.key as? String] ?: return ""
    val others = x.sorts.filter { brand(it) != p.brand }
    val maybe = " Es kann also auch ${ph.on} liegen."
    val licked = if (x.n > 0) " Oft nur die Soße geleckt: ${x.k} von ${x.n} Mal." else ""
    if (others.isEmpty()) return "Andere ${ph.sorts} gab es nicht.$maybe$licked"
    val o = tallyOf(others)
    val who = andList(others.map(::brand).filter { it.isNotEmpty() }.distinct())
    return if (o.good * 2 < o.n) {
        "Von $who ${ph.inside} auch ${if (o.good == 0) "nie" else "nur ${times(o.good, o.n)}"} gut gefressen.$maybe$licked"
    } else {
        "Von $who ${ph.inside} dagegen ${times(o.good, o.n)} gut gefressen.$licked"
    }
}

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

// the brand all of a group come from, when no other variety of it with a verdict of its own lies outside the group
private fun wholeBrand(
    sorts: List<Sort>,
    m: Model,
): String? {
    val b = brand(sorts[0]).takeIf { b -> b.isNotEmpty() && sorts.all { brand(it) == b } } ?: return null
    val ids = sorts.map { it.id }.toSet()
    return b.takeIf { m.sorts.none { it.id !in ids && brand(it) == b && it.verdict != "neu" && it.n > 0 } }
}

// one variety by name, two by both; more by their brand when it is theirs alone, else by the first and how many more
private fun Phone.groupSaid(
    one: String,
    many: String,
    sorts: List<Sort>,
    c: Ctx,
    liked: Boolean,
): Said {
    val k = sorts.size
    val list = sorts.sortedWith(compareBy<Sort> { likingOf(it) }.let { if (liked) it.reversed() else it })
    val whole = if (k >= 3) wholeBrand(list, c.m) else null
    return when {
        k == 1 -> list[0].let { e -> Said(one, nameOf(e), esc(joined(brand(e), lower(whyOf(e)) + if (liked) away(e, c) else ""))) }
        k == 2 -> Said(many, "${nameOf(list[0])} und ${nameOf(list[1])}", esc(brandsOf(list)))
        whole != null -> {
            // where more of the brand is rated, the sum says it is of these alone
            val apart = c.m.sorts.any { e -> e !in list && brand(e) == whole && e.n > 0 }
            Said(
                many,
                "${bigWord(k)} Sorten von $whole",
                sumSaid(list, if (apart) "Bei diesen ${word(k)} zusammen" else "Zusammen"),
                brand = true,
            )
        }
        else -> {
            // what most of them share, so the value says more than a count; the names stand in the rows it opens
            val textures = list.groupingBy { textureKey(it.product) }.eachCount()
            val (texture, most) = textures.maxBy { it.value }
            val ph = PHRASES[texture]
            val value =
                when {
                    ph != null && textures.size == 1 -> "${bigWord(k)} ${ph.sorts}"
                    ph != null && most * 2 > k -> "${bigWord(k)} Sorten, ${word(most)} davon ${ph.inside}"
                    else -> "${bigWord(k)} Sorten"
                }
            Said(many, value, esc(listOf(sumSaid(list), if (k > 3) brandsOf(list) else "").filter { it.isNotEmpty() }.joinToString(" ")))
        }
    }
}

private fun sumSaid(
    list: List<Sort>,
    head: String = "Zusammen",
) = tallyOf(list).let { "$head ${times(it.good, it.n)} gut gefressen." }

// the favourites' consistency, where only they came in it and it cannot be told from their brand; named: the value
// names the brand already, textured its consistency; who: the cat
private fun keptSaid(
    x: Insight,
    mixed: List<String>,
    k: Int,
    named: Boolean,
    who: String,
    textured: Boolean,
): String {
    val ph = PHRASES[x.a.key as? String] ?: return ""
    val g = x.sorts.size
    val all = if (k == 2) "Beide" else "Alle ${word(k)}"
    val head =
        when {
            textured -> "$all sind von ${andList(mixed)}."
            named && g == k -> "$all sind ${ph.inside}."
            named -> "${bigWord(g)} davon ${if (g == 1) "ist" else "sind"} ${ph.inside}."
            g == k -> "$all sind ${ph.inside} und von ${andList(mixed)}."
            g == 1 -> "Die ${ph.inside} ist von ${andList(mixed)}."
            g == 2 -> "Die beiden ${ph.inside} sind von ${andList(mixed)}."
            else -> "Die ${word(g)} ${ph.inside} sind alle von ${andList(mixed)}."
        }
    return "$head Ob $who ${ph.liked} mag oder die Marke, ist noch offen."
}

private fun Said.with(sub: String) = Said(label, value, sub, a, b, quiet, note, brand)

// a sub and what the owner struck of it
private fun struckSaid(
    sub: String,
    gone: String,
) = if (gone.isEmpty()) sub else "${sentence(sub)} $gone".trim()

// the cat of a page on its own, as „er“ or „sie“
private fun Phone.pronoun(m: Model) = if (m.pets.singleOrNull()?.let { derive.getPet(it)?.str("sex") } == "m") "er" else "sie"

// what the appetite counts leave out, where the cat has ratings of it
private fun Ctx.scope(): String {
    val rated = { type: String -> m.sorts.any { typeOf(it.product) == type && it.total > 0 } }
    return when {
        !rated("Snack") && !rated("Trockenfutter") -> ""
        rated("Sonstiges") -> " ohne Snacks und Trockenfutter"
        else -> " beim Nassfutter"
    }
}

private fun moveSaid(mv: Move) =
    "Vor einem Monat <b>${times(goodOf(mv.before.counts), mv.before.n)}</b> gut gefressen, seitdem ${esc(lower(evidenceOf(mv.since)))}."

private fun Phone.trendSaid(
    t: Trend,
    c: Ctx,
): String {
    val counts =
        "${c.scope()} <b>${times(t.recent.good, t.recent.n)}</b> gut gefressen, in den acht davor ${times(t.before.good, t.before.n)}."
    val names = t.behind.mapNotNull { id -> c.m.byId[id]?.let { nameOf(it) } }
    return when {
        t.cause == "tier" -> "Auch bei den gewohnten Sorten: in den letzten vier Wochen$counts"
        t.cause == "futter" && names.isNotEmpty() ->
            "Bei den gewohnten Sorten wie vorher, ${if (t.dir < 0) "schlechter" else "besser"} nur bei neuen wie <b>${esc(
                andList(names),
            )}</b>."
        t.cause == "futter" -> "Bei den gewohnten Sorten wie vorher, anders nur bei neuen Sorten."
        else -> "In den letzten vier Wochen$counts"
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
        "schlechter" -> a.trend?.let { said("Deutlich schlechter", trendSaid(it, c)) }
        "besser" -> a.trend?.let { said("Deutlich besser", trendSaid(it, c)) }
        "zuletzt-schwaecher", "zuletzt-besser" ->
            w?.let {
                said(
                    if (a.state == "zuletzt-besser") "Zuletzt besser" else "Zuletzt schwächer",
                    "Vom ${spanOf(w.from, w.to)}${c.scope()} <b>${times(w.good, w.n)}</b> gut gefressen, " +
                        "bei diesen Sorten wären etwa ${jsRound(w.expected)} zu erwarten gewesen.",
                )
            }
        "unauffaellig" -> {
            val first = c.weeks.firstOrNull()
            if (c.weeks.size < 2 || first == null) {
                said("Wie gewohnt", "")
            } else {
                // a first week cut short by the first rating is no week
                val span = if (first.start > first.from) "Seit dem ${since(first.start)}" else "In den letzten ${word(c.weeks.size)} Wochen"
                said(
                    "Wie gewohnt",
                    "$span${c.scope()} ${times(c.weeks.sumOf { it.good }, c.weeks.sumOf { it.n })} gut gefressen, " +
                        "jede Woche etwa so, wie ${pronoun(c.m)} die gefütterten Sorten sonst frisst.",
                )
            }
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
                val name = m.pets.singleOrNull()?.let { derive.getPet(it)?.str("name") }
                Said(
                    "Lieblingssorte",
                    "Noch keine",
                    esc("Dafür muss ${name ?: "sie"} eine Sorte mindestens dreimal bekommen und meistens gut gefressen haben."),
                    quiet = true,
                )
            } else if (sorts.isNotEmpty()) {
                val s = groupSaid("Lieblingssorte", "Lieblingssorten", sorts, c, true)
                val textured = PHRASES[x?.a?.key]?.let { s.value.endsWith(it.sorts) } == true
                val kept = x?.let { esc(keptSaid(it, t.mixed, sorts.size, s.brand, pronoun(m), textured)) }
                val struck = sorts.filter { it.kaufen == "nicht" }
                val k = sorts.size
                val gone =
                    when {
                        struck.isEmpty() -> ""
                        k == 1 -> "Von dir gestrichen."
                        struck.size == k -> "${if (k == 2) "Beide" else "Alle ${word(k)}"} hast du gestrichen."
                        k == 2 -> esc("${nameOf(struck[0])} hast du gestrichen.")
                        else -> "${bigWord(struck.size)} davon hast du gestrichen."
                    }
                val sub =
                    when {
                        kept == null -> s.sub
                        k == 2 -> kept
                        else -> "${s.sub} $kept"
                    }
                // what the favourites share against the rest, so the claim stands with its proof
                Said(
                    s.label,
                    s.value,
                    struckSaid(sub, gone),
                    x?.let { side("<b>${esc(textureLabel(it.a.key))}</b>", it.a) },
                    x?.let { side(esc(otherLabel(it)), it.b) },
                    brand = s.brand,
                )
            } else {
                null
            }
        "stehen" ->
            if (sorts.isNotEmpty()) {
                val s = groupSaid("Kommt nicht an", "Kommt nicht an", sorts, c, false)
                s.with(struckSaid(s.sub, if (sorts.all { it.kaufen == "nicht" }) "Von dir gestrichen." else ""))
            } else {
                null
            }
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
                        else -> "Keine der $n Sorten öfter als jedes zweite Mal gut gefressen."
                    }
                val sub = listOf(said, x?.let { lineSaid(p, it) } ?: "", if (struck) "Von dir gestrichen." else "")
                Said(
                    if (p.a.good == 0 && p.a.mid == 0) "Kommt gar nicht an" else "Kommt nicht an",
                    packLabel(p),
                    esc(sub.filter { it.isNotEmpty() }.joinToString(" ")),
                    side("<b>${esc(packLabel(p))}</b>", p.a),
                    side("Andere Sorten", p.b),
                )
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
                        "${if (k == 2) "Die beiden ${ph.sorts} sind" else "Die ${word(k)} ${ph.sorts} sind alle"} von " +
                            "${andList(t.mixed, "oder")}, darum ist offen, ob es ${ph.on} liegt oder an der Marke."
                    } else {
                        ""
                    }
                val sauce = if (it.n > 0) "Oft nur die Soße geleckt: ${it.k} von ${it.n} Mal." else ""
                Said(
                    better(it.gap),
                    TEXTURE_SAID[key] ?: cap(key),
                    esc(listOf(mixed, sauce).filter { s -> s.isNotEmpty() }.joinToString(" ")),
                    side("<b>${esc(textureLabel(key))}</b>", it.a),
                    side(esc(otherLabel(it)), it.b),
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
                    "",
                    Compared(
                        "<b>In Soße</b>: ${times(it.a.good, it.a.n)} gut gefressen, ${if (it.k == 1) "einmal" else "${it.k} Mal"} " +
                            "nur die Soße geleckt",
                        it.a,
                    ),
                    it.instead?.let { i -> side(esc(textureLabel(i.key)), it.b) },
                )
            }
        "snacks" ->
            t.treats?.let {
                // so the snacks still open below read as no doubt
                val kinds = m.sorts.count { e -> typeOf(e.product) == "Snack" && e.n > 0 }
                val each =
                    it.counts.keys
                        .singleOrNull()
                        ?.let { r -> RATINGS.getValue(r).said } ?: "gut gefressen"
                Said(
                    "Snacks",
                    "Immer aufgefressen",
                    when {
                        kinds == it.n -> "${bigWord(kinds)} verschiedene Snacks, jeder $each."
                        kinds > 1 -> "${esc(evidenceOf(it))}, ${word(kinds)} verschiedene Snacks."
                        else -> "${esc(evidenceOf(it))}."
                    },
                )
            }
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
    sep: @Composable (T?, T) -> Unit = { was, _ -> if (was != null) Divider(at) },
    row: @Composable (T) -> Unit,
) {
    watch()
    val ui = LocalUi.current
    val folds = items.size >= FOLD_AT
    val open = folds && isOpen(key)
    (if (folds) items.take(FOLD_SHOWN) else items).forEachIndexed { i, x ->
        sep(items.getOrNull(i - 1), x)
        row(x)
    }
    if (!folds) return
    Column(Modifier.fillMaxWidth().animateContentSize(unfold())) {
        if (open) {
            items.drop(FOLD_SHOWN).forEachIndexed { i, x ->
                sep(items[FOLD_SHOWN + i - 1], x)
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

/** A line of the Steckbrief: a press area with label, value and dots beside its picture, then sub and what it compares
 across the width; under it the week chart, an action and what it rests on. open: null without a proof; figure: what
 stands for the compared sides; quiet: label and value as one line of text, for a line that asks nothing of anyone. */
@Composable
private fun TraitRow(
    tag: String,
    said: Said,
    tap: (() -> Unit)? = null,
    open: Boolean? = null,
    end: (@Composable () -> Unit)? = null,
    visual: (@Composable () -> Unit)? = null,
    chart: (@Composable () -> Unit)? = null,
    figure: (@Composable () -> Unit)? = null,
    action: (@Composable () -> Unit)? = null,
    proof: (@Composable () -> Unit)? = null,
    quiet: Boolean = false,
    legend: Boolean = false,
) {
    watch()
    // a figure reads out its own rows
    val words =
        (
            listOf("${said.label}: ${said.value}.", sentence(plainOf(said.sub)), sentence(plainOf(said.note))) +
                (if (figure == null) listOfNotNull(said.a, said.b) else emptyList()).map { sentence(plainOf(it.text)) }
        ).filter { it.isNotEmpty() }.joinToString(" ")
    val pad = if (quiet) Space.s2 else Space.s3
    val turn by animateFloatAsState(
        if (open == true) 270f else 90f,
        if (reduceMotion) snap() else tween(Motion.STEP, easing = Motion.easeOut),
        label = "fold",
    )
    val swapped = figure != null
    Column(Modifier.fillMaxWidth().animateContentSize(unfold())) {
        Column(
            Modifier
                .testTag(tag)
                .fillMaxWidth()
                .semantics(mergeDescendants = true) {
                    if (!quiet) heading()
                    contentDescription = words
                    if (tap != null) {
                        if (open != null) stateDescription = if (open) "aufgeklappt" else "zugeklappt"
                        onClick(
                            when (open) {
                                null -> "Sorte öffnen"
                                true -> "Weniger zeigen"
                                false -> "Mehr zeigen"
                            },
                        ) {
                            tap()
                            true
                        }
                    }
                }.press(tap, Motion.PRESS_WIDE)
                .heightIn(min = Size.tap)
                .padding(top = pad, bottom = if (chart != null) 0.dp else pad),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                Column(Modifier.weight(1f)) {
                    if (quiet) {
                        T(saidLine(said, colors.muted), Type.body, color = if (said.quiet) colors.muted else colors.ink)
                    } else {
                        T(said.label, Type.captionStrong, color = colors.muted)
                        T(said.value, Type.heading, color = if (said.quiet) colors.muted else colors.ink, balance = true)
                    }
                    if (visual != null) {
                        Gap(Space.s1)
                        visual()
                    }
                }
                // the chevron on the picture's middle, not above it
                if (end != null || tap != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.s3), verticalAlignment = Alignment.CenterVertically) {
                        end?.invoke()
                        when {
                            tap == null -> {}
                            open == null -> Chevron()
                            else -> Icon("chevron", Modifier.graphicsLayer { rotationZ = turn }, Size.iconS, colors.faint)
                        }
                    }
                }
            }
            if (said.sub.isNotEmpty()) M(said.sub, Type.small, Modifier.padding(top = Space.hair), colors.muted)
            if (said.a != null && !swapped) {
                Gap(Space.s2)
                CompareBars(said.a, said.b)
                if (legend) OutcomeLegend(Modifier.padding(top = Space.s2))
            }
            if (said.note.isNotEmpty()) M(said.note, Type.small, Modifier.padding(top = Space.s3), colors.muted)
        }
        if (chart != null) {
            Gap(Space.s2)
            chart()
        }
        if (figure != null) {
            Gap(Space.s2)
            figure()
        }
        if (legend && swapped) OutcomeLegend(Modifier.padding(bottom = Space.s3))
        action?.invoke()
        if (proof != null && open == true) proof()
    }
}

/** a row of a variety: its packaging, name, ratings, then what its dots cannot say; said: each cat's verdict after its
 dots; small: the smaller packaging of the rows under a line of the Steckbrief */
@Composable
private fun SortRow(
    m: Model,
    e: Sort,
    sub: String,
    label: String,
    modifier: Modifier = Modifier,
    tag: String = "sort-${e.id}",
    said: ((String) -> String?)? = null,
    small: Boolean = false,
) {
    watch()
    val ui = LocalUi.current
    ListRow(modifier.testTag(tag), onClick = ui.on("open-product", "id" to e.id), top = true, label = label) {
        Thumb(null, e.product, if (small) Th.M else Th.L)
        Column(Modifier.weight(1f)) {
            T(ui.phone.nameOf(e), Type.bodyStrong)
            DotLines(m, e, Modifier.padding(top = Space.s1), said = said, sub = sub)
        }
    }
}

// where a row's text starts, for its divider
private val rowIndent = Size.picL + Space.s3
private val smallIndent = Size.picM + Space.s3

/** feeds the variety at once, under its row from where the text starts, outside the row's press area; pet: to that cat
 alone */
@Composable
private fun FeedBtn(
    e: Sort,
    pet: String? = null,
) {
    watch()
    val ui = LocalUi.current
    val name = ui.phone.nameOf(e)
    Btn(
        "Füttern",
        BtnKind.SOFT,
        Modifier
            .padding(start = rowIndent, bottom = Space.s3)
            .semantics { contentDescription = "$name füttern" }
            .testTag("feed-${e.id}"),
        icon = "feed",
        fill = false,
        nowrap = true,
        onClick = ui.on("serve", "id" to e.id, "pet" to pet),
    )
}

/** a row to feed from: the first of a card with its button under it, each further one with the bowl beside it, so the
 first reads as the one to feed next */
@Composable
private fun Feedable(
    e: Sort,
    pet: String?,
    first: Boolean,
    row: @Composable (Modifier) -> Unit,
) {
    watch()
    if (first) {
        Column(Modifier.fillMaxWidth()) {
            row(Modifier)
            FeedBtn(e, pet)
        }
        return
    }
    val ui = LocalUi.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        row(Modifier.weight(1f))
        // level with the packaging
        IconBtn(
            "feed",
            "${ui.phone.nameOf(e)} füttern",
            Modifier.padding(top = Space.s3).testTag("feed-${e.id}"),
            colors.accentInk,
            ui.on("serve", "id" to e.id, "pet" to pet),
        )
    }
}

private class RowSaid(
    val sub: String,
    val label: String,
)

// a clause after a sub that may be empty: „, nur für Mau“ or „Nur für Mau“
private fun after(
    head: String,
    extra: String,
) = if (head.isNotEmpty()) head + extra else cap(extra.removePrefix(", ").removePrefix(". "))

// the other cats that like what the one cat of the page leaves
private fun Phone.fansOf(
    e: Sort,
    m: Model,
): List<String> =
    if (m.pets.size != 1 || e.verdict != "nicht") {
        emptyList()
    } else {
        db.pets.filter { it.id !in m.pets && derive.modelFor(it.id).byId[e.id]?.verdict == "nachkaufen" }.mapNotNull { it.str("name") }
    }

// band: the Einkaufen group the row stands in, empty elsewhere; the brand is left out where the rows share it
private fun Phone.rowSaid(
    e: Sort,
    c: Ctx,
    band: String = "",
    branded: Boolean = true,
): RowSaid {
    val evidence =
        when {
            e.total == 0 -> "noch nicht bewertet"
            e.n == 0 -> "lange nicht bewertet"
            else -> lower(whyOf(e))
        }
    val at = c.last[e.id] ?: 0L
    val own =
        if (db.pets.size > 1) {
            c.m.pets
                .singleOrNull()
                ?.let { derive.getPet(it)?.str("name") }
        } else {
            null
        }
    val who = if (e.verdict == "gemischt" && e.yes.isNotEmpty()) ", nur für ${derive.petNames(e.yes)}" else ""
    val fans = if (band == "nicht") fansOf(e, c.m) else emptyList()
    val extra =
        when {
            band == "nachkaufen" && at > 0 && c.now - at >= AWAY -> ", zuletzt vor ${lapse(at, c.now)}"
            fans.isNotEmpty() && e.kaufen == "immer" -> ". Für ${andList(fans)} auf deiner Liste, $own lässt sie stehen."
            fans.isNotEmpty() -> ". ${andList(fans)} ${if (fans.size == 1) "mag" else "mögen"} sie, $own lässt sie stehen."
            e.kaufen == "immer" && e.verdict == "nicht" && own != null -> ". Steht auf deiner Liste, $own lässt sie aber stehen."
            e.kaufen == "immer" && e.verdict == "nicht" -> ". Steht auf deiner Liste, kam zuletzt aber nicht gut an."
            e.kaufen == "nicht" && e.verdict == "nachkaufen" -> ". Von dir gestrichen, kommt inzwischen aber gut an."
            e.kaufen == "nicht" -> ", von dir gestrichen"
            e.kaufen == "immer" -> ", von dir auf die Liste gesetzt"
            else -> ""
        }
    val label = sentence("${heard(e)} ${cap(evidence)}$who$extra")
    // the dots say how it went, the words only where there are none
    val words = if (e.n > 0) "" else evidence
    return RowSaid(after(joined(if (branded) lead(e) else "", words), who + extra), label)
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
        if (i > 0) Divider(smallIndent)
        val x = ph.rowSaid(e, c, branded = branded)
        SortRow(c.m, e, sub?.invoke(e) ?: x.sub, x.label, tag = "proof-${e.id}", small = true)
    }
}

// each group of wet food rated twice or more with its meals, the worst first
private fun Ctx.sidesBy(keysOf: (Sort) -> List<String>): List<Pair<String, Side>> {
    val by = LinkedHashMap<String, MutableList<Sort>>()
    for (e in m.sorts) if (typeOf(e.product) == TYPES[0] && e.n > 0) for (k in keysOf(e)) by.getOrPut(k) { mutableListOf() }.add(e)
    return by
        .map { (k, l) -> k to tallyOf(l) }
        .filter { it.second.n >= 2 }
        .sortedWith(
            compareBy<Pair<String, Side>> { it.second.good.toDouble() / it.second.n }
                .thenByDescending { it.second.n }
                .thenComparing({ it.first }, german),
        )
}

/** every brand and every flavour of wet food with its meals, behind a link: what no line above answers, to look at
 oneself */
@Composable
private fun Overview(
    c: Ctx,
    brands: Boolean,
    flavours: Boolean,
) {
    watch()
    val ui = LocalUi.current
    val lists =
        listOfNotNull(
            if (brands) "Marke" to c.sidesBy { listOf(brand(it).ifEmpty { "Ohne Marke" }) } else null,
            if (flavours) "Geschmack" to c.sidesBy { flavoursOf(it.product.str("variety")) } else null,
        ).filter { it.second.size >= 2 }
    if (lists.isEmpty()) return
    val open = isOpen("marken")
    Column(Modifier.fillMaxWidth().animateContentSize(unfold())) {
        if (open) {
            for ((head, list) in lists) {
                Label("Nach $head", top = Space.s4)
                Column(verticalArrangement = Arrangement.spacedBy(Space.s3)) {
                    list.forEachIndexed { i, (k, x) ->
                        Column(Modifier.semantics(mergeDescendants = true) {}) {
                            T("$k: ${times(x.good, x.n)}${if (i == 0) " gut gefressen" else ""}", Type.small, color = colors.ink)
                            Gap(Space.s1)
                            OutcomeBar(x)
                        }
                    }
                }
            }
        }
    }
    Link(
        if (open) "Weniger" else "Nach ${lists.joinToString(" und ") { it.first }} ansehen",
        Modifier.minTap().testTag("fold-marken"),
        onClick = ui.on("fold", "v" to "marken"),
    )
}

/** brand by consistency: the varieties of a texture finding and the rest, so a brand that never came without it shows */
@Composable
private fun MixGrid(x: Insight) {
    watch()
    val p = colors
    val key = x.a.key as? String
    // beside a column of one consistency the rest is all else, not other brands
    val heads = listOf(textureLabel(key), otherLabel(x, "Sonst"))
    val said = listOf(PHRASES[key]?.inside ?: lower(heads[0]), lower(heads[1]))
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
    val cellsOf = { b: String -> sides.map { s -> s[b]?.let { tallyOf(it) }?.takeIf { it.n > 0 } } }
    val round = Radius.s
    Column(Modifier.fillMaxWidth().padding(bottom = Space.s3)) {
        Row(Modifier.fillMaxWidth().padding(bottom = Space.s1)) {
            Spacer(Modifier.weight(BRANDS))
            for (h in heads) T(h, Type.smallStrong, Modifier.weight(1f).padding(horizontal = Space.s2), p.muted)
        }
        brands.forEachIndexed { i, b ->
            val cells = cellsOf(b)
            // the tested column as one band under its line
            val band =
                RoundedCornerShape(
                    topStart = if (i == 0) round else 0.dp,
                    topEnd = if (i == 0) round else 0.dp,
                    bottomStart = if (i == brands.lastIndex) round else 0.dp,
                    bottomEnd = if (i == brands.lastIndex) round else 0.dp,
                )
            val name = b.ifEmpty { "Ohne Marke" }
            var named = false
            val parts =
                cells.mapIndexed { j, s ->
                    if (s == null) {
                        "${said[j]} nie bekommen"
                    } else {
                        "${said[j]} ${s.good} von ${s.n} Mal" + if (named) "" else " gut gefressen".also { named = true }
                    }
                }
            // name, count and „nie bekommen“ on one line, each bar under its count
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = Size.tap)
                    .height(IntrinsicSize.Min)
                    .semantics(mergeDescendants = true) { contentDescription = "$name: ${parts.joinToString(", ")}." },
                verticalAlignment = Alignment.Top,
            ) {
                T(name, Type.small, Modifier.weight(BRANDS).padding(vertical = Space.s2), p.ink)
                cells.forEachIndexed { j, s ->
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .then(if (j == 0) Modifier.background(p.surface2, band) else Modifier)
                            .padding(Space.s2),
                        contentAlignment = Alignment.TopStart,
                    ) {
                        if (s != null) {
                            Column {
                                T("${s.good} von ${s.n}", Type.small.copy(fontFeatureSettings = "tnum"), color = p.ink)
                                Gap(Space.s1)
                                OutcomeBar(s)
                            }
                        } else {
                            // that brand never came this way, which is what the grid shows
                            T("nie bekommen", Type.small, color = p.muted)
                        }
                    }
                }
            }
        }
    }
}

private val OUTCOMES =
    listOf(
        "good" to "gut gefressen",
        "mid" to "die Hälfte",
        "sauce" to "ein bissl oder nur Soße",
        "bad" to "fast nix",
    )

// one height for every entry, so words beside a square and beside an icon share a line
@Composable
private fun LegendItem(
    word: String,
    mark: @Composable () -> Unit,
) {
    Row(
        Modifier.heightIn(min = Size.iconS),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.s1),
    ) {
        mark()
        T(word, Type.caption, color = colors.muted)
    }
}

/** what the tones of the dots and bars stand for, once, under the first that draws them; more: entries after them */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OutcomeLegend(
    modifier: Modifier = Modifier,
    tones: Boolean = true,
    more: @Composable () -> Unit = {},
) {
    watch()
    FlowRow(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
        if (tones) for ((tone, w) in OUTCOMES) LegendItem(w) { Swatch(tone) }
        more()
    }
}

/** tones: the chart is the first on the page to draw them */
@Composable
private fun AppetiteChart(
    weeks: List<Block>,
    tones: Boolean,
) {
    watch()
    val p = colors
    Column(Modifier.fillMaxWidth().padding(bottom = Space.s3)) {
        WeekChart(weeks)
        OutcomeLegend(Modifier.padding(top = Space.s2), tones) {
            LegendItem("sonst bei diesen Sorten") {
                Canvas(Modifier.size(Size.dot)) {
                    drawLine(p.ink, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), Size.stroke.toPx())
                }
            }
            for (k in OBSERVATIONS.keys.filter { k -> weeks.any { k in it.seen } }) {
                val ob = observationOf(k)
                LegendItem(
                    if (k ==
                        "stink"
                    ) {
                        ob.label
                    } else {
                        lower(ob.label)
                    },
                ) { Icon(ob.icon, size = Size.iconS, color = p.tone(k)?.c ?: p.muted) }
            }
        }
    }
}

// what a line's proof lists, so a later one leaves out what an earlier one showed
private fun listed(t: Trait): List<String> =
    when {
        t.pack != null || t.kind == "liebling" ->
            t.ids +
                t.insight
                    ?.sorts
                    .orEmpty()
                    .map { it.id }
        t.insight != null -> t.insight.sorts.map { it.id }
        grouped(t) -> t.ids
        else -> emptyList()
    }

@Composable
private fun TraitBlock(
    t: Trait,
    said: Said,
    c: Ctx,
    shown: Set<String>,
    quiet: Boolean = false,
    legend: Boolean = false,
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val m = c.m
    val one = c.oneOf(t)
    val key = foldOf(t)
    val chart = c.charted(t)
    // weeks as expected are there to look at, not told at once
    val calm = chart && t.key == "unauffaellig"
    val open = if (grouped(t) || calm) isOpen(key) else null
    val fresh = { l: List<Sort> -> l.filter { it.id !in shown } }
    val sorts = t.ids.mapNotNull { m.byId[it] }
    val worstFirst = compareBy<Sort> { likingOf(it) }
    val x = t.insight
    val pack = t.pack
    // packagings fanned only where there are photos; letters alone read as empty tabs
    val pictured =
        t.ids.count {
            !ph.derive
                .getProduct(it)
                ?.str("thumb")
                .isNullOrEmpty()
        } >= 2
    val end: (@Composable () -> Unit)? =
        when {
            one != null -> {
                { Thumb(null, one.product, Th.L) }
            }
            t.kind in setOf("liebling", "stehen", "neuerdings", "pack") && sorts.size > 1 && pictured -> {
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
    // a whole brand line, unless another cat still eats some of it or is trying it
    val line =
        when {
            pack != null -> Triple(pack.brand, packLabel(pack), pack.sorts)
            t.kind == "stehen" && said.brand -> Triple(brand(sorts[0]), brand(sorts[0]), sorts)
            else -> null
        }
    // what each other cat still eats of the line, so the page says why it has no button
    val eats =
        if (line == null) {
            emptyList()
        } else {
            ph.db.pets.filter { it.id !in m.pets }.mapNotNull { pet ->
                val o = ph.derive.modelFor(pet.id)
                val kept = line.third.mapNotNull { e -> o.byId[e.id]?.takeIf { it.n > 0 && it.verdict != "nicht" } }
                if (kept.isEmpty()) return@mapNotNull null
                val name = pet.str("name") ?: ""
                val (liked, rest) = kept.partition { it.verdict == "nachkaufen" }
                val (meh, open) = rest.partition { it.verdict == "geht" }
                val names = { l: List<Sort> -> andList(l.map { ph.nameOf(it) }) }
                when {
                    liked.isNotEmpty() -> "$name frisst davon ${names(liked)} gern."
                    meh.isNotEmpty() -> "Für $name geht davon ${names(meh)} so."
                    else -> "Für $name ist davon ${names(open)} noch offen."
                }
            }
        }
    val stop = line != null && eats.isEmpty() && line.third.any { ph.derive.getProduct(it.id)?.str("kaufen") != "nicht" }
    val note = esc(eats.joinToString(" "))
    val grid = gridOf(t)
    val action: (@Composable () -> Unit)? =
        if (stop && line != null) {
            {
                Btn(
                    "Alle ${word(line.third.size)} nicht mehr kaufen",
                    BtnKind.SOFT,
                    Modifier.padding(bottom = Space.s3).testTag("stop-${line.first}"),
                    icon = "flop",
                    fill = false,
                    onClick =
                        ui.on(
                            "stop-many",
                            "ids" to line.third.joinToString(",") { it.id },
                            "label" to line.second,
                        ),
                )
            }
        } else {
            null
        }
    val proof: (@Composable () -> Unit)? =
        when {
            open == null -> null
            calm -> {
                { AppetiteChart(c.weeks, legend) }
            }
            else -> {
                {
                    when {
                        t.kind == "liebling" -> ProofRows(c, fresh(sorts))
                        pack != null -> {
                            ProofRows(c, fresh(pack.sorts.sortedWith(worstFirst)), branded = false)
                            if (x != null) {
                                val rest = fresh(x.sorts.filter { it !in pack.sorts }.sortedWith(worstFirst))
                                val phrase = PHRASES[x.a.key as? String]?.sorts
                                if (rest.isNotEmpty() && phrase != null) {
                                    Label(
                                        if (rest.size ==
                                            1
                                        ) {
                                            "Die andere Sorte ${phrase.removePrefix("Sorten ")}"
                                        } else {
                                            "Die ${word(rest.size)} anderen $phrase"
                                        },
                                    )
                                    ProofRows(c, rest)
                                }
                            }
                        }
                        t.kind == "neuerdings" -> {
                            val by = t.moves.associateBy { it.id }
                            ProofRows(c, fresh(sorts)) { e -> by[e.id]?.let { plainOf(moveSaid(it)) } ?: "" }
                        }
                        x != null -> {
                            val all = x.sorts.sortedWith(if (x.gap < 0 || t.kind == "sosse") worstFirst else worstFirst.reversed())
                            val list = fresh(all)
                            val phrase = PHRASES[x.a.key as? String]?.sorts
                            if (t.kind == "konsistenz" && phrase != null && list.isNotEmpty()) {
                                val other = list.size < all.size
                                val one = phrase.replaceFirst("Sorten", "Sorte")
                                Label(
                                    when {
                                        list.size == 1 -> if (other) "Die andere $one" else "Die eine $one"
                                        list.size == 2 && !other -> "Beide $phrase"
                                        other -> "Die ${word(list.size)} anderen $phrase"
                                        else -> "Die ${word(list.size)} $phrase"
                                    },
                                    top = Space.s2,
                                )
                            }
                            ProofRows(c, list, branded = t.kind != "marke")
                        }
                        else -> ProofRows(c, fresh(sorts))
                    }
                }
            }
        }
    TraitRow(
        tagOf(t),
        if (note.isEmpty()) said else Said(said.label, said.value, said.sub, said.a, said.b, said.quiet, note, said.brand),
        tap =
            when {
                one != null -> ui.on("open-product", "id" to one.id)
                open != null -> ui.on("fold", "v" to key)
                else -> null
            },
        open = open,
        end = end,
        visual = visual,
        chart =
            if (chart && !calm) {
                { AppetiteChart(c.weeks, legend) }
            } else {
                null
            },
        figure = grid?.let { g -> { MixGrid(g) } },
        action = action,
        proof = proof,
        quiet = quiet,
        legend = legend,
    )
}

private fun Ctx.charted(t: Trait) = t.kind == "appetit" && weeks.count { it.judged } >= 2

// brand by consistency in place of the two sides it splits up
private fun gridOf(t: Trait) = t.insight?.takeIf { gridded(it) && (t.pack != null || t.kind == "konsistenz" || t.kind == "liebling") }

// the first line that draws the tones of meals: under it, what they stand for
private fun Ctx.legendOf(said: List<Pair<Trait, Said>>) =
    said.firstOrNull { (t, s) -> s.a != null || gridOf(t) != null || charted(t) }?.first

// a grid only where each column holds two brands or more; with one, the sentence above says it and the grid is a column
// of gaps
private fun gridded(x: Insight) =
    listOf(x.sorts, x.rest).all { l ->
        l
            .filter { it.n > 0 }
            .map(::brand)
            .distinct()
            .size >= 2
    }

// a sauce line's other side is left out where a line above already draws it
private fun Said.without(b: Boolean) = if (b) Said(label, value, sub, a, null, quiet, note, brand) else this

// the side a consistency line, or the favourites' consistency, draws
private fun drawnOf(t: Trait) =
    t.insight?.takeIf { t.kind == "konsistenz" || t.kind == "liebling" }?.let { plainOf(side(textureLabel(it.a.key), it.a).text) }

/** the lines of the Steckbrief in words, a sauce line without the side a line above draws already */
private fun Phone.saidOf(
    traits: List<Trait>,
    c: Ctx,
): List<Pair<Trait, Said>> {
    val raw = traits.mapNotNull { t -> traitSaid(t, c)?.let { t to it } }
    val drawn = raw.mapNotNull { drawnOf(it.first) }.toSet()
    return raw.map { (t, s) -> t to s.without(t.kind == "sosse" && s.b?.text?.let(::plainOf) in drawn) }
}

// what showed nothing clear, or that there is too little yet
// what showed nothing clear, and which of brand and flavour that leaves to look at oneself
private class Closing(
    val end: String,
    val brands: Boolean,
    val flavours: Boolean,
)

private fun closing(
    said: List<Pair<Trait, Said>>,
    c: Ctx,
): Closing {
    val wet =
        c.m.sorts
            .filter { typeOf(it.product) == TYPES[0] }
            .sumOf { it.n }
    // a line that cannot tell its consistency from its brands has raised the brand already
    val kinds =
        said.map { it.first.kind }.toSet() + said.mapNotNull { it.first.insight?.kind } +
            if (said.any { it.second.brand || it.first.mixed.isNotEmpty() }) setOf("marke") else emptySet()
    val topics =
        listOf(
            "die Marke" to setOf("marke", "pack"),
            "die Konsistenz" to setOf("konsistenz", "sosse"),
            "der Geschmack" to setOf("geschmack"),
            "die Tageszeit" to setOf("tageszeit"),
            "neue Sorten" to setOf("neu"),
        )
    val missing = topics.filter { (_, k) -> k.none { it in kinds } }.map { it.first }
    val end =
        when {
            wet < CLEAR -> "Für mehr reicht es noch nicht. Mit jeder Bewertung kommt etwas dazu."
            missing.isNotEmpty() ->
                "Ob ${andList(missing, "oder")} etwas ${if (missing.last() == "neue Sorten") "ausmachen" else "ausmacht"}, " +
                    "zeigt sich noch nicht."
            else -> ""
        }
    return Closing(end, wet >= CLEAR && "die Marke" in missing, wet >= CLEAR && "der Geschmack" in missing)
}

/** The lines of the Steckbrief: no favourite yet first, then the findings, the feeding ones under their label, then the
 lines that ask nothing of anyone; last: then what showed nothing clear */
@Composable
private fun Lines(
    said: List<Pair<Trait, Said>>,
    c: Ctx,
    last: Boolean,
) {
    watch()
    val (quiet, found) = said.partition { quietOf(it.first) }
    val (none, calm) = quiet.sortedBy { QUIET.indexOf(it.first.kind) }.partition { it.first.kind == "liebling" }
    val legend = c.legendOf(none + found + calm)
    for ((t, s) in none) TraitBlock(t, s, c, emptySet(), quiet = true)
    var feeding = false
    val shown = mutableSetOf<String>()
    found.forEachIndexed { i, (t, s) ->
        if (t.kind in FEEDING && !feeding) {
            feeding = true
            Label("Beim Füttern")
        } else if (i > 0 || none.isNotEmpty()) {
            Divider()
        }
        TraitBlock(t, s, c, shown.toSet(), legend = t === legend)
        shown += listed(t)
    }
    if (found.isNotEmpty() && calm.isNotEmpty()) Divider()
    for ((t, s) in calm) TraitBlock(t, s, c, emptySet(), quiet = true, legend = t === legend)
    if (!last) return
    val end = closing(said, c)
    if (end.end.isNotEmpty()) T(end.end, Type.small, Modifier.padding(top = Space.s3), colors.muted)
    Overview(c, end.brands, end.flavours)
}

private fun thousands(n: Int) = if (n < 1000) "$n" else String.format(Locale.GERMAN, "%,d", n)

private fun since(t: Long) = dayMonth(t) + if (yearOf(t) != yearOf(Time.now())) " ${yearOf(t)}" else ""

// The cat in a sentence, counted as Einkaufen counts its bands: „Mag zwei Sorten, lässt vier stehen, zwei gehen so.“ A
// band the owner changed for a variety is not the cat's to tell, a count the first line below starts with is not told
// twice, and one clause alone is left to the lines below.
private fun verdictSaid(
    m: Model,
    g: Bands,
    first: String,
): String {
    if (g.buy.size + g.stop.size + g.meh.size < SKETCH) return ""
    val said = { l: List<Sort>, verdict: String -> l.all { it.verdict == verdict } && !first.startsWith("${bigWord(l.size)} ") }
    val parts =
        listOfNotNull(
            when {
                g.buy.isNotEmpty() ->
                    "mag ${word(
                        g.buy.size,
                    )} ${if (g.buy.size == 1) "Sorte" else "Sorten"}".takeIf { said(g.buy, "nachkaufen") }
                m.sorts.none { it.verdict == "nachkaufen" } -> "mag noch keine Sorte"
                else -> null
            },
            "lässt ${word(g.stop.size)} stehen".takeIf { g.stop.isNotEmpty() && said(g.stop, "nicht") },
            "${word(g.meh.size)} ${if (g.meh.size == 1) "geht" else "gehen"} so".takeIf { g.meh.isNotEmpty() && said(g.meh, "geht") },
        )
    return if (parts.size < 2) "" else cap(parts.joinToString(", ")) + "."
}

@Composable
private fun Header(
    pet: de.schmeckts.app.Rec?,
    d: de.schmeckts.app.Diary,
    verdict: String,
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
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {
            contentDescription = listOf("$name.", verdict, "$said.").filter { it.isNotEmpty() }.joinToString(" ")
        },
        horizontalArrangement = Arrangement.spacedBy(Space.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(pet, Av.L)
        Column(Modifier.weight(1f)) {
            T(name, Type.subheading, color = colors.ink)
            if (verdict.isNotEmpty()) T(verdict, Type.body, color = colors.ink, balance = true)
            T(said, Type.small, color = colors.muted)
        }
    }
}

private fun firstSteps(name: String) =
    "Bewerte nach dem Füttern, wie viel $name gefressen hat. Nach ein paar Bewertungen einer Sorte steht hier, ob sie ankommt."

/** What one cat is like as an eater, on the page's ground; how many of its varieties fall in each band is told with
 Einkaufen, where the bands are. said: its lines in words. */
@Composable
private fun Steckbrief(
    s: PetSummary,
    said: List<Pair<Trait, Said>>,
    c: Ctx,
    r: Ranking,
    g: Bands,
) {
    watch()
    val ui = LocalUi.current
    val pet = ui.phone.derive.getPet(s.pet)
    val name = esc(pet?.str("name") ?: "")
    val first = said.firstOrNull { !quietOf(it.first) }?.second?.value ?: ""
    Column(Modifier.fillMaxWidth().testTag("profile")) {
        Header(pet, s.diary, if (r.stale) "" else verdictSaid(c.m, g, first))
        if (s.diary.n == 0) {
            Gap(Space.s4)
            M(firstSteps(name), Type.body, color = colors.ink)
            Gap(Space.s4)
            Btn("Füttern", BtnKind.PRIMARY, icon = "feed", onClick = ui.on("feed"))
        } else {
            Gap(Space.s3)
            if (r.stale) {
                M(
                    "Die letzten Bewertungen sind über ein halbes Jahr alt. Nach ein paar neuen steht hier wieder, was $name mag.",
                    Type.body,
                    color = colors.ink,
                )
            } else if (r.rated == 0) {
                Lines(said, c, false)
                M(
                    "Bewertet sind bisher nur Trockenfutter und Snacks. Was davon ankommt, steht unten beim Einkaufen.",
                    Type.body,
                    Modifier.padding(top = Space.s3),
                    colors.ink,
                )
            } else {
                Lines(said, c, true)
            }
        }
    }
}

/** group: what the rows under one label share; status: the same as a sentence for one row on its own; label: the row
 read aloud; pet: the one cat the meal is for, among several */
private class PickSaid(
    val e: Sort,
    val group: String,
    val sub: String,
    val status: String,
    val label: String,
    val open: Int,
    val pets: List<String>,
    val pet: String? = null,
    val of: (Stat) -> List<Pt>,
)

private fun Phone.pickSaid(
    m: Model,
    p: Pick,
    now: Long,
): PickSaid? {
    val several = m.pets.size > 1
    val e = m.byId[p.id] ?: return null
    val head = heard(e)
    p.trial?.let { t ->
        val list = t.need == 1 && allGood(t)
        val again = if (t.need == 1) "einmal" else "zweimal"
        // when every cat that rated it is as far along, one meal settles it for all and no name is needed
        val rated = m.pets.map { pid -> e.pets[pid]?.n ?: 0 }.filter { it > 0 }
        val alike = !t.alone && rated.all { it == e.pets[t.pet]?.n }
        val name = if (several && !alike) derive.getPet(t.pet)?.str("name") else null
        val all =
            when {
                !alike || rated.size < 2 -> ""
                rated.size == 2 -> "für beide "
                else -> "für alle "
            }
        val then = if (list) "kommt die Sorte auf die Einkaufsliste" else "steht’s ${all}fest"
        val still = if (name != null) "Für $name noch" else "Noch"
        val status = "$still $again füttern, dann $then."
        val group = "$still $again, dann ${if (list) "auf die Einkaufsliste" else "steht’s fest"}"
        return PickSaid(
            e,
            group,
            lead(e),
            status,
            "$head ${sentence(cap(lower(whyOf(e, true))))} $status",
            if (several) 0 else t.need,
            m.pets,
            if (name != null) t.pet else null,
        ) {
            it.window
        }
    }
    p.missed?.let { v ->
        val rated = m.pets.count { pid -> (e.pets[pid]?.list?.size ?: 0) > 0 }
        val by = if (several && v.by.size < rated) "bei ${derive.petNames(v.by)} " else ""
        val status = "Gab es seit ${lapse(v.at, now)} nicht mehr."
        return PickSaid(
            e,
            "Gern gefressen, lange nicht gefüttert",
            joined(lead(e), "zuletzt vor ${lapse(v.at, now)}"),
            status,
            "$head Davor $by${lower(evidenceOf(v))}. $status",
            0,
            v.by,
        ) { it.list.take(NEXT_NEWEST) }
    }
    p.retry?.let { x ->
        val first = e.pets[x.pet] ?: return null
        val status = "${petName(m, x.pet, "next")} braucht bei Neuem oft einen zweiten Versuch."
        val was = "beim ersten Mal ${lower(evidenceOf(first))}"
        return PickSaid(e, status.removeSuffix("."), joined(lead(e), was), status, "$head ${cap(was)}. $status", 0, listOf(x.pet)) {
            it.list.take(1)
        }
    }
    return null
}

/** what to feed next; first: the card's first, with its button under it */
@Composable
private fun NextRow(
    m: Model,
    s: PickSaid,
    tag: String,
    first: Boolean = true,
) {
    watch()
    val ui = LocalUi.current
    val e = s.e
    Feedable(e, s.pet, first) { mod ->
        ListRow(
            mod.testTag(tag + e.id),
            onClick = ui.on("open-product", "id" to e.id),
            top = true,
            label = s.label,
        ) {
            Thumb(null, e.product, Th.L)
            Column(Modifier.weight(1f)) {
                T(ui.phone.nameOf(e), Type.bodyStrong)
                DotLines(m, e, Modifier.padding(top = Space.s1), s.open, s.pets, s.of, sub = s.sub)
            }
        }
    }
}

/** A meal that would tell a consistency from its brands, which the line above leaves open: with a variety at home to
 feed, under Als Nächstes; else to buy, under Einkaufen. e: that variety; first: nothing to feed stands above it. */
@Composable
private fun TestMeal(
    c: Ctx,
    x: Experiment,
    e: Sort?,
    first: Boolean = false,
) {
    watch()
    val ui = LocalUi.current
    val ph = PHRASES[x.texture] ?: return
    val brands = andList(x.brands, "oder")
    val probier = if (e == null) "Probier beim nächsten Einkauf mal" else "Probier mal"
    val body =
        if (x.worse) {
            "$probier eine Sorte von $brands ${ph.without}${x.liked?.let { ", oder eine von $it ${ph.inside}" } ?: ""}."
        } else {
            "$probier eine Sorte ${ph.inside} von einer anderen Marke als $brands, oder eine von ${x.brands[0]} ${ph.without}."
        }
    Column(Modifier.fillMaxWidth().testTag("next-versuch")) {
        if (e != null && !first) Divider()
        Label(
            "Ein Versuch",
            top =
                when {
                    first -> Space.s2
                    e != null -> Space.s4
                    else -> Space.s5
                },
        )
        T(body, Type.body, color = colors.ink)
        T("Dann zeigt sich, ob es ${ph.on} liegt oder an der Marke.", Type.small, Modifier.padding(top = Space.s1), colors.muted)
        if (e != null) {
            val said = ui.phone.rowSaid(e, c)
            Feedable(e, null, first) { mod -> SortRow(c.m, e, said.sub, said.label, mod, tag = "versuch-${e.id}") }
        }
    }
}

// the rows under one label together, the labels in the order they first come
private fun byGroup(picks: List<PickSaid>) = picks.groupBy { it.group }.values.flatten()

/** the rows to feed by what one more meal does, then a meal at home that would settle what a line leaves open */
@Composable
private fun NextCard(
    c: Ctx,
    picks: List<PickSaid>,
    test: Sort?,
) {
    watch()
    val list = byGroup(picks)
    Card(Modifier.testTag("next")) {
        CardTitle("Als Nächstes füttern")
        // rows that need the same go under one label, so it is said once
        Folded(list, "next", rowIndent, { was, x ->
            if (was?.group == x.group) Divider(rowIndent) else Label(x.group, top = if (was == null) Space.s2 else Space.s5)
        }) { NextRow(c.m, it, "next-", it === list.first()) }
        if (test != null) c.experiment?.let { TestMeal(c, it, test, picks.isEmpty()) }
    }
}

/** a band's square, its count and word; fold: the key its rows open with, from the link at its end */
@Composable
private fun BandLabel(
    text: String,
    tone: String?,
    first: Boolean = false,
    fold: String? = null,
    more: String = "Zeigen",
) {
    watch()
    val ui = LocalUi.current
    // a link's tap height stands around the words already
    val top =
        when {
            first -> Space.s2
            fold != null -> Space.s2
            else -> Space.s5
        }
    Row(Modifier.fillMaxWidth().padding(top = top), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).semantics(mergeDescendants = true) { heading() }, verticalAlignment = Alignment.CenterVertically) {
            Swatch(tone)
            Gap(Space.s2)
            T(text, Type.smallStrong, color = colors.ink)
        }
        if (fold != null) {
            Link(
                if (isOpen(fold)) "Weniger" else more,
                Modifier.minTap().testTag("fold-$fold"),
                onClick = ui.on("fold", "v" to fold),
            )
        }
    }
}

/** beside: the varieties still open that Als Nächstes holds; asks: those where the owner's choice or another cat's
 liking goes against this one */
private class Bands(
    val buy: List<Sort>,
    val meh: List<Sort>,
    val stop: List<Sort>,
    val open: List<Sort>,
    val beside: Int,
    val asks: Set<String>,
) {
    val empty get() = buy.isEmpty() && meh.isEmpty() && stop.isEmpty() && open.isEmpty()
}

// what the owner chose against how it goes down now first, the one thing here to decide; then by type, Geht so by how
// well each goes down, Noch offen the last served first and without what Als Nächstes holds
private fun Phone.bandsOf(
    v: Vorlieben,
    m: Model,
    shown: Set<String>,
): Bands {
    val g = v.shop
    val type = compareBy<Sort> { TYPES.indexOf(typeOf(it.product)) }
    val asks =
        (g.nachkaufen + g.nicht)
            .filter {
                (it.kaufen == "nicht" && it.verdict == "nachkaufen") ||
                    (it.kaufen == "immer" && it.verdict == "nicht") ||
                    fansOf(it, m).isNotEmpty()
            }.map { it.id }
            .toSet()
    val told = compareBy<Sort> { it.id !in asks }.then(type)
    return Bands(
        g.nachkaufen.sortedWith(told),
        g.geht.sortedWith(type.thenByDescending { likingOf(it) }),
        g.nicht.sortedWith(told),
        g.neu.filter { it.id !in shown }.sortedWith(type.thenByDescending { v.last[it.id] ?: 0L }),
        g.neu.count { it.id in shown },
        asks,
    )
}

@Composable
private fun ShopCard(
    c: Ctx,
    g: Bands,
    test: Experiment?,
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val several = c.m.pets.size > 1
    val row: @Composable (Sort, String) -> Unit = { e, band ->
        val x = ph.rowSaid(e, c, band)
        SortRow(c.m, e, x.sub, x.label, said = if (several) verdicts(e, band) else null)
    }
    val rows: @Composable (List<Sort>, String, Boolean) -> Unit = { list, band, after ->
        list.forEachIndexed { i, e ->
            if (i > 0 || after) Divider(rowIndent)
            row(e, band)
        }
    }
    Card(Modifier.testTag("shop")) {
        CardTitle("Einkaufen")
        ShelfBar(Shelf(g.buy.size, g.meh.size, g.stop.size, g.open.size + g.beside), Modifier.padding(top = Space.s2))
        if (g.buy.isEmpty()) {
            BandLabel("Nachkaufen", "good")
            Hint("Noch nichts zum Nachkaufen.", Modifier.padding(top = Space.s2))
        } else {
            BandLabel("${g.buy.size} nachkaufen", "good")
            Folded(g.buy, "shop:nachkaufen", rowIndent) { row(it, "nachkaufen") }
        }
        // something new to buy beside what to buy again
        if (test != null) TestMeal(c, test, null)
        if (g.meh.isNotEmpty()) {
            BandLabel("${g.meh.size} geht so", "mid")
            Folded(g.meh, "shop:geht", rowIndent) { row(it, "geht") }
        }
        if (g.stop.isNotEmpty()) {
            // the lines above name what fails, so only what asks a decision shows at once; a few more show too
            val (asks, rest) = g.stop.partition { it.id in g.asks }
            val folds = rest.size >= FOLD_REST
            val open = !folds || isOpen("shop:nicht")
            BandLabel("${g.stop.size} nicht mehr kaufen", "bad", fold = if (folds && asks.isEmpty()) "shop:nicht" else null)
            rows(asks, "nicht", false)
            Column(Modifier.fillMaxWidth().animateContentSize(unfold())) { if (open) rows(rest, "nicht", asks.isNotEmpty()) }
            if (folds && asks.isNotEmpty()) {
                Link(
                    if (open) "Weniger" else "Die anderen ${word(rest.size)} zeigen",
                    Modifier.minTap().testTag("fold-shop:nicht"),
                    onClick = ui.on("fold", "v" to "shop:nicht"),
                )
            }
        }
        if (g.open.isNotEmpty()) {
            val folds = g.open.size >= FOLD_REST
            // the tally counts with them those Als Nächstes holds
            BandLabel(
                "${g.open.size + g.beside} noch offen",
                null,
                fold = if (folds) "shop:offen" else null,
                more = if (g.beside > 0) "Die übrigen zeigen" else "Zeigen",
            )
            val open = !folds || isOpen("shop:offen")
            Column(Modifier.fillMaxWidth().animateContentSize(unfold())) { if (open) rows(g.open, "offen", false) }
        }
        if (g.buy.isNotEmpty()) CardBtn("Einkaufsliste teilen", icon = "share", onClick = ui.on("share-list"))
    }
}

private fun saidLine(
    s: Said,
    muted: Color,
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
            val lines = cardLines(ph, s, null).map { it.second }
            val counts =
                s.shelf
                    .let { listOf(it.buy to "nachkaufen", it.meh to "geht so", it.stop to "nicht mehr kaufen", it.open to "noch offen") }
                    .filter { it.first > 0 }
                    .joinToString(", ") { "${it.first} ${it.second}" }
            val none = if (s.diary.n == 0) "Noch nichts bewertet." else "Noch steht nichts fest."
            val said = lines.joinToString(" ") { "${it.label}: ${it.value}." }.ifEmpty { none }
            ListRow(
                Modifier.testTag("cat-${s.pet}"),
                onClick = ui.on("filter", "id" to s.pet),
                top = true,
                label = "$name: ${if (counts.isEmpty()) "" else "$counts. "}$said",
            ) {
                Avatar(pet, Av.M)
                Column(Modifier.weight(1f)) {
                    T(name, Type.subheading, color = colors.ink)
                    if (lines.isEmpty()) {
                        T(none, Type.small, Modifier.padding(top = Space.hair), colors.muted)
                    } else {
                        for (l in lines) T(saidLine(l, colors.muted), Type.small, Modifier.padding(top = Space.hair), colors.ink)
                    }
                    Gap(Space.s2)
                    ShelfBar(s.shelf)
                }
                Chevron()
            }
        }
        Gap(Space.s1)
        // under the tallies, where the text starts
        ShelfLegend(null, Modifier.padding(start = Av.M.side + Space.s3))
    }
}

@Composable
private fun DifferRow(
    x: Differ,
    legend: Boolean,
) {
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
    val what =
        when (x.kind) {
            "konsistenz" -> ph?.let { "etwas ${it.inside}" } ?: "dasselbe"
            "marke" -> x.key ?: "dasselbe"
            else -> "dasselbe"
        }
    // meals in digits, as the bars above count them
    val meals = { n: Int -> if (n <= 1) often(n) else "$n Mal" }
    val note = "${cap(meals(x.shared))} bekamen beide $what: ${meals(x.ab)} hat $a gut gefressen und $b kaum, umgekehrt ${meals(x.ba)}."
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
        legend = legend,
    )
}

// each cat's verdict where it is not the band's, which the band and the dots say already
private fun verdicts(
    e: Sort,
    band: String,
): (String) -> String? =
    { pid ->
        e.pets[pid]?.takeIf { it.n > 0 && it.verdict != (if (band == "offen") "neu" else band) }?.let { verdictOf(it.verdict) }
    }

// each about the variety, as the lines of the Steckbrief put it
private fun verdictOf(verdict: String) =
    when (verdict) {
        "nachkaufen" -> "kommt gut an"
        "nicht" -> "kommt nicht an"
        "geht" -> "geht so"
        else -> "noch offen"
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
        // the varieties they split on stand in Einkaufen, with whom each is for
        when {
            differ.isNotEmpty() ->
                differ.forEachIndexed { i, x ->
                    if (i > 0) Divider()
                    DifferRow(x, i == 0)
                }
            r.split.isNotEmpty() -> {
                val n = r.split.size
                Hint(
                    "Bei ${if (n == 1) "einer Sorte" else "${word(n)} Sorten"} sind sie sich uneinig, unten bei Einkaufen steht, für wen.",
                    Modifier.padding(top = Space.s2),
                )
            }
            else -> Hint("${esc(ph.derive.petNames(m.pets))} mögen bisher dieselben Sorten.", Modifier.padding(top = Space.s2))
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
    return r.rated > 0 || ownGroups(m, db.pets.size).nachkaufen.isNotEmpty()
}

@Composable
fun hasEvaluationCard(m: Model) = LocalUi.current.phone.hasEvaluationCard(m)

private fun Said.short() = Said(label, value, quiet = quiet)

// a cat's lines in short, each told once among the lines beside it
private fun cardLines(
    ph: Phone,
    s: PetSummary,
    hint: de.schmeckts.app.Hint?,
): List<Pair<String, Said>> {
    val m = ph.derive.modelFor(s.pet)
    val c = Ctx(m)
    return cardTraits(s.traits, hint, m).mapNotNull { t -> ph.traitSaid(t, c)?.let { t.kind to it.short() } }
}

// one line of the card
@Composable
private fun CardTrait(
    kind: String,
    s: Said,
) {
    watch()
    val line = s.short()
    Box(
        Modifier
            .fillMaxWidth()
            .testTag("card-trait-$kind")
            .padding(top = Space.s1)
            .semantics(mergeDescendants = true) { contentDescription = "${line.label}: ${line.value}" },
    ) { T(saidLine(line, colors.muted), Type.body, color = if (s.quiet) colors.muted else colors.ink) }
}

/** hint: the one the question card above shows, so the card does not say it twice */
@Composable
fun EvaluationCard(
    m: Model,
    hint: de.schmeckts.app.Hint? = null,
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val r = d.rankingModel()
    val sum = d.summaryModel()
    val now = Time.now()
    val first = sum.picks.firstOrNull { it.id != hint?.id }
    val pick = first?.let { ph.pickSaid(m, it, now) }
    Card {
        CardHead("Vorlieben", label = "Alle Vorlieben", onMore = ui.on("open-evaluation"))
        if (sum.pets.size >= 2) {
            sum.pets.forEachIndexed { i, s ->
                if (i > 0) Divider(Size.picM + Space.s3)
                val pet = d.getPet(s.pet)
                val name = pet?.str("name") ?: ""
                val lines = cardLines(ph, s, hint).map { it.second }
                val none = if (s.diary.n == 0) "Noch nichts bewertet." else "Noch steht nichts fest."
                ListRow(
                    Modifier.testTag("card-cat-${s.pet}"),
                    onClick = ui.on("open-evaluation", "pet" to s.pet),
                    label = "$name. ${lines.joinToString(" ") { "${it.label}: ${it.value}." }.ifEmpty { none }}",
                    top = true,
                ) {
                    Avatar(pet, Av.M)
                    Column(Modifier.weight(1f)) {
                        T(name, Type.bodyStrong, color = colors.ink)
                        if (lines.isEmpty()) T(none, Type.small, Modifier.padding(top = Space.hair), colors.muted)
                        for (l in lines) T(saidLine(l, colors.muted), Type.small, Modifier.padding(top = Space.hair), colors.ink)
                    }
                    Chevron()
                }
            }
            if (pick != null) PickRow(m, pick)
            return@Card
        }
        val s = sum.pets.firstOrNull()
        val c = Ctx(if (s != null) d.modelFor(s.pet) else m)
        val lines = s?.let { cardLines(ph, it, hint) }.orEmpty()
        // what the hint above says leaves its place empty, no sentence that nothing shows yet
        val told = s != null && cardTraits(s.traits, null, c.m).size > cardTraits(s.traits, hint, c.m).size
        val body: @Composable (
            String,
        ) -> Unit = { text -> M(text, Type.body, Modifier.padding(top = Space.hair, bottom = Space.s3), colors.ink) }
        when {
            s?.diary?.n == 0 -> body(firstSteps(esc(d.getPet(s.pet)?.str("name") ?: "")))
            r.rated == 0 -> {
                if (s != null) {
                    Gap(Space.s2)
                    ShelfLegend(s.shelf)
                }
                Label("Nachkaufen", top = Space.s4)
                ownGroups(m, ph.db.pets.size).nachkaufen.take(CARD_BUY).forEachIndexed { i, e ->
                    if (i > 0) Divider(rowIndent)
                    val x = ph.rowSaid(e, c, "nachkaufen")
                    SortRow(m, e, x.sub, x.label)
                }
            }
            r.stale -> {
                body("Die letzten Bewertungen sind über ein halbes Jahr alt.")
                if (s != null) ShelfLegend(s.shelf)
                Gap(Space.s3)
                if (pick != null && first?.missed != null) PickRow(m, pick)
            }
            lines.isEmpty() && pick == null && !told -> body(ph.waiting(m, r))
            else -> {
                // the counts carry the colours; the squares are on the page
                for ((kind, x) in lines) CardTrait(kind, x)
                if (s != null) {
                    Gap(Space.s3)
                    ShelfLegend(s.shelf)
                }
                Gap(Space.s3)
                if (pick != null) PickRow(m, pick)
            }
        }
    }
}

/** the variety to feed next under what one more meal does, as on the page */
@Composable
private fun PickRow(
    m: Model,
    s: PickSaid,
) {
    Divider()
    Label(s.group, top = Space.s3)
    NextRow(m, s, "pick-")
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
    val one = sum.pets.singleOrNull()
    // the first weeks, before there were ratings enough to judge one, would only look like a poor start
    val c = Ctx(m, r, v.weeks.dropWhile { !it.judged }, v.last, experiment = if (one != null) v.experiment else null)
    val scroll = rememberScrollState()
    val still = reduceMotion
    LaunchedEffect(ph.prefs.activePet) { if (still) scroll.scrollTo(0) else scroll.animateScrollTo(0) }
    val picks = v.picks.mapNotNull { ph.pickSaid(m, it, c.now) }
    // a test meal at home is fed, one not at home bought
    val test = c.experiment?.let { trialOf(it, c.m) }
    val bands = ph.bandsOf(v, m, picks.map { it.e.id }.toSet())
    val shop = !bands.empty && one?.diary?.n != 0
    val said = if (one != null) ph.saidOf(v.traits, c) else emptyList()
    SheetBody("Vorlieben", ui.sheets, onBack = ui.on("settings-back"), scroll = scroll) {
        if (ph.db.pets.size >= 2) {
            CatChips()
            Gap(Space.s4)
        }
        if (one != null) Steckbrief(one, said, c, r, bands) else CatsBlock(sum)
        val cards =
            listOfNotNull(
                if (one == null && (v.differ.isNotEmpty() || r.split.isNotEmpty() || agrees(m))) "differ" else null,
                if (picks.isNotEmpty() || test != null) "next" else null,
                if (shop) "shop" else null,
            )
        cards.forEachIndexed { i, k ->
            Gap(if (i == 0) Space.s6 else Space.s4)
            when (k) {
                "differ" -> DifferCard(c, r, v.differ)
                "next" -> NextCard(c, picks, test)
                else -> ShopCard(c, bands, c.experiment?.takeIf { test == null })
            }
        }
    }
}
