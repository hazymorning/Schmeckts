package de.schmeckts.app.views

import de.schmeckts.app.DAY
import de.schmeckts.app.GlanceOf
import de.schmeckts.app.Phone
import de.schmeckts.app.RATINGS
import de.schmeckts.app.Rec
import de.schmeckts.app.addDays
import de.schmeckts.app.andList
import de.schmeckts.app.cap
import de.schmeckts.app.clockStr
import de.schmeckts.app.content.ANCHORS
import de.schmeckts.app.content.DAY_FACTS
import de.schmeckts.app.content.GREETINGS
import de.schmeckts.app.content.NOTABLE
import de.schmeckts.app.content.NOTED
import de.schmeckts.app.content.WEEKEND
import de.schmeckts.app.dayMonth
import de.schmeckts.app.dayNumber
import de.schmeckts.app.dayStart
import de.schmeckts.app.esc
import de.schmeckts.app.flavoursOf
import de.schmeckts.app.hourOf
import de.schmeckts.app.jsRound
import de.schmeckts.app.pname
import de.schmeckts.app.servedAt
import de.schmeckts.app.typeOf
import de.schmeckts.app.weekday

// Top of the home page, on the ground above the cards: a greeting, then how it goes at the bowl, in facts: the last
// meal and how it went, then one more of the day. Never the schedule, never what the cards below show.

private const val FRESH = 60 // minutes a serving counts as news
private const val NIGHT = 5 // night lasts until this hour
private const val HOURS_FROM = 90 // minutes
private const val SPAN = 12 * 60 // minutes up to which the last meal is said as „vor 3 Stunden“
private const val TURN = 3 // hours a wording stays, unless something is served or noted
private const val AFTERNOON = 14 // from this hour no treat yet is said, where treats are usual
private const val STREAK_GOOD = 3 // meals in a row worth a word
private const val STREAK_LEFT = 2
private const val RATED = 5 // ratings in the week before it is told
private const val SORTS = 3
private val HALF = mapOf(1 to "eineinhalb", 2 to "zweieinhalb")
private val NUMBER = "null eine zwei drei vier fünf sechs sieben acht neun zehn elf zwölf".split(" ")
private val NTH = listOf("", "ersten", "zweiten", "dritten", "vierten", "fünften", "sechsten", "siebten", "achten", "neunten")
private val PRONOUN = mapOf("f" to "sie", "m" to "er")
val SLEEP = setOf("night")

/** What the card tells of: the glance of the day, how many pets it shows, the one pet's name, the favourite. */
class Card(
    val g: GlanceOf,
    val pets: Int,
    val name: String?,
    val favourite: String?,
    val meals: Int = g.meals,
)

private fun b(text: String) = "<b>$text</b>"

private fun number(n: Int) = NUMBER.getOrNull(n) ?: n.toString()

// a number and its unit stay on one line
private fun spanOf(min: Long): String {
    if (min < HOURS_FROM) return "$min Minuten"
    val halves = jsRound(min / 30.0)
    val hours = (halves / 2).toInt()
    return "${if (halves % 2 == 1L && HALF[hours] != null) HALF[hours] else jsRound(min / 60.0).toString()} Stunden"
}

private fun daysBefore(
    t: Long,
    now: Long,
) = jsRound((dayStart(now) - dayStart(t)).toDouble() / DAY)

private fun dateOf(t: Long) = dayMonth(t).replace(" ", " ")

// „vor 2 Stunden“, „heute um 7:10“, „gestern um 19:28“, „am 3. Oktober“, its time bold
private fun agoOf(
    t: Long,
    now: Long,
): String {
    val min = jsRound((now - t) / 6e4)
    val days = daysBefore(t, now)
    if (min < SPAN && days == 0L) return "vor ${b(spanOf(min))}"
    return when (days) {
        0L -> "heute um ${b(clockStr(t))}"
        1L -> "gestern um ${b(clockStr(t))}"
        else -> "am ${b(dateOf(t))}"
    }
}

