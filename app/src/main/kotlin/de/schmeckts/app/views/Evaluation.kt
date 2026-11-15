package de.schmeckts.app.views

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import de.schmeckts.app.DAY
import de.schmeckts.app.Evaluation
import de.schmeckts.app.Group
import de.schmeckts.app.Insight
import de.schmeckts.app.Model
import de.schmeckts.app.Phone
import de.schmeckts.app.Pt
import de.schmeckts.app.RATINGS
import de.schmeckts.app.Ranking
import de.schmeckts.app.Sort
import de.schmeckts.app.TYPES
import de.schmeckts.app.Taste
import de.schmeckts.app.Time
import de.schmeckts.app.Trial
import de.schmeckts.app.andList
import de.schmeckts.app.cap
import de.schmeckts.app.dayMonth
import de.schmeckts.app.esc
import de.schmeckts.app.fishOrMeat
import de.schmeckts.app.observationOf
import de.schmeckts.app.ownGroups
import de.schmeckts.app.pname
import de.schmeckts.app.poorOf
import de.schmeckts.app.ranks
import de.schmeckts.app.rateTone
import de.schmeckts.app.sideOf
import de.schmeckts.app.typeOf
import de.schmeckts.app.ui.Card
import de.schmeckts.app.ui.CardHead
import de.schmeckts.app.ui.CardTitle
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
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.M
import de.schmeckts.app.ui.Motion
import de.schmeckts.app.ui.Palette
import de.schmeckts.app.ui.SheetBody
import de.schmeckts.app.ui.Size
import de.schmeckts.app.ui.Space
import de.schmeckts.app.ui.T
import de.schmeckts.app.ui.TMain
import de.schmeckts.app.ui.Type
import de.schmeckts.app.ui.colors
import de.schmeckts.app.ui.minTap
import de.schmeckts.app.ui.reduceMotion
import de.schmeckts.app.ui.tone
import de.schmeckts.app.ui.watch
import de.schmeckts.app.usualOf
import de.schmeckts.app.within
import de.schmeckts.app.yearOf

// „Vorlieben“: the card on home, the page and its shopping list. The analysis is in Smart.kt, this only words it.

private const val SHOWN = 3 // rows a list shows before the rest unfolds
private const val CARD_ROWS = 2 // rows of a side on the home card
private const val JUDGE = 4 // settled varieties before the lead calls a cat picky or easy to please
private const val AWAY = 42 * DAY // a favourite unserved this long says since when
private const val NAMED = 2 // groups or favourites one sentence names
private const val WHOLE = 18 // letters of a marked name kept on one line

private val TEXTURE_SAID =
    mapOf(
        "pastete" to "Pastete",
        "sosse" to "Stückchen in Soße",
        "gelee" to "Stückchen in Gelee",
        "mousse" to "Mousse",
        "block" to "Fester Block",
        "suppe" to "Suppe",
    )

private fun textureName(key: Any?) = TEXTURE_SAID[key] ?: (key as? String ?: "")

private fun brandOf(e: Sort) = if (!e.product.str("variety").isNullOrEmpty()) (e.product.str("brand") ?: "").trim() else ""

// „(Sterilised)“ and the like stay on the packaging
private fun shortName(e: Sort) = pname(e.product).replace(Regex("""\s*\([^)]*\)\s*$"""), "").ifEmpty { pname(e.product) }

private fun Phone.petName(id: String) = derive.getPet(id)?.str("name") ?: ""

private fun Phone.pronOf(id: String) = if (derive.getPet(id)?.str("sex") == "m") "er" else "sie"

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

private val KINDS = listOf("geschmack", "konsistenz", "marke")
private val TITLES = mapOf("geschmack" to "Geschmack", "konsistenz" to "Konsistenz", "marke" to "Marke")
private val OTHERS = mapOf("geschmack" to "Andere Sorten", "konsistenz" to "Andere Sorten", "marke" to "Andere Marken")

private fun Taste.of(kind: String) =
    when (kind) {
        "geschmack" -> geschmack
        "konsistenz" -> konsistenz
        else -> marke
    }

private fun groupName(
    kind: String,
    key: String,
) = when {
    key.isEmpty() -> OTHERS.getValue(kind)
    kind == "konsistenz" -> textureName(key)
    else -> key
}

// == How much a cat usually eats: the bowl she leaves, as she rates it after each meal ==

/** r: none where her verdict is still open */
private class Ate(
    val pet: String,
    val r: String?,
)

private fun usualIn(pts: List<Pt>?) = pts?.let { usualOf(it.groupingBy { p -> p.r }.eachCount()) }

// early: also where too few ratings say anything yet, as for a variety in its test
private fun ateOf(
    e: Sort,
    pets: List<String>,
    early: Boolean = false,
) = pets.mapNotNull { pid ->
    val s = e.pets[pid] ?: return@mapNotNull null
    usualIn(s.window)?.let { Ate(pid, it.takeIf { early || sideOf(s) != "thin" }) }
}

