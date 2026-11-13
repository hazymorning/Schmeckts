package de.schmeckts.app.views

import de.schmeckts.app.Insight
import de.schmeckts.app.andList
import de.schmeckts.app.cap
import de.schmeckts.app.esc

// Evaluation card and page. The analysis is in Smart.kt, this only words it

private val TEXTURE_SAID =
    mapOf(
        "pastete" to "Pastete",
        "sosse" to "Stückchen in Soße",
        "gelee" to "Stückchen in Gelee",
        "mousse" to "Mousse",
        "block" to "fester Block",
        "suppe" to "Suppe",
    )

private fun ofN(
    good: Int,
    n: Int,
) = "$good von $n"

private fun better(gap: Double) = if (gap > 0) "besser" else "schlechter"

// a group against the rest, which is named where it is one group
private val REST = mapOf("marke" to "andere Marken", "konsistenz" to "anderes Nassfutter")

/** [icon, the sentence, the counts], as markup */
class Said(
    val icon: String,
    val say: String,
    val why: String,
)

private fun compared(
    ic: String,
    x: Insight,
): Said {
    val name = { key: Any? -> esc(if (x.kind == "konsistenz") TEXTURE_SAID[key] else key as String?) }
    val a = name(x.a.key)
    val b = if (x.b.key != null) name(x.b.key) else REST.getValue(x.kind)
    return Said(
        ic,
        "Bisher kommt <b>$a</b> ${better(x.gap)} an als $b.",
        "${cap(a)} <b>${ofN(x.a.good, x.a.n)} Mal</b> gut gefressen, $b ${ofN(x.b.good, x.b.n)} Mal.",
    )
}

@Suppress("UNCHECKED_CAST")
fun insightSaid(x: Insight): Said {
    val a = x.a
    val b = x.b
    return when (x.kind) {
        "marke" -> compared("tag", x)
        "geschmack" ->
            Said(
                "fish",
                "Bisher kommt <b>${esc(a.key as String)}</b> ${better(x.gap)} an als andere Sorten derselben Marke.",
                "Mit ${esc(a.key)} <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, ohne ${ofN(b.good, b.n)} Mal.",
            )
        "konsistenz" -> compared("layers", x)
        "sosse" ->
            Said(
                "drop",
                "Bei Stückchen in Soße wird oft nur die Soße geleckt.",
                "<b>${x.k} von ${x.n} Mal</b> nur die Soße." +
                    (x.instead?.let { " ${cap(TEXTURE_SAID.getValue(it.key))} dagegen ${ofN(it.good, it.n)} Mal gut gefressen." } ?: ""),
            )
        "wiederholung" ->
            Said(
                "repeat",
                "Zweimal hintereinander dieselbe Sorte kommt schlechter an.",
                "Beim zweiten Mal <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, sonst ${ofN(b.good, b.n)} Mal.",
            )
        "neu" ->
            Said(
                "sparkle",
                if (x.gap >
                    0
                ) {
                    "Neue Sorten kommen beim ersten Mal besser an als danach."
                } else {
                    "Neue Sorten brauchen eine Weile, danach läuft es besser."
                },
                "Beim ersten Mal <b>${ofN(a.good, a.n)}</b>, danach ${ofN(b.good, b.n)} Mal gut gefressen.",
            )
        "tageszeit" ->
            Said(
                if (x.gap > 0) "sun" else "moon",
                if (x.gap >
                    0
                ) {
                    "Die erste Mahlzeit am Tag kommt besser an als die letzte."
                } else {
                    "Die letzte Mahlzeit am Tag kommt besser an als die erste."
                },
                "Bei der ersten <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, bei der letzten ${ofN(b.good, b.n)} Mal.",
            )
        "snack" ->
            Said(
                "r_verputzt",
                "Nach einem Snack bleibt beim nächsten Napf öfter etwas stehen.",
                "Nach Snacks <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, sonst ${ofN(b.good, b.n)} Mal.",
            )
        else -> {
            val first = esc(a.key as String)
            val rest = esc(andList(b.key as List<String>))
            Said(
                "person",
                "Bei <b>$first</b> kommen dieselben Sorten besser an als bei $rest.",
                "Bei $first <b>${ofN(a.good, a.n)} Mal</b> gut gefressen, bei $rest ${ofN(b.good, b.n)} Mal.",
            )
        }
    }
}
