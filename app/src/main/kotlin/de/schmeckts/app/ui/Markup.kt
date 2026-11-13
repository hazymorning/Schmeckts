package de.schmeckts.app.ui

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight

// The views' texts carry <b> and the entities of esc(), as the old HTML did; this sets them.

private val ENTITY = mapOf("&amp;" to "&", "&lt;" to "<", "&gt;" to ">", "&quot;" to "\"", "&#39;" to "'")
private val TOKEN = Regex("</?b>|&(amp|lt|gt|quot|#39);")

fun markup(
    html: String,
    strong: SpanStyle = SpanStyle(fontWeight = FontWeight.SemiBold),
): AnnotatedString =
    buildAnnotatedString {
        var at = 0
        var bold = -1
        for (m in TOKEN.findAll(html)) {
            append(html.substring(at, m.range.first))
            when (m.value) {
                "<b>" -> bold = length
                "</b>" -> {
                    if (bold >= 0) addStyle(strong, bold, length)
                    bold = -1
                }
                else -> append(ENTITY.getValue(m.value))
            }
            at = m.range.last + 1
        }
        append(html.substring(at))
        if (bold >= 0) addStyle(strong, bold, length)
    }

/** the text without its markup */
fun plainOf(html: String) = markup(html).text
