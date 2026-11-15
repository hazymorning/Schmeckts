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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import de.schmeckts.app.DAY
import de.schmeckts.app.Evaluation
import de.schmeckts.app.Group
import de.schmeckts.app.Insight
import de.schmeckts.app.Model
import de.schmeckts.app.Phone
import de.schmeckts.app.Ranking
import de.schmeckts.app.Sort
import de.schmeckts.app.TYPES
import de.schmeckts.app.Time
import de.schmeckts.app.Trial
import de.schmeckts.app.andList
import de.schmeckts.app.cap
import de.schmeckts.app.dayMonth
import de.schmeckts.app.esc
import de.schmeckts.app.observationOf
import de.schmeckts.app.ownGroups
import de.schmeckts.app.pname
import de.schmeckts.app.ratingsIn
import de.schmeckts.app.typeOf
import de.schmeckts.app.ui.Card
import de.schmeckts.app.ui.CardHead
import de.schmeckts.app.ui.CardTitle
import de.schmeckts.app.ui.Chip
import de.schmeckts.app.ui.Chips
import de.schmeckts.app.ui.Divider
import de.schmeckts.app.ui.Gap
import de.schmeckts.app.ui.Hint
import de.schmeckts.app.ui.IconBtn
import de.schmeckts.app.ui.Label
import de.schmeckts.app.ui.Link
import de.schmeckts.app.ui.ListRow
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.M
import de.schmeckts.app.ui.Motion
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
import de.schmeckts.app.yearOf

// „Vorlieben“: the card on home, the page and its shopping list. The analysis is in Smart.kt, this only words it.

private const val SHOWN = 3 // rows a list shows before the rest unfolds
private const val CARD_ROWS = 2 // rows of a side on the home card
private const val JUDGE = 4 // settled varieties before the head calls a cat picky or easy to please
private const val AWAY = 42 * DAY // a favourite unserved this long says since when

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

private fun Phone.petName(id: String) = derive.getPet(id)?.str("name") ?: ""

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