private fun Phone.ateSaid(ate: List<Ate>) =
    ate.joinToString(", ") { "${petName(it.pet)} ${it.r?.let { r -> "meistens ${RATINGS.getValue(r).said}" } ?: "noch offen"}" }

// the cats with ratings of wet food, as one with none likes and leaves nothing yet
private fun ratedOf(m: Model) = m.pets.filter { pid -> m.sorts.any { ranks(it.product) && (it.pets[pid]?.n ?: 0) > 0 } }.ifEmpty { m.pets }

/** one cat: the bowl she usually leaves; several: each one's ring, as on the meals at home */
@Composable
private fun Eats(
    m: Model,
    ate: List<Ate>,
) {
    watch()
    if (ate.isEmpty()) return
    if (ratedOf(m).size == 1) {
        val r = ate[0].r ?: return
        Icon("r_$r", color = colors.tone(rateTone(r))!!.c)
        return
    }
    val d = LocalUi.current.phone.derive
    Row(Modifier.padding(horizontal = Space.s1), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
        for (a in ate) Mini(d.getPet(a.pet), a.r)
    }
}

// == The lead: the cat in a sentence or three, its key words marked in their tone ==

private const val TONE = "tone"

private class Bit(
    val text: String,
    val tone: String? = null,
)

private class Lead(
    val bits: List<Bit>,
    val note: String = "",
)

private class Named(
    val kind: String,
    val g: Group,
)

private fun capped(bits: List<Bit>) = bits.mapIndexed { i, b -> if (i == 0) Bit(cap(b.text), b.tone) else b }

private fun anded(items: List<List<Bit>>): List<Bit> =
    items.flatMapIndexed { i, b ->
        when {
            i == 0 -> b
            i == items.size - 1 -> listOf(Bit(" und ")) + b
            else -> listOf(Bit(", ")) + b
        }
    }

private fun nounOf(
    p: Named,
    tone: String,
) = if (p.kind == "marke") listOf(Bit("die Sorten von "), Bit(p.g.key, tone)) else listOf(Bit(groupName(p.kind, p.g.key), tone))

private fun namedOf(
    t: Taste,
    verdict: String,
) = KINDS.flatMap { k -> t.of(k).filter { it.key.isNotEmpty() && it.verdict == verdict }.map { Named(k, it) } }

private fun poorShare(g: Group) = poorOf(g.counts).toDouble() / g.n

// a group whose varieties all lie in another one says nothing of its own, as a brand only made in sauce; of two with
// the same varieties the first kind stays; one tried once does not count, as it makes no group either
private fun widest(list: List<Named>): List<Named> {
    val ids = list.map { p -> p.g.sorts.mapNotNull { e -> e.id.takeIf { e.n >= 2 } } }
    return list.filterIndexed { i, _ ->
        ids.indices.none { j -> j != i && ids[j].containsAll(ids[i]) && (ids[j].size > ids[i].size || j < i) }
    }
}

/** what one cat likes: groups first, then her favourite; nothing early on when nothing stands out */
private fun likesOf(
    name: String,
    r: Ranking,
    t: Taste,
): List<Bit> {
    val n = r.settled
    if (n == 0) return listOf(Bit("Bei $name steht noch keine Sorte fest."))
    val k = r.top.size
    val early = n < JUDGE
    val flops = r.flop.map { it.id }.toSet()
    val liked = widest(namedOf(t, "nachkaufen").filter { p -> p.g.sorts.none { it.id in flops } }).take(NAMED)
    val favs = r.top.take(if (r.flat) NAMED else 1)
    val fav = anded(favs.map { listOf(Bit(shortName(it), "good")) })
    val easy = !early && k * 3 >= n * 2
    val b = mutableListOf<Bit>()
    when {
        liked.isNotEmpty() -> {
            b += Bit(if (easy) "$name frisst fast alles gern, besonders " else "$name mag ${if (early) "bisher " else ""}")
            b += anded(liked.map { nounOf(it, "good") })
            if (favs.isNotEmpty()) b += listOf(Bit(", am liebsten ")) + fav
        }
        favs.isNotEmpty() -> {
            b +=
                Bit(
                    when {
                        early -> "Bisher frisst $name am liebsten "
                        !r.flat && k * 3 <= n -> "$name ist wählerisch und frisst am liebsten "
                        easy -> "$name frisst fast alles gern, am liebsten "
                        else -> "$name frisst am liebsten "
                    },
                )
            b += fav
        }
        early -> return emptyList()
        else -> return listOf(Bit("Bei $name kommt bisher keine Sorte richtig gut an."))
    }
    return b + Bit(".")
}

