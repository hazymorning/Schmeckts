package de.schmeckts.app

import kotlinx.serialization.json.JsonObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.Collator
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sqrt

// The evaluation model. Pure; caching is in Derive.kt.

private const val HALF_LIFE = 90.0 * DAY
private const val WEIGHT_ZERO = 1767225600000.0 // Date.UTC(2026, 0, 1); arbitrary, the score does not depend on it
const val GOOD = 70 // points from which something counts as going down well
const val NO = 40 // points under which a rating counts as left
private const val WINDOW = 8 // newest ratings per variety and pet that the verdict uses
private const val VERDICT_SPAN = 180 * DAY // older ratings still weigh in the score, not in the verdict

private object APPETITE {
    const val RECENT = 72 * 3_600_000L
    const val USUAL = 30 * DAY
    const val MIN_RECENT = 3
    const val MIN_USUAL = 8
    const val MIN_SORTS = 2
    const val DROP = 30
    const val BELOW = 50
}

val VERDICTS =
    linkedMapOf(
        "nachkaufen" to "Nachkaufen",
        "gemischt" to "Gemischt",
        "geht" to "Geht so",
        "neu" to "Noch zu wenig bewertet",
        "nicht" to "Nicht mehr kaufen",
    )
private val HINTS = listOf("appetit", "stop", "sosse", "liebling") // by precedence

// unknown values from other devices do not count
fun rOf(x: Any?): String? = ((x as? JsonObject)?.get("r").asString)?.takeIf { it in RATINGS }

private fun toneOf(v: Double) =
    if (v >= GOOD) {
        "good"
    } else if (v >= NO) {
        "mid"
    } else {
        "bad"
    }

fun rateTone(r: String): String = RATINGS.getValue(r).score.let { if (it in 1..NO) "sauce" else toneOf(it.toDouble()) }

fun scoreCls(v: Double) = "r-" + toneOf(v)

fun rateCls(r: String) = "r-" + rateTone(r)

fun score(r: String) = RATINGS.getValue(r).score

/** One rating: pet, level, time, variety. */
class Pt(
    val pid: String,
    val r: String,
    val t: Long,
    val id: String?,
)

class Sum {
    var n = 0
    var points = 0.0
    var weights = 0.0
    val list = mutableListOf<Pt>()
}

// All weights shrink at the same rate, so points / weights does not depend on when it is computed and a sum holds
// until one of its meals changes. list is newest first, like the meals.
private fun addRating(
    sum: Sum,
    x: Pt,
) {
    val w = 2.0.pow((x.t - WEIGHT_ZERO) / HALF_LIFE)
    sum.n++
    sum.points += w * score(x.r)
    sum.weights += w
    sum.list.add(x)
}

private fun addSum(
    sum: Sum,
    other: Sum,
): Sum {
    sum.n += other.n
    sum.points += other.points
    sum.weights += other.weights
    return sum
}

// +x.toFixed(6)
fun fixed6(x: Double): Double = BigDecimal(x).setScale(6, RoundingMode.HALF_UP).toDouble()

private fun scoreOf(sum: Sum) = if (sum.n > 0) fixed6(sum.points / sum.weights) else 0.0

private fun windowOf(
    list: List<Pt>,
    now: Long,
) = list.take(WINDOW).filter { it.t > now - VERDICT_SPAN }

// only levels that actually occur
fun countsOf(list: List<Pt>): LinkedHashMap<String, Int> {
    val counts = LinkedHashMap<String, Int>()
    for (x in list) counts[x.r] = (counts[x.r] ?: 0) + 1
    return counts
}

/** What a verdict rests on: how many ratings and which levels. */
interface Tally {
    val n: Int
    val counts: Map<String, Int>
    val verdict: String
}

class Counted(
    override val n: Int,
    override val counts: Map<String, Int>,
    override val verdict: String = "",
) : Tally

class Stat(
    override val n: Int,
    val score: Double,
    val pct: Long,
    override val counts: Map<String, Int>,
    val list: List<Pt>,
    val window: List<Pt>,
    override val verdict: String,
) : Tally

class House(
    override val n: Int,
    val score: Double,
    val pct: Long,
    override val counts: Map<String, Int>,
    val yes: List<String>,
    val no: List<String>,
    override val verdict: String,
) : Tally

/** A variety in the model. */
class Sort(
    val id: String,
    val product: Rec,
    val kaufen: String?,
    val pets: Map<String, Stat>,
    val house: House,
    val total: Int,
    override val n: Int,
    val score: Double,
    val pct: Long,
    override val verdict: String,
    override val counts: Map<String, Int>,
    val yes: List<String>,
    val no: List<String>,
    val choice: String,
) : Tally

class Ratings(
    val keys: List<String>,
    val more: Boolean,
)

// keys oldest first; more is set when ratings lie beyond the windows
fun ratingsIn(
    m: Model,
    ids: List<String>,
): Ratings {
    val stats =
        ids.flatMap { id ->
            val pets = m.byId[id]?.pets ?: emptyMap()
            if (m.pet != null) listOfNotNull(pets[m.pet]) else pets.values.toList()
        }
    return Ratings(stats.flatMap { it.window }.sortedBy { it.t }.map { it.r }, stats.any { it.list.size > it.window.size })
}

private fun countOf(
    counts: Map<String, Int>,
    on: (Int) -> Boolean,
) = counts.entries.sumOf { (r, k) -> if (on(score(r))) k else 0 }

fun goodOf(counts: Map<String, Int>) = countOf(counts) { it >= GOOD }

fun poorOf(counts: Map<String, Int>) = countOf(counts) { it < NO }

// counts ratings instead of using the score, so it agrees with the wording in evidenceOf() (views/Parts.kt)
private fun verdictOf(
    n: Int,
    good: Int,
    poor: Int,
) = if (n >= 3 && good * 3 >= n * 2) {
    "nachkaufen"
} else if (n >= 2 && poor * 2 > n) {
    "nicht"
} else if (n >= 3) {
    "geht"
} else {
    "neu"
}

// score over every rating, the rest from the window; pct rounds off the noise of the weights
private fun statOf(
    sum: Sum,
    now: Long,
): Stat {
    val window = windowOf(sum.list, now)
    val counts = countsOf(window)
    val score = scoreOf(sum)
    return Stat(window.size, score, jsRound(score), counts, sum.list, window, verdictOf(window.size, goodOf(counts), poorOf(counts)))
}

private class HouseVerdict(
    val yes: List<String>,
    val no: List<String>,
    val verdict: String,
)

private fun houseVerdict(pets: List<Pair<String, Tally>>): HouseVerdict {
    val yes = pets.filter { it.second.verdict == "nachkaufen" }.map { it.first }
    val no = pets.filter { it.second.verdict == "nicht" }.map { it.first }
    val rest = if (pets.any { it.second.verdict == "geht" }) "geht" else "neu"
    return HouseVerdict(
        yes,
        no,
        if (yes.isNotEmpty()) {
            (if (no.isNotEmpty()) "gemischt" else "nachkaufen")
        } else if (no.isNotEmpty()) {
            "nicht"
        } else {
            rest
        },
    )
}

private fun houseOf(
    sums: Map<String, Sum>,
    stats: Map<String, Stat>,
): House {
    val all = sums.values.fold(Sum(), ::addSum)
    val score = scoreOf(all)
    val window = stats.values.flatMap { it.window }
    val v = houseVerdict(stats.entries.map { it.key to it.value })
    return House(window.size, score, jsRound(score), countsOf(window), v.yes, v.no, v.verdict)
}

