package de.schmeckts.app.views

import de.schmeckts.app.GOOD
import de.schmeckts.app.House
import de.schmeckts.app.NO
import de.schmeckts.app.Phone
import de.schmeckts.app.RATINGS
import de.schmeckts.app.Sort
import de.schmeckts.app.Tally
import de.schmeckts.app.VERDICTS
import de.schmeckts.app.cap
import de.schmeckts.app.sideOf

// Building blocks shared by the views

/** A row that tells something: its picture (an icon), what it says and why, as markup */
class Told(
    val icon: String,
    val say: String,
    val why: String = "",
)

fun times(
    k: Int,
    n: Int,
) = if (n == 1) {
    "einmal"
} else if (k < n) {
    "$k von $n Mal"
} else if (n == 2) {
    "beide Male"
} else {
    "alle $n Mal"
}

// Ratings in words, never as a percentage. Each falls on a side (good, poor, between); the majority side is named,
// by its level if it holds only one.
private val SIDES: List<Pair<(Int) -> Boolean, String>> =
    listOf(
        { v: Int -> v >= GOOD } to "gut gefressen",
        { v: Int -> v < NO } to "kaum gefressen",
        { v: Int -> v in NO until GOOD } to "nur zum Teil gefressen",
    )

fun evidenceOf(x: Tally): String {
    if (x.n == 0) return "Noch nicht bewertet"
    val levels = x.counts.keys.sortedByDescending { RATINGS.getValue(it).score }
    if (levels.size == 1) return cap("${times(x.n, x.n)} ${RATINGS.getValue(levels[0]).said}")
    if (x.n ==
        2
    ) {
        return "Einmal ${once(listOf(RATINGS.getValue(levels[0]).said, RATINGS.getValue(levels[1]).said)).joinToString(", einmal ")}"
    }
    val sides =
        SIDES
            .map { (on, word) ->
                val l = levels.filter { on(RATINGS.getValue(it).score) }
                l.sumOf { x.counts.getValue(it) } to (if (l.size == 1) RATINGS.getValue(l[0]).said else word)
            }.filter { it.first > 0 }
            .sortedByDescending { it.first }
    if (sides[0].first * 2 > x.n) return cap("${times(sides[0].first, x.n)} ${sides[0].second}")
    return "Mal so, mal so: ${once(sides.map { it.second }).mapIndexed { i, said -> "${sides[i].first}× $said" }.joinToString(", ")}"
}

// a closing word all phrases share is said once, at the end: „einmal fast alles, einmal die Hälfte gefressen“
private fun once(phrases: List<String>): List<String> {
    val end = " " + phrases.last().split(" ").last()
    return if (phrases.all { it.endsWith(end) }) {
        phrases.mapIndexed { i, p ->
            if (i <
                phrases.size - 1
            ) {
                p.dropLast(end.length)
            } else {
                p
            }
        }
    } else {
        phrases
    }
}

fun lower(t: String) = if (t.isEmpty()) t else t.substring(0, 1).lowercase() + t.substring(1)

// A variety's ratings in words, each pet counted on its own, or three meals for two would read as six. Only the pets
// that decided the verdict are told, unless all.
fun Phone.whyOf(
    e: Sort,
    all: Boolean = false,
): String {
    val rated = e.pets.keys.filter { (e.pets.getValue(it).n > 0) && derive.inFilter(it) && derive.getPet(it) != null }
    val by =
        if (all) {
            emptyList()
        } else if (e.verdict == "nachkaufen") {
            e.yes
        } else if (e.verdict == "nicht") {
            e.no
        } else {
            emptyList()
        }
    val ids = rated.filter { by.isEmpty() || it in by }
    if (ids.isEmpty()) return evidenceOf(e)
    if (rated.size < 2) return evidenceOf(e.pets.getValue(ids[0]))
    val said = ids.map { lower(evidenceOf(e.pets.getValue(it))) }
    if (said.all { it == said[0] }) return "Bei ${if (ids.size == 2 && rated.size == 2) "beiden" else derive.petNames(ids)} ${said[0]}"
    return cap(ids.mapIndexed { i, id -> "bei ${derive.getPet(id)!!.str("name")} ${said[i]}" }.joinToString(", "))
}

// what a variety that goes down badly, or that nobody buys any more, has to show for itself when it is served
fun Phone.record(e: Sort?) = if (e != null && e.n > 0 && (e.choice == "nicht" || sideOf(e) == "flop")) whyOf(e) else ""

fun Phone.verdictLabel(x: Tally): String =
    if (x.verdict == "gemischt") {
        val (yes, no) =
            when (x) {
                is Sort -> x.yes to x.no
                is House -> x.yes to x.no
                else -> emptyList<String>() to emptyList()
            }
        "Gemischt: ${derive.petNames(yes)} ja, ${derive.petNames(no)} nein"
    } else {
        VERDICTS.getValue(x.verdict)
    }
