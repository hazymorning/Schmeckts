package de.schmeckts.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Packaging photos read by an AI on a key of the user's own, straight from this phone. The key lives in ai.json, which
// neither sync, backup, exchange file nor device transfer carries, and goes only to its provider.

private const val TIMEOUT = 45_000L
private const val CHECK_TIMEOUT = 15_000L
private const val KNOWN = 60

// word for word server/recognize-prompt.txt, so the phone and the server answer alike
private const val PROMPT = """The photo shows cat food packaging (a can, tray, pouch, sack or treat).
Identify the brand and the variety. Answer with JSON ONLY, no markdown, in this form:
{"brand":"","variety":"","type":"Nassfutter|Trockenfutter|Snack|Sonstiges"}
"variety" is the variety, short and in German, e.g. "Huhn in Soße" or "Lachs Pastete".
Leave a value empty when it cannot be made out."""

class Model(
    val id: String,
    val name: String?,
)

// the highest version in names like gpt-6.1-sol or gemini-3.8-flash
private fun newest(
    models: List<Model>,
    re: Regex,
): Model? {
    fun v(m: Model) =
        re
            .find(m.id)!!
            .groupValues[1]
            .split(".")
            .map { it.toInt() }
    return models
        .filter { re.containsMatchIn(it.id) }
        .sortedWith { a, b ->
            val x = v(b)[0] - v(a)[0]
            if (x != 0) x else (v(b).getOrElse(1) { 0 } - v(a).getOrElse(1) { 0 })
        }.firstOrNull()
}

private fun list(
    d: JsonElement?,
    key: String,
): List<JsonObject> = ((d as? JsonObject)?.get(key) as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }

private fun content(vararg parts: JsonObject?) = JsonArray(parts.filterNotNull())

/** Each provider's middle line, as the server takes Claude Sonnet. The model comes from the list the key may use
 *  today and is picked again once it is gone, so a retired model needs no app update. lean asks for little thinking,
 *  which a photo of a label does not need; a model that refuses it is asked without. */
class Provider(
    val name: String,
    val models: String,
    val headers: (String) -> Map<String, String>,
    val pick: (JsonElement?) -> Model?,
    val url: (String) -> String,
    val lean: JsonObject,
    val body: (model: String, text: String, b64: String) -> JsonObject,
    val text: (JsonElement?) -> List<String>,
)