val Rec.pets: JsonObject get() = obj("pets") ?: JsonObject(emptyMap())

private fun ratingsOf(
    db: Db,
    servings: List<Rec>,
): List<Pt> {
    val known = db.pets.map { it.id }.toSet()
    val out = mutableListOf<Pt>()
    for (s in servings) {
        for ((pid, x) in s.pets) {
            val r = rOf(x)
            if (r != null && pid in known) out.add(Pt(pid, r, s.servedAt, s.str("productId")))
        }
    }
    return out
}

class Sums {
    val bySort = HashMap<String, LinkedHashMap<String, Sum>>()
    var next = Long.MAX_VALUE
}

// next is the first future meal; the sums are stale once it is reached
fun tally(
    db: Db,
    now: Long,
    only: Set<String?>? = null,
    sums: Sums = Sums(),
): Sums {
    if (only != null) only.forEach { sums.bySort.remove(it) } else sums.bySort.clear()
    sums.next = Long.MAX_VALUE
    val due = mutableListOf<Rec>()
    for (s in db.servings) {
        val pid = s.str("productId")
        if (s.servedAt > now) {
            sums.next = min(sums.next, s.servedAt)
        } else if (!pid.isNullOrEmpty() && (only == null || pid in only)) {
            due.add(s)
        }
    }
    for (x in ratingsOf(db, due)) addRating(sums.bySort.getOrPut(x.id!!) { LinkedHashMap() }.getOrPut(x.pid) { Sum() }, x)
    return sums
}

class Hint(
    val kind: String,
    val id: String?,
    val pet: String?,
    val order: Double,
    val n: Int = 0,
    val good: Int = 0,
    val before: Int = 0,
    val goodBefore: Int = 0,
    val recent: Long = 0,
    val usual: Long = 0,
    val day: String = "",
    val seen: List<String> = emptyList(),
)

fun hintKey(h: Hint) = if (h.kind == "appetit") "appetit:${h.pet}:${h.day}" else "${h.kind}:${h.id}"

class Model(
    val pet: String?,
    val pets: List<String>,
    val sorts: List<Sort>,
    val byId: Map<String, Sort>,
    val rated: Int,
    val hints: List<Hint>,
)

/** What analyze() reads of the settings. */
class Filter(
    val activePet: String = "all",
    val hiddenHints: List<String> = emptyList(),
)

// total counts every rating in the filter, not only the window; list and window exist per pet only
fun analyze(
    db: Db,
    prefs: Filter,
    now: Long,
    sums: Sums = tally(db, now),
): Model {
    val petIds = db.pets.map { it.id }
    val pet = prefs.activePet.takeIf { it != "all" && it in petIds }
    val sorts =
        db.products
            .map { product ->
                val mine = sums.bySort[product.id] ?: emptyMap<String, Sum>()
                val pets = LinkedHashMap<String, Stat>()
                for (pid in petIds) mine[pid]?.let { pets[pid] = statOf(it, now) }
                val house = houseOf(mine, pets)
                val k = product.str("kaufen")?.takeIf { it == "immer" || it == "nicht" }
                val eff: Tally = if (pet != null) pets[pet] ?: statOf(Sum(), now) else house
                val effScore = if (eff is Stat) eff.score else (eff as House).score
                val effPct = if (eff is Stat) eff.pct else (eff as House).pct
                Sort(
                    id = product.id,
                    product = product,
                    kaufen = k,
                    pets = pets,
                    house = house,
                    total = if (pet != null) mine[pet]?.n ?: 0 else petIds.sumOf { mine[it]?.n ?: 0 },
                    n = eff.n,
                    score = effScore,
                    pct = effPct,
                    verdict = eff.verdict,
                    counts = eff.counts,
                    yes = if (pet != null) emptyList() else house.yes,
                    no = if (pet != null) emptyList() else house.no,
                    choice =
                        if (k == "immer") {
                            "nachkaufen"
                        } else if (k == "nicht") {
                            "nicht"
                        } else {
                            eff.verdict
                        },
                )
            }.sortedWith(compareByDescending<Sort> { it.score }.thenByDescending { it.n })
    return Model(
        pet,
        if (pet != null) listOf(pet) else petIds,
        sorts,
        sorts.associateByTo(LinkedHashMap()) { it.id },
        sorts.sumOf { it.n },
        hints(sorts, appetite(db, if (pet != null) listOf(pet) else petIds, now), pet, prefs),
    )
}

private fun sauceShare(x: Tally) = (x.counts["sosse"] ?: 0).toDouble() / x.n

private fun avg(l: List<Pt>) = jsRound(l.sumOf { score(it.r) }.toDouble() / l.size)

// has a pet been eating noticeably worse for a few days?
private fun appetite(
    db: Db,
    petIds: List<String>,
    now: Long,
): List<Hint> {
    val cut = now - APPETITE.RECENT
    val out = mutableListOf<Hint>()
    val span = ratingsOf(db, db.servings.filter { it.servedAt <= now && it.servedAt > cut - APPETITE.USUAL })
    val good = { l: List<Pt> -> l.count { score(it.r) >= GOOD } }
    for (pid in petIds) {
        val mine = span.filter { it.pid == pid }
        val win = mine.filter { it.t > cut }
        val base = mine.filter { it.t <= cut }
        if (win.size < APPETITE.MIN_RECENT ||
            base.size < APPETITE.MIN_USUAL ||
            win.mapNotNull { it.id?.takeIf(String::isNotEmpty) }.toSet().size < APPETITE.MIN_SORTS
        ) {
            continue
        }
        val recent = avg(win)
        val usual = avg(base)
        // what each variety got before, so a run of food the pet never liked is no alarm
        val before = { x: Pt -> if (x.id != null && base.any { it.id == x.id }) avg(base.filter { it.id == x.id }) else usual }
        val expected = win.sumOf { before(it) }.toDouble() / win.size
        if (usual - recent >= APPETITE.DROP && expected - recent >= APPETITE.DROP && recent < APPETITE.BELOW) {
            out.add(
                Hint(
                    kind = "appetit",
                    id = null,
                    pet = pid,
                    order = (recent - usual).toDouble(),
                    n = win.size,
                    good = good(win),
                    before = base.size,
                    goodBefore = good(base),
                    recent = recent,
                    usual = usual,
                    day = dayKey(win.maxOf { it.t }),
                    // observations in the same hours, named beside the ratings
                    seen =
                        db.observations
                            .filter { it.at > cut && it.at <= now && it.pets[pid] != null }
                            .mapNotNull { it.str("kind") }
                            .distinct(),
                ),
            )
        }
    }
    return out
}

private fun hints(
    sorts: List<Sort>,
    appetites: List<Hint>,
    pet: String?,
    prefs: Filter,
): List<Hint> {
    val hidden = prefs.hiddenHints.toSet()
    val out = appetites.toMutableList()
    for (e in sorts) {
        if (e.kaufen != null) continue
        if (e.verdict == "nicht") out.add(Hint("stop", e.id, pet, e.score))
        val sauce =
            e.pets.entries
                .filter { (pid, x) -> (pet == null || pid == pet) && x.n >= 3 && sauceShare(x) >= 0.6 }
                .sortedByDescending { sauceShare(it.value) }
                .firstOrNull()
        if (sauce != null) out.add(Hint("sosse", e.id, sauce.key, -sauceShare(sauce.value)))
        // a treat is eaten up anyway
        if (e.verdict == "nachkaufen" && typeOf(e.product) != "Snack") out.add(Hint("liebling", e.id, pet, -e.score))
    }
    return out
        .filter { hintKey(it) !in hidden }
        .sortedWith(compareBy<Hint> { HINTS.indexOf(it.kind) }.thenBy { it.order })
}

