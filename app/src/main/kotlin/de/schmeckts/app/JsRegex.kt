package de.schmeckts.app

// JavaScript's \s, \b, \w and \d, and its $, on the JVM and on Android alike, whose regex engines read them otherwise

private const val SPACES = "\\t\\n\\u000B\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff"
private const val WORD = "A-Za-z0-9_"
private const val BOUNDARY = "(?:(?<=[$WORD])(?![$WORD])|(?<![$WORD])(?=[$WORD]))"

private fun translate(source: String): String {
    val out = StringBuilder()
    var inClass = false
    var i = 0
    while (i < source.length) {
        val c = source[i]
        if (c == '\\' && i + 1 < source.length) {
            val n = source[i + 1]
            out.append(
                when {
                    n == 's' -> if (inClass) SPACES else "[$SPACES]"
                    n == 'S' && !inClass -> "[^$SPACES]"
                    n == 'w' -> if (inClass) WORD else "[$WORD]"
                    n == 'W' && !inClass -> "[^$WORD]"
                    n == 'd' -> if (inClass) "0-9" else "[0-9]"
                    n == 'D' && !inClass -> "[^0-9]"
                    n == 'b' && !inClass -> BOUNDARY
                    n == 'S' || n == 'W' || n == 'D' || n == 'B' -> error("\\$n is not translated: $source")
                    else -> "\\$n"
                },
            )
            i += 2
            continue
        }
        when {
            c == '[' && !inClass -> inClass = true
            c == ']' && inClass -> inClass = false
        }
        out.append(if (c == '$' && !inClass) "(?![\\s\\S])" else c.toString())
        i++
    }
    return out.toString()
}

/** A regular expression as JavaScript reads source; flags: i for case-insensitive, the rest as JavaScript has them. */
fun jsRe(
    source: String,
    flags: String = "",
): Regex = if ('i' in flags) Regex(translate(source), RegexOption.IGNORE_CASE) else Regex(translate(source))