val PROVIDERS: Map<String, Provider> =
    linkedMapOf(
        "anthropic" to
            Provider(
                name = "Anthropic",
                models = "https://api.anthropic.com/v1/models?limit=1000",
                headers = { key ->
                    linkedMapOf(
                        "x-api-key" to key,
                        "anthropic-version" to "2023-06-01",
                        "anthropic-dangerous-direct-browser-access" to "true",
                    )
                },
                // newest first, and the line is a field of its own
                pick = { d ->
                    list(d, "data")
                        .filter { it["line"].asString == "sonnet" && (it["lifecycle"].asString ?: "active") == "active" }
                        .firstOrNull { m ->
                            val can = m["capabilities"] as? JsonObject
                            can == null || ((can["image_input"] as? JsonObject)?.get("supported").truthy)
                        }?.let { Model(it["id"].asString!!, it["display_name"].asString) }
                },
                url = { "https://api.anthropic.com/v1/messages" },
                lean = parseJson("""{"output_config":{"effort":"low"}}""") as JsonObject,
                body = { model, text, b64 ->
                    jsonObject(
                        "model" to JsonPrimitive(model),
                        "max_tokens" to num(4096),
                        "messages" to
                            JsonArray(
                                listOf(
                                    jsonObject(
                                        "role" to JsonPrimitive("user"),
                                        "content" to
                                            content(
                                                if (b64.isNotEmpty()) {
                                                    jsonObject(
                                                        "type" to JsonPrimitive("image"),
                                                        "source" to
                                                            jsonObject(
                                                                "type" to JsonPrimitive("base64"),
                                                                "media_type" to JsonPrimitive("image/jpeg"),
                                                                "data" to JsonPrimitive(b64),
                                                            ),
                                                    )
                                                } else {
                                                    null
                                                },
                                                jsonObject("type" to JsonPrimitive("text"), "text" to JsonPrimitive(text)),
                                            ),
                                    ),
                                ),
                            ),
                    )
                },
                text = { d -> list(d, "content").filter { it["type"].asString == "text" }.mapNotNull { it["text"].asString } },
            ),
        "openai" to
            Provider(
                name = "OpenAI",
                models = "https://api.openai.com/v1/models",
                headers = { key -> mapOf("Authorization" to "Bearer $key") },
                pick = { d ->
                    newest(
                        list(d, "data").mapNotNull {
                            it["id"].asString?.let { id ->
                                Model(id, null)
                            }
                        },
                        Regex("^gpt-(\\d+(?:\\.\\d+)?)(?:-sol)?$"),
                    )
                },
                url = { "https://api.openai.com/v1/responses" },
                lean = parseJson("""{"reasoning":{"effort":"low"}}""") as JsonObject,
                body = { model, text, b64 ->
                    jsonObject(
                        "model" to JsonPrimitive(model),
                        "store" to JsonPrimitive(false),
                        "max_output_tokens" to num(4096),
                        "input" to
                            JsonArray(
                                listOf(
                                    jsonObject(
                                        "role" to JsonPrimitive("user"),
                                        "content" to
                                            content(
                                                if (b64.isNotEmpty()) {
                                                    jsonObject(
                                                        "type" to JsonPrimitive("input_image"),
                                                        "image_url" to JsonPrimitive("data:image/jpeg;base64,$b64"),
                                                        "detail" to JsonPrimitive("auto"),
                                                    )
                                                } else {
                                                    null
                                                },
                                                jsonObject("type" to JsonPrimitive("input_text"), "text" to JsonPrimitive(text)),
                                            ),
                                    ),
                                ),
                            ),
                    )
                },
                text = { d ->
                    list(d, "output")
                        .flatMap { (it["content"] as? JsonArray).orEmpty().mapNotNull { c -> c as? JsonObject } }
                        .filter { it["type"].asString == "output_text" }
                        .mapNotNull { it["text"].asString }
                },
            ),
        "google" to
            Provider(
                name = "Google",
                models = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
                headers = { key -> mapOf("x-goog-api-key" to key) },
                // the alias Google moves along to each new Flash
                pick = { d ->
                    val models =
                        list(d, "models")
                            .filter { m ->
                                (m["supportedGenerationMethods"] as? JsonArray)?.any { it.asString == "generateContent" } == true
                            }.map { Model((it["name"].asString ?: "").removePrefix("models/"), it["displayName"].asString) }
                    models.find { it.id == "gemini-flash-latest" } ?: newest(models, Regex("^gemini-(\\d+(?:\\.\\d+)?)-flash$"))
                },
                url = { model -> "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent" },
                lean = parseJson("""{"generationConfig":{"thinkingConfig":{"thinkingLevel":"low"}}}""") as JsonObject,
                body = { _, text, b64 ->
                    jsonObject(
                        "contents" to
                            JsonArray(
                                listOf(
                                    jsonObject(
                                        "role" to JsonPrimitive("user"),
                                        "parts" to
                                            content(
                                                if (b64.isNotEmpty()) {
                                                    jsonObject(
                                                        "inlineData" to
                                                            jsonObject(
                                                                "mimeType" to JsonPrimitive("image/jpeg"),
                                                                "data" to JsonPrimitive(b64),
                                                            ),
                                                    )
                                                } else {
                                                    null
                                                },
                                                jsonObject("text" to JsonPrimitive(text)),
                                            ),
                                    ),
                                ),
                            ),
                    )
                },
                text = { d ->
                    val first = ((d as? JsonObject)?.get("candidates") as? JsonArray)?.firstOrNull() as? JsonObject
                    ((first?.get("content") as? JsonObject)?.get("parts") as? JsonArray)
                        .orEmpty()
                        .mapNotNull { it as? JsonObject }
                        .filter { !it["thought"].truthy }
                        .map { it["text"].asString ?: "" }
                },
            ),
    )

// the prefixes the providers give their keys; Google's newer ones start with AQ.
private fun providerOf(key: String) =
    when {
        key.startsWith("sk-ant-") -> "anthropic"
        Regex("^(AIza|AQ\\.)").containsMatchIn(key) -> "google"
        key.startsWith("sk-") -> "openai"
        else -> ""
    }

class AiFailure(
    val kind: String,
    override val message: String,
    val status: Int = 0,
) : Exception(message)

class AiKey(
    val provider: String,
    val key: String,
    val model: String,
    val name: String,
)