class ShopGroups(
    val nachkaufen: List<Sort>,
    val nicht: List<Sort>,
    val geht: List<Sort>,
    val neu: List<Sort>,
)

// sorted by likingOf() as on "Vorlieben"; a variety unrated in the filter shows only with a manual setting
fun shopGroups(m: Model): ShopGroups {
    val yes = mutableListOf<Sort>()
    val no = mutableListOf<Sort>()
    val geht = mutableListOf<Sort>()
    val neu = mutableListOf<Sort>()
    for (e in m.sorts) {
        when {
            e.choice == "nachkaufen" || e.choice == "gemischt" -> yes.add(e)
            e.choice == "nicht" -> no.add(e)
            e.total > 0 -> if (e.choice == "geht") geht.add(e) else neu.add(e)
        }
    }
    val like = (yes + no).associateWith { likingOf(it) }
    val own = { verdict: String -> { e: Sort -> if (e.verdict == verdict) 0 else 1 } } // own verdict before mixed or manual
    return ShopGroups(
        yes.sortedWith(compareBy<Sort>(own("nachkaufen")).thenByDescending { like.getValue(it) }.thenByDescending { it.n }),
        no.sortedWith(compareBy<Sort>(own("nicht")).thenBy { like.getValue(it) }.thenByDescending { it.n }),
        geht,
        neu,
    )
}

// a treat is nearly always eaten and dry food stands in the bowl all day, so neither says much beside a meal
private val UNRANKED = listOf("Snack", "Trockenfutter")

fun ranks(product: Rec?) = typeOf(product) !in UNRANKED

private object RANK {
    const val PRIOR = 2
    const val MIDDLE = 50
    const val FLOP = 50
    const val FLAT = 1.3
    const val FLAT_SORTS = 4
    const val FLAT_RATINGS = 24
}

private fun pointsIn(counts: Map<String, Int>) = counts.entries.sumOf { (r, k) -> score(r) * k }

// pulled toward RANK.MIDDLE by RANK.PRIOR ratings, so evidence beats a lucky start; never shown
fun likingOf(x: Tally): Double = (pointsIn(x.counts) + RANK.PRIOR * RANK.MIDDLE).toDouble() / (x.n + RANK.PRIOR)

// follows the verdict, so "Vorlieben" never contradicts "Einkaufen" or a hint
fun sideOf(x: Tally): String {
    if (x.n == 0 || x.verdict == "neu") return "thin"
    if (x.verdict == "gemischt") return "split"
    if (x.verdict == "nachkaufen") return "top"
    if (x.verdict == "nicht") return "flop"
    val good = goodOf(x.counts) * 2
    if (good > x.n) return "top"
    return if (good < x.n && pointsIn(x.counts) < RANK.FLOP * x.n) "flop" else "mid"
}

private fun sided(
    dir: Int,
    like: Map<Sort, Double>,
) = Comparator<Sort> { a, b ->
    val g = (if (a.verdict == "geht") 1 else 0) - (if (b.verdict == "geht") 1 else 0)
    if (g != 0) return@Comparator g
    val l = dir * (like.getValue(b) - like.getValue(a))
    if (l != 0.0) return@Comparator sign(l).toInt()
    if (b.n != a.n) return@Comparator b.n - a.n
    if (a.id < b.id) -1 else 1
}

class Trial(
    val e: Sort,
    val need: Int,
    val pet: String,
)

class Ranking(
    private val m: Model,
    private val now: Long,
) {
    val top = mutableListOf<Sort>()
    val flop = mutableListOf<Sort>()
    val mid = mutableListOf<Sort>()
    val split = mutableListOf<Sort>()
    val thin = mutableListOf<Sort>()
    var settled = 0
    var rated = 0
    var stale = false
    val like = HashMap<Sort, Double>()

    // lazy, the card needs them only when it has no side to show
    val flat: Boolean by lazy { flatOf(top + mid + flop + split) }
    val trials: List<Trial> by lazy { trialsOf(m, now, thin, like) }

    fun side(k: String): List<Sort> =
        when (k) {
            "top" -> top
            "flop" -> flop
            "mid" -> mid
            "split" -> split
            else -> thin
        }
}

fun ranking(
    m: Model,
    now: Long,
): Ranking {
    val r = Ranking(m, now)
    for (e in m.sorts) {
        if (e.total > 0 && ranks(e.product)) {
            r.rated++
            if (e.n > 0) (r.side(sideOf(e)) as MutableList<Sort>).add(e)
        }
    }
    for (e in r.top + r.flop + r.split + r.thin) r.like[e] = likingOf(e)
    r.top.sortWith(sided(1, r.like))
    r.flop.sortWith(sided(-1, r.like))
    val spread = { e: Sort ->
        val l = m.pets.filter { (e.pets[it]?.n ?: 0) > 0 }.map { likingOf(e.pets.getValue(it)) }
        (l.maxOrNull() ?: Double.NEGATIVE_INFINITY) - (l.minOrNull() ?: Double.POSITIVE_INFINITY)
    }
    val s = sided(1, r.like)
    r.split.sortWith { a, b ->
        val d = spread(b) - spread(a)
        if (d != 0.0 && !d.isNaN()) sign(d).toInt() else s.compare(a, b)
    }
    r.settled = r.top.size + r.flop.size + r.mid.size + r.split.size
    r.stale = r.rated > 0 && r.settled == 0 && r.thin.isEmpty()
    return r
}

// Index of dispersion: do the varieties differ no more than coin flips would? In simulation it says so on most looks
// for a cat that eats everything alike, and on hardly any for real differences.
private fun flatOf(list: List<Sort>): Boolean {
    val n = list.sumOf { it.n }
    val good = list.sumOf { goodOf(it.counts) }
    if (list.size < RANK.FLAT_SORTS || n < RANK.FLAT_RATINGS || good == 0 || good == n) return false
    val p = good.toDouble() / n
    val chi = list.sumOf { (goodOf(it.counts) - it.n * p).pow(2) / (it.n * p * (1 - p)) }
    return chi / (list.size - 1) <= RANK.FLAT
}

// need is exact, since every variety has a verdict from TRIAL_NEED ratings on
private const val TRIAL_SPAN = 60 * DAY
private const val TRIAL_NEED = 3

private fun trialsOf(
    m: Model,
    now: Long,
    thin: List<Sort>,
    like: Map<Sort, Double>,
): List<Trial> {
    val out = mutableListOf<Trial>()
    for (e in thin) {
        if (e.kaufen == "nicht" || goodOf(e.counts) * 2 < e.n) continue
        val mine = m.pets.mapNotNull { pid -> e.pets[pid]?.takeIf { it.n > 0 }?.let { pid to it } }
        if (mine.isEmpty() ||
            mine.minOf {
                it.second.list
                    .last()
                    .t
            } < now - TRIAL_SPAN
        ) {
            continue
        }
        val (pet, x) = mine.reduce { a, b -> if (b.second.n > a.second.n) b else a }
        out.add(Trial(e, max(1, TRIAL_NEED - x.n), pet))
    }
    val all = { t: Trial -> if (goodOf(t.e.counts) == t.e.n) 0 else 1 }
    return out.sortedWith { a, b ->
        if (a.need != b.need) return@sortedWith a.need - b.need
        if (all(a) != all(b)) return@sortedWith all(a) - all(b)
        val l = like.getValue(b.e) - like.getValue(a.e)
        if (l != 0.0) return@sortedWith sign(l).toInt()
        if (a.e.id < b.e.id) -1 else 1
    }
}