// meist where more than half was left, oft where less was, bisher on two ratings
private fun oftenOf(counts: List<Map<String, Int>>) =
    when {
        counts.any { it.values.sum() < 3 } -> "bisher"
        counts.all { poorOf(it) * 2 > it.values.sum() } -> "meist"
        else -> "oft"
    }

private fun windowOf(
    e: Sort,
    pid: String,
) = (e.pets[pid]?.window ?: emptyList()).groupingBy { it.r }.eachCount()

/** what the cats leave, every one of them: the groups, or else the variety furthest down */
private fun Phone.leavesOf(
    pets: List<String>,
    r: Ranking,
    t: Taste,
    named: Boolean,
): List<Bit> {
    val one = pets.size == 1
    // a favourite of any of them keeps its group from being called left
    val favs = (r.top + if (one) emptyList() else pets.flatMap { derive.rankingFor(it).top }).map { it.id }.toSet()
    val own = pets.map { derive.modelFor(it) }
    val mine = { p: Named -> if (one) listOf(p.g) else own.map { p.g.within(it) } }
    val groups = KINDS.flatMap { k -> t.of(k).filter { it.key.isNotEmpty() }.map { Named(k, it) } }
    val left =
        widest(groups.filter { p -> p.g.sorts.none { it.id in favs } && mine(p).all { it?.verdict == "nicht" } })
            .sortedByDescending { poorShare(it.g) }
            .take(NAMED)
            .sortedBy { KINDS.indexOf(it.kind) }
    val e = r.flop.firstOrNull { e -> one || pets.all { pid -> e.pets[pid]?.let(::sideOf) == "flop" } }
    val what = if (left.isNotEmpty()) anded(left.map { nounOf(it, "bad") }) else listOf(Bit(shortName(e ?: return emptyList()), "bad"))
    val counts = if (left.isNotEmpty()) left.flatMap { p -> mine(p).mapNotNull { it?.counts } } else pets.map { windowOf(e!!, it) }
    val often = oftenOf(counts)
    // with several the cats come first, or the food would read as the one that leaves
    if (!one) return listOf(Bit("${if (pets.size == 2) "Beide" else "Alle"} lassen ")) + what + Bit(" $often stehen.")
    return capped(what) + Bit(" lässt ${if (named) pronOf(pets[0]) else petName(pets[0])} $often stehen.")
}

private fun Phone.leadOf(
    m: Model,
    r: Ranking,
    x: Evaluation,
    sauceInCard: Boolean,
): Lead {
    val names = derive.petNames(m.pets)
    if (r.stale) {
        return Lead(
            listOf(Bit("Die letzten Bewertungen sind über ein halbes Jahr alt.")),
            "Nach ein paar neuen steht hier wieder, was ankommt.",
        )
    }
    if (r.settled == 0) {
        return Lead(
            listOf(Bit("Bei $names steht noch keine Sorte fest.")),
            "Ab drei Bewertungen einer Sorte steht hier, was gut ankommt und was stehen bleibt.",
        )
    }
    val rated = ratedOf(m)
    val sentences = mutableListOf<List<Bit>>()
    if (rated.size == 1) {
        val pid = rated[0]
        val likes = likesOf(petName(pid), r, x.taste)
        sentences += likes
        val fm = fishOrMeat(m)?.takeIf { it.clear }
        if (fm != null) {
            val (more, less) = if (fm.fish.good * fm.meat.n > fm.meat.good * fm.fish.n) "Fisch" to "Fleisch" else "Fleisch" to "Fisch"
            val who = if (likes.isEmpty()) petName(pid) else pronOf(pid)
            sentences += listOf(Bit(more, "good"), Bit(" frisst $who deutlich lieber als $less."))
        }
        val leaves = leavesOf(rated, r, x.taste, likes.isNotEmpty() || fm != null)
        sentences += leaves
        val sauce = x.insights.firstOrNull { it.kind == "sosse" }
        if (sauce != null && !sauceInCard && leaves.none { it.text == textureName("sosse") }) {
            val who = if (sentences.all { it.isEmpty() }) petName(pid) else pronOf(pid)
            sentences += listOf(Bit("Von Stückchen in Soße leckt $who oft "), Bit("nur die Soße", "sauce"), Bit("."))
        }
    } else {
        for (pid in rated) sentences += likesOf(petName(pid), derive.rankingFor(pid), derive.tasteFor(pid))
        sentences += leavesOf(rated, r, x.taste, true)
    }
    val said = sentences.filter { it.isNotEmpty() }
    val bits =
        if (said.isEmpty()) {
            listOf(Bit("Bisher ist keine Sorte ein klarer Treffer oder Reinfall."))
        } else {
            said.flatMapIndexed { i, s -> if (i > 0) listOf(Bit(" ")) + s else s }
        }
    val none = m.pets.filter { pid -> m.sorts.none { it.pets[pid]?.list?.isNotEmpty() == true } }
    val note = if (none.isNotEmpty() && none.size < m.pets.size) "Für ${derive.petNames(none)} gibt es noch keine Bewertungen." else ""
    return Lead(tied(bits), note)
}

