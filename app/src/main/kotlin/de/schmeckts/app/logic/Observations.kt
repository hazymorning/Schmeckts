package de.schmeckts.app.logic

import de.schmeckts.app.Rec
import de.schmeckts.app.Time
import de.schmeckts.app.at
import de.schmeckts.app.jsonObject
import de.schmeckts.app.num
import de.schmeckts.app.observationOf
import de.schmeckts.app.pets
import de.schmeckts.app.uid
import de.schmeckts.app.views.whoObserved
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// noted for all pets, an observation means one of them or all, as with a shared litter box

class Observations(
    l: Logic,
) : Part(l) {
    private fun shown() =
        if (prefs.activePet != "all" && db.pets.any { it.id == prefs.activePet }) listOf(prefs.activePet) else db.pets.map { it.id }

    private fun petSet(ids: List<String>) = JsonObject(ids.associateWith { JsonPrimitive(true) })

    private fun sortObs() = db.observations.sortByDescending { it.at }

    fun observe(kind: String) {
        val ids = shown()
        if (ids.isEmpty()) return
        val o =
            Rec(
                jsonObject(
                    "id" to JsonPrimitive(uid()),
                    "kind" to JsonPrimitive(kind),
                    "at" to num(Time.now()),
                    "pets" to petSet(ids),
                    "by" to d.byMe(),
                ),
            )
        db.observations.add(0, o)
        save()
        haptic("success")
        ui.home.fresh = o.id
        update()
        val seen = observationOf(kind)
        val said = if (db.pets.size > 1) seen.said.replace("Notiert", "Notiert bei ${ph.whoObserved(ids)}") else seen.said
        toast(
            said,
            {
                db.observations.removeAll { it.id == o.id }
                save()
                update()
                renderSheet()
            },
            icon = seen.icon,
            tone = "o-$kind",
        )
    }

    fun setObservationKind(kind: String) {
        val o = d.getObservation(sheet?.id) ?: return
        if (o.str("kind") == kind) return
        o.put("kind", kind)
        save()
        haptic("select")
        renderSheet()
        update()
    }

    /** several pets mean it is unclear which one it was */
    fun toggleObservationPet(pid: String) {
        val o = d.getObservation(sheet?.id) ?: return
        if (o.pets.containsKey(pid)) {
            if (o.pets.size == 1) {
                toast("Mindestens eine Katze muss dabei sein.")
                return
            }
            o["pets"] = JsonObject(o.pets - pid)
        } else {
            o["pets"] = JsonObject(o.pets + (pid to JsonPrimitive(true)))
        }
        save()
        haptic("select")
        renderSheet()
        update()
    }

    fun setObservationTime(
        id: String,
        t: Long,
    ) {
        val o = d.getObservation(id) ?: return
        o["at"] = num(minOf(t, Time.now()))
        sortObs()
        save()
        haptic("select")
        renderSheet()
        update()
    }

    fun deleteObservation(id: String) {
        val o = d.getObservation(id) ?: return
        db.observations.removeAll { it === o }
        save()
        haptic("strong")
        afterClose {
            update()
            toast("Eintrag gelöscht", {
                db.observations.add(o)
                sortObs()
                save()
                update()
                renderSheet()
            })
        }
    }
}
