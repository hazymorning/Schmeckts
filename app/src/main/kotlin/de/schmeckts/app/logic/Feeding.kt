package de.schmeckts.app.logic

import de.schmeckts.app.AiFailure
import de.schmeckts.app.Identified
import de.schmeckts.app.Lines
import de.schmeckts.app.Picture
import de.schmeckts.app.READ_MAX
import de.schmeckts.app.READ_PATIENCE
import de.schmeckts.app.READ_QUALITY
import de.schmeckts.app.Reading
import de.schmeckts.app.Rec
import de.schmeckts.app.ServerError
import de.schmeckts.app.Time
import de.schmeckts.app.addSentence
import de.schmeckts.app.asString
import de.schmeckts.app.esc
import de.schmeckts.app.jsonObject
import de.schmeckts.app.num
import de.schmeckts.app.petMap
import de.schmeckts.app.pets
import de.schmeckts.app.pname
import de.schmeckts.app.report
import de.schmeckts.app.truthy
import de.schmeckts.app.textSquare
import de.schmeckts.app.uid
import de.schmeckts.app.ui.CameraFailed
import de.schmeckts.app.ui.SheetState
import de.schmeckts.app.views.lower
import de.schmeckts.app.views.record
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okio.ByteString.Companion.toByteString

// the photo stays on this phone, only the preview is synced

private val PAUSE = listOf(0L, 30_000L, 2 * 60_000L, 10 * 60_000L, 30 * 60_000L) // ms; no automatic attempt after the last
private const val BUSY_PAUSE = 90_000L // the server's cost brake lets one photo through per 90 s

private class Tries(
    var n: Int = 0,
    var next: Long = 0,
)

