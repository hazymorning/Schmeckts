package de.schmeckts.app

import java.util.Calendar
import java.util.GregorianCalendar
import kotlin.math.abs
import kotlin.math.floor

/** The time everything asks; tests set their own. */
object Time {
    var source: () -> Long = System::currentTimeMillis

    fun now(): Long = source()
}

const val DAY = 86_400_000L

// local time in the phone's zone, as JavaScript's Date sees it (java.time needs Android 8)
fun calendar(t: Long): Calendar = GregorianCalendar().apply { timeInMillis = t }

private val Calendar.year get() = get(Calendar.YEAR)
private val Calendar.month get() = get(Calendar.MONTH) + 1 // 1 to 12
private val Calendar.day get() = get(Calendar.DAY_OF_MONTH)
private val Calendar.hour get() = get(Calendar.HOUR_OF_DAY)
private val Calendar.minute get() = get(Calendar.MINUTE)

// 0 Sunday to 6 Saturday, as getDay() counts
fun weekday(t: Long): Int = calendar(t).get(Calendar.DAY_OF_WEEK) - 1

fun hourOf(t: Long): Int = calendar(t).hour

fun minuteOf(t: Long): Int = calendar(t).minute

fun yearOf(t: Long): Int = calendar(t).year

fun monthOf(t: Long): Int = calendar(t).month

fun dateOf(t: Long): Int = calendar(t).day

/** new Date(y, m - 1, d, h, min): local time */
fun localTime(
    y: Int,
    m: Int,
    d: Int,
    h: Int = 0,
    min: Int = 0,
): Long = GregorianCalendar(y, m - 1, d, h, min, 0).timeInMillis

/** d.setHours(h, min, 0, 0) */
fun atHour(
    t: Long,
    h: Int,
    min: Int = 0,
): Long =
    calendar(t)
        .apply {
            set(Calendar.HOUR_OF_DAY, h)
            set(Calendar.MINUTE, min)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

private fun pad(n: Int) = n.toString().padStart(2, '0')

// Math.round: halves go up
fun jsRound(x: Double): Long = floor(x + 0.5).toLong()

fun timeStr(t: Long): String {
    val d = calendar(t)
    return "${pad(d.hour)}:${pad(d.minute)}"
}

// as the app says a time: 7:05, not 07:05
fun clockStr(t: Long): String {
    val d = calendar(t)
    return "${d.hour}:${pad(d.minute)}"
}

// min: minutes after midnight, to the quarter hour
fun quarterStr(min: Int): String {
    val m = jsRound(min / 15.0).toInt() * 15
    return "${(m / 60) % 24}:${pad(m % 60)}"
}

fun dayStart(t: Long): Long = atHour(t, 0)

// counts local days; the same all day
fun dayNumber(t: Long): Long = jsRound(dayStart(t).toDouble() / DAY)

fun dayKey(t: Long): String {
    val d = calendar(t)
    return "${d.year}-${pad(d.month)}-${pad(d.day)}"
}

private fun daysAgo(t: Long): Long = jsRound((dayStart(Time.now()) - dayStart(t)).toDouble() / DAY)

// the calendar day, so a day stays a day across daylight saving changes
fun addDays(
    t: Long,
    n: Int,
): Long = calendar(t).apply { add(Calendar.DAY_OF_MONTH, n) }.timeInMillis

// Monday 00:00 local time
fun weekStart(t: Long): Long = addDays(dayStart(t), -((weekday(t) + 6) % 7))

val WEEKDAYS_LONG = listOf("Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag")
val MONTHS_LONG =
    listOf("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember")
val MONTHS_SHORT = listOf("Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez.")

fun weekdayOf(t: Long): String = WEEKDAYS_LONG[weekday(t)]

// toLocaleDateString('de-DE', {day: 'numeric', month: 'long'}): 3. Oktober
fun dayMonth(t: Long): String {
    val d = calendar(t)
    return "${d.day}. ${MONTHS_LONG[d.month - 1]}"
}

// {weekday: 'long', day: 'numeric', month: 'long'}: Samstag, 28. Juli
fun weekdayDayMonth(t: Long): String = "${weekdayOf(t)}, ${dayMonth(t)}"

fun dayLabel(t: Long): String {
    val n = daysAgo(t)
    if (n == 0L) return "Heute"
    if (n == 1L) return "Gestern"
    val label = weekdayDayMonth(t)
    return if (yearOf(t) != yearOf(Time.now())) "$label ${yearOf(t)}" else label
}

// every date with its time: heute um 7:05, gestern um 18:30, am 2. Okt. um 18:29
fun whenStr(t: Long): String {
    val n = daysAgo(t)
    val d = calendar(t)
    val year = if (d.year != yearOf(Time.now())) " ${d.year}" else ""
    val day =
        when (n) {
            0L -> "heute"
            1L -> "gestern"
            else -> "am ${d.day}. ${MONTHS_SHORT[d.month - 1]}$year"
        }
    return "$day um ${clockStr(t)}"
}

// Intl.RelativeTimeFormat('de', {numeric: 'auto'})
private fun relative(
    n: Long,
    unit: String,
): String {
    if (unit == "day") {
        when (n) {
            -2L -> return "vorgestern"
            -1L -> return "gestern"
            1L -> return "morgen"
            2L -> return "übermorgen"
        }
    }
    val a = abs(n)
    val word =
        when (unit) {
            "minute" -> if (a == 1L) "Minute" else "Minuten"
            "hour" -> if (a == 1L) "Stunde" else "Stunden"
            else -> if (a == 1L) "Tag" else "Tagen"
        }
    return if (n < 0) "vor $a $word" else "in $a $word"
}

fun ago(t: Long): String {
    val d = (t - Time.now()) / 1000.0
    val a = abs(d)
    if (a < 60) return "gerade eben"
    if (a < 3600) return relative(jsRound(d / 60), "minute")
    if (a < 86400) return relative(jsRound(d / 3600), "hour")
    if (a < 86400 * 7) return relative(jsRound(d / 86400), "day")
    return "am ${dayMonth(t)}"
}