class Ai(
    private val disk: Disk,
    private val http: Http,
    private val products: () -> List<Rec>,
) {
    var on = false
    var key = ""
    var provider = ""
    var model = ""
    var name = ""
    var trouble = "" // why the last photo failed, for the settings

    fun load() {
        val x =
            try {
                disk.read("ai") as? JsonObject
            } catch (e: Exception) {
                report("the own AI key", e)
                null
            }
        on = x?.get("on").asBoolean == true
        key = x?.get("key").asString ?: ""
        provider = x?.get("provider").asString?.takeIf { it in PROVIDERS } ?: ""
        model = x?.get("model").asString ?: ""
        name = x?.get("name").asString ?: ""
    }

    fun toJson() =
        jsonObject(
            "on" to JsonPrimitive(on),
            "key" to JsonPrimitive(key),
            "provider" to JsonPrimitive(provider),
            "model" to JsonPrimitive(model),
            "name" to JsonPrimitive(name),
        )

    fun save() = disk.schedule("ai", { toJson().stringify() to null })

    fun ready() = on && key.isNotEmpty() && PROVIDERS.containsKey(provider) && model.isNotEmpty()

    private fun refused(
        p: Provider,
        status: Int,
        data: String?,
    ): AiFailure {
        val said = data ?: "\"\""
        if (status == 401 ||
            status == 403 ||
            "API_KEY_INVALID" in said
        ) {
            return AiFailure("auth", "${p.name} hat den Schlüssel abgelehnt.", status)
        }
        if (status == 402 || Regex("credit|billing|quota|spend", RegexOption.IGNORE_CASE).containsMatchIn(said)) {
            return AiFailure("money", "Bei ${p.name} ist das Guthaben oder ein Limit aufgebraucht.", status)
        }
        if (status == 429) return AiFailure("busy", "${p.name} ist gerade ausgelastet.", status)
        if (status >= 500) return AiFailure("unavailable", "${p.name} ist gerade gestört.", status)
        return AiFailure("bad", "${p.name} meldet einen Fehler ($status).", status)
    }

    private suspend fun send(
        p: Provider,
        url: String,
        key: String,
        body: JsonObject?,
        timeout: Long,
    ): JsonElement? {
        val headers = LinkedHashMap(p.headers(key))
        if (body != null) headers["Content-Type"] = "application/json"
        // the app's own HTTP, so no browser rule decides which provider may be asked
        val res =
            try {
                http.send(if (body != null) "POST" else "GET", url, headers, body?.stringify(), timeout)
            } catch (e: Http.Offline) {
                throw AiFailure(
                    "offline",
                    if (e.timedOut) "${p.name} hat zu lange nicht geantwortet." else "${p.name} ist nicht erreichbar. Ist das Handy online?",
                )
            }
        val data = res.body?.let { runCatching { parseJson(it) }.getOrNull() }
        if (res.status != 200) throw refused(p, res.status, data?.stringify())
        return data
    }

    private suspend fun pick(
        p: Provider,
        key: String,
    ): Model {
        val found =
            p.pick(send(p, p.models, key, null, CHECK_TIMEOUT))
                ?: throw AiFailure("model", "${p.name} hat für diesen Schlüssel kein passendes Modell.")
        return Model(found.id, found.name ?: found.id)
    }

    private suspend fun ask(
        p: Provider,
        key: String,
        model: String,
        text: String,
        b64: String = "",
    ): String {
        val body = p.body(model, text, b64)
        val answer =
            try {
                send(p, p.url(model), key, JsonObject(body + p.lean), TIMEOUT)
            } catch (e: AiFailure) {
                if (e.status != 400) throw e
                send(p, p.url(model), key, body, TIMEOUT)
            }
        return p.text(answer).joinToString("")
    }

    /** throws with a message for the person who pasted it */
    suspend fun check(input: String): AiKey {
        val key = input.replace(Regex("\\s+"), "")
        val provider = providerOf(key)
        if (provider.isEmpty()) throw AiFailure("input", "Das ist kein Schlüssel von Anthropic, OpenAI oder Google.")
        val p = PROVIDERS.getValue(provider)
        val found = pick(p, key)
        ask(p, key, found.id, "Reply with OK.") // a fraction of a cent, and it shows the key can pay
        return AiKey(provider, key, found.id, found.name ?: found.id)
    }

    // as the server does it: the household's newest varieties, so a known one comes back spelled the same
    private fun prompt(): String {
        val known =
            products()
                .map { Triple((it.str("brand") ?: "").trim(), (it.str("variety") ?: "").trim(), it.num("createdAt") ?: 0.0) }
                .filter { it.first.isNotEmpty() || it.second.isNotEmpty() }
                .sortedByDescending { it.third }
                .take(KNOWN)
                .map { "${it.first} | ${it.second}" }
        return if (known.isNotEmpty()) {
            "$PROMPT\nProducts already known. If it is one of these, use exactly this spelling:\n${known.joinToString(
                "\n",
            )}"
        } else {
            PROMPT
        }
    }

    /** {brand, variety, type} as the server answers, or null when nothing could be made out */
    suspend fun recognize(b64: String): JsonObject? {
        val p = PROVIDERS.getValue(provider)
        val text = prompt()
        val answer =
            try {
                try {
                    ask(p, key, model, text, b64)
                } catch (e: AiFailure) {
                    if (e.status != 404) throw e
                    val m = pick(p, key) // retired: the newest that fits takes over
                    model = m.id
                    name = m.name ?: m.id
                    save()
                    ask(p, key, model, text, b64)
                }
            } catch (e: AiFailure) {
                trouble = e.message
                throw e
            }
        trouble = ""
        val json = Regex("\\{[\\s\\S]*\\}").find(answer.replace(Regex("```(json)?"), "")) ?: return null
        return runCatching { parseJson(json.value) as? JsonObject }.getOrNull() // no JSON is nothing recognised, as on the server
    }
}