// A clear change also needs TREND.z pooled standard errors, so a lucky run is no news. Its cause is the pet when the
// varieties eaten in both spans moved the same way, the food when they held.
private object TREND {
    const val RECENT = 28 * DAY
    const val BEFORE = 56 * DAY
    const val MIN = 10
    const val CALM = 10
    const val CLEAR = 20
    const val Z = 2
    const val USUAL = 6
    const val BEHIND = 2
}

class GoodCount(
    val n: Int,
    val good: Int,
)

private class Rid(
    val r: String,
    val id: String?,
)

private fun goodCount(list: List<Rid>) = GoodCount(list.size, list.count { score(it.r) >= GOOD })

// cross-multiplied, so a threshold in points compares exactly: apart against points * of
private fun shareGap(
    a: GoodCount,
    b: GoodCount,
) = Pair(100L * (a.good.toLong() * b.n - b.good.toLong() * a.n), a.n.toLong() * b.n)

class Trend(
    val pet: String,
    val kind: String,
    val dir: Int,
    val recent: GoodCount,
    val before: GoodCount,
    val cause: String? = null,
    val behind: List<String> = emptyList(),
)

fun trend(
    db: Db,
    m: Model,
    now: Long,
): List<Trend> {
    val meal =
        db.products
            .filter(::ranks)
            .map { it.id }
            .toSet()
    val cut = now - TREND.RECENT
    val from = cut - TREND.BEFORE
    val per = LinkedHashMap<String, Pair<MutableList<Rid>, MutableList<Rid>>>()
    m.pets.forEach { per[it] = mutableListOf<Rid>() to mutableListOf() }
    for (s in db.servings) {
        if (s.servedAt <= from) break // the meals are kept newest first
        if (s.servedAt > now || s.str("productId") !in meal) continue
        for ((pid, x) in per) {
            val r = rOf(s.pets[pid])
            if (r != null) (if (s.servedAt > cut) x.first else x.second).add(Rid(r, s.str("productId")))
        }
    }
    val out = mutableListOf<Trend>()
    for ((pet, lists) in per) {
        val (recent, before) = lists
        val now4 = goodCount(recent)
        val then = goodCount(before)
        if (now4.n < TREND.MIN || then.n < TREND.MIN) continue
        val (apart, of) = shareGap(now4, then)
        val p = (now4.good + then.good).toDouble() / (now4.n + then.n)
        val se = 100 * sqrt(p * (1 - p) * (1.0 / now4.n + 1.0 / then.n))
        val dir = if (apart < 0) -1 else 1
        val kind =
            if (abs(apart) < TREND.CALM * of) {
                "gleich"
            } else if (abs(apart) >= TREND.CLEAR * of && abs(apart) >= TREND.Z * se * of) {
                "deutlich"
            } else {
                "etwas"
            }
        if (kind == "deutlich") {
            val (cause, behind) = causeOf(recent, before, dir)
            out.add(Trend(pet, kind, dir, now4, then, cause, behind))
        } else {
            out.add(Trend(pet, kind, dir, now4, then))
        }
    }
    return out
}

private fun causeOf(
    recent: List<Rid>,
    before: List<Rid>,
    dir: Int,
): Pair<String?, List<String>> {
    val old = before.map { it.id }.toSet()
    val known = recent.map { it.id }.filter { it in old }.toSet()
    val a = goodCount(recent.filter { it.id in known })
    val b = goodCount(before.filter { it.id in known })
    if (a.n < TREND.USUAL || b.n < TREND.USUAL) return null to emptyList()
    val (apart, of) = shareGap(a, b)
    if (apart * dir >= TREND.CLEAR * of) return "tier" to emptyList()
    if (abs(apart) >= TREND.CALM * of) return null to emptyList()
    val fresh = LinkedHashMap<String?, MutableList<Rid>>()
    for (x in recent) if (x.id !in old) fresh.getOrPut(x.id) { mutableListOf() }.add(x)
    val behind =
        fresh
            .map { (id, l) -> id to goodCount(l) }
            .filter { (_, x) -> x.n >= 2 && (if (dir < 0) x.good * 2 < x.n else x.good * 2 > x.n) }
            .sortedWith { x, y ->
                if (y.second.n !=
                    x.second.n
                ) {
                    y.second.n - x.second.n
                } else if ((x.first ?: "") < (y.first ?: "")) {
                    -1
                } else {
                    1
                }
            }.take(TREND.BEHIND)
            .map { it.first ?: "" }
    return "futter" to behind
}

// Erkenntnisse: what holds across varieties and meals and helps with buying and feeding, never one variety's verdict
// told again. Most set two sides against each other by how many of their meals went down well and count once both
// have INSIGHT_RATINGS, their shares lie INSIGHT_GAP apart and the gap is INSIGHT_Z pooled standard errors wide;
// INSIGHT_GROUP for a group against the rest, since the one furthest off is picked from several. In simulated
// households whose cat likes everything alike that keeps insights to about one in twenty after two months
// (PersonasTest). The widest gap comes first.
private const val INSIGHT_RATINGS = 4
private const val INSIGHT_GAP = 0.3
private const val INSIGHT_Z = 2.5
private const val INSIGHT_GROUP = 2.75
private const val SAUCE_RATINGS = 5 // „Nur Soße“ among the ratings of the varieties in sauce
private const val SAUCE_SHARE = 0.4
private const val NEW_SORTS = 5 // varieties served again after their first time
private const val DAY_BEGINS = 4 // a meal before this hour still belongs to the day before
private const val AFTER_SNACK = 3 * 3_600_000L
private const val TWO = 2 // varieties in a group, ratings of a variety

/** One side of an insight: a group (key) and how many of its meals went down well. */
class Side(
    val key: Any? = null,
    var n: Int = 0,
    var good: Int = 0,
)

private fun add(
    x: Side,
    r: String,
) {
    x.n++
    if (score(r) >= GOOD) x.good++
}

class SauceTally(
    val key: String,
    var n: Int = 0,
    var good: Int = 0,
    var sosse: Int = 0,
)

class Insight(
    val kind: String,
    val a: Side,
    val b: Side,
    val gap: Double,
    val sorts: List<Sort> = emptyList(),
    val rest: List<Sort> = emptyList(),
    val k: Int = 0,
    val n: Int = 0,
    val instead: SauceTally? = null,
)

// gap: a's share ahead of b's, negative behind; one division, so exactly 0.3 counts
private fun insightOf(
    kind: String,
    a: Side,
    b: Side,
    z: Double = INSIGHT_Z,
): Insight? {
    if (a.n < INSIGHT_RATINGS || b.n < INSIGHT_RATINGS) return null
    val gap = (a.good.toDouble() * b.n - b.good.toDouble() * a.n) / (a.n.toDouble() * b.n)
    val p = (a.good + b.good).toDouble() / (a.n + b.n)
    return if (abs(gap) >= INSIGHT_GAP && gap * gap >= z * z * p * (1 - p) * (1.0 / a.n + 1.0 / b.n)) Insight(kind, a, b, gap) else null
}

private fun worse(x: Insight?) = x?.takeIf { it.gap < 0 } // where only that way round helps

private fun textureKey(p: Rec): String = textureOf(p, p.str("texture"))?.key ?: guessTexture(p) ?: ""