// the last two words on one line, so none stands alone
private fun tied(bits: List<Bit>): List<Bit> {
    val i = bits.indexOfLast { ' ' in it.text.trimEnd() }
    if (i < 0) return bits
    val t = bits[i].text
    val at = t.trimEnd().lastIndexOf(' ')
    return bits.toMutableList().also { it[i] = Bit(t.substring(0, at) + '\u00A0' + t.substring(at + 1), bits[i].tone) }
}

/** text whose marked words sit on a soft stroke of their tone, low on the line as a highlighter leaves it */
@Composable
private fun Marked(
    bits: List<Bit>,
    modifier: Modifier = Modifier,
) {
    watch()
    val p = colors
    val style = Type.heading
    val text = remember(bits, p) { marked(bits, p) }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    androidx.compose.material3.Text(
        text,
        modifier.drawBehind {
            val l = layout ?: return@drawBehind
            val em = style.fontSize.toPx()
            for (a in text.getStringAnnotations(TONE, 0, text.length)) {
                val c = p.tone(a.item)!!.cs
                for (line in l.getLineForOffset(a.start)..l.getLineForOffset(a.end - 1)) {
                    val s = maxOf(a.start, l.getLineStart(line))
                    val e = minOf(a.end, l.getLineEnd(line, visibleEnd = true))
                    if (s >= e) continue
                    val base = l.getLineBaseline(line)
                    // from the middle of the small letters to just under the line they stand on
                    val stroke = Rect(l.getBoundingBox(s).left, base - em * 0.3f, l.getBoundingBox(e - 1).right, base + em * 0.12f)
                    drawRoundRect(c, stroke.topLeft, stroke.size, CornerRadius(em * 0.08f))
                }
            }
        },
        color = p.ink,
        style = style.copy(lineBreak = LineBreak.Paragraph),
        onTextLayout = { layout = it },
    )
}

private fun marked(
    bits: List<Bit>,
    p: Palette,
): AnnotatedString =
    buildAnnotatedString {
        for (b in bits) {
            if (b.tone == null) {
                append(b.text)
                continue
            }
            pushStringAnnotation(TONE, b.tone)
            // a short name stays on one line
            val whole = if (b.text.length <= WHOLE) b.text.replace(' ', '\u00A0') else b.text
            withStyle(SpanStyle(color = p.tone(b.tone)!!.c)) { append(whole) }
            pop()
        }
    }

// == What the feeding findings say: a sentence and the counts behind it ==

private class Said(
    val say: String,
    val why: String,
)

private fun ofN(
    good: Int,
    n: Int,
) = "$good von $n Mal"

@Suppress("UNCHECKED_CAST")
private fun saidOf(x: Insight): Said {
    val a = x.a
    val b = x.b
    return when (x.kind) {
        "wiederholung" ->
            Said(
                "<b>Abwechslung</b> lohnt sich: zweimal hintereinander dieselbe Sorte kommt schlechter an.",
                "Beim zweiten Mal ${ofN(a.good, a.n)} gut gefressen, sonst ${ofN(b.good, b.n)}.",
            )
        "neu" ->
            Said(
                if (x.gap > 0) {
                    "Neue Sorten kommen beim <b>ersten Mal</b> besser an als danach."
                } else {
                    "Neue Sorten brauchen <b>eine Weile</b>, danach läuft es besser."
                },
                "Beim ersten Mal ${ofN(a.good, a.n)} gut gefressen, danach ${ofN(b.good, b.n)}.",
            )
        "tageszeit" ->
            Said(
                if (x.gap > 0) {
                    "Die <b>erste Mahlzeit</b> am Tag kommt besser an als die letzte."
                } else {
                    "Die <b>letzte Mahlzeit</b> am Tag kommt besser an als die erste."
                },
                "Bei der ersten ${ofN(a.good, a.n)} gut gefressen, bei der letzten ${ofN(b.good, b.n)}.",
            )
        "snack" ->
            Said(
                "Nach einem <b>Snack</b> bleibt beim nächsten Napf öfter etwas stehen.",
                "Nach Snacks ${ofN(a.good, a.n)} gut gefressen, sonst ${ofN(b.good, b.n)}.",
            )
        else -> {
            val first = esc(a.key as String)
            val rest = esc(andList(b.key as List<String>))
            Said(
                "Wenn <b>$first</b> füttert, kommen dieselben Sorten besser an als bei $rest.",
                "Von $first gefüttert ${ofN(a.good, a.n)} gut gefressen, von $rest ${ofN(b.good, b.n)}.",
            )
        }
    }
}

// == Rows ==