// what a meal was, as in „es gab Huhn und Pute“; dry food by its kind, a variety without a flavour not at all
private fun Phone.whatOf(s: Rec): String? {
    val p = derive.getProduct(s.str("productId")) ?: return null
    val flavours = if (typeOf(p) == "Trockenfutter") listOf("Trockenfutter") else flavoursOf(p.str("variety"))
    return if (flavours.isNotEmpty()) andList(flavours) else null
}

// the moment the card speaks of
fun Phone.momentOf(
    c: Card,
    now: Long,
): String {
    val last = c.g.last ?: return "none"
    if (last.servedAt < addDays(dayStart(now), -1)) return "older"
    if ((now - last.servedAt) / 6e4 <
        FRESH
    ) {
        return if (typeOf(derive.getProduct(last.str("productId"))) == "Snack") "freshTreat" else "fresh"
    }
    if (hourOf(now) < NIGHT) return "night"
    val meal = c.g.meal
    return if (meal != null && meal.servedAt >= dayStart(now)) "today" else "notYet"
}

private fun anchorOf(
    moment: String,
    c: Card,
) = if (moment == "fresh" && c.g.first) {
    "firstFresh"
} else if (moment == "night" || moment == "today") {
    if (c.g.first) "firstLast" else "last"
} else {
    moment
}

// what a sentence can name; what the day does not have is left out
fun Phone.valuesOf(
    c: Card,
    now: Long,
): Map<String, String> {
    val g = c.g
    val last = g.last
    val meal = g.meal
    val what = meal?.let { whatOf(it) }
    val ago = meal?.let { agoOf(it.servedAt, now) }
    val p = meal?.let { derive.getProduct(it.str("productId")) }
    val v = LinkedHashMap<String, String>()
    if (ago != null) {
        v["ago"] = ago
        v["Ago"] = cap(ago)
    }
    if (what != null) v["what"] = esc(what)
    if (!c.name.isNullOrEmpty()) v["name"] = esc(c.name)
    if (g.rating != null) v["said"] = RATINGS.getValue(g.rating).said
    if (c.pets > 1 && g.outcome == "good") v["All"] = "${if (c.pets == 2) "Beide" else "Alle"} haben gut gefressen"
    if (c.pets > 1 && g.outcome == "left") v["All"] = "Da blieb einiges stehen"
    if (last != null) v["days"] = "${daysBefore(last.servedAt, now)} Tage"
    if (meal != null) v["date"] = "am ${dateOf(meal.servedAt)}"
    if (g.treats >= 2 && NTH.getOrNull(g.treats)?.isNotEmpty() == true) v["nthTreat"] = NTH[g.treats]
    if (g.first && p != null) v["variety"] = esc(pname(p))
    if (g.streak.n > 0) v["k"] = number(g.streak.n)
    if (g.week.n > 0) {
        v["good"] = g.week.good.toString()
        v["n"] = g.week.n.toString()
    }
    if (!c.favourite.isNullOrEmpty()) v["fav"] = esc(c.favourite)
    if (g.treats > 0) v["treats"] = if (g.treats == 1) "einen Snack" else "${number(g.treats)} Snacks"
    if (c.meals >= 2) v["count"] = number(c.meals)
    if (g.week.sorts > 0) v["sorts"] = number(g.week.sorts)
    return v
}

private fun plain(html: String) = html.replace(Regex("<[^>]*>"), "")

// the facts of the day there are, the notable ones alone where there are any
fun factsOf(
    c: Card,
    now: Long,
    moment: String,
): List<String> {
    val g = c.g
    val at =
        mapOf(
            "noted" to g.noted.isNotEmpty(),
            "streakLeft" to (g.streak.kind == "left" && g.streak.n >= STREAK_LEFT),
            "treatsNone" to (g.treatsUsual && g.treats == 0 && hourOf(now) >= AFTERNOON && moment != "night"),
            "streakGood" to (g.streak.kind == "good" && g.streak.n >= STREAK_GOOD),
            "week" to (g.week.n >= RATED),
            "favourite" to !c.favourite.isNullOrEmpty(),
            "treats" to (g.treats > 0 && moment != "freshTreat"),
            "count" to (c.meals >= 2),
            "sorts" to (g.week.sorts >= SORTS),
        )
    val there = DAY_FACTS.keys.filter { at[it] == true }
    val notable = there.filter { it in NOTABLE }
    return notable.ifEmpty { there }
}

