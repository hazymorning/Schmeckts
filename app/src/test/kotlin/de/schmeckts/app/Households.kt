package de.schmeckts.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.GregorianCalendar
import java.util.TimeZone

// Made-up households for the tests of the evaluation and the overview, as tests/*.test.js built them

fun berlin() = TimeZone.setDefault(TimeZone.getTimeZone("Europe/Berlin"))

fun utc(
    y: Int,
    m: Int,
    d: Int,
    h: Int = 0,
): Long =
    GregorianCalendar(TimeZone.getTimeZone("UTC"))
        .apply {
            clear()
            set(y, m - 1, d, h, 0, 0)
        }.timeInMillis

/** new Date('2026-06-10T12:00') in local time */
fun at(text: String): Long {
    val m = Regex("^(\\d{4})-(\\d{2})-(\\d{2})(?:T(\\d{2}):(\\d{2}))?$").matchEntire(text)!!.groupValues
    return localTime(m[1].toInt(), m[2].toInt(), m[3].toInt(), m[4].ifEmpty { "0" }.toInt(), m[5].ifEmpty { "0" }.toInt())
}

fun j(v: Any?): JsonElement =
    when (v) {
        null -> JsonNull
        is JsonElement -> v
        is String -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        is Int -> num(v)
        is Long -> num(v)
        is Double -> num(v)
        is Map<*, *> -> JsonObject(v.entries.associate { (k, x) -> k as String to j(x) })
        is List<*> -> JsonArray(v.map { j(it) })
        else -> error("$v")
    }

/** A product: an id alone, or its fields. */
fun prod(
    id: String,
    vararg fields: Pair<String, Any?>,
): Map<String, Any?> = mapOf("id" to id) + fields

/** An absolute time for a meal, in place of days before now */
class At(
    val t: Long,
)

/** A meal: variety, the pets with their rating, when (days before NOW, or local time as text), who served it. */
class Meal(
    val p: String?,
    val rated: Map<String, String?>,
    val ago: Any,
    val by: String? = null,
)

fun meal(
    p: String?,
    rated: Map<String, String?>,
    ago: Any = 0,
    by: String? = null,
) = Meal(p, rated, ago, by)

fun rate(
    sort: String,
    pet: String,
    ratings: List<String?>,
    daysAgo: Number = 0,
) = ratings.map { Meal(sort, mapOf(pet to it), daysAgo) }

fun daily(
    pet: String,
    pairs: List<Pair<String, String?>>,
    start: Number,
    step: Number = 1,
) = pairs.mapIndexed { i, (sort, r) -> Meal(sort, mapOf(pet to r), start.toDouble() + i * step.toDouble()) }

fun Rec.set(
    key: String,
    v: Any?,
) {
    this[key] = if (v == null) null else j(v)
}

/** meals newest first, as the app keeps them; products with an empty brand and variety unless given */
fun household(
    pets: List<String>,
    products: List<Any>,
    meals: List<Meal>,
    now: Long,
    productDefaults: Map<String, Any?> = mapOf("brand" to "", "variety" to "", "codes" to emptyMap<String, Any>()),
    petFields: (String) -> Map<String, Any?> = { mapOf("id" to it, "name" to it) },
): Db {
    val db = Db()
    pets.forEach { db.pets.add(Rec(j(petFields(it)) as JsonObject)) }
    for (p in products) {
        val fields = if (p is String) mapOf("id" to p) else (p as Map<*, *>).mapKeys { it.key as String }
        db.products.add(Rec(j(productDefaults + fields) as JsonObject))
    }
    val made =
        meals.mapIndexed { i, m ->
            val t =
                when (m.ago) {
                    is String -> at(m.ago)
                    is At -> m.ago.t
                    else -> now - Math.round((m.ago as Number).toDouble() * DAY)
                }
            Rec(
                j(
                    linkedMapOf(
                        "id" to "meal$i",
                        "productId" to m.p,
                        "by" to m.by,
                        "servedAt" to t,
                        "pets" to m.rated.mapValues { (_, r) -> mapOf("r" to r) },
                    ).filterValues { it != null },
                ) as JsonObject,
            )
        }
    db.servings.addAll(made.sortedByDescending { it.servedAt })
    return db
}