private val GROUPS: Map<String, (Rec) -> List<String>> =
    mapOf(
        "marke" to { p -> listOf((p.str("brand") ?: "").trim()) },
        "geschmack" to { p -> flavoursOf(p.str("variety")) },
        "konsistenz" to { p -> listOf(textureKey(p)) },
    )

private fun wetOf(m: Model) = m.sorts.filter { it.n > 0 && typeOf(it.product) == TYPES[0] }

private fun enough(list: List<Sort>) = list.count { it.n >= TWO } >= TWO // so no single variety carries a side

private fun tallyOf(
    list: List<Sort>,
    key: Any? = null,
) = Side(key, list.sumOf { it.n }, list.sumOf { goodOf(it.counts) })

private val german: Collator = Collator.getInstance(Locale.GERMAN)

class Group(
    val key: String,
    val n: Int,
    val good: Int,
    val sorts: List<Sort>,
)

// Wet food by group, the best share first. Every rating counts, but a group needs two varieties rated twice; a variety
// naming two flavours counts in both.
private fun grouped(
    m: Model,
    keysOf: (Rec) -> List<String>,
): List<Group> {
    val by = LinkedHashMap<String, MutableList<Sort>>()
    for (e in wetOf(m)) for (k in keysOf(e.product)) if (k.isNotEmpty()) by.getOrPut(k) { mutableListOf() }.add(e)
    return by.entries
        .filter { enough(it.value) }
        .map { (key, sorts) -> tallyOf(sorts).let { Group(key, it.n, it.good, sorts) } }
        .sortedWith { a, b ->
            val d = b.good.toDouble() / b.n - a.good.toDouble() / a.n
            if (d != 0.0) return@sortedWith sign(d).toInt()
            if (b.n != a.n) return@sortedWith b.n - a.n
            german.compare(a.key, b.key)
        }
}

// the rest by its name where it is all one group
private fun restOf(
    kind: String,
    rest: List<Sort>,
): Side {
    val keys = rest.map { GROUPS.getValue(kind)(it.product).firstOrNull() }.toSet()
    return tallyOf(rest, if (kind != "geschmack" && keys.size == 1) keys.first()?.takeIf { it.isNotEmpty() } else null)
}

// A flavour only against varieties of the same brand and consistency, so it takes no blame for the sauce it came in:
// the counts are those of the lines holding both, the test Cochran-Mantel-Haenszel's, line by line.
private fun lineOf(p: Rec) = "${(p.str("brand") ?: "").trim()}|${textureKey(p)}"

private fun sameLine(
    g: Group,
    rest: List<Sort>,
): Insight? {
    val lines = LinkedHashMap<String, Pair<MutableList<Sort>, MutableList<Sort>>>()
    for ((i, list) in listOf(g.sorts, rest).withIndex()) {
        for (e in list) {
            val l = lines.getOrPut(lineOf(e.product)) { mutableListOf<Sort>() to mutableListOf() }
            (if (i == 0) l.first else l.second).add(e)
        }
    }
    val mine = mutableListOf<Sort>()
    val theirs = mutableListOf<Sort>()
    var off = 0.0
    var vary = 0.0
    for ((a, b) in lines.values) {
        if (a.isEmpty() || b.isEmpty()) continue
        mine.addAll(a)
        theirs.addAll(b)
        val x = tallyOf(a)
        val y = tallyOf(b)
        val n = (x.n + y.n).toDouble()
        val k = (x.good + y.good).toDouble()
        off += x.good - (x.n * k) / n
        vary += (x.n.toDouble() * y.n * k * (n - k)) / (n * n * (n - 1))
    }
    if (!enough(mine) || !enough(theirs)) return null
    val x = insightOf("geschmack", tallyOf(mine, g.key), tallyOf(theirs, null), 0.0)
    return if (x != null && off * x.gap > 0 && off * off >= INSIGHT_GROUP * INSIGHT_GROUP * vary) x else null
}

private fun withSorts(
    x: Insight,
    sorts: List<Sort>,
    rest: List<Sort>,
) = Insight(x.kind, x.a, x.b, x.gap, sorts, rest)

// each group against the rest of the wet food, the one furthest off; on a tie the better one
private fun byGroup(
    m: Model,
    kind: String,
): Insight? {
    val wet = wetOf(m)
    var best: Insight? = null
    for (g in grouped(m, GROUPS.getValue(kind))) {
        val rest = wet.filter { it !in g.sorts }
        if (!enough(rest)) continue
        val x = if (kind == "geschmack") sameLine(g, rest) else insightOf(kind, Side(g.key, g.n, g.good), restOf(kind, rest), INSIGHT_GROUP)
        if (x != null &&
            (best == null || abs(x.gap) > abs(best.gap) || (abs(x.gap) == abs(best.gap) && x.gap > 0))
        ) {
            best = withSorts(x, g.sorts, rest)
        }
    }
    return best
}

// a brand all on one side of a consistency's split says nothing of its own, and the consistency holds for every brand
private fun inside(
    brand: Insight,
    texture: Insight,
) = brand.sorts.all { (if (brand.gap * texture.gap > 0) texture.sorts else texture.rest).contains(it) }

private fun byGroups(m: Model): List<Insight?> {
    val brand = byGroup(m, "marke")
    val texture = byGroup(m, "konsistenz")
    return listOf(if (brand != null && texture != null && inside(brand, texture)) null else brand, texture, byGroup(m, "geschmack"))
}

class TasteRow(
    val key: String,
    val n: Int,
    val good: Int,
)

class Taste(
    val marke: List<TasteRow>,
    val konsistenz: List<TasteRow>,
    val geschmack: List<TasteRow>,
)

// Geschmacksprofil: how each brand, consistency and flavour goes down, best first, the TASTE most rated; a side with
// one group stays empty, as there is nothing to set it against
private const val TASTE = 5

fun taste(m: Model): Taste {
    fun side(keysOf: (Rec) -> List<String>): List<TasteRow> {
        val list = grouped(m, keysOf)
        val most = list.sortedByDescending { it.n }.take(TASTE).toSet()
        return if (list.size >= TWO) list.filter { it in most }.map { TasteRow(it.key, it.n, it.good) } else emptyList()
    }
    return Taste(side(GROUPS.getValue("marke")), side(GROUPS.getValue("konsistenz")), side(GROUPS.getValue("geschmack")))
}

// instead: the texture eaten best otherwise, mostly well and better than the sauce, as advice; none, no advice
private fun inSauce(m: Model): Insight? {
    val wet = m.sorts.filter { typeOf(it.product) == TYPES[0] }
    val by = LinkedHashMap<String, SauceTally>()
    for (e in wet) {
        val key = textureKey(e.product)
        val x = by.getOrPut(key) { SauceTally(key) }
        x.n += e.n
        x.good += goodOf(e.counts)
        x.sosse += e.counts["sosse"] ?: 0
    }
    val sauce = by["sosse"]
    if (sauce == null || sauce.n < SAUCE_RATINGS || sauce.sosse.toDouble() / sauce.n < SAUCE_SHARE) return null
    val instead =
        by.values
            .filter {
                it.key.isNotEmpty() &&
                    it.key != "sosse" &&
                    it.n >= INSIGHT_RATINGS &&
                    it.good * 2 > it.n &&
                    it.good.toLong() * sauce.n > sauce.good.toLong() * it.n
            }.sortedWith { a, b ->
                val d = b.good.toDouble() / b.n - a.good.toDouble() / a.n
                if (d != 0.0) sign(d).toInt() else b.n - a.n
            }.firstOrNull()
    return Insight("sosse", Side(), Side(), sauce.sosse.toDouble() / sauce.n, k = sauce.sosse, n = sauce.n, instead = instead)
}

