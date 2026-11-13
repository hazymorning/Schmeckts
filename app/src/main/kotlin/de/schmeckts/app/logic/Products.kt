package de.schmeckts.app.logic

import de.schmeckts.app.Picture
import de.schmeckts.app.Rec
import de.schmeckts.app.ServerError
import de.schmeckts.app.TYPES
import de.schmeckts.app.Time
import de.schmeckts.app.asString
import de.schmeckts.app.guessTexture
import de.schmeckts.app.jsonObject
import de.schmeckts.app.num
import de.schmeckts.app.pets
import de.schmeckts.app.report
import de.schmeckts.app.serverStamp
import de.schmeckts.app.textureOf
import de.schmeckts.app.truthy
import de.schmeckts.app.typeOfName
import de.schmeckts.app.uid
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// barcodes reach a variety only in linkProduct, so a multipack grows and a wrong variety takes its code with it

/** what is known of a variety: brand, variety, type and texture; userType: chosen by a person, which wins */
class Details(
    val brand: String = "",
    val variety: String = "",
    val type: String? = null,
    val texture: String? = null,
    val userType: Boolean = false,
    val textureGiven: Boolean = false,
    val thumb: String? = null,
)

class Products(
    l: Logic,
) : Part(l) {
    /** overrides the computed verdict household-wide; any other value means automatic */
    fun setKaufen(
        id: String,
        v: String?,
    ) {
        val p = d.getProduct(id) ?: return
        if (v == "immer" || v == "nicht") p.put("kaufen", v) else p.remove("kaufen")
        save()
    }

    suspend fun shareShopping() {
        val list = d.shoppingList()
        try {
            if (ph.platform.shareText(list.title, list.text) == "copied") toast("Liste kopiert")
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            toast("Die Liste konnte nicht geteilt werden.") // shareText() already swallows a cancel
        }
    }

    fun cleanupProduct(pid: String) {
        if (db.servings.none { it.str("productId") == pid }) db.products.removeAll { it.id == pid }
    }

    /** the person's choice wins (userType, null = none), then an existing value, the server's, the keywords */
    fun applyTexture(
        p: Rec,
        details: Details = Details(),
    ) {
        val fits = { v: String? -> if (textureOf(p, v) != null) v else null }
        val v =
            if (details.userType && details.textureGiven) {
                fits(details.texture)
            } else {
                fits(p.str("texture")) ?: fits(details.texture) ?: guessTexture(p)
            }
        if (v != null) p.put("texture", v) else p.remove("texture")
    }

    fun toggleTexture(
        id: String,
        v: String,
    ) {
        val p = d.getProduct(id) ?: return
        applyTexture(p, Details(texture = if (p.str("texture") == v) null else v, userType = true, textureGiven = true))
        save()
    }

    fun newProduct(
        details: Details,
        id: String = uid(),
    ): Rec {
        val p =
            Rec(
                jsonObject(
                    "id" to JsonPrimitive(id),
                    "brand" to JsonPrimitive(details.brand),
                    "variety" to JsonPrimitive(details.variety),
                    "type" to JsonPrimitive(typeOfName(details.type)),
                    "thumb" to (details.thumb?.let { JsonPrimitive(it) } ?: JsonNull),
                    "lastPets" to JsonArray(emptyList()),
                    "codes" to JsonObject(emptyMap()),
                    "createdAt" to num(Time.now()),
                ),
            )
        applyTexture(p, details)
        db.products.add(p)
        return p
    }

    fun applyProduct(
        s: Rec,
        details: Details,
    ): Rec {
        var p = d.findProduct(details.brand, details.variety)
        if (p == null) {
            p =
                newProduct(
                    Details(
                        details.brand,
                        details.variety,
                        details.type,
                        details.texture,
                        details.userType,
                        details.textureGiven,
                        s.str("thumb"),
                    ),
                )
        } else {
            if (details.userType && details.type in TYPES) p.put("type", details.type)
            applyTexture(p, details)
        }
        linkProduct(s, p)
        return p
    }

    fun linkProduct(
        s: Rec,
        p: Rec,
    ) {
        val prev = s.str("productId")
        val photos = ph.photos
        if (p.str("thumb").isNullOrEmpty() && !s.str("thumb").isNullOrEmpty()) p.put("thumb", s.str("thumb"))
        s.put("productId", p.id)
        p["lastPets"] = JsonArray(s.pets.keys.map { JsonPrimitive(it) })
        val code = s.str("scanCode")
        if (!code.isNullOrEmpty()) p["codes"] = JsonObject((p.obj("codes") ?: emptyMap()) + (code to JsonPrimitive(true)))
        (photos.mem[s.id] ?: s.str("photo")?.substringAfter(",", "")?.ifEmpty { null })?.let { photos.keepPhoto(p.id, it, s.id) }
        for (k in listOf("photo", "thumb", "status", "error", "autoPets", "guess")) s.remove(k)
        photos.mem.remove(s.id)
        ph.recognize.memLines.remove(s.id)
        ph.recognize.seenBy.remove(s.id)
        if (!prev.isNullOrEmpty() && prev != p.id) {
            // corrected: the photo follows if it came from this meal or the old variety has no meal left
            val last = db.servings.none { it.str("productId") == prev }
            val was = d.getProduct(prev)
            if (last && p.str("thumb").isNullOrEmpty() && !was?.str("thumb").isNullOrEmpty()) p.put("thumb", was!!.str("thumb"))
            if (last || photos.photoFrom(prev) == s.id) photos.passPhoto(prev, p.id)
            cleanupProduct(prev)
        }
    }

    fun mergeProducts(
        from: Rec,
        into: Rec,
    ) {
        ph.photos.passPhoto(from.id, into.id)
        db.servings.forEach { if (it.str("productId") == from.id) it.put("productId", into.id) }
        if (into.str("thumb").isNullOrEmpty() && !from.str("thumb").isNullOrEmpty()) into.put("thumb", from.str("thumb"))
        into["codes"] = JsonObject((into.obj("codes") ?: emptyMap()) + (from.obj("codes") ?: emptyMap()))
        applyTexture(into, Details(texture = from.str("texture")))
        db.products.removeAll { it.id == from.id }
    }

    // meals moved off a variety that is gone: the photo follows, or the next start would sweep it away
    private var owners = HashMap<String, String?>() // meal → its variety at the last look

    fun followPhotos() {
        for (s in db.servings) {
            val was = owners[s.id]
            val now = s.str("productId")
            if (was != null && !now.isNullOrEmpty() && was != now && d.getProduct(was) == null) ph.photos.passPhoto(was, now)
        }
        owners = HashMap(db.servings.associate { it.id to it.str("productId") })
    }

    fun replaceProductPhoto(
        pid: String,
        img: Picture,
    ) {
        val p = d.getProduct(pid) ?: return
        val pics = ph.platform.pictures
        ph.photos.replacePhotoFile(pid, pics.resize(img, 1100, 0.82).substringAfter(","))
        p.put("thumb", pics.square(img, 200, 0.76))
        // newer than the household's, whatever the clocks say
        prefs.photoStamps[pid] = maxOf(ph.clock.serverNow(), serverStamp(p) + 1)
        save()
        savePrefs()
        if (ph.sync.isConnected()) launch { sharePhotos() }
    }

    // a photo replaced here waits until the server has it: this phone's stamp above the household's mark
    private fun newerHere() = db.products.filter { it["sharedPhoto"].truthy && (prefs.photoStamps[it.id] ?: 0) > serverStamp(it) }

    // servers without the photo or replace feature keep what they have; a first upload never overwrites a numeric mark
    private var sharing = false
    private var toldOld = false
    private val refused = HashSet<String>()

    // one photo to the server. A refused photo or an unreadable file is skipped from then on; anything else on the
    // server's side ends the round, and the next contact tries again.
    private suspend fun upload(id: String): Boolean =
        try {
            val image = ph.photos.photoData(id)
            if (image == null) {
                false
            } else {
                ph.api.request("POST", "/api/photo/$id", jsonObject("image" to JsonPrimitive(image)), timeout = 60_000)
                true
            }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            if (e is ServerError && e.kind != "bad") throw e
            if (e !is ServerError) report("reading a photo to share", e)
            refused.add(id)
            false
        }

    suspend fun sharePhotos() {
        if (sharing) return
        sharing = true
        try {
            val replaced = newerHere().filter { it.id !in refused }
            val st = ph.sync.status
            if (replaced.isNotEmpty() && !ph.sync.serverCan("replace")) {
                if (st.features != null && !toldOld) toast("Der Server behält das alte Foto, bis er aktualisiert ist.")
                toldOld = toldOld || st.features != null
                if (st.features == null) return // out of reach: tried again on the next contact
            } else {
                for (p in replaced) {
                    if (upload(p.id)) {
                        p["sharedPhoto"] = num(prefs.photoStamps[p.id] ?: 0L)
                        save()
                    }
                }
            }
            if (!ph.sync.serverCan("photo")) return
            for (id in db.products.filter { !it["sharedPhoto"].truthy && ph.photos.keptPhoto(it.id) && it.id !in refused }.map { it.id }) {
                val p = d.getProduct(id)
                if (upload(id) && p != null && !p["sharedPhoto"].truthy) {
                    p["sharedPhoto"] = prefs.photoStamps[id]?.let { num(it) } ?: JsonPrimitive(true)
                    save()
                }
            }
        } catch (e: ServerError) {
            if (e.kind != "offline") report("handing a photo to the server", e) // offline: retried on the next contact
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            report("handing a photo to the server", e)
        } finally {
            sharing = false
        }
    }

    /** the server has no photo for it: no phone offers it any more, and one still holding it uploads it again */
    fun unsharePhoto(p: Rec) {
        if (!p["sharedPhoto"].truthy) return
        p.remove("sharedPhoto")
        save()
    }

    /** not while a broken or set-aside db.json could still bring varieties back */
    fun tidyPhotos() {
        if (ph.store.loadError != null || !ph.store.dbFound || ph.disk.setAside()) return
        ph.photos.sweepPhotos((db.products.map { it.id } + db.servings.mapNotNull { it.str("productId")?.ifEmpty { null } }).toSet())
    }

    /** a guess as the recognition chain hands it over */
    fun detailsOf(o: JsonObject?) =
        Details(
            o?.get("brand").asString ?: "",
            o?.get("variety").asString ?: "",
            o?.get("type").asString,
            o?.get("texture").asString,
        )
}
