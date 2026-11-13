package de.schmeckts.app

// What the overview card needs of the day. Pure, so it can be told in words elsewhere.

private const val TREATS_DAYS = 14 // treats are usual on this many of the last days
private const val TREATS_USUAL = 5
private const val WEEK = 7 // days

// how a meal went for the pets shown: good when each one rated ate well, left when one of them left it
private fun outcomeOf(
    s: Rec,
    shown: Set<String>,
): String? {
    val scores =
        s.pets.entries
            .filter { (id, x) -> id in shown && rOf(x) != null }
            .map { score(rOf(it.value)!!) }
    if (scores.isEmpty()) return null
    return if (scores.any { it < NO }) {
        "left"
    } else if (scores.all { it >= GOOD }) {
        "good"
    } else {
        "mid"
    }
}

class Noted(
    val kind: String,
    val pets: List<String>,
)

// each kind noted today with the pets shown it was noted for
private fun notedOn(
    db: Db,
    shown: Set<String>,
    today: Long,
    now: Long,
): List<Noted> {
    val kinds = LinkedHashMap<String, LinkedHashSet<String>>()
    for (o in db.observations) {
        val pets = o.pets.keys.filter { it in shown }
        val kind = o.str("kind") ?: continue
        if (o.at >= today && o.at <= now && pets.isNotEmpty()) kinds.getOrPut(kind) { LinkedHashSet() }.addAll(pets)
    }
    return kinds.map { (kind, pets) -> Noted(kind, pets.toList()) }
}

class Streak(
    val kind: String?,
    val n: Int,
)

class Week(
    val n: Int,
    val good: Int,
    val sorts: Int,
)

/** last: the newest serving of the pets shown up to now; meal: the newest that is no treat, with how it went and,
 *  for one pet, its rating; first: it was that variety's first time. meals and treats: today's. streak: the newest
 *  rated meals that all went the same way, good or left. week: the ratings and varieties of the last WEEK days.
 *  noted: today's notes. next: the next usual meal. sex: of the one pet shown, if known. */
class GlanceOf(
    val last: Rec?,
    val meal: Rec?,
    val left: Boolean,
    val outcome: String?,
    val rating: String?,
    val first: Boolean,
    val meals: Int,
    val treats: Int,
    val treatsUsual: Boolean,
    val streak: Streak,
    val week: Week,
    val noted: List<Noted>,
    val next: NextMeal?,
    val sex: String?,
)

fun glance(
    db: Db,
    pets: List<String>,
    now: Long,
): GlanceOf {
    val shown = pets.toSet()
    val concerns = { s: Rec -> s.pets.keys.any { it in shown } }
    val treat =
        db.products
            .filter { typeOf(it) == "Snack" }
            .map { it.id }
            .toSet()
    val today = dayStart(now)
    val since = addDays(today, 1 - maxOf(TREATS_DAYS, WEEK))
    val weekFrom = addDays(today, 1 - WEEK)
    val treatDays = HashSet<Long>()
    val sorts = HashSet<String>()
    var weekN = 0
    var weekGood = 0
    var streakKind: String? = null
    var streakN = 0
    var streakDone = false
    var last: Rec? = null
    var meal: Rec? = null
    var meals = 0
    var treats = 0
    for (s in db.servings) {
        if (s.servedAt > now || !concerns(s)) continue
        if (meal != null && s.servedAt < since) break // newest first
        val isTreat = s.str("productId") in treat
        if (last == null) last = s
        if (isTreat) {
            if (s.servedAt >= today) treats++
            if (s.servedAt >= addDays(today, 1 - TREATS_DAYS)) treatDays.add(dayStart(s.servedAt))
            continue
        }
        if (meal == null) meal = s
        if (s.servedAt >= today) meals++
        if (s.servedAt >= weekFrom) {
            s.str("productId")?.takeIf { it.isNotEmpty() }?.let { sorts.add(it) }
            for ((id, x) in s.pets) {
                val r = rOf(x)
                if (id in shown && r != null) {
                    weekN++
                    if (score(r) >= GOOD) weekGood++
                }
            }
        }
        val went = outcomeOf(s, shown)
        if (went != null && !streakDone) {
            if (streakKind == null) streakKind = went
            if (went == streakKind) streakN++ else streakDone = true
        }
    }
    val one = if (pets.size == 1 && meal != null) rOf(meal.pets[pets[0]]) else null
    val m = meal
    return GlanceOf(
        last = last,
        meal = m,
        left = m != null && outcomeOf(m, shown) == "left",
        outcome = m?.let { outcomeOf(it, shown) },
        rating = one,
        first =
            m != null &&
                !m.str("productId").isNullOrEmpty() &&
                m.servedAt >= today &&
                db.servings.none { it.str("productId") == m.str("productId") && it.servedAt < m.servedAt && concerns(it) },
        meals = meals,
        treats = treats,
        treatsUsual = treatDays.size >= TREATS_USUAL,
        streak = if (streakKind == "mid") Streak(null, 0) else Streak(streakKind, streakN),
        week = Week(weekN, weekGood, sorts.size),
        noted = notedOn(db, shown, today, now),
        next = nextMeal(db, now, pets),
        sex = if (pets.size == 1) sexOf(db.pets.find { it.id == pets[0] }) else null,
    )
}
