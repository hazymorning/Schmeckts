package de.schmeckts.app.content

import de.schmeckts.app.asArray
import de.schmeckts.app.asLong
import de.schmeckts.app.asString
import de.schmeckts.app.resourceJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

// The texts of the overview card and the cat calendar, in src/main/resources (facts.json, pools.json)

/** A sheet of the cat calendar. verdict, back: the stamp and the answer on the back of a Stimmt’s?. m, f: the wording
 *  for the household's one cat of that sex, {name} its name; {deine Katze} becomes „dein Kater“ for a tom. months,
 *  only in Wissen: 1-12, outside them the sheet is skipped. */
class Sheet(
    val id: String,
    val text: String,
    val back: String? = null,
    val verdict: String? = null,
    val m: String? = null,
    val f: String? = null,
    val months: List<Int>? = null,
)

/** The cat calendar's sheets by format, a format for each weekday (WEEK in views/Facts.kt). Keep ids stable. */
val FACTS: Map<String, List<Sheet>> by lazy {
    (resourceJson("facts.json") as JsonObject).mapValues { (_, list) ->
        (list as JsonArray).map {
            val o = it as JsonObject
            Sheet(
                o["id"].asString!!,
                o["text"].asString!!,
                o["back"].asString,
                o["verdict"].asString,
                o["m"].asString,
                o["f"].asString,
                o["months"].asArray?.map { m -> m.asLong!!.toInt() },
            )
        }
    }
}

private val pools by lazy { resourceJson("pools.json") as JsonObject }

private fun lists(key: String) = (pools[key] as JsonObject).mapValues { (_, v) -> (v as JsonArray).map { it.asString!! } }

// from the hour on; Saturday and Sunday their own from noon to the evening
val GREETINGS: List<Pair<Int, String>> by lazy {
    (pools["GREETINGS"] as JsonArray).map {
        (it as JsonArray)[0].asLong!!.toInt() to
            it[1].asString!!
    }
}
val WEEKEND: Map<Int, String> by lazy { (pools["WEEKEND"] as JsonObject).entries.associate { (k, v) -> k.toInt() to v.asString!! } }

/** The overview card's words: the first sentence tells the last meal, by moment */
val ANCHORS: Map<String, List<String>> by lazy { lists("ANCHORS") }

/** The second sentence, a fact of the day, by kind */
val DAY_FACTS: Map<String, List<String>> by lazy { lists("FACTS") }
val NOTABLE: List<String> by lazy { (pools["NOTABLE"] as JsonArray).map { it.asString!! } }
val NOTED: Map<String, String> by lazy { (pools["NOTED"] as JsonObject).mapValues { it.value.asString!! } }
