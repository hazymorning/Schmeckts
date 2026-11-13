package de.schmeckts.app.logic

import androidx.compose.ui.graphics.asImageBitmap
import de.schmeckts.app.AndroidPicture
import de.schmeckts.app.Picture
import de.schmeckts.app.Rec
import de.schmeckts.app.Time
import de.schmeckts.app.jsonObject
import de.schmeckts.app.namesOf
import de.schmeckts.app.norm
import de.schmeckts.app.num
import de.schmeckts.app.pets
import de.schmeckts.app.uid
import de.schmeckts.app.ui.Crop
import de.schmeckts.app.ui.SheetState
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okio.ByteString.Companion.toByteString

// from the settings the editor is a page with its own way back, elsewhere a sheet

private const val NICKS = 6

private fun sameName(
    a: String,
    b: String,
) = norm(a) == norm(b)

class Pets(
    l: Logic,
) : Part(l) {
    /** as a page, exactly these keys are taken off again on the way back */
    fun petState(p: Rec?): Array<Pair<String, Any?>> =
        arrayOf(
            "id" to p?.id,
            "name" to (p?.str("name") ?: ""),
            "nicknames" to namesOf(p).drop(1).toMutableList(),
            "nick" to "", // typed, not yet added
            "error" to "",
            "sex" to (p?.str("sex") ?: ""),
            "photo" to p?.str("photo"),
            "step" to null,
            "cropImg" to null,
            "crop" to null,
            "cropPic" to null,
        )

    fun editing(s: SheetState?) = s?.kind == "pet" || (s?.kind == "settings" && s.page == "pet")

    fun openPet(
        id: String,
        inSettings: Boolean = false,
    ) {
        val p = d.getPet(id) ?: return
        if (inSettings) ui.sheets.openPage("pet", *petState(p)) else ui.sheets.openSheet(SheetState("pet", *petState(p)))
    }

    private fun leave(msg: String) {
        if (sheet?.kind == "settings") {
            ui.sheets.backPage()
            update()
            toast(msg)
            return
        }
        afterClose {
            update()
            toast(msg)
        }
    }

    suspend fun pickPhoto() {
        val s = sheet
        if (!editing(s)) return
        val bytes = ph.platform.pickImage() ?: return
        setPetPhoto(s!!, bytes)
    }

    fun setPetPhoto(
        s: SheetState,
        bytes: ByteArray,
    ) {
        val img = ph.platform.pictures.decode(bytes.toByteString().base64())
        if (img == null) {
            toast("Das Foto ließ sich nicht lesen.")
            return
        }
        if (sheet !== s) return
        s.assign(
            "step" to "crop",
            "cropPic" to img,
            "cropImg" to (img as? AndroidPicture)?.bitmap?.asImageBitmap(),
            "crop" to Crop(img.width.toDouble(), img.height.toDouble()),
        )
        renderSheet()
    }

    fun closeCrop(apply: Boolean) {
        val s = sheet ?: return
        if (s.step != "crop") return
        if (apply) {
            val pic = s["cropPic"] as Picture
            s["photo"] = ph.platform.pictures.square(pic, 320, 0.8, (s["crop"] as Crop).rect())
            haptic("select")
        }
        s.assign("step" to null, "cropImg" to null, "crop" to null, "cropPic" to null)
        renderSheet()
    }

    @Suppress("UNCHECKED_CAST")
    private fun nicks(s: SheetState) = s["nicknames"] as MutableList<String>

    /** quiet: while saving, which takes a nickname typed but not added along */
    fun addNick(quiet: Boolean = false) {
        val s = sheet ?: return
        val nick = s.str("nick").trim().replace(Regex("\\s+"), " ")
        if (nick.isEmpty()) return
        val list = nicks(s)
        val known = (listOf(s.str("name")) + list).any { sameName(it, nick) }
        if (!known && list.size >= NICKS) {
            if (!quiet) toast("Sechs Spitznamen sind genug.")
            return
        }
        if (!known) list.add(nick)
        s["nick"] = ""
        if (quiet) return
        haptic("select")
        renderSheet()
    }

    fun dropNick(nick: String) {
        val s = sheet ?: return
        s["nicknames"] = nicks(s).filter { it != nick }.toMutableList()
        haptic("select")
        renderSheet()
    }

    fun savePet() {
        val s = sheet ?: return
        val name = s.str("name").trim()
        if (name.isEmpty()) {
            l.editing.showError("Wie heißt deine Katze?")
            ui.focus("f-name")
            return
        }
        // species for older app versions, which pick the icon and the cat calendar by it
        val isNew = !s.has("id")
        val p =
            if (isNew) {
                Rec(jsonObject("id" to JsonPrimitive(uid()), "species" to JsonPrimitive("Katze"), "createdAt" to num(Time.now())))
            } else {
                d.getPet(s.id) ?: Rec()
            }
        addNick(true)
        val nicknames = nicks(s).filter { !sameName(it, name) }
        p.put("name", name)
        p["photo"] = s.str("photo").ifEmpty { null }?.let { JsonPrimitive(it) } ?: JsonNull
        if (s.str("sex").isNotEmpty()) p.put("sex", s.str("sex")) else p.remove("sex")
        if (nicknames.isNotEmpty()) p["nicknames"] = JsonArray(nicknames.map { JsonPrimitive(it) }) else p.remove("nicknames")
        if (isNew) db.pets.add(p)
        save()
        haptic("success")
        leave(if (!isNew) "Gespeichert" else if (db.pets.size == 1) "Willkommen, $name!" else "$name ist dabei")
    }

    fun deletePet() {
        val id = sheet?.id ?: return
        val p = d.getPet(id) ?: return
        db.pets.removeAll { it.id == id }
        for (s in db.servings) if (s.pets.containsKey(id)) s["pets"] = JsonObject(s.pets - id)
        db.servings.removeAll { it.pets.isEmpty() }
        for (o in db.observations) if (o.pets.containsKey(id)) o["pets"] = JsonObject(o.pets - id)
        db.observations.removeAll { it.pets.isEmpty() }
        for (pr in db.products) {
            val lp = (pr["lastPets"] as? JsonArray).orEmpty()
            pr["lastPets"] = JsonArray(lp.filter { (it as? JsonPrimitive)?.content != id })
        }
        db.products.removeAll { pr -> db.servings.none { it.str("productId") == pr.id } }
        prefs.lastPets = prefs.lastPets.filter { it != id }
        if (prefs.activePet == id) prefs.activePet = "all"
        save()
        savePrefs()
        haptic("strong")
        leave("${p.str("name")} entfernt")
    }
}
