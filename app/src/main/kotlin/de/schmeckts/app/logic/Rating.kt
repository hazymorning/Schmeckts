package de.schmeckts.app.logic

import de.schmeckts.app.RATINGS
import de.schmeckts.app.Time
import de.schmeckts.app.jsonObject
import de.schmeckts.app.num
import de.schmeckts.app.pets
import de.schmeckts.app.rateCls
import de.schmeckts.app.truthy
import de.schmeckts.app.ui.Motion
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// rating a meal, from its slider or from the reminder's buttons

/* A fully rated meal stays put for a moment so it can be corrected. Its sheet closes by itself only once the last open
   pet is rated, not when an old rating is put right. */
private const val HOLD = 1500L // ms

class Rating(
    l: Logic,
) : Part(l) {
    private val holds = HashMap<String, Int>() // meal id → its newest hold, so an older one ending does nothing
    private var lastHold = 0

    /** a level the meal already holds stays as it is (a second tap, Enter twice) */
    fun rateMeal(
        sid: String,
        pid: String,
        r: String,
    ): Boolean {
        val s = d.getServing(sid) ?: return false
        val cur = s.pets[pid] as? JsonObject ?: return false
        if (r !in RATINGS || cur["r"] == JsonPrimitive(r)) return false
        val prev = cur
        val pet = d.getPet(pid)
        s["pets"] = JsonObject(s.pets + (pid to jsonObject("r" to JsonPrimitive(r), "at" to num(Time.now()), "by" to d.byMe())))
        save()
        haptic("success")
        val rt = RATINGS.getValue(r)
        toast(
            "${rt.label}${if (db.pets.size > 1 && pet != null) " für " + pet.str("name") else ""}. ${rt.cheer}",
            undoRating(s.id, pid, prev),
            icon = "r_$r",
            tone = rateCls(r),
        )
        return true
    }

    fun rate(
        sid: String,
        pid: String,
        r: String,
    ) {
        val was = (d.getServing(sid)?.pets?.get(pid) as? JsonObject)?.get("r").truthy
        if (rateMeal(sid, pid, r)) showRated(sid, pid, was)
    }

    private fun undoRating(
        sid: String,
        pid: String,
        prev: JsonElement,
    ): () -> Unit =
        {
            val cur = d.getServing(sid)
            if (cur != null && cur.pets.containsKey(pid)) {
                cur["pets"] = JsonObject(cur.pets + (pid to prev))
                save()
                update()
                renderSheet()
            }
        }

    private fun rated(s: de.schmeckts.app.Rec) = s.pets.values.all { (it as? JsonObject)?.get("r").truthy }

    private fun showRated(
        sid: String,
        pid: String,
        corrected: Boolean,
    ) {
        val s = d.getServing(sid) ?: return
        val inSheet = sheet?.kind == "serving" && sheet?.id == s.id
        if (!inSheet) {
            ui.home.held
                .getOrPut(s.id) { HashSet() }
                .add(pid) // the row stays until the pop has run
            ui.home.kept = s.id
        }
        launch {
            delay(Motion.STEP.toLong())
            update()
        }
        if (!rated(s) || (inSheet && corrected && !holds.containsKey(s.id))) {
            holds.remove(s.id)
            return
        }
        val mine = ++lastHold
        holds[s.id] = mine
        launch {
            delay(HOLD)
            if (holds[s.id] == mine) finish(s.id, inSheet)
        }
    }

    private fun finish(
        sid: String,
        inSheet: Boolean,
    ) {
        holds.remove(sid)
        if (ui.home.kept == sid) ui.home.kept = null
        val s = d.getServing(sid)
        if (s == null || !rated(s)) return // undone meanwhile, or given another pet
        if (inSheet) {
            val sh = sheet
            if (sh?.kind == "serving" && sh.id == sid && sh.step == null && !ui.viewer.viewerOpen()) ui.sheets.closeSheet()
            return
        }
        ui.home.leaving[sid] = {
            ui.home.held.remove(sid)
            update()
        }
        if (!ui.hosted) {
            ui.home.leaving
                .remove(sid)
                ?.invoke()
        }
    }
}