private fun keysOf(t: String) = Regex("\\{(\\w+)\\}").findAll(t).map { it.groupValues[1] }.toList()

private val RICH = listOf("said", "All", "what", "variety", "nthTreat") // what the last serving was and how it went

// from turn on, the first wording the values fill that repeats no word of avoid, of those telling the most
private fun pick(
    pool: List<String>,
    values: Map<String, String>,
    turn: Long,
    avoid: String,
): String {
    val fits = pool.filter { t -> keysOf(t).all { values[it] != null } }
    val rich = { t: String -> keysOf(t).count { it in RICH } }
    val most = maxOf(0, fits.maxOfOrNull(rich) ?: 0)
    val list = fits.filter { rich(it) == most }
    val turned = list.indices.map { i -> list[((turn + i) % list.size).toInt()] }
    return turned.find { !sharesWord(avoid, fill(it, values)) } ?: turned.firstOrNull() ?: ""
}

private const val LONG = 120 // characters the two sentences keep below

// the one cat in the second sentence: by its pronoun once the first has named it and its sex is known
private fun subjectOf(
    c: Card,
    named: Boolean,
    values: Map<String, String>,
): Map<String, String> {
    val name = values["name"] ?: return emptyMap()
    val wer = (if (named) PRONOUN[c.g.sex] else null) ?: name
    return mapOf("wer" to wer, "Wer" to cap(wer))
}

// the first kind noted today, said of the cats it was noted for
private fun Phone.notedOf(
    c: Card,
    wer: String?,
): Map<String, String> {
    val n = NOTED.keys.mapNotNull { kind -> c.g.noted.find { it.kind == kind } }.firstOrNull() ?: return emptyMap()
    val several = c.pets > 1 && n.pets.size > 1
    return mapOf(
        "noted" to
            fill(
                NOTED.getValue(n.kind),
                mapOf(
                    "Wer" to if (c.pets > 1) esc(derive.petNames(n.pets)) else wer,
                    "ist" to if (several) "sind" else "ist",
                    "war" to if (several) "waren" else "war",
                    "hat" to if (several) "haben" else "hat",
                ),
            ),
    )
}

// The sentence on the last meal, then a fact of the day. A wording stays for TURN hours and until something is served
// or noted, which moves it on by one; each stretch of hours starts somewhere else.
fun Phone.sentenceOf(
    c: Card,
    now: Long,
): String {
    val moment = momentOf(c, now)
    val values = valuesOf(c, now)
    val stretch = dayNumber(now) * 8 + hourOf(now) / TURN
    val turn = (stretch.toInt() * -1640531535).ushr(8).toLong() + c.meals + c.g.treats + c.g.noted.size
    val anchor = pick(ANCHORS.getValue(anchorOf(moment, c)), values, turn, "")
    val first = fill(anchor, values)
    if (moment == "none" || moment == "older") return first
    val who = subjectOf(c, "{name}" in anchor, values)
    val more = values + who + notedOf(c, who["Wer"])
    val facts = factsOf(c, now, moment)
    val room = LONG - plain(first).length
    val from = if (facts.isNotEmpty() && facts[0] in NOTABLE) 0L else turn // the notable ones in their order, the others in turn
    // a fact that repeats no word of the first sentence, else any
    for (strict in listOf(true, false)) {
        for (i in facts.indices) {
            val said = fill(pick(DAY_FACTS.getValue(facts[((from + i) % facts.size).toInt()]), more, turn, first), more)
            if (said.isNotEmpty() && plain(said).length < room && !(strict && sharesWord(first, said))) return "$first $said"
        }
    }
    return first
}

// a greeting for the hour, by the name of whoever holds the phone where it is known
fun headOf(
    now: Long,
    name: String,
): String {
    val h = hourOf(now)
    val hello = (if (h in 11..17) WEEKEND[weekday(now)] else null) ?: GREETINGS.last { h >= it.first }.second
    return if (name.isNotEmpty()) "$hello, ${esc(name)}" else hello
}