/** a variety: its packaging, name and brand, and how much the cats usually eat of it; sub: said after the brand */
@Composable
private fun SortRow(
    m: Model,
    e: Sort,
    tag: String,
    sub: String = "",
    pets: List<String> = m.pets,
    early: Boolean = false,
) {
    watch()
    val ui = LocalUi.current
    val line = cap(listOf(brandOf(e), sub).filter { it.isNotEmpty() }.joinToString(", "))
    ListRow(
        Modifier.testTag("$tag-${e.id}"),
        onClick = ui.on("open-product", "id" to e.id),
        label = "${pname(e.product)}${if (line.isNotEmpty()) ". $line" else ""}. ${ui.phone.whyOf(e)}.",
    ) {
        Thumb(null, e.product)
        TMain(esc(pname(e.product)), esc(line))
        Eats(m, ateOf(e, pets, early))
    }
}

/** the first SHOWN rows, the rest behind a link that really opens them */
@Composable
private fun <T> Folded(
    items: List<T>,
    key: String,
    row: @Composable (T) -> Unit,
) {
    watch()
    var open by remember(key) { mutableStateOf(false) }
    val folds = items.size > SHOWN + 1
    (if (folds) items.take(SHOWN) else items).forEachIndexed { i, x ->
        if (i > 0) Divider(Size.picL + Space.s3)
        row(x)
    }
    if (!folds) return
    Column(Modifier.fillMaxWidth().animateContentSize(if (reduceMotion) tween(0) else tween(Motion.STEP, easing = Motion.easeOut))) {
        if (open) {
            for (x in items.drop(SHOWN)) {
                Divider(Size.picL + Space.s3)
                row(x)
            }
        }
    }
    Link(
        if (open) "Weniger zeigen" else "Alle ${items.size} zeigen",
        Modifier.minTap().testTag("fold-$key"),
        onClick = { open = !open },
    )
}

// == The page ==

@Composable
private fun LeadBlock(
    m: Model,
    r: Ranking,
    x: Evaluation,
) {
    watch()
    val ph = LocalUi.current.phone
    val l = ph.leadOf(m, r, x, m.pets.size == 1 && x.taste.konsistenz.isNotEmpty())
    Column(Modifier.fillMaxWidth().testTag("lead")) {
        Marked(l.bits)
        if (l.note.isNotEmpty()) M(esc(l.note), Type.body, Modifier.padding(top = Space.s3), colors.muted)
    }
    // the appetite rule already weighs each variety by what it got before, so a drop it finds is not the food
    for (h in m.hints.filter { it.kind == "appetit" }) {
        val who = if (m.pets.size > 1) "${ph.petName(h.pet ?: "")} frisst" else "Frisst"
        val said =
            "$who seit ein paar Tagen schlechter als sonst: zuletzt ${times(h.good, h.n)} gut gefressen, " +
                "davor ${times(h.goodBefore, h.before)}. An den Sorten liegt es nicht, die kamen vorher besser an."
        M(esc(said), Type.body, Modifier.fillMaxWidth().padding(top = Space.s4).testTag("appetite"), colors.ink)
    }
    Gap(Space.s2)
}

@Composable
private fun ListCard(
    title: String,
    tag: String,
    content: @Composable () -> Unit,
) {
    watch()
    Gap(Space.s4)
    Card(Modifier.testTag(tag)) {
        CardTitle(title)
        Gap(Space.s2)
        content()
    }
}

/** the lists of the page; with several cats only what each cat that had it says the same of */
private class Lists(
    val top: List<Sort>,
    val flop: List<Sort>,
    val split: List<Sort>,
)

// One cat liking what another leaves is Geschmackssache; the rest stands on each cat's own page.
private fun listsOf(
    m: Model,
    r: Ranking,
): Lists {
    if (ratedOf(m).size == 1) return Lists(r.top, r.flop, emptyList())
    val sides = { e: Sort -> m.pets.mapNotNull { pid -> e.pets[pid]?.takeIf { it.n > 0 }?.let(::sideOf) } }
    val torn = { e: Sort -> sides(e).let { "top" in it && "flop" in it } }
    return Lists(
        r.top.filter { e -> sides(e).all { it == "top" } },
        r.flop.filter { e -> sides(e).all { it == "flop" } },
        (r.split + (r.top + r.flop + r.mid).filter(torn)).distinct(),
    )
}

@Composable
private fun Favourites(
    m: Model,
    r: Ranking,
    top: List<Sort>,
    last: Map<String, Long>,
) {
    watch()
    if (top.isEmpty()) return
    val now = Time.now()
    ListCard("Am liebsten", "favourites") {
        if (r.flat && top.size > 1) Hint("Die Sorten liegen noch so nah beieinander, dass die Reihenfolge Zufall sein kann.")
        Folded(top, "top") { e ->
            val at = last[e.id] ?: 0L
            SortRow(m, e, "top", if (at > 0 && now - at >= AWAY) "zuletzt vor ${lapse(at, now)}" else "")
        }
    }
}