private class PetMeal(
    val id: String?,
    val t: Long,
    val r: String?,
)

private class PetMeals(
    val meals: MutableList<PetMeal> = mutableListOf(),
    val snacks: MutableList<Long> = mutableListOf(),
)

// each pet's meals up to now, oldest first, without treats and dry food, unknown food as id null; and its treats
private fun mealsOf(
    db: Db,
    pets: List<String>,
    now: Long,
): List<PetMeals> {
    val types = db.products.associate { it.id to typeOf(it) }
    val out = LinkedHashMap<String, PetMeals>()
    pets.forEach { out[it] = PetMeals() }
    for (i in db.servings.indices.reversed()) {
        val s = db.servings[i]
        val type = types[s.str("productId")]
        if (s.servedAt > now || type == "Trockenfutter") continue
        for ((pid, x) in s.pets) {
            val mine = out[pid] ?: continue
            if (type ==
                "Snack"
            ) {
                mine.snacks.add(s.servedAt)
            } else {
                mine.meals.add(
                    PetMeal(
                        if (type !=
                            null
                        ) {
                            s.str("productId")
                        } else {
                            null
                        },
                        s.servedAt,
                        rOf(x),
                    ),
                )
            }
        }
    }
    return out.values.toList()
}

// a meal of the same variety as the pet's meal before against one of another
private fun repeat(meals: List<PetMeals>): Insight? {
    val same = Side()
    val other = Side()
    for (pm in meals) {
        val l = pm.meals
        for (i in 1 until l.size) {
            val x = l[i]
            if (x.id != null && x.r != null) add(if (l[i - 1].id == x.id) same else other, x.r)
        }
    }
    return worse(insightOf("wiederholung", same, other))
}

// a variety's first rating by a pet against its later ones, every rating however old, of the varieties served again
private fun newSorts(
    m: Model,
    pets: List<String>,
): Insight? {
    val first = Side()
    val later = Side()
    val sorts = HashSet<String>()
    for (e in m.sorts) {
        for (pid in pets) {
            val l = e.pets[pid]?.list // newest first
            if (!ranks(e.product) || l == null || l.size < TWO) continue
            sorts.add(e.id)
            l.forEachIndexed { i, x -> add(if (i == l.size - 1) first else later, x.r) }
        }
    }
    return if (sorts.size >= NEW_SORTS) insightOf("neu", first, later) else null
}

// pets that take to new food only after the first time, so one left then is worth a second try
fun slowStarters(m: Model): List<String> = m.pets.filter { (newSorts(m, listOf(it))?.gap ?: 0.0) < 0 }

// a day's first meal against its last, on days with two or more, whenever they come: the first is breakfast at noon too
private fun daytime(meals: List<PetMeals>): Insight? {
    val first = Side()
    val last = Side()
    val dayOf = { x: PetMeal -> dayKey(x.t - DAY_BEGINS * 3_600_000L) }
    for (pm in meals) {
        val l = pm.meals
        var i = 0
        var j = 0
        while (i < l.size) {
            while (j + 1 < l.size && dayOf(l[j + 1]) == dayOf(l[i])) j++
            if (j != i) {
                l[i].r?.let { add(first, it) }
                l[j].r?.let { add(last, it) }
            }
            j++
            i = j
        }
    }
    return insightOf("tageszeit", first, last)
}

private fun afterSnacks(meals: List<PetMeals>): Insight? {
    val after = Side()
    val rest = Side()
    for (pm in meals) {
        var j = 0
        var last = Long.MIN_VALUE / 2
        for (x in pm.meals) {
            while (j < pm.snacks.size && pm.snacks[j] < x.t) last = pm.snacks[j++]
            if (x.r != null) add(if (x.t - last <= AFTER_SNACK) after else rest, x.r)
        }
    }
    return worse(insightOf("snack", after, rest))
}

// Who served: per variety the newest meals from each side, as many from one as from the other, so serving the
// better liked varieties more often cannot make a person look better. The person the pets eat best with.
private fun feeder(
    db: Db,
    m: Model,
    now: Long,
): Insight? {
    val meal =
        db.products
            .filter(::ranks)
            .map { it.id }
            .toSet()
    val per = LinkedHashMap<String, MutableList<Pair<String, Boolean>>>() // variety → [(by, good)], newest first
    for (s in db.servings) {
        if (s.servedAt <= now - VERDICT_SPAN) break // the meals are kept newest first
        val by = (s.str("by") ?: "").trim()
        val pid0 = s.str("productId")
        if (s.servedAt > now || by.isEmpty() || pid0 !in meal) continue
        for (pid in m.pets) {
            val r = rOf(s.pets[pid])
            if (r != null) per.getOrPut(pid0!!) { mutableListOf() }.add(by to (score(r) >= GOOD))
        }
    }
    val names = LinkedHashSet<String>()
    per.values.forEach { l -> l.forEach { names.add(it.first) } }
    var best: Insight? = null
    for (name in names) {
        val mine = Side(name)
        val theirs = Side(names.filter { it != name })
        for (list in per.values) {
            val a = list.filter { it.first == name }
            val b = list.filter { it.first != name }
            val k = min(a.size, b.size)
            mine.n += k
            theirs.n += k
            mine.good += a.take(k).count { it.second }
            theirs.good += b.take(k).count { it.second }
        }
        val x = insightOf("feeder", mine, theirs)
        if (x != null && x.gap > 0 && !(best != null && best.gap >= x.gap)) best = x
    }
    return best
}

fun insights(
    db: Db,
    m: Model,
    now: Long,
): List<Insight> {
    val meals = mealsOf(db, m.pets, now)
    return (byGroups(m) + listOf(inSauce(m), repeat(meals), newSorts(m, m.pets), daytime(meals), afterSnacks(meals), feeder(db, m, now)))
        .filterNotNull()
        .sortedByDescending { abs(it.gap) }
}

// Sides as they stood MOVE_DAYS ago, worked out the same way as now. A move needs a real change in the good share,
// since drifting across a line on the same ratings is no news; fresh needs MOVE_FROM settled varieties back then, or
// in a young diary everything would be new.
private const val MOVE_DAYS = 30
private const val MOVE_FROM = 3
private const val MOVE_BEFORE = 3
private const val MOVE_SINCE = 2
private const val MOVE_GAP = 30
private val LEVEL = mapOf("flop" to 0, "mid" to 1, "top" to 2)

class Move(
    val id: String,
    val before: Counted,
    val since: Counted,
)

class Moves(
    val fresh: Set<String>,
    val cooled: List<Move>,
    val warmed: List<Move>,
)

