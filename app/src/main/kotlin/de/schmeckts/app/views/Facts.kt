package de.schmeckts.app.views

import de.schmeckts.app.DAY
import de.schmeckts.app.Rec
import de.schmeckts.app.content.FACTS
import de.schmeckts.app.content.Sheet
import de.schmeckts.app.dayKey
import de.schmeckts.app.dayNumber
import de.schmeckts.app.esc
import de.schmeckts.app.localTime
import de.schmeckts.app.sexOf
import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone
import kotlin.math.roundToInt

// The cat calendar's turn of sheets and what the overview card and the calendar share; the texts are in content/

// Sunday first, as getDay() counts
val WEEK = listOf("Wissen", "Katzenlogik", "Stimmt’s?", "Kurios", "Tipp", "Warum?", "Sprache")

// Turn k takes the sheet k * step along the list, the same order on every phone. A step of about 0.38 of the list,
// sharing no divisor with its size, keeps sheets close in the list, often on the same theme, off turns in a row.
private fun spread(list: List<Sheet>): List<Sheet> {
    var step = maxOf(1, (list.size * 0.382).roundToInt())
    while ((2..step).any { step % it == 0 && list.size % it == 0 }) step++
    return List(list.size) { list[(it * step) % list.size] }
}

private val ORDERS by lazy { FACTS.mapValues { (_, list) -> spread(list.filter { it.months == null }) } }
private val SEASONAL by lazy { FACTS.mapValues { (_, list) -> list.filter { it.months != null } } }
private const val START = 20454L // 1 January 2026 as dayNumber() counts it

// dayNumber() counts a local date as UTC counts the same date
private fun utcOf(day: Long) = GregorianCalendar(TimeZone.getTimeZone("UTC")).apply { timeInMillis = ((day + 0.5) * DAY).toLong() }

private fun formatOf(day: Long) = WEEK[Math.floorMod(day + 4, 7L).toInt()] // 1 January 1970 was a Thursday

fun formatOn(date: Long) = formatOf(dayNumber(date))

// the season of a sheet around a day: the first month of its run of months there, counted from year 0
private fun seasonOf(
    f: Sheet,
    day: Long,
): Int {
    val c = utcOf(day)
    var at = c.get(Calendar.YEAR) * 12 + c.get(Calendar.MONTH)
    repeat(11) { if (Math.floorMod(at - 1, 12) + 1 in f.months!!) at-- }
    return at
}

// A format's seasonal sheets each take its first day in their months once a season, in list order. The other days
// take the year-round sheets in turn, so none comes twice before the others have had their turn.
fun factOn(date: Long): Sheet {
    val today = dayNumber(date)
    val format = formatOf(today)
    val order = ORDERS.getValue(format)
    val seasonal = SEASONAL.getValue(format)
    val shown = HashMap<String, Int>()
    var at = 0
    var day = minOf(START, today)
    while (true) {
        if (formatOf(day) == format) {
            val month = utcOf(day).get(Calendar.MONTH) + 1
            val due = seasonal.firstOrNull { month in it.months!! && shown[it.id] != seasonOf(it, day) }
            if (day == today) return due ?: order[at % order.size]
            if (due != null) shown[due.id] = seasonOf(due, day) else at++
        }
        day++
    }
}

class SheetOn(
    val sheet: Sheet,
    val format: String,
)

fun sheetOn(date: Long) = SheetOn(factOn(date), formatOn(date))

// sheetDay: the day of the sheet on top, "YYYY-MM-DD". Before today it still hangs over today's sheet: the last one
// seen, whatever came in between. Its noon, or null.
fun hangingDay(
    sheetDay: String?,
    now: Long,
): Long? {
    if (sheetDay == null || sheetDay >= dayKey(now)) return null
    val (y, m, d) = sheetDay.split("-").map { it.toInt() }
    return localTime(y, m, d, 12)
}

// the household's only cat, if its sex is known: the variants and „dein Kater“ speak of it
fun catOf(pets: List<Rec>) = if (pets.size == 1 && sexOf(pets[0]) != null) pets[0] else null

fun sheetText(
    sheet: Sheet,
    cat: Rec?,
    back: Boolean = false,
): String {
    val text = if (back) sheet.back!! else (cat?.let { if (it.str("sex") == "m") sheet.m else sheet.f }) ?: sheet.text
    val yours = if (cat?.str("sex") == "m") "ein Kater" else "eine Katze"
    return fill(text, mapOf("name" to cat?.let { esc(it.str("name")) })).replace(Regex("\\{([Dd])eine Katze\\}")) {
        it.groupValues[1] +
            yours
    }
}

// values come escaped from the caller; one missing stays as it is, so a test sees it
fun fill(
    template: String,
    values: Map<String, String?>,
): String = template.replace(Regex("\\{(\\w+)\\}")) { values[it.groupValues[1]] ?: it.value }

// small words a heading and its sentence may share without sounding repetitive
private val STOP =
    """der die das dem den des ein eine einen einem einer und oder aber auch noch schon mal nur ist sind war hat haben
  gibt gab sie dein deine dich dir man sich hier nicht nichts auf aufs aus bei mit von vom zum zur für fürs bis seit
  nach vor wie was""".split(Regex("\\s+")).toSet()

// content words cut to a light stem, so Tag, Tage and Tagen match; numbers do not count, 3 Stunden is not 3 Tage
private fun words(text: String) =
    text
        .replace(Regex("<[^>]*>"), " ")
        .lowercase()
        .split(Regex("[^\\p{L}]+"))
        .filter { it.length > 2 && it !in STOP }
        .map { it.replace(Regex("(?<=.{3})(e[nrs]?|[ns])$"), "") }
        .toSet()

fun sharesWord(
    a: String,
    b: String,
): Boolean {
    val seen = words(a)
    return words(b).any { it in seen }
}
