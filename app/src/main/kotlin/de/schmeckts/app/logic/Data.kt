package de.schmeckts.app.logic

import de.schmeckts.app.DAY
import de.schmeckts.app.DEMO
import de.schmeckts.app.Db
import de.schmeckts.app.RATINGS
import de.schmeckts.app.Rec
import de.schmeckts.app.Time
import de.schmeckts.app.at
import de.schmeckts.app.jsonObject
import de.schmeckts.app.localTime
import de.schmeckts.app.num
import de.schmeckts.app.parseJson
import de.schmeckts.app.petMap
import de.schmeckts.app.pets
import de.schmeckts.app.report
import de.schmeckts.app.servedAt
import de.schmeckts.app.stringify
import de.schmeckts.app.tidy
import de.schmeckts.app.uid
import de.schmeckts.app.yearOf
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// with a server, import and delete apply to the whole household

// made up, but it has to look like a phone in use so every evaluation has something to show
private class Planned(
    val brand: String,
    val variety: String,
    val type: String,
    val ratings: List<String>,
)

private val DEMO_PLAN =
    listOf(
        Planned("Sheba", "Lachs in Soße", "Nassfutter", listOf("top", "top", "gut", "mittel")),
        Planned("Felix", "Huhn in Gelee", "Nassfutter", listOf("top", "gut", "gut", "top", "gut")),
        Planned("Felix", "Rind in Gelee", "Nassfutter", listOf("top", "gut", "top", "top", "gut")),
        Planned("Whiskas", "Thunfisch in Soße", "Nassfutter", listOf("sosse", "sosse", "mittel")),
        Planned("Kitekat", "Geflügel in Soße", "Nassfutter", listOf("sosse", "gut", "sosse")),
        Planned("Gourmet", "Rind Pastete", "Nassfutter", listOf("schlecht", "schlecht", "mittel", "schlecht")),
        Planned("Animonda Carny", "Pute Pastete", "Nassfutter", listOf("mittel", "gut")),
        Planned("Dreamies", "Käse", "Snack", listOf("verputzt", "verputzt")),
    )
private val DEMO_PEOPLE = listOf("Anna", "Jonas")
private val DEMO_SLOTS = listOf(7.25, 18.1, 12.5, 19.4) // hours of the day
private const val DEMO_CALM = 6 // newest meals without weak ratings, so the sample never reports a decline
private const val DEMO_RATED_AFTER = 2 * 3_600_000L
private const val DEMO_OPEN_AGO = 2 * 3_600_000L

private fun demoId() = DEMO + uid()