@Composable
private fun Flops(
    m: Model,
    flop: List<Sort>,
) {
    watch()
    if (flop.isEmpty()) return
    ListCard(LocalUi.current.phone.leaves(m), "flops") { Folded(flop, "flop") { e -> SortRow(m, e, "flop") } }
}

private fun Phone.leaves(m: Model) =
    ratedOf(m).let {
        when {
            it.size > 1 -> "Lassen sie stehen"
            pronOf(it[0]) == "er" -> "Lässt er stehen"
            else -> "Lässt sie stehen"
        }
    }

// only with several cats: what one likes and another leaves, each one's ring says who
@Composable
private fun Split(
    m: Model,
    split: List<Sort>,
) {
    watch()
    if (split.isEmpty()) return
    ListCard("Geschmackssache", "split") {
        Hint(if (m.pets.size == 2) "Die eine mag sie, die andere lässt sie stehen." else "Manche mögen sie, andere lassen sie stehen.")
        Folded(split, "split") { e -> SortRow(m, e, "split") }
    }
}

/** a flavour, consistency or brand: its name, how often it went down well, how much each cat usually eats */
@Composable
private fun GroupRow(
    m: Model,
    name: String,
    g: Group,
    ate: List<Ate>,
) {
    watch()
    val ph = LocalUi.current.phone
    val count = "${g.good} von ${g.n}"
    ListRow(
        Modifier.testTag("group-$name").semantics(mergeDescendants = true) {
            contentDescription = listOf(name, "$count Mal gut gefressen", ph.ateSaid(ate)).filter { it.isNotEmpty() }.joinToString(", ")
        },
    ) {
        T(name, Type.body, Modifier.weight(1f), colors.ink)
        if (ratedOf(m).size == 1) T(count, Type.small, color = colors.muted)
        Eats(m, ate)
    }
}

// what the rows cannot show: the sauce licked off, and whether fish or meat makes a difference where nothing clear does
private fun Phone.toldIn(
    m: Model,
    x: Evaluation,
    kind: String,
    pid: String,
): String? {
    val pron = pronOf(pid)
    if (kind == "konsistenz") {
        val i = x.insights.firstOrNull { it.kind == "sosse" } ?: return null
        val instead = i.instead?.let { " ${textureName(it.key)} frisst $pron lieber." } ?: ""
        return "Von Stückchen in Soße leckt $pron oft nur die Soße.$instead"
    }
    if (kind == "geschmack" && fishOrMeat(m)?.clear == false) {
        return "Ob Fisch oder Fleisch, macht bei ${petName(pid)} bisher keinen klaren Unterschied."
    }
    return null
}

// each flavour, consistency and brand, the bowl she usually leaves first
@Composable
private fun Tastes(
    m: Model,
    x: Evaluation,
) {
    watch()
    val ph = LocalUi.current.phone
    if (KINDS.all { x.taste.of(it).isEmpty() }) return
    val rated = ratedOf(m)
    val one = rated.size == 1
    val own = if (one) emptyMap() else rated.associateWith { ph.derive.modelFor(it) }
    ListCard("Was wie ankommt", "taste") {
        val name = ph.petName(rated[0])
        Hint(
            if (one) {
                "Die Zahl zeigt, wie oft $name gut gefressen hat, der Napf, wie viel ${ph.pronOf(rated[0])} meistens frisst."
            } else {
                "Der Ring zeigt, wie viel jede Katze meistens frisst."
            },
        )
        var first = true
        for (kind in KINDS) {
            val groups = x.taste.of(kind)
            if (groups.isEmpty()) continue
            Label(TITLES.getValue(kind), top = if (first) Space.s1 else Space.s4)
            first = false
            groups.forEachIndexed { i, g ->
                if (i > 0) Divider()
                // a cat who had some of it, but too little to tell, gets the ring of a verdict still open
                val ate =
                    if (one) {
                        listOfNotNull(usualOf(g.counts)?.let { Ate(rated[0], it) })
                    } else {
                        rated.mapNotNull { pid ->
                            val mine = own.getValue(pid)
                            g.within(mine)?.let { usualOf(it.counts)?.let { r -> Ate(pid, r) } }
                                ?: Ate(pid, null).takeIf { g.sorts.any { (mine.byId[it.id]?.n ?: 0) > 0 } }
                        }
                    }
                GroupRow(m, groupName(kind, g.key), g, ate)
            }
            val told = if (one) ph.toldIn(m, x, kind, rated[0]) else null
            if (told != null) Hint(told, Modifier.padding(top = Space.s2).testTag("told-$kind"))
        }
    }
}

// what holds for feeding rather than buying: the same variety twice, new ones, the time of day, snacks, who feeds
private val BUYING = setOf("geschmack", "konsistenz", "marke", "sosse")

