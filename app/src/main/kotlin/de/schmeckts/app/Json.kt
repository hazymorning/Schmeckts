package de.schmeckts.app

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonUnquotedLiteral
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import java.math.BigDecimal

// Stored data stays JSON as JavaScript wrote it: numbers as JavaScript prints them, keys in their order, every field
// kept, including those this version does not know.

private val format = Json { prettyPrint = false }

fun parseJson(text: String): JsonElement = normalized(format.parseToJsonElement(text))

fun JsonElement.stringify(): String = toString()

// JSON.parse then JSON.stringify: a number reads as a double and is written back the way JavaScript writes it
private fun normalized(e: JsonElement): JsonElement =
    when (e) {
        is JsonObject -> JsonObject(e.mapValuesTo(LinkedHashMap()) { normalized(it.value) })
        is JsonArray -> JsonArray(e.map(::normalized))
        is JsonPrimitive ->
            if (e.isString || e is JsonNull || e.booleanOrNull != null) {
                e
            } else {
                e.doubleOrNull?.let(::num) ?: e
            }
    }

@OptIn(ExperimentalSerializationApi::class)
fun num(d: Double): JsonPrimitive = JsonUnquotedLiteral(jsNumber(d))

fun num(n: Long): JsonPrimitive = JsonPrimitive(n)

fun num(n: Int): JsonPrimitive = JsonPrimitive(n)

// Number.prototype.toString: the shortest digits that read back as the same double
fun jsNumber(d: Double): String {
    if (d.isNaN() || d.isInfinite()) return "null"
    if (d == 0.0) return "0"
    if (d == Math.rint(d) && Math.abs(d) < 9.007199254740992E15) return d.toLong().toString()
    val shortest = BigDecimal(d.toString()).stripTrailingZeros()
    val digits = shortest.unscaledValue().abs().toString()
    val k = digits.length
    val n = k - shortest.scale() // value = 0.digits × 10^n
    val sign = if (d < 0) "-" else ""
    val body =
        when {
            n in k..21 -> digits + "0".repeat(n - k)
            n in 1..21 -> digits.substring(0, n) + "." + digits.substring(n)
            n in -5..0 -> "0." + "0".repeat(-n) + digits
            else -> {
                val e = n - 1
                val mantissa = if (k == 1) digits else digits[0] + "." + digits.substring(1)
                mantissa + "e" + (if (e < 0) "-" else "+") + Math.abs(e)
            }
        }
    return sign + body
}

fun str(s: String?): JsonElement = if (s == null) JsonNull else JsonPrimitive(s)

fun bool(b: Boolean): JsonPrimitive = JsonPrimitive(b)

val JsonElement?.asString: String?
    get() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

val JsonElement?.asDouble: Double?
    get() = (this as? JsonPrimitive)?.takeIf { !it.isString && it !is JsonNull }?.doubleOrNull

val JsonElement?.asLong: Long?
    get() = asDouble?.toLong()

val JsonElement?.asBoolean: Boolean?
    get() = (this as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull

val JsonElement?.asObject: JsonObject?
    get() = this as? JsonObject

val JsonElement?.asArray: JsonArray?
    get() = this as? JsonArray

val JsonElement?.isNull: Boolean
    get() = this == null || this is JsonNull

// JavaScript's truthiness, for fields read the way the old code read them
val JsonElement?.truthy: Boolean
    get() =
        when (this) {
            null, JsonNull -> false
            is JsonPrimitive ->
                if (isString) {
                    content.isNotEmpty()
                } else {
                    booleanOrNull ?: doubleOrNull?.let { it != 0.0 && !it.isNaN() } ?: true
                }
            else -> true
        }

fun jsonObject(vararg pairs: Pair<String, JsonElement?>): JsonObject =
    JsonObject(
        pairs.filter { it.second != null }.associateTo(LinkedHashMap()) {
            it.first to
                it.second!!
        },
    )

fun JsonObject.with(
    key: String,
    value: JsonElement?,
): JsonObject {
    val m = LinkedHashMap(this)
    if (value == null) m.remove(key) else m[key] = value
    return JsonObject(m)
}

/** A stored record: an ordered JSON object whose fields can change, every field kept as it came. */
class Rec(
    val m: LinkedHashMap<String, JsonElement> = LinkedHashMap(),
) {
    constructor(o: JsonObject) : this(LinkedHashMap(o))

    val id: String get() = m["id"].asString ?: ""

    operator fun get(key: String): JsonElement? = m[key]

    operator fun set(
        key: String,
        value: JsonElement?,
    ) {
        if (value == null) m.remove(key) else m[key] = value
    }

    fun has(key: String) = m.containsKey(key)

    fun remove(key: String) {
        m.remove(key)
    }

    fun str(key: String): String? = m[key].asString

    fun num(key: String): Double? = m[key].asDouble

    fun long(key: String): Long? = m[key].asLong

    fun obj(key: String): JsonObject? = m[key].asObject

    fun put(
        key: String,
        value: String?,
    ) = set(key, value?.let { JsonPrimitive(it) })

    fun put(
        key: String,
        value: Long?,
    ) = set(key, value?.let { num(it) })

    fun put(
        key: String,
        value: Boolean?,
    ) = set(key, value?.let { JsonPrimitive(it) })

    fun toJson(): JsonObject = JsonObject(LinkedHashMap(m))

    fun copy(): Rec = Rec(LinkedHashMap(m))

    override fun toString() = toJson().toString()
}

fun recOf(vararg pairs: Pair<String, JsonElement?>): Rec = Rec(jsonObject(*pairs))