class Data(
    l: Logic,
) : Part(l) {
    fun wipe() {
        val house = ph.sync.isConnected()
        ph.store.replaceDb(Db())
        ph.photos.sweepPhotos(emptySet())
        prefs.lastPets = emptyList()
        prefs.activePet = "all"
        save()
        savePrefs()
        haptic("strong")
        afterClose {
            update()
            toast(if (house) "Alle Daten im Haushalt gelöscht" else "Alle Daten gelöscht")
        }
    }

    suspend fun exportData() {
        ph.platform.clearExports()
        // household data only, no device settings
        val json = JsonObject(db.toJson() + ("exportedAt" to JsonPrimitive(isoNow()))).stringify()
        val name = "schmeckts-backup-${utcDay()}.json"
        try {
            ph.platform.shareFile(name, json, "Schmeckt’s-Backup", "Backup sichern oder senden")
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            report("backup", e)
            toast("Das Backup konnte nicht geteilt werden.")
        }
    }

    /** a fixture for tests/fixtures/ocr; a person checks it before it goes into the tests */
    suspend fun exportReading() {
        val r = ph.recognize.last ?: return toast("Noch kein Foto gelesen.")
        ph.platform.clearExports()
        val p = d.getProduct(d.getServing(r.meal)?.str("productId"))
        val taken = iso(r.at)
        val timing = ph.recognize.timing
        val fields =
            listOfNotNull(
                "about" to JsonPrimitive(if (p != null) listOfNotNull(p.str("brand"), p.str("variety")).filter { it.isNotEmpty() }.joinToString(" ") else ""),
                "taken" to JsonPrimitive(taken),
                "app" to JsonPrimitive(ph.platform.version),
                "width" to num(r.first.width),
                "height" to num(r.first.height),
                "ms" to num(r.first.ms),
                if (timing) {
                    "timings" to JsonObject(ph.recognize.timings.mapKeys { it.key.toString() }.mapValues { (_, v) -> JsonArray(v.map { num(it) }) })
                } else {
                    null
                },
                "expected" to
                    jsonObject(
                        "brand" to if (p != null) JsonPrimitive(p.str("brand") ?: "") else JsonNull, // null: not named yet, filled in by hand
                        "variety" to if (p != null) JsonPrimitive(p.str("variety") ?: "") else JsonNull,
                        "type" to (p?.str("type")?.ifEmpty { null }?.let { JsonPrimitive(it) } ?: JsonNull),
                        "texture" to (p?.str("texture")?.ifEmpty { null }?.let { JsonPrimitive(it) } ?: JsonNull),
                        "locked" to JsonPrimitive(false),
                    ),
                "result" to (r.first.raw ?: JsonNull),
                r.second?.let { s ->
                    "second" to
                        jsonObject(
                            "crop" to
                                jsonObject(
                                    "left" to num(s.crop.left),
                                    "top" to num(s.crop.top),
                                    "right" to num(s.crop.right),
                                    "bottom" to num(s.crop.bottom),
                                ),
                            "scale" to num(s.scale),
                            "width" to num(s.read.width),
                            "height" to num(s.read.height),
                            "ms" to num(s.read.ms),
                            "result" to (s.read.raw ?: JsonNull),
                        )
                },
            )
        // one field per line, the expectations get edited by hand
        val json = "{\n" + fields.joinToString(",\n") { (k, v) -> "  ${JsonPrimitive(k)}: ${v.stringify()}" } + "\n}\n"
        val name = "schmeckts-ocr-${taken.take(19).replace(Regex("[T:]"), "-")}.json"
        try {
            ph.platform.shareFile(name, json, name, "Gelesenen Text teilen")
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            report("reading as a fixture", e)
            toast("Der gelesene Text konnte nicht geteilt werden.")
        }
    }

    suspend fun importData() {
        val text = ph.platform.pickFile() ?: return
        importText(text)
    }

    fun importText(text: String) {
        try {
            val d = parseJson(text) as JsonObject
            if (listOf("servings", "pets", "products").any { d[it] !is JsonArray }) throw IllegalArgumentException("Format")
            val prev = db
            ph.store.replaceDb(tidy(d))
            save()
            val msg = if (ph.sync.isConnected()) "Backup in den Haushalt importiert" else "Backup importiert"
            afterClose {
                update()
                toast(msg, {
                    ph.store.replaceDb(prev)
                    save()
                    update()
                })
            }
        } catch (e: Exception) {
            toast("Diese Datei ist kein gültiges Backup.")
        }
    }

    fun loadDemo() {
        if (ph.sync.isConnected()) return
        val pet =
            Rec(
                jsonObject(
                    "id" to JsonPrimitive(demoId()),
                    "name" to JsonPrimitive("Mau"),
                    "species" to JsonPrimitive("Katze"),
                    "photo" to JsonNull,
                    "createdAt" to num(Time.now()),
                ),
            )
        db.pets.add(pet)
        val made = demoMeals(pet)
        db.servings.addAll(made)
        db.servings.sortByDescending { it.servedAt }
        db.observations.addAll(demoObservations(pet, made))
        db.observations.sortByDescending { it.at }
        save()
        afterClose {
            update()
            toast("Beispieldaten geladen")
        }
    }

    private fun demoMeals(pet: Rec): MutableList<Rec> {
        val made = mutableListOf<Rec>()
        val byBrand = HashMap<String, Rec>()
        for (x in DEMO_PLAN) {
            val p = l.products.newProduct(Details(x.brand, x.variety, x.type), demoId())
            p["lastPets"] = JsonArray(listOf(JsonPrimitive(pet.id)))
            byBrand.getOrPut(x.brand) { p }
            for (r in x.ratings) {
                made.add(
                    Rec(
                        jsonObject(
                            "id" to JsonPrimitive(demoId()),
                            "productId" to JsonPrimitive(p.id),
                            "servedAt" to num(0),
                            "pets" to JsonObject(mapOf(pet.id to jsonObject("r" to JsonPrimitive(r), "at" to JsonNull))),
                            "note" to JsonPrimitive(""),
                        ),
                    ),
                )
            }
        }
        spreadOverDays(made, pet)
        made[3].put("note", "Neue Packung")
        // one unrated meal, so the rating prompt is not empty
        made.add(
            Rec(
                jsonObject(
                    "id" to JsonPrimitive(demoId()),
                    "productId" to JsonPrimitive(byBrand.getValue("Felix").id),
                    "servedAt" to num(Time.now() - DEMO_OPEN_AGO),
                    "pets" to petMap(listOf(pet.id)),
                    "note" to JsonPrimitive(""),
                    "by" to JsonPrimitive("Anna"),
                ),
            ),
        )
        return made
    }

    // so the diary and the preferences have something to show
    private fun demoObservations(
        pet: Rec,
        made: List<Rec>,
    ): List<Rec> {
        val now = Time.now()
        val pastete = made.find { d.getProduct(it.str("productId"))?.str("variety") == "Rind Pastete" && it.servedAt < now - DAY }
        val three = now - 3 * DAY
        val tired = localTime(yearOf(three), de.schmeckts.app.monthOf(three), de.schmeckts.app.dateOf(three), 15, 10)
        val seen = { kind: String, at: Long, by: String ->
            Rec(
                jsonObject(
                    "id" to JsonPrimitive(demoId()),
                    "kind" to JsonPrimitive(kind),
                    "at" to num(at),
                    "pets" to JsonObject(mapOf(pet.id to JsonPrimitive(true))),
                    "by" to JsonPrimitive(by),
                ),
            )
        }
        return listOfNotNull(pastete?.let { seen("stink", it.servedAt + 5 * 3_600_000L, "Jonas") }, seen("tired", tired, "Anna"))
    }

    private fun spreadOverDays(
        made: MutableList<Rec>,
        pet: Rec,
    ) {
        val now = Time.now()
        made.shuffle()
        val score = { s: Rec -> RATINGS.getValue((s.pets[pet.id] as JsonObject)["r"]!!.let { (it as JsonPrimitive).content }).score }
        val calm = made.filter { score(it) >= 50 }.take(DEMO_CALM).toSet()
        made.sortBy { if (it in calm) 0 else 1 }
        made.forEachIndexed { i, s ->
            val day = now - ((i / 2) + 1) * DAY
            val h = DEMO_SLOTS[(i * 3) % DEMO_SLOTS.size] + Math.random() * 0.6
            val at = localTime(yearOf(day), de.schmeckts.app.monthOf(day), de.schmeckts.app.dateOf(day), h.toInt(), ((h % 1) * 60).toInt())
            s["servedAt"] = num(at)
            s.put("by", DEMO_PEOPLE[i % 2])
            s["pets"] = JsonObject(s.pets.mapValues { (_, x) -> JsonObject((x as JsonObject) + ("at" to num(at + DEMO_RATED_AFTER))) })
        }
    }

    /** before connecting, so none of the sample reaches the household */
    fun purgeDemo() {
        val demo = { id: String -> id.startsWith(DEMO) }
        val pets = db.pets.filter { demo(it.id) }.map { it.id }.toSet()
        val onlyDemo = { s: Rec -> s.pets.isNotEmpty() && s.pets.keys.all { it in pets } }
        val servings = db.servings.filter { demo(it.id) || onlyDemo(it) }.map { it.id }.toSet()
        val used = db.servings.filter { it.id !in servings }.map { it.str("productId") }.toSet()
        val fromDemo = db.servings.filter { it.id in servings }.map { it.str("productId") }.toSet()
        val products = db.products.filter { it.id !in used && (demo(it.id) || it.id in fromDemo) }.map { it.id }.toSet()
        val observations = db.observations.filter { demo(it.id) || onlyDemo(it) }.map { it.id }.toSet()
        if (pets.isEmpty() && servings.isEmpty() && products.isEmpty() && observations.isEmpty()) return
        ph.store.purge(mapOf("pets" to pets, "products" to products, "servings" to servings, "observations" to observations))
        var touched = false // mixed records stay, minus the sample pet
        for (s in db.servings + db.observations) {
            if (s.pets.keys.any { it in pets }) {
                s["pets"] = JsonObject(s.pets.filterKeys { it !in pets })
                touched = true
            }
        }
        prefs.lastPets = prefs.lastPets.filter { it !in pets }
        savePrefs()
        if (touched) save()
    }
}

/** an instant as toISOString() writes it */
fun iso(t: Long): String {
    val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.ROOT)
    f.timeZone = java.util.TimeZone.getTimeZone("UTC")
    return f.format(java.util.Date(t))
}

fun isoNow() = iso(Time.now())
