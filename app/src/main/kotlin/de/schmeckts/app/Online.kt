package de.schmeckts.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// barcode lookup straight from the phone, only when allowed in the settings; only the number is sent

private val BARCODE_URLS = listOf("https://world.openpetfoodfacts.org", "https://world.openfoodfacts.org")
private const val FIELDS = "product_name,product_name_de,brands,categories_tags"
private const val KEEP_FOUND = 90 * DAY
private const val KEEP_MISS = 7 * DAY
private const val MAX_KEPT = 200
private const val TIMEOUT = 5_000L
private val QUANTITY =
    jsRe("\\b\\d+(?:[.,]\\d+)?\\s*[x×]\\s*\\d+(?:[.,]\\d+)?\\s*(?:g|kg|ml|l)\\b|\\b\\d+(?:[.,]\\d+)?\\s*(?:g|kg|ml|l)\\b", "gi")

/** found, and what the database says; type empty where its categories are not clear */
class Lookup(
    val found: Boolean,
    val brand: String = "",
    val variety: String = "",
    val type: String = "",
)

class Online(
    private val store: Store,
    private val http: Http,
) {
    suspend fun lookup(code: String): Lookup {
        remembered(code)?.let { return it }
        var reached = false
        for (base in BARCODE_URLS) {
            val hit =
                try {
                    fetchProduct(base, code)
                } catch (e: Exception) {
                    continue
                }
            reached = true
            if (hit.found) return remember(code, hit)
        }
        if (!reached) throw java.io.IOException("Keine Datenbank im Internet erreichbar.")
        return remember(code, Lookup(false))
    }

    private suspend fun fetchProduct(
        base: String,
        code: String,
    ): Lookup {
        val res = http.send("GET", "$base/api/v2/product/${encodeUri(code)}.json?fields=$FIELDS", timeoutMs = TIMEOUT)
        if (res.status !in 200..299 && res.status != 404) throw java.io.IOException("HTTP ${res.status}")
        val body = parseJson(res.body ?: "") as? JsonObject
        if (body?.get("status").asDouble != 1.0) return Lookup(false)
        val p = body!!["product"] as? JsonObject ?: JsonObject(emptyMap())
        val brand = (p["brands"].asString ?: "").split(",")[0].trim()
        val variety = cleanVariety((p["product_name_de"].asString ?: "").trim().ifEmpty { p["product_name"].asString ?: "" }, brand)
        if (brand.isEmpty() && variety.isEmpty()) return Lookup(false)
        return Lookup(
            true,
            brand,
            variety,
            typeOfTags(
                (p["categories_tags"] as? JsonArray)?.map { it.asString ?: it.toString() } ?: emptyList(),
            ),
        )
    }

    // "Sheba Fresh Choice Huhn in Sauce 4x50g" → "Fresh Choice Huhn in Sauce"
    private fun cleanVariety(
        name: String,
        brand: String,
    ): String {
        var v = name.replace(QUANTITY, " ").replace(jsRe("\\s+"), " ").trim()
        if (brand.isNotEmpty() && v.lowercase().startsWith(brand.lowercase())) v = v.substring(brand.length)
        return v.replace(jsRe("^[\\s\\-–,·|]+|[\\s\\-–,·|]+$"), "")
    }

    // unambiguous categories only
    private fun typeOfTags(tags: List<String>): String {
        fun has(vararg words: String) = tags.any { t -> words.any { it in t } }
        val wet = has("wet")
        val dry = has("dry")
        val snack = has("treat", "snack")
        return when {
            wet && !dry && !snack -> "Nassfutter"
            dry && !wet && !snack -> "Trockenfutter"
            snack && !wet && !dry -> "Snack"
            else -> ""
        }
    }

    // remembered so the same number does not go out again
    private fun remembered(code: String): Lookup? {
        val kept = store.prefs.codes[code] ?: return null
        val found = kept["found"].asBoolean == true
        if (Time.now() - (kept["at"].asLong ?: 0) > (if (found) KEEP_FOUND else KEEP_MISS)) return null
        return Lookup(found, kept["brand"].asString ?: "", kept["variety"].asString ?: "", kept["type"].asString ?: "")
    }

    private fun remember(
        code: String,
        hit: Lookup,
    ): Lookup {
        val codes = store.prefs.codes
        codes[code] =
            if (hit.found) {
                jsonObject(
                    "found" to JsonPrimitive(true),
                    "brand" to JsonPrimitive(hit.brand),
                    "variety" to JsonPrimitive(hit.variety),
                    "type" to JsonPrimitive(hit.type),
                    "at" to num(Time.now()),
                )
            } else {
                jsonObject("found" to JsonPrimitive(false), "at" to num(Time.now()))
            }
        val old =
            codes.entries
                .sortedBy { it.value["at"].asDouble ?: 0.0 }
                .dropLast(MAX_KEPT)
                .map { it.key }
        for (k in old) codes.remove(k)
        store.savePrefs()
        return hit
    }
}
