package de.schmeckts.app

import java.text.Normalizer

// for text that goes into markup (Markup.kt reads <b> and these entities back)
fun esc(s: String?): String =
    (s ?: "").replace(Regex("[&<>\"']")) {
        when (it.value) {
            "&" -> "&amp;"
            "<" -> "&lt;"
            ">" -> "&gt;"
            "\"" -> "&quot;"
            else -> "&#39;"
        }
    }

private val MARKS = Regex("[\\u0300-\\u036f]")
private val NOT_WORD = Regex("[^a-z0-9]+")

fun norm(s: String?): String =
    Normalizer
        .normalize((s ?: "").lowercase().replace("ß", "ss"), Normalizer.Form.NFKD)
        .replace(MARKS, "")
        .replace(NOT_WORD, " ")
        .trim()

fun andList(
    l: List<String>,
    and: String = "und",
): String = if (l.size > 1) l.dropLast(1).joinToString(", ") + " $and " + l.last() else l.firstOrNull() ?: ""

fun cap(s: String): String = if (s.isEmpty()) s else s.substring(0, 1).uppercase() + s.substring(1)

fun addSentence(
    text: String,
    more: String,
): String = "$text${if (Regex("[.!?…]$").containsMatchIn(text)) "" else "."} $more"

// filler words, German and English, that carry no meaning on their own
val SMALL = "und oder mit ohne in im am an auf aus bei fur von vor zu zum zur neu the and with for".split(" ").toSet()

private val LOOSE = Regex("(?:[\\s&+/|,·–-]+|\\s(\\p{L}+))$")

// prefers cutting where another language begins (" / ", " | "), then at a word; never ends on a joiner or filler word
fun cutName(
    v: String,
    max: Int,
): String {
    if (v.length <= max) return v.trim()
    val head = v.substring(0, minOf(v.length, max + 1))
    val part = maxOf(head.lastIndexOf(" / "), head.lastIndexOf(" | "))
    val word = head.lastIndexOf(' ')
    var out =
        when {
            part > 0 -> head.substring(0, part)
            word > 0 -> head.substring(0, word)
            else -> v.substring(0, max)
        }
    while (true) {
        val end = LOOSE.find(out) ?: break
        val w = end.groups[1]?.value
        if (w != null && !SMALL.contains(norm(w))) break
        out = out.substring(0, end.range.first)
    }
    return out.trim()
}

// must match the server's rules: UPC-A is stored as EAN-13, an invalid code gives ''
fun normBarcode(raw: String?): String {
    var c = (raw ?: "").trim()
    if (!Regex("^[0-9]+$").matches(c)) return ""
    if (c.length == 12) c = "0$c"
    if (c.length != 8 && c.length != 13) return ""
    var sum = 0
    var w = 3
    for (i in c.length - 2 downTo 0) {
        sum += (c[i] - '0') * w
        w = 4 - w
    }
    return if ((10 - sum % 10) % 10 == c.last() - '0') c else ""
}
