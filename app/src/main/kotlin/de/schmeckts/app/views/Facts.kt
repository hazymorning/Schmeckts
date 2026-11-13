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

// The cat calendar's turn of sheets and what the overview card and the calendar share; the texts are in content/

// Sunday first, as getDay() counts
val WEEK = listOf("Wissen", "Katzenlogik", "Stimmt’s?", "Kurios", "Wissen", "Flachwitz", "Sprache")

// mixed once with a fixed seed, the same order on every phone
private fun shuffled(
    list: List<Sheet>,
    seed0: Long,
): List<Sheet> {
    val out = list.toMutableList()
    var seed = seed0
    for (i in out.size - 1 downTo 1) {
        seed = ((seed.toInt() * 1664525).toLong() + 1013904223L) and 0xffffffffL
        val j = Math.floor((seed / 4294967296.0) * (i + 1)).toInt()
        val x = out[i]
        out[i] = out[j]
        out[j] = x
    }
    return out
}

// the seed keeps sheets up to two apart in a list, often on the same theme, off turns in a row
private val ORDERS by lazy { FACTS.mapValues { (_, list) -> shuffled(list, 90950) } }
private const val START = 20454L // 1 January 2026 as dayNumber() counts it

private fun inSeason(
    f: Sheet,
    month: Int,
) = f.months == null || month in f.months

// dayNumber() counts a local date as UTC counts the same date
private fun utcOf(day: Long) = GregorianCalendar(TimeZone.getTimeZone("UTC")).apply { timeInMillis = ((day + 0.5) * DAY).toLong() }

private fun monthOf(day: Long) = utcOf(day).get(Calendar.MONTH) + 1

private fun formatOf(day: Long) = WEEK[utcOf(day).get(Calendar.DAY_OF_WEEK) - 1]

fun formatOn(date: Long) = formatOf(dayNumber(date))

// The days of a format from START on take its sheets in turn; one out of season is skipped, so none comes twice
// before the others have had their turn.
fun factOn(date: Long): Sheet {
    val today = dayNumber(date)
    val format = formatOf(today)
    val order = ORDERS.getValue(format)
    var at = 0
    var day = minOf(START, today)
    while (true) {
        if (formatOf(day) == format) {
            val month = monthOf(day)
            while (!inSeason(order[at % order.size], month)) at++
            if (day == today) break
            at++
        }
        day++
    }
    return order[at % order.size]
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