@Composable
private fun Feeding(x: Evaluation) {
    watch()
    val said = x.insights.filter { it.kind !in BUYING }.map(::saidOf)
    if (said.isEmpty()) return
    ListCard("Beim Füttern", "feeding") {
        said.forEachIndexed { i, s ->
            if (i > 0) Divider()
            Column(Modifier.fillMaxWidth().padding(vertical = Space.s3).testTag("said-$i")) {
                M(s.say, Type.body, color = colors.ink)
                M(s.why, Type.small, Modifier.padding(top = Space.hair), colors.muted)
            }
        }
    }
}

// where a kind of note follows one variety clearly more often than the others, as after food that upsets the stomach
@Composable
private fun Observed(
    m: Model,
    x: Evaluation,
) {
    watch()
    val ui = LocalUi.current
    val links = x.observed.filter { m.byId[it.id] != null }
    if (links.isEmpty()) return
    ListCard("Beobachtungen", "observed") {
        links.forEachIndexed { i, l ->
            val e = m.byId.getValue(l.id)
            val ob = observationOf(l.kind)
            val say = "Nach ${pname(e.product)} öfter „${ob.label}“ notiert"
            val why = "Nach ${l.after.hit} von ${l.after.n} Mahlzeiten ${ob.after}, sonst nach ${l.other.hit} von ${l.other.n}."
            if (i > 0) Divider(Size.picL + Space.s3)
            ListRow(Modifier.testTag("observed-${e.id}"), onClick = ui.on("open-product", "id" to e.id), label = "$say. $why", top = true) {
                Thumb(null, e.product)
                TMain(esc(say), esc(why))
            }
        }
    }
}

@Composable
private fun Trials(
    m: Model,
    r: Ranking,
) {
    watch()
    val ph = LocalUi.current.phone
    if (r.stale || r.trials.isEmpty()) return
    val rated = ratedOf(m)
    ListCard("Noch im Test", "trials") {
        val at = if (rated.size == 1) " bei ${ph.petName(rated[0])}" else ""
        Hint("Noch ein- oder zweimal füttern und bewerten, dann steht fest, wie sie$at ankommen.")
        Folded(r.trials, "trials") { t: Trial -> SortRow(m, t.e, "trial", pets = listOf(t.pet), early = true) }
    }
}

private val LEFT = mapOf("Snack" to "Snacks", "Trockenfutter" to "Trockenfutter")

@Composable
private fun Foot(x: Evaluation) {
    watch()
    val b = x.basis
    val parts = mutableListOf<String>()
    if (b.n > 0) {
        val date = dayMonth(b.first) + if (yearOf(b.first) == yearOf(Time.now())) "" else " ${yearOf(b.first)}"
        parts.add("Beruht auf ${b.n} Bewertungen seit dem $date.")
    }
    if (b.left.isNotEmpty()) {
        parts.add(
            "${andList(b.left.map { LEFT.getValue(it) })} ${if (b.left.size > 1 || b.left[0] == "Snack") "zählen" else "zählt"} nicht mit.",
        )
    }
    if (parts.isEmpty()) return
    T(
        parts.joinToString(" "),
        Type.small,
        Modifier.fillMaxWidth().padding(top = Space.s6),
        colors.muted,
        align = TextAlign.Center,
        balance = true,
    )
}