fun moves(
    m: Model,
    now: Long,
    r: Ranking,
): Moves {
    val start = addDays(dayStart(now), 1 - MOVE_DAYS)
    val side = HashMap<String, String>()
    for (k in listOf("top", "flop", "mid", "split", "thin")) r.side(k).forEach { side[it.id] = k }
    val fresh = LinkedHashSet<String>()
    val cooled = mutableListOf<Move>()
    val warmed = mutableListOf<Move>()

    class Seen(
        val e: Sort,
        val was: String,
        val is_: String,
        val before: Counted,
        val since: Counted,
    )
    val seen = mutableListOf<Seen>()
    var settled = 0
    for (e in m.sorts) {
        val now0 = side[e.id] ?: continue
        val pets =
            m.pets
                .filter { e.pets[it] != null }
                .map { pid ->
                    val sum = Sum()
                    for (x in e.pets.getValue(pid).list) if (x.t < start) addRating(sum, x)
                    pid to statOf(sum, start)
                }.filter { it.second.list.isNotEmpty() }
        val window = pets.flatMap { it.second.window }
        val before = Counted(window.size, countsOf(window))
        val was =
            if (pets.isNotEmpty()) {
                sideOf(Counted(before.n, before.counts, if (m.pet != null) pets[0].second.verdict else houseVerdict(pets).verdict))
            } else {
                "thin"
            }
        if (was != "thin") settled++
        val since =
            m.pets.flatMap { pid ->
                e.pets[pid]
                    ?.list
                    .orEmpty()
                    .filter { it.t >= start }
            }
        seen.add(Seen(e, was, now0, before, Counted(since.size, countsOf(since))))
    }

    fun moved(x: Seen): Boolean {
        val w = LEVEL[x.was] ?: return false
        val i = LEVEL[x.is_] ?: return false
        return x.before.n >= MOVE_BEFORE &&
            x.since.n >= MOVE_SINCE &&
            100L * (goodOf(x.since.counts).toLong() * x.before.n - goodOf(x.before.counts).toLong() * x.since.n) *
            sign((i - w).toDouble()).toLong() >=
            MOVE_GAP.toLong() * x.since.n * x.before.n
    }
    for (x in seen) {
        if (x.was == x.is_) continue
        val real = moved(x)
        if ((x.is_ == "top" || x.is_ == "flop") && settled >= MOVE_FROM && (x.was !in LEVEL || real)) fresh.add(x.e.id)
        if (real && x.was == "top") cooled.add(Move(x.e.id, x.before, x.since))
        if (real && x.is_ == "top") warmed.add(Move(x.e.id, x.before, x.since))
    }
    return Moves(fresh, cooled, warmed)
}

// missed reads the newest ratings however old, since a variety not served for long has an empty window. retry is
// a single poor rating by a pet that slowStarters() says needs a while with new food.
private const val NEXT_NEWEST = 8
private const val NEXT_AWAY = 42 * DAY
private const val NEXT_MISSED = 2
private const val NEXT_SPAN = 60 * DAY
private const val NEXT_RETRY = 2
private const val NEXT_SHOWN = 5

class Missed(
    val id: String,
    val at: Long,
    val by: List<String>,
    override val n: Int,
    override val counts: Map<String, Int>,
) : Tally {
    override val verdict = ""
}

class Retry(
    val id: String,
    val pet: String,
)

class NextUp(
    val missed: List<Missed>,
    val retry: List<Retry>,
)

fun nextUp(
    m: Model,
    now: Long,
    r: Ranking,
    last: Map<String, Long>,
    slow: List<String>,
): NextUp {
    val shown =
        r.top
            .take(NEXT_SHOWN)
            .map { it.id }
            .toSet()
    val flop = r.flop.map { it.id }.toSet()
    val missed = mutableListOf<Missed>()
    val retry = mutableListOf<Pair<Retry, Long>>()
    for (e in m.sorts) {
        if (!ranks(e.product) || e.kaufen == "nicht" || e.id in shown || e.id in flop) continue
        val mine = m.pets.mapNotNull { pid -> e.pets[pid]?.takeIf { it.list.isNotEmpty() }?.let { pid to it } }
        if (mine.isEmpty()) continue
        val at = last[e.id] ?: 0L

        class Newest(
            val pid: String,
            val l: List<Pt>,
            val verdict: String,
        )
        val newest =
            mine.map { (pid, x) ->
                val l = x.list.take(NEXT_NEWEST)
                val counts = countsOf(l)
                Newest(pid, l, verdictOf(l.size, goodOf(counts), poorOf(counts)))
            }
        val yes = newest.filter { it.verdict == "nachkaufen" }
        // skip what a pet rejects now, however it went once
        if (at != 0L &&
            at <= now - NEXT_AWAY &&
            yes.isNotEmpty() &&
            mine.none { it.second.verdict == "nicht" } &&
            newest.none { it.verdict == "nicht" }
        ) {
            val l = yes.flatMap { it.l }
            missed.add(Missed(e.id, at, yes.map { it.pid }, l.size, countsOf(l)))
        }
        val (pid, x) = mine[0]
        if (mine.size == 1 && x.list.size == 1 && pid in slow && score(x.list[0].r) < NO && x.list[0].t > now - NEXT_SPAN) {
            retry.add(Retry(e.id, pid) to x.list[0].t)
        }
    }
    return NextUp(
        missed
            .sortedWith { a, b ->
                val d = likingOf(b) - likingOf(a)
                if (d != 0.0) sign(d).toInt() else a.at.compareTo(b.at)
            }.take(NEXT_MISSED),
        retry.sortedByDescending { it.second }.take(NEXT_RETRY).map { it.first },
    )
}

class Basis(
    val n: Int,
    val first: Long,
    val left: List<String>,
)

fun basis(
    m: Model,
    r: Ranking,
): Basis {
    var n = 0
    var first = Long.MAX_VALUE
    for (e in r.top + r.flop + r.mid + r.split) {
        n += e.n
        for (pid in m.pets) for (x in e.pets[pid]?.window.orEmpty()) first = min(first, x.t)
    }
    val left =
        m.sorts
            .filter { it.total > 0 && !ranks(it.product) }
            .map { typeOf(it.product) }
            .toSet()
    return Basis(n, first, UNRANKED.filter { it in left })
}

// gap, delay and lead in minutes; slot times are minutes since local midnight
private const val FEED_SPAN = 14 * DAY
private const val FEED_GAP = 90
private const val FEED_MIN_DAYS = 4
private const val FEED_DELAY = 45
private const val FEED_LEAD = 60
private const val FEED_AHEAD = 7

// wall-clock minute min of the day i days after now's, so a clock change shifts nothing
private fun atMinute(
    now: Long,
    min: Int,
    i: Int = 0,
): Long {
    val c = calendar(now)
    c.set(java.util.Calendar.HOUR_OF_DAY, 0)
    c.set(java.util.Calendar.MINUTE, min)
    c.set(java.util.Calendar.SECOND, 0)
    c.set(java.util.Calendar.MILLISECOND, 0)
    c.timeInMillis
    c.add(java.util.Calendar.DAY_OF_MONTH, i)
    return c.timeInMillis
}

private fun mealsIn(
    db: Db,
    from: Long,
    to: Long,
    pets: List<String>? = null,
): List<Rec> {
    val snack =
        db.products
            .filter { typeOf(it) == "Snack" }
            .map { it.id }
            .toSet()
    return db.servings.filter { s ->
        s.servedAt > from && s.servedAt <= to && s.str("productId") !in snack && (pets == null || s.pets.keys.any { it in pets })
    }
}

class Slot(
    val from: Int,
    val at: Int,
    val remind: Int,
)

fun feedSlots(
    db: Db,
    now: Long,
    pets: List<String>? = null,
): List<Slot> {
    val times =
        mealsIn(db, now - FEED_SPAN, now, pets)
            .map { hourOf(it.servedAt) * 60 + minuteOf(it.servedAt) to dayKey(it.servedAt) }
            .sortedBy { it.first }
    val groups = mutableListOf<MutableList<Pair<Int, String>>>()
    for (x in times) {
        val g = groups.lastOrNull()
        if (g != null && x.first - g.last().first <= FEED_GAP) g.add(x) else groups.add(mutableListOf(x))
    }
    return groups
        .filter { g -> g.map { it.second }.toSet().size >= FEED_MIN_DAYS }
        .map { g -> Slot(g[0].first, g[g.size shr 1].first, g[g.size shr 1].first + FEED_DELAY) }
}

