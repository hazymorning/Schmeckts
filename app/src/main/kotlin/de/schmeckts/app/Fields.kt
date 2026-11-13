package de.schmeckts.app

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// records as the server syncs them: one field per key, maps entry by entry as <map>.<key>, null removes

val COLLECTIONS = listOf("pets", "products", "servings", "observations")

// every server knows these; others need the "collections" feature
val BASE = listOf("pets", "products", "servings")
private val MAPS = mapOf("servings" to listOf("pets"), "products" to listOf("codes"), "observations" to listOf("pets"))
private val LOCAL = setOf("photo", "status", "error", "autoPets", "scanCode", "guess")
private val ID_RE = Regex("^[A-Za-z0-9_-]{4,40}$") // as on the server

fun validId(id: String?): Boolean = id != null && ID_RE.matches(id)

fun validId(id: JsonElement?): Boolean = validId(id.asString)

fun uid(): String =
    java.lang.Long.toString(Time.now(), 36) +
        java.lang.Long
            .toString((Math.random() * Long.MAX_VALUE).toLong(), 36)
            .padStart(5, '0')
            .take(5)

private val FIELD_RE = Regex("^(_del|[A-Za-z][A-Za-z0-9]{0,31})(\\.[A-Za-z0-9_-]{1,40})?$")
private const val MAX_FIELD = 500_000 // the server takes up to 512 KB per field

private fun isMap(
    c: String,
    k: String,
) = MAPS[c]?.contains(k) == true

// {field: '"value"'}, values as JSON text
fun fieldsOf(
    c: String,
    rec: Rec,
    report: (String, String) -> Unit = { _, _ -> },
): LinkedHashMap<String, String> {
    val out = LinkedHashMap<String, String>()

    fun put(
        k: String,
        v: JsonElement?,
    ) {
        if (v.isNull || !FIELD_RE.matches(k) || k == "_del") return
        val j = v!!.stringify()
        if (j.length <= MAX_FIELD) out[k] = j else report("field too large, stays on the device", "$c/${rec.id}/$k")
    }
    for ((k, v) in rec.m) {
        if (k == "id" || (c == "servings" && k in LOCAL)) continue
        if (isMap(c, k)) {
            (v as? JsonObject)?.forEach { (key, x) -> put("$k.$key", x) }
        } else {
            put(k, v)
        }
    }
    return out
}

private fun splitKey(k: String): Pair<String, String?> {
    val i = k.indexOf('.')
    return if (i < 0) k to null else k.substring(0, i) to k.substring(i + 1)
}

fun valueOf(
    rec: Rec?,
    k: String,
): JsonElement? {
    val (a, b) = splitKey(k)
    val v = if (b != null) (rec?.get(a) as? JsonObject)?.get(b) else rec?.get(a)
    return if (v.isNull) null else v
}

// false: a field this device does not know, e.g. a map from a newer version
fun setField(
    c: String,
    rec: Rec,
    k: String,
    v: JsonElement?,
): Boolean {
    val (a, b) = splitKey(k)
    if (b != null) {
        if (!isMap(c, a)) return false
        val map = rec[a] as? JsonObject ?: JsonObject(emptyMap())
        rec[a] = map.with(b, if (v.isNull) null else v)
    } else if (k != "id" && k != "_del") {
        rec[k] = if (v.isNull) null else v
    } else {
        return false
    }
    return true
}

fun fromFields(
    c: String,
    id: String,
    values: Map<String, JsonElement?>,
): Rec {
    val rec = Rec()
    rec["id"] = JsonPrimitive(id)
    for (m in MAPS[c].orEmpty()) rec[m] = JsonObject(emptyMap())
    for ((k, v) in values) setField(c, rec, k, v)
    return rec
}

fun complete(
    c: String,
    rec: Rec,
): Boolean =
    when (c) {
        "servings" -> rec.num("servedAt") != null && rec["servedAt"] !is JsonNull && rec["pets"].truthy
        "observations" -> rec.num("at") != null && rec.str("kind") != null && rec["pets"].truthy
        else -> true
    }

fun sameValue(
    a: JsonElement?,
    b: JsonElement?,
): Boolean = (a ?: JsonNull).stringify() == (b ?: JsonNull).stringify()