class Feeding(
    l: Logic,
) : Part(l) {
    private val running = HashMap<String, String>() // meal → the photo being recognised, so a new photo supersedes the run
    private val tries = HashMap<String, Tries>() // meal → attempts and the earliest next one

    private fun meal(
        ids: List<String>,
        scanCode: String,
        extra: Map<String, kotlinx.serialization.json.JsonElement> = emptyMap(),
    ): Rec {
        val s =
            Rec(
                jsonObject(
                    "id" to JsonPrimitive(uid()),
                    "productId" to JsonNull,
                    "servedAt" to num(Time.now()),
                    "pets" to petMap(ids),
                    "note" to JsonPrimitive(""),
                    "by" to d.byMe(),
                ),
            )
        for ((k, v) in extra) s[k] = v
        if (scanCode.isNotEmpty()) s.put("scanCode", scanCode)
        return s
    }

    fun serveProduct(
        pid: String,
        scanCode: String = "",
    ) {
        val p = d.getProduct(pid) ?: return
        val ids = d.defaultPets(p).ids
        val s = meal(ids, scanCode)
        db.servings.add(0, s)
        l.products.linkProduct(s, p)
        prefs.lastPets = ids
        save()
        savePrefs()
        served(s.id)
        update()
        ui.home.top++
        servedToast(s.id)
    }

    /** also once a meal just photographed is named */
    fun servedToast(id: String) {
        val s = d.getServing(id)
        val p = d.getProduct(s?.str("productId")) ?: return
        val msg = "${pname(p)} für ${d.calledNames(s!!.pets.keys.toList(), s.id)}. ${onRecord(p).ifEmpty { "Guten Appetit!" }}"
        toast(msg, { undoServe(id) }, icon = "bowl")
    }

    // a variety that goes down badly, or that nobody buys any more, shows its record as it is served
    private fun onRecord(p: Rec): String {
        val past = ph.record(d.sortOf(p.id))
        return if (past.isNotEmpty()) "Zuletzt ${lower(past)}." else ""
    }

    private fun served(id: String) {
        haptic("success")
        ui.home.fresh = id
        ui.home.fills++
        l.reminders.syncReminders()
    }

    private fun undoServe(id: String) {
        val s = d.getServing(id) ?: return
        db.servings.removeAll { it.id == id }
        ph.photos.mem.remove(id)
        ph.recognize.memLines.remove(id)
        ph.recognize.seenBy.remove(id)
        tries.remove(id)
        s.str("productId")?.ifEmpty { null }?.let { l.products.cleanupProduct(it) }
        if (sheet?.kind == "serving" && sheet?.id == id) ui.sheets.closeSheet()
        save()
        update()
    }

    private fun bytesOf(photo: ByteArray) = photo.toByteString().base64()

    // null on cancel or when nothing could take the photo
    private suspend fun packagingPhoto(hint: String): ByteArray? =
        try {
            ui.camera.openCamera(hint.ifEmpty { "Packung fotografieren" })
        } catch (e: CameraFailed) {
            report("our own camera", e)
            try {
                ph.platform.takePhoto(hint)
            } catch (err: Exception) {
                if (err is CancellationException) throw err
                toast("Die Kamera ließ sich nicht öffnen. Ist sie in den Android-Einstellungen erlaubt?")
                null
            }
        }

    suspend fun shootPhoto(
        hint: String = "",
        scanCode: String = "",
    ): Boolean {
        val photo = packagingPhoto(hint) ?: return false
        servePhoto(photo, scanCode)
        return true
    }

    suspend fun reshootProduct(pid: String) {
        if (d.getProduct(pid) == null) return
        val photo = packagingPhoto("") ?: return
        productPhotoFile(photo, pid)
    }

    private fun decode(photo: ByteArray): Picture? {
        val img = ph.platform.pictures.decode(bytesOf(photo))
        if (img == null) toast("Das Foto ließ sich nicht lesen.")
        return img
    }

    fun productPhotoFile(
        photo: ByteArray,
        pid: String,
    ) {
        if (d.getProduct(pid) == null) return
        val img = decode(photo) ?: return
        l.products.replaceProductPhoto(pid, img)
        renderSheet()
        update()
    }

    suspend fun rephoto() {
        val id = if (sheet?.kind == "serving" && sheet?.step == "name") sheet?.id else null
        if (id == null) return
        val photo = packagingPhoto("") ?: return
        replacePhoto(id, photo)
    }

    // the large copy for reading is made only once the meal is on screen; a failure reads the 1100 px copy instead
    private fun readable(img: Picture) =
        try {
            ph.platform.pictures.resize(img, READ_MAX, READ_QUALITY).substringAfter(",")
        } catch (e: Exception) {
            report("the photo for reading", e)
            ""
        }

    /** scanCode: an unknown barcode, attached to the variety once it is known */
    suspend fun servePhoto(
        photo: ByteArray,
        scanCode: String = "",
    ) {
        if (db.pets.isEmpty()) return
        val img = decode(photo) ?: return
        val pics = ph.platform.pictures
        val full = pics.resize(img, 1100, 0.82)
        val local = !ph.recognize.photoByAI()
        val (ids, auto) = d.defaultPets(null).let { it.ids to it.auto }
        val s =
            meal(
                ids,
                scanCode,
                mapOf(
                    "photo" to JsonPrimitive(pics.resize(img, 480, 0.74)),
                    "thumb" to JsonPrimitive(pics.square(img, 200, 0.76)),
                    "status" to JsonPrimitive(if (local) "noserver" else "recognizing"),
                    "autoPets" to JsonPrimitive(auto),
                ),
            )
        db.servings.add(0, s)
        ph.photos.mem[s.id] = full.substringAfter(",")
        prefs.lastPets = ids
        save()
        savePrefs()
        served(s.id)
        ui.sheets.closeAll().await()
        update()
        ui.home.top++
        // fresh: once named, the meal is rated on the home page like any other
        if (local) {
            ui.sheets.openSheet(
                SheetState("serving", "id" to s.id, "step" to "name", "fresh" to true, "brand" to "", "variety" to "", "type" to "Nassfutter"),
            )
        }
        toast(
            "${if (db.pets.size > 1) d.petNames(ids) + " gefüttert" else "Gefüttert"}${if (local) "" else ". Sorte wird erkannt …"}",
            { undoServe(s.id) },
            icon = "bowl",
        )
        val sharp = if (local) readable(img) else ""
        recognizeServing(s.id, sharp)
    }

    /** sizes as in servePhoto(); everything the old photo brought goes */
    suspend fun replacePhoto(
        id: String,
        photo: ByteArray,
    ) {
        val s = d.getServing(id) ?: return
        if (!s.str("productId").isNullOrEmpty()) return
        val img = decode(photo) ?: return
        val pics = ph.platform.pictures
        running.remove(id) // a run for the old photo no longer counts
        val full = pics.resize(img, 1100, 0.82)
        s.put("photo", pics.resize(img, 480, 0.74))
        s.put("thumb", pics.square(img, 200, 0.76))
        s.put("status", if (ph.recognize.photoByAI()) "recognizing" else "noserver")
        s.remove("guess")
        s.remove("error")
        ph.photos.mem[id] = full.substringAfter(",")
        ph.recognize.memLines.remove(id)
        tries.remove(id)
        val sh = sheet
        if (sh?.kind == "serving" && sh.id == id) sh.assign("brand" to "", "variety" to "", "type" to "Nassfutter", "texture" to null)
        save()
        recognizeServing(id, readable(img))
    }

    fun retryNow(id: String) {
        tries.remove(id)
        launch { recognizeServing(id) }
    }

    private suspend fun recognizeServing(
        id: String,
        sharp: String = "",
    ) {
        val s = d.getServing(id) ?: return
        val b64 = ph.photos.mem[id] ?: s.str("photo")?.substringAfter(",", "")?.ifEmpty { null }
        if (b64 == null) {
            if (s.str("productId").isNullOrEmpty() && !s.str("status").isNullOrEmpty()) {
                s.put("status", "failed")
                s.put("error", "Das Foto ist nicht mehr da. Bitte die Sorte eintragen.")
                save()
                refreshServing(id)
            }
            return
        }
        if (running[id] == b64) return
        running[id] = b64
        val house = ph.recognize.photoByServer()
        val asked = ph.recognize.photoByAI()
        s.put("status", if (asked) "recognizing" else "reading")
        s.remove("error")
        ph.recognize.readingSince[id] = Time.now()
        if (!asked) {
            launch {
                delay(READ_PATIENCE)
                if (d.getServing(id)?.str("status") == "reading") refreshServing(id)
            }
        }
        save()
        refreshServing(id)
        var found = Identified("")
        try {
            found = ph.recognize.identify(code = s.str("scanCode") ?: "", photo = b64, sharp = sharp, meal = id)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            report("recognition", e)
        }
        val thumb = found.read?.let { textThumb(b64, it) }
        if (running[id] != b64) return // superseded by a new photo
        running.remove(id)
        ph.recognize.readingSince.remove(id)
        val cur = d.getServing(id) ?: return
        if (!cur.str("productId").isNullOrEmpty()) {
            settle(cur) // named meanwhile, here or on another phone
        } else {
            if (thumb != null) cur.put("thumb", thumb) // first, as linking hands the thumbnail on to the variety
            takeResult(cur, found, house)
        }
        save()
        refreshServing(id)
    }

    // the square around the packaging's text; null keeps the centre square
    private fun textThumb(
        b64: String,
        read: Reading,
    ): String? =
        try {
            val img = ph.platform.pictures.decode(b64)
            val square = img?.let { textSquare(read, it.width, it.height) }
            if (img != null && square != null) ph.platform.pictures.square(img, 200, 0.76, square) else null
        } catch (e: Exception) {
            report("the thumbnail around the text", e)
            null
        }

    private fun kindOf(e: Exception?) =
        when (e) {
            is ServerError -> e.kind
            is AiFailure -> e.kind
            else -> ""
        }

    private fun takeResult(
        s: Rec,
        found: Identified,
        house: Boolean,
    ) {
        val err = found.error
        val why = if (kindOf(err).isNotEmpty()) err?.message ?: "" else "" // why no AI named it, said while naming
        if (found.lines.isNotEmpty() || found.brands.isNotEmpty()) ph.recognize.memLines[s.id] = Lines(found.lines, found.brands)
        val products = found.products.orEmpty()
        val details = found.details
        when {
            products.isNotEmpty() -> {
                tries.remove(s.id)
                if (found.source == "text") recognized(s, products[0]) else l.products.linkProduct(s, products[0])
            }
            details != null && found.source != "text" -> {
                tries.remove(s.id)
                refinePets(s, d.findProduct(details.brand, details.variety))
                l.products.applyProduct(s, Details(details.brand, details.variety, details.type, details.texture))
                found.via?.let { ph.recognize.seenBy[s.id] = it }
                val sh = sheet
                if (sh?.kind == "serving" && sh.id == s.id && sh.step == "name" && sh.str("brand").isEmpty() && sh.str("variety").isEmpty()) sh.step = null
            }
            details != null -> {
                // read by the phone: a person confirms it while naming
                tries.remove(s.id)
                s["guess"] =
                    jsonObject(
                        "brand" to JsonPrimitive(details.brand),
                        "variety" to JsonPrimitive(details.variety),
                        "type" to details.type?.let { JsonPrimitive(it) },
                        "texture" to details.texture?.let { JsonPrimitive(it) },
                    )
                s.put("status", "noserver")
                setWhy(s, why)
                fillName(s.id, s.obj("guess")!!)
            }
            !house -> {
                s.put("status", "noserver")
                setWhy(s, why)
            }
            err is ServerError && err.retry -> waitForAnotherTry(s, err)
            else -> {
                s.put("status", "failed")
                s.put("error", err?.message ?: "Packung nicht erkannt.")
            }
        }
    }

    private fun setWhy(
        s: Rec,
        why: String,
    ) = if (why.isNotEmpty()) s.put("error", why) else s.remove("error")

    // keeps what linking changes for as long as the toast offers to undo it
    private fun recognized(
        s: Rec,
        p: Rec,
    ) {
        val guess =
            jsonObject(
                "brand" to JsonPrimitive(p.str("brand") ?: ""),
                "variety" to JsonPrimitive(p.str("variety") ?: ""),
                "type" to JsonPrimitive(p.str("type") ?: ""),
                "texture" to p.str("texture")?.ifEmpty { null }?.let { JsonPrimitive(it) },
            )
        val code = s.str("scanCode")
        val was =
            Was(
                s.str("photo"),
                s.str("thumb"),
                guess,
                ph.photos.mem[s.id],
                ph.recognize.memLines[s.id],
                p.str("thumb"),
                p["lastPets"],
                code.isNullOrEmpty() || p.obj("codes")?.get(code) != null,
            )
        l.products.linkProduct(s, p)
        ph.recognize.seenBy[s.id] = "phone"
        val naming = sheet?.kind == "serving" && sheet?.id == s.id
        val said = "Erkannt: <b>${esc(pname(p))}</b>"
        val past = onRecord(p)
        val tell = { toast(if (past.isNotEmpty()) addSentence(said, esc(past)) else said, { unrecognize(s.id, p.id, was) }, icon = "bowl", html = true) }
        if (naming) afterClose(tell) else tell()
    }

    private class Was(
        val photo: String?,
        val thumb: String?,
        val guess: JsonObject,
        val mem: String?,
        val lines: Lines?,
        val productThumb: String?,
        val lastPets: kotlinx.serialization.json.JsonElement?,
        val code: Boolean,
    )

    // undoes the recognition, not the meal; a photo keepPhoto() wrote stays, it shows the right packaging
    private fun unrecognize(
        id: String,
        pid: String,
        was: Was,
    ) {
        val s = d.getServing(id) ?: return
        val p = d.getProduct(pid)
        if (s.str("productId") != pid) return
        s["productId"] = JsonNull
        s.put("status", "noserver")
        s["guess"] = was.guess
        ph.recognize.seenBy.remove(id)
        was.photo?.let { s.put("photo", it) }
        was.thumb?.let { s.put("thumb", it) }
        was.mem?.let { ph.photos.mem[id] = it }
        was.lines?.let { ph.recognize.memLines[id] = it }
        if (p != null) {
            if (was.productThumb != null) p.put("thumb", was.productThumb) else p.remove("thumb")
            if (was.lastPets != null) p["lastPets"] = was.lastPets else p.remove("lastPets")
            val code = s.str("scanCode")
            if (!was.code && code != null) p["codes"] = JsonObject((p.obj("codes") ?: emptyMap()) - code)
        }
        save()
        update()
        ui.sheets.openSheet(SheetState("serving", "id" to id, "step" to "name", "fresh" to true, *guessOf(s)))
    }

    private fun waitForAnotherTry(
        s: Rec,
        err: ServerError,
    ) {
        val t = tries[s.id] ?: Tries()
        if (err.kind != "offline" || err.timeout) t.n++ // an unreachable server costs nothing, so it does not count
        if (t.n >= PAUSE.size) {
            tries.remove(s.id)
            s.put("status", "failed")
            s.put("error", err.message)
            return
        }
        t.next = Time.now() + if (err.kind == "busy") BUSY_PAUSE else PAUSE[t.n]
        tries[s.id] = t
        s.put("status", "waiting")
        s.put(
            "error",
            if (err.kind == "offline" && !err.timeout) {
                "Der Server ist gerade nicht erreichbar. Die Sorte wird erkannt, sobald er wieder da ist."
            } else {
                "${err.message} Die App versucht es später automatisch noch einmal."
            },
        )
    }

    // empty fields only, so typing in the other field keeps its place
    private fun fillName(
        id: String,
        guess: JsonObject,
    ) {
        val sh = sheet ?: return
        if (sh.kind != "serving" || sh.id != id || sh.step != "name") return
        val typed = listOf("brand", "variety").filter { sh.str(it).trim().isNotEmpty() }
        for (f in listOf("brand", "variety")) {
            val v = guess[f].asString
            if (f in typed || v.isNullOrEmpty()) continue
            sh[f] = v
            sh["error"] = ""
        }
        if (typed.isEmpty()) sh.assign("type" to (guess["type"].asString?.ifEmpty { null } ?: sh.str("type")), "texture" to guess["texture"].asString)
    }

    fun guessOf(s: Rec?): Array<Pair<String, Any?>> {
        val g = s?.obj("guess")
        return arrayOf(
            "brand" to (g?.get("brand").asString ?: ""),
            "variety" to (g?.get("variety").asString ?: ""),
            "type" to (g?.get("type").asString?.ifEmpty { null } ?: "Nassfutter"),
            "texture" to g?.get("texture").asString,
        )
    }

    private fun settle(s: Rec) {
        val p = d.getProduct(s.str("productId"))
        if (p != null) {
            l.products.linkProduct(s, p)
        } else {
            // the variety has not arrived here yet
            (ph.photos.mem[s.id] ?: s.str("photo")?.substringAfter(",", "")?.ifEmpty { null })?.let { ph.photos.keepPhoto(s.str("productId")!!, it, s.id) }
            for (k in listOf("photo", "status", "error", "autoPets", "guess")) s.remove(k)
            ph.photos.mem.remove(s.id)
            ph.recognize.memLines.remove(s.id)
        }
        tries.remove(s.id)
    }

    /** refresh false: the caller redraws everything anyway */
    fun settleNamed(refresh: Boolean = true) {
        val named = db.servings.filter { !it.str("productId").isNullOrEmpty() && (it.has("status") || it.has("photo")) }
        for (s in named) settle(s)
        if (named.isEmpty()) return
        save()
        if (refresh) for (s in named) refreshServing(s.id)
    }

    private var retrying = false

    suspend fun retryWaiting() {
        settleNamed()
        if (retrying || !ph.recognize.photoByServer()) return
        retrying = true
        try {
            for (s in db.servings.toList()) {
                if (!s.str("productId").isNullOrEmpty()) {
                    if (s.has("status") || s.has("photo")) {
                        settle(s)
                        save()
                        refreshServing(s.id)
                    }
                    continue
                }
                val st = s.str("status")
                if (st != "waiting" && st != "noserver") continue
                if (s.has("guess")) continue // a person confirms the phone's reading while naming
                if ((tries[s.id]?.next ?: 0) > Time.now()) continue
                recognizeServing(s.id)
            }
        } finally {
            retrying = false
        }
    }

    private fun refreshServing(id: String) {
        update()
        if (ui.sheets.isClosing() || sheet?.kind != "serving" || sheet?.id != id) return
        renderSheet()
    }

    fun refinePets(
        s: Rec,
        known: Rec?,
    ) {
        if (!s["autoPets"].truthy || db.pets.size < 2) return
        if (s.pets.values.any { (it as? JsonObject)?.get("r").truthy }) return
        val pref = (known?.get("lastPets") as? JsonArray).orEmpty().mapNotNull { it.asString }.filter { d.getPet(it) != null }
        if (pref.isNotEmpty()) s["pets"] = petMap(pref)
    }
}