class FeedDue(
    val key: String,
    val at: Long,
    val since: Long,
)

// since: from then on a meal served on another phone also makes the reminder unnecessary
// keyed by the slot's day, also where the reminder falls after midnight
fun feedReminders(
    db: Db,
    now: Long,
): List<FeedDue> {
    val out = mutableListOf<FeedDue>()
    for (slot in feedSlots(db, now)) {
        for (i in 0 until FEED_AHEAD) {
            val at = atMinute(now, slot.remind, i)
            val since = atMinute(now, slot.from - FEED_LEAD, i)
            if (at > now && mealsIn(db, since - 1, at).isEmpty()) out.add(FeedDue("${dayKey(atMinute(now, 0, i))}|${slot.at}", at, since))
        }
    }
    return out
}

// keys of today's reminders that a meal has made unnecessary
fun fedToday(
    db: Db,
    now: Long,
): List<String> =
    feedSlots(db, now)
        .filter { mealsIn(db, atMinute(now, it.from - FEED_LEAD) - 1, now).isNotEmpty() }
        .map { "${dayKey(now)}|${it.at}" }

class NextMeal(
    val at: Int,
    val due: Boolean = false,
    val tomorrow: Boolean = false,
)

fun nextMeal(
    db: Db,
    now: Long,
    pets: List<String>?,
): NextMeal? {
    val slots = feedSlots(db, now, pets)
    val c = calendar(now)
    val minute = c.get(java.util.Calendar.HOUR_OF_DAY) * 60 + c.get(java.util.Calendar.MINUTE) + c.get(java.util.Calendar.SECOND) / 60.0
    val meals = mealsIn(db, atMinute(now, -FEED_LEAD) - 1, now, pets) // before midnight, for a slot just after it
    for (slot in slots) {
        if (meals.any { it.servedAt >= atMinute(now, slot.from - FEED_LEAD) }) continue
        if (minute < slot.from) return NextMeal(slot.at)
        if (minute <= slot.remind + FEED_LEAD) return NextMeal(slot.at, due = true)
    }
    return if (slots.isNotEmpty()) NextMeal(slots[0].at, tomorrow = true) else null
}

// Observations never change a rating, a verdict or a place. Several pets on one means one of them or all.
private const val OBSERVED_RECENT = 28 * DAY
private const val OBSERVED_BEFORE = 56 * DAY
private const val OBSERVED_SPAN = 180 * DAY
private const val OBSERVED_MEALS = 4
private const val OBSERVED_HITS = 2
private const val OBSERVED_GAP = 30
private const val OBSERVED_Z = 3.5
private const val OBSERVED_SHOWN = 3
private const val HOUR = 3_600_000L

private fun concerns(
    o: Rec,
    pets: List<String>,
) = o.pets.keys.any { it in pets }

fun mealsBefore(
    db: Db,
    o: Rec,
): List<Rec> {
    val kind = OBSERVATIONS[o.str("kind")]
    if (kind?.about != "meal") return emptyList()
    val from = o.at - kind.within * HOUR
    val pets = o.pets.keys
    return db.servings.filter { s ->
        s.servedAt <= o.at &&
            s.servedAt >= from &&
            !s.str("productId").isNullOrEmpty() &&
            pets.any { s.pets[it] != null }
    }
}

class Followed(
    var n: Int = 0,
    var hit: Int = 0,
)

// only meals whose hours are over count; id → {n, hit}
private fun followed(
    db: Db,
    pets: List<String>,
    now: Long,
    kind: String,
    only: String? = null,
): LinkedHashMap<String, Followed> {
    val win = OBSERVATIONS.getValue(kind).within * HOUR
    val from = now - OBSERVED_SPAN
    val products = db.products.map { it.id }.toSet()
    val notes = db.observations.filter { it.str("kind") == kind && it.at <= now && it.at > from && concerns(it, pets) }
    val out = LinkedHashMap<String, Followed>()
    for (s in db.servings) {
        if (s.servedAt < from) break // the meals are kept newest first
        val pid = s.str("productId")
        if (s.servedAt + win > now || pid !in products || (only != null && pid != only)) continue
        val mine = pets.filter { s.pets[it] != null }
        if (mine.isEmpty()) continue
        val x = out.getOrPut(pid!!) { Followed() }
        x.n++
        if (notes.any { it.at > s.servedAt && it.at <= s.servedAt + win && concerns(it, mine) }) x.hit++
    }
    return out
}

class KindSeen(
    val kind: String,
    var n: Int = 0,
    var before: Int = 0,
    var last: Long = 0,
)

class Link(
    val kind: String,
    val id: String,
    val after: Followed,
    val other: Followed,
    val gap: Double = 0.0,
)

class Observed(
    val kinds: List<KindSeen>,
    val links: List<Link>,
)

// A link also needs OBSERVED_Z pooled standard errors, as in trend(), so a lucky run is no news; it is that high since
// every variety is weighed against the rest for every kind at once (PersonasTest)
fun observed(
    db: Db,
    pets: List<String>,
    now: Long,
): Observed {
    val cut = now - OBSERVED_RECENT
    val back = cut - OBSERVED_BEFORE
    val per = LinkedHashMap<String, KindSeen>()
    for (o in db.observations) {
        val kind = o.str("kind") ?: continue
        if (o.at > now || o.at <= back || !concerns(o, pets)) continue
        val x = per.getOrPut(kind) { KindSeen(kind) }
        if (o.at > cut) {
            x.n++
            x.last = max(x.last, o.at)
        } else {
            x.before++
        }
    }
    val kinds = per.values.filter { it.n > 0 }.sortedWith(compareByDescending<KindSeen> { it.n }.thenByDescending { it.last })
    val links = mutableListOf<Link>()
    for (kind in OBSERVATIONS.keys.filter { OBSERVATIONS.getValue(it).about == "meal" }) {
        if (db.observations.none { it.str("kind") == kind }) continue
        val by = followed(db, pets, now, kind)
        val all = by.values.fold(Followed()) { a, x -> Followed(a.n + x.n, a.hit + x.hit) }
        for ((id, after) in by) {
            val other = Followed(all.n - after.n, all.hit - after.hit)
            if (after.n < OBSERVED_MEALS || after.hit < OBSERVED_HITS || other.n < OBSERVED_MEALS) continue
            val apart = 100.0 * (after.hit.toLong() * other.n - other.hit.toLong() * after.n) // cross-multiplied to stay exact
            val of = after.n.toDouble() * other.n
            val p = all.hit.toDouble() / all.n
            val se = 100 * sqrt(p * (1 - p) * (1.0 / after.n + 1.0 / other.n))
            if (apart >= OBSERVED_GAP * of && apart >= OBSERVED_Z * se * of) links.add(Link(kind, id, after, other, apart / of))
        }
    }
    val sorted = links.sortedWith(compareByDescending<Link> { it.gap }.thenByDescending { it.after.n })
    return Observed(kinds, sorted.take(OBSERVED_SHOWN).map { Link(it.kind, it.id, it.after, it.other) })
}

class After(
    val kind: String,
    val n: Int,
    val hit: Int,
)

fun observedAfter(
    db: Db,
    pets: List<String>,
    now: Long,
    id: String,
): List<After> =
    OBSERVATIONS.keys
        .filter { k -> OBSERVATIONS.getValue(k).about == "meal" && db.observations.any { it.str("kind") == k } }
        .map { kind -> (followed(db, pets, now, kind, id)[id] ?: Followed()).let { After(kind, it.n, it.hit) } }
        .filter { it.hit > 0 }