@Composable
private fun CatChips() {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val cur = ph.prefs.activePet.takeIf { ph.derive.getPet(it) != null } ?: "all"
    Chips(
        Modifier.padding(bottom = Space.s5).semantics {
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

@Composable
fun EvaluationPage() {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val m = d.model()
    val r = d.rankingModel()
    SheetBody(
        "Vorlieben",
        ui.sheets,
        onBack = ui.on("settings-back"),
        end = { IconBtn("cart", "Einkaufen", Modifier.testTag("cart"), onClick = ui.on("open-level", "v" to "shop")) },
    ) {
        if (ph.db.pets.size > 1) CatChips()
        if (r.rated == 0) {
            // dry food and treats have scales of their own and stay out of the comparison
            val wet = if (m.rated > 0) " mit Nassfutter" else ""
            val ask = "Bewerte ein paar Mahlzeiten$wet, dann steht hier, was ${d.petNames(m.pets)} schmeckt."
            Column(Modifier.testTag("lead")) { Marked(listOf(Bit(ask))) }
            return@SheetBody
        }
        val x = d.evaluationModel()
        val lists = listsOf(m, r)
        LeadBlock(m, r, x)
        Favourites(m, r, lists.top, x.last)
        Flops(m, lists.flop)
        Split(m, lists.split)
        Tastes(m, x)
        Feeding(x)
        Observed(m, x)
        Trials(m, r)
        Foot(x)
    }
}

// == The shopping list, a level of the page ==

@Composable
private fun ShopRow(
    m: Model,
    e: Sort,
) {
    watch()
    val ph = LocalUi.current.phone
    val sub = if (e.kaufen == null && e.choice == "gemischt") "nur für ${ph.derive.petNames(e.yes)}" else ""
    SortRow(m, e, "shop", if (e.kaufen != null) listOf(sub, "von dir festgelegt").filter { it.isNotEmpty() }.joinToString(", ") else sub)
}

@Composable
fun ShopPage() {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val m = ph.derive.model()
    val g = ownGroups(m, ph.db.pets.size)
    val types = TYPES.map { t -> t to g.nachkaufen.filter { typeOf(it.product) == t } }.filter { it.second.isNotEmpty() }
    SheetBody(
        "Einkaufen" + ph.forWhom(m.pet),
        ui.sheets,
        onBack = ui.on("settings-back"),
        end = if (types.isNotEmpty()) ({ IconBtn("share", "Liste teilen", onClick = ui.on("share-list")) }) else null,
    ) {
        Card(Modifier.testTag("buy")) {
            CardTitle("Nachkaufen")
            if (types.isEmpty()) {
                Hint("Noch nichts zum Nachkaufen, erst mal probieren.", Modifier.padding(top = Space.s2))
            } else {
                for ((t, l) in types) {
                    Label(t, top = Space.s3)
                    Folded(l, "buy-$t") { e -> ShopRow(m, e) }
                }
            }
        }
        // what „Vorlieben“ lists as left is not bought again either, though no rule says so yet
        val (left, open) = g.geht.partition { it.kaufen == null && sideOf(it) == "flop" }
        val stop = g.nicht + left
        if (stop.isNotEmpty()) {
            ListCard("Nicht mehr kaufen", "stop") { Folded(stop, "stop") { e -> ShopRow(m, e) } }
        }
        val unclear = open + g.neu
        if (unclear.isNotEmpty()) {
            ListCard("Noch unklar", "unclear") { Folded(unclear, "unclear") { e -> ShopRow(m, e) } }
        }
    }
}

// == The card on home ==

fun Phone.hasEvaluationCard(m: Model): Boolean {
    val r = derive.rankingModel()
    return r.rated > 0 || ownGroups(m, db.pets.size).nachkaufen.isNotEmpty()
}

@Composable
fun hasEvaluationCard(m: Model) = LocalUi.current.phone.hasEvaluationCard(m)

@Composable
private fun SideLabel(
    text: String,
    tone: String,
) {
    watch()
    val c = colors.tone(tone)!!
    Row(
        Modifier.fillMaxWidth().padding(top = Space.s3, bottom = Space.hair),
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        T(text, Type.smallStrong, color = c.c)
        Box(Modifier.weight(1f).height(Size.hairline).background(c.cs))
    }
}

// without a ranking, as for a cat on dry food only, the card shows what to buy again
@Composable
fun EvaluationCard(m: Model) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val r = ph.derive.rankingModel()
    val lists = listsOf(m, r)
    Card(Modifier.animateContentSize(if (reduceMotion) tween(0) else tween(Motion.STEP, easing = Motion.easeIn))) {
        CardHead("Vorlieben", label = "Alle Vorlieben", onMore = ui.on("open-evaluation"))
        when {
            r.rated == 0 -> {
                SideLabel("Nachkaufen", "good")
                ownGroups(m, ph.db.pets.size).nachkaufen.take(CARD_ROWS + 1).forEachIndexed { i, e ->
                    if (i > 0) Divider(Size.picL + Space.s3)
                    SortRow(m, e, "card")
                }
            }
            lists.top.isNotEmpty() || lists.flop.isNotEmpty() || lists.split.isNotEmpty() -> {
                for ((side, list) in listOf("good" to lists.top, "bad" to lists.flop, "mid" to lists.split)) {
                    if (list.isEmpty() || side == "mid" && (lists.top + lists.flop).isNotEmpty()) continue
                    SideLabel(
                        when (side) {
                            "good" -> "Am liebsten"
                            "bad" -> ph.leaves(m)
                            else -> "Geschmackssache"
                        },
                        side,
                    )
                    list.take(CARD_ROWS).forEachIndexed { i, e ->
                        if (i > 0) Divider(Size.picL + Space.s3)
                        SortRow(m, e, "card")
                    }
                }
            }
            else -> {
                val t = if (r.stale) null else r.trials.firstOrNull()
                val wait =
                    when {
                        r.stale -> "Die letzten Bewertungen sind über ein halbes Jahr alt."
                        r.settled > 0 -> "Bisher ist keine Sorte ein klarer Treffer oder Reinfall."
                        else -> "Ab drei Bewertungen einer Sorte steht hier, was am besten ankommt."
                    }
                M(wait, Type.body, Modifier.padding(top = Space.hair, bottom = Space.s3), colors.ink)
                if (t != null) {
                    SideLabel("Am weitesten", "good")
                    SortRow(m, t.e, "card", "noch ${if (t.need == 1) "einmal" else "zweimal"} füttern", listOf(t.pet), early = true)
                }
            }
        }
    }
}