/** a variety: its packaging, name and brand, its ratings; sub: said after the brand */
@Composable
private fun SortRow(
    m: Model,
    e: Sort,
    tag: String,
    sub: String = "",
    open: Int = 0,
) {
    watch()
    val ui = LocalUi.current
    val brand = brandOf(e)
    val line = cap(listOf(brand, sub).filter { it.isNotEmpty() }.joinToString(", "))
    ListRow(
        Modifier.testTag("$tag-${e.id}"),
        onClick = ui.on("open-product", "id" to e.id),
        label = "${pname(e.product)}${if (line.isNotEmpty()) ". $line" else ""}. ${ui.phone.whyOf(e)}.",
    ) {
        Thumb(null, e.product)
        TMain(esc(pname(e.product)), esc(line))
        Strip(ratingsIn(m, listOf(e.id)), open)
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

/** who the page is about and what sums them up */
@Composable
private fun Head(
    m: Model,
    r: Ranking,
) {
    watch()
    val ph = LocalUi.current.phone
    val several = m.pets.size > 1
    val k = r.top.size
    val n = r.settled
    val all = if (several) " bei allen" else ""
    val good = { only: String ->
        "Von $n Sorten ${if (k == 1) "kommt" else "kommen"} ${if (k == 0) "keine" else only + (if (k == 1) "eine" else "$k")}$all gut an."
    }
    val said =
        when {
            r.stale -> "Die letzten Bewertungen sind über ein halbes Jahr alt. Nach ein paar neuen steht hier wieder, was ankommt."
            n == 0 -> "Ab drei Bewertungen einer Sorte steht hier, was gut ankommt und was stehen bleibt."
            n < JUDGE -> "Bisher ${if (n == 1) "steht erst eine Sorte" else "stehen erst $n Sorten"} fest."
            several -> good("")
            k * 3 >= n * 2 -> "Frisst fast alles gern. ${good("")}"
            k * 3 <= n -> "Wählerisch. ${good("nur ")}"
            else -> good("")
        }
    Row(
        Modifier.fillMaxWidth().testTag("head"),
        horizontalArrangement = Arrangement.spacedBy(Space.s4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (several) {
            val ground = colors.bg
            Box(Modifier.size(Size.picXxl)) {
                m.pets.take(2).forEachIndexed { i, pid ->
                    // the second over the first, with a ring of the page around it
                    val ring =
                        if (i ==
                            1
                        ) {
                            Modifier.drawBehind { drawCircle(ground, size.minDimension / 2 + Size.stroke.toPx()) }
                        } else {
                            Modifier
                        }
                    Avatar(ph.derive.getPet(pid), Av.L, Modifier.align(if (i == 0) Alignment.TopStart else Alignment.BottomEnd).then(ring))
                }
            }
        } else {
            Avatar(ph.derive.getPet(m.pets.firstOrNull()), Av.XL)
        }
        Column(Modifier.weight(1f)) {
            T(ph.derive.petNames(m.pets), Type.heading, color = colors.ink)
            M(esc(said), Type.body, Modifier.padding(top = Space.hair), colors.ink)
        }
    }
    // the appetite rule already weighs each variety by what it got before, so a drop it finds is not the food
    for (h in m.hints.filter { it.kind == "appetit" }) {
        val who = if (several) "${ph.petName(h.pet ?: "")} frisst" else "Frisst"
        val said =
            "$who seit ein paar Tagen schlechter als sonst: zuletzt ${times(h.good, h.n)} gut gefressen, " +
                "davor ${times(h.goodBefore, h.before)}. An den Sorten liegt es nicht, die kamen vorher besser an."
        M(esc(said), Type.body, Modifier.fillMaxWidth().padding(top = Space.s4).testTag("appetite"), colors.ink)
    }
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

@Composable
private fun Favourites(
    m: Model,
    r: Ranking,
    last: Map<String, Long>,
) {
    watch()
    if (r.top.isEmpty()) return // the head says so
    val now = Time.now()
    ListCard("Am liebsten", "favourites") {
        if (r.flat) Hint("Die Sorten liegen noch so nah beieinander, dass die Reihenfolge Zufall sein kann.")
        Folded(r.top, "top") { e ->
            val at = last[e.id] ?: 0L
            SortRow(m, e, "top", if (at > 0 && now - at >= AWAY) "zuletzt vor ${lapse(at, now)}" else "")
        }
    }
}

@Composable
private fun Flops(
    m: Model,
    r: Ranking,
) {
    watch()
    if (r.flop.isEmpty()) return
    ListCard(LocalUi.current.phone.leaves(m), "flops") { Folded(r.flop, "flop") { e -> SortRow(m, e, "flop") } }
}

private fun Phone.leaves(m: Model) =
    when {
        m.pets.size > 1 -> "Lassen sie stehen"
        derive.getPet(m.pets.firstOrNull())?.str("sex") == "m" -> "Lässt er stehen"
        else -> "Lässt sie stehen"
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
            val say = "Nach ${pname(e.product)} öfter: ${ob.label}"
            val why = "Nach ${l.after.hit} von ${l.after.n} Mahlzeiten ${ob.after}, sonst nach ${l.other.hit} von ${l.other.n}."
            if (i > 0) Divider(Size.picL + Space.s3)
            ListRow(Modifier.testTag("observed-${e.id}"), onClick = ui.on("open-product", "id" to e.id), label = "$say. $why", top = true) {
                Thumb(null, e.product)
                TMain(esc(say), esc(why))
            }
        }
    }
}

// only with several cats: what one likes and another leaves
@Composable
private fun Split(
    m: Model,
    r: Ranking,
) {
    watch()
    val ph = LocalUi.current.phone
    if (m.pets.size < 2 || r.split.isEmpty()) return
    ListCard("Geschmackssache", "split") {
        Folded(r.split, "split") { e ->
            val yes = ph.derive.petNames(e.yes)
            SortRow(m, e, "split", "$yes ${if (e.yes.size > 1) "mögen" else "mag"} sie, ${ph.derive.petNames(e.no)} nicht")
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
    val several = m.pets.size > 1
    ListCard("Noch im Test", "trials") {
        Folded(r.trials, "trials") { t: Trial ->
            val who = if (several) " für ${ph.petName(t.pet)}" else ""
            SortRow(m, t.e, "trial", "noch ${if (t.need == 1) "einmal" else "zweimal"}$who bewerten", if (several) 0 else t.need)
        }
    }
}

/** one group: its name, how often it went down well as a bar, and what a clear finding says of it */
@Composable
private fun GroupBar(
    name: String,
    g: Group,
    said: List<Pair<String, String>>,
) {
    watch()
    val good = colors.good
    val verdict = said.joinToString(", ") { it.first }
    Column(
        Modifier
            .fillMaxWidth()
            .padding(bottom = Space.s3)
            .testTag("group-$name")
            .semantics(mergeDescendants = true) {
                contentDescription = "$name: ${g.good} von ${g.n} Mal gut gefressen" + if (verdict.isNotEmpty()) ", $verdict" else ""
            },
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
            T(name, Type.body, Modifier.weight(1f), colors.ink)
            T("${g.good} von ${g.n}", Type.small, Modifier.align(Alignment.CenterVertically), colors.muted)
        }
        Box(
            Modifier
                .fillMaxWidth()
                .padding(top = Space.s1)
                .height(Size.meterW)
                .clip(RoundedCornerShape(50))
                .background(colors.goodSoft)
                .drawBehind {
                    drawRoundRect(good, size = size.copy(width = size.width * g.good / g.n), cornerRadius = CornerRadius(size.height / 2))
                },
        )
        if (said.isNotEmpty()) {
            T(cap(verdict), Type.smallStrong, Modifier.padding(top = Space.s1), colors.tone(said[0].second)!!.c)
        }
    }
}

private val OTHERS = mapOf("geschmack" to "Andere Sorten", "konsistenz" to "Anderes Nassfutter", "marke" to "Andere Marken")
private val DIMENSIONS = listOf("geschmack" to "Geschmack", "konsistenz" to "Konsistenz", "marke" to "Marke")
private val BUYING = setOf("geschmack", "konsistenz", "marke", "sosse")

// what a clear finding says of a group under its bar, and in which tone: of the group it is about, and of the other
// side where that is one group too, the other way round
private fun verdictOf(
    x: Insight,
    key: String,
): Pair<String, String>? {
    val better =
        if (x.kind == "sosse" || x.a.key == key) {
            x.gap > 0
        } else if (x.b.key == key) {
            x.gap < 0
        } else {
            return null
        }
    return when {
        x.kind == "sosse" -> if (key == "sosse") "oft nur die Soße geleckt" to "sauce" else null
        better -> "kommt deutlich besser an" to "good"
        else -> "kommt deutlich schlechter an" to "bad"
    }
}

// each flavour, consistency and brand with how often it went down well, the best first; a clear finding under its bar
@Composable
private fun Taste(x: Evaluation) {
    watch()
    val t = x.taste
    val lists = listOf(t.geschmack, t.konsistenz, t.marke)
    if (lists.all { it.isEmpty() }) return
    val found = x.insights.filter { it.kind in BUYING }
    ListCard("Was wie ankommt", "taste") {
        DIMENSIONS.forEachIndexed { i, (kind, title) ->
            if (lists[i].isEmpty()) return@forEachIndexed
            Row(Modifier.fillMaxWidth().padding(top = Space.s4, bottom = Space.s3), horizontalArrangement = Arrangement.SpaceBetween) {
                T(title, Type.smallStrong, color = colors.muted)
                T("gut gefressen", Type.smallStrong, color = colors.muted)
            }
            for (g in lists[i]) {
                val said =
                    if (g.key.isEmpty()) {
                        emptyList()
                    } else {
                        found
                            .filter {
                                dimensionOf(
                                    it,
                                ) == kind
                            }.mapNotNull { verdictOf(it, g.key) }
                    }
                GroupBar(groupName(kind, g.key), g, said)
            }
        }
    }
}

private fun dimensionOf(x: Insight) = if (x.kind == "sosse") "konsistenz" else x.kind

private fun groupName(
    kind: String,
    key: String,
) = when {
    key.isEmpty() -> OTHERS.getValue(kind)
    kind == "konsistenz" -> textureName(key)
    else -> key
}

// what holds for feeding rather than buying: the same variety twice, new ones, the time of day, snacks, who feeds
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
    T(parts.joinToString(" "), Type.small, Modifier.fillMaxWidth().padding(top = Space.s6), colors.muted, align = TextAlign.Center)
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
    val x = d.evaluationModel()
    SheetBody(
        "Vorlieben",
        ui.sheets,
        onBack = ui.on("settings-back"),
        end = { IconBtn("cart", "Einkaufen", Modifier.testTag("cart"), onClick = ui.on("open-level", "v" to "shop")) },
    ) {
        if (ph.db.pets.size > 1) CatChips()
        if (r.rated == 0) {
            M("Bewerte ein paar Mahlzeiten, dann steht hier, was ankommt und was nicht.", Type.body, color = colors.ink)
            return@SheetBody
        }
        Head(m, r)
        Favourites(m, r, x.last)
        Flops(m, r)
        Split(m, r)
        Taste(x)
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
        if (g.nicht.isNotEmpty()) {
            ListCard("Nicht mehr kaufen", "stop") { Folded(g.nicht, "stop") { e -> ShopRow(m, e) } }
        }
        val unclear = g.geht + g.neu
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
            r.top.isNotEmpty() || r.flop.isNotEmpty() -> {
                for ((side, list) in listOf("good" to r.top, "bad" to r.flop)) {
                    if (list.isEmpty()) continue
                    SideLabel(if (side == "good") "Am liebsten" else ph.leaves(m), side)
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
                    SortRow(m, t.e, "card", "noch ${if (t.need == 1) "einmal" else "zweimal"} bewerten", if (m.pets.size > 1) 0 else t.need)
                }
            }
        }
    }
}
