package de.schmeckts.app.logic

import de.schmeckts.app.Rec
import de.schmeckts.app.hasLine
import de.schmeckts.app.pname
import de.schmeckts.app.servedAt
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

class Editing(
    l: Logic,
) : Part(l) {
    // a texture set to none while naming is kept as "", so it counts as chosen
    private fun detailsOfSheet(): Details {
        val s = sheet!!
        return Details(
            s.str("brand").trim(),
            s.str("variety").trim(),
            s.str("type"),
            s.str("texture").ifEmpty { null },
            userType = true,
            textureGiven = s.has("texture"),
        )
    }

    fun saveName() {
        val s = sheet ?: return
        val details = detailsOfSheet()
        if (details.brand.isEmpty() && details.variety.isEmpty()) {
            showError("Bitte Marke oder Sorte eintragen.")
            ui.focus("f-brand")
            return
        }
        haptic("success")
        when (s.kind) {
            "serving" -> nameServing(s.id!!, details)
            "new" -> serveNewProduct(details)
            "product" -> renameProduct(s.id!!, details)
        }
    }

    fun showError(text: String) {
        val s = sheet ?: return
        s["error"] = text
        renderSheet()
    }

    private fun nameServing(
        id: String,
        details: Details,
    ) {
        val sv = d.getServing(id) ?: return
        l.feeding.refinePets(sv, d.findProduct(details.brand, details.variety))
        l.products.applyProduct(sv, details)
        save()
        backFromNaming()
    }

    private fun serveNewProduct(details: Details) {
        val p = d.findProduct(details.brand, details.variety) ?: l.products.newProduct(details)
        p.put("type", de.schmeckts.app.typeOfName(details.type))
        l.products.applyTexture(p, details)
        save()
        afterCloseAll { l.feeding.serveProduct(p.id) } // the meal is rated on the home page
    }

    /** the other variety a rename would turn this one into, which merges the two */
    fun mergeTarget(): Rec? {
        val s = sheet ?: return null
        if (s.kind != "product" || s.step != "name") return null
        val other = d.findProduct(s.str("brand").trim(), s.str("variety").trim())
        return if (other != null && other.id != s.id) other else null
    }

    private fun renameProduct(
        id: String,
        details: Details,
    ) {
        val p = d.getProduct(id) ?: return
        p.put("brand", details.brand)
        p.put("variety", details.variety)
        p.put("type", de.schmeckts.app.typeOfName(details.type))
        l.products.applyTexture(p, details)
        save()
        backFromNaming()
    }

    private fun backFromNaming() {
        val s = sheet ?: return
        if (s.bool("fresh")) {
            val id = s.id!!
            afterClose {
                update()
                l.feeding.servedToast(id)
            }
            return
        }
        s.step = null
        renderSheet()
        update()
    }

    fun setPackLine(
        field: String,
        line: String,
    ) {
        val s = sheet ?: return
        if (field != "brand" && field != "variety") return
        haptic("select")
        s[field] = if (hasLine(s.str(field), line)) "" else line
        if (s.str(field).isNotEmpty()) s["error"] = ""
        renderSheet()
    }

    fun useProduct(pid: String) {
        val p = d.getProduct(pid) ?: return
        val s = sheet ?: return
        haptic("select")
        when (s.kind) {
            "serving" -> {
                val sv = d.getServing(s.id) ?: return
                l.feeding.refinePets(sv, p)
                l.products.linkProduct(sv, p)
                save()
                backFromNaming()
            }
            "new" -> afterCloseAll { l.feeding.serveProduct(p.id) }
            "product" -> {
                val cur = d.getProduct(s.id)
                if (cur != null && cur.id != p.id) {
                    l.products.mergeProducts(cur, p)
                    save()
                    s.id = p.id
                    s.step = null
                    renderSheet()
                    update()
                    toast("Mit der vorhandenen Sorte zusammengeführt")
                }
            }
        }
    }

    fun deleteServing(id: String) {
        val idx = db.servings.indexOfFirst { it.id == id }
        if (idx < 0) return
        val s = db.servings.removeAt(idx)
        var removed: Rec? = null
        val p = d.getProduct(s.str("productId"))
        if (p != null && db.servings.none { it.str("productId") == p.id }) {
            removed = p
            db.products.removeAll { it === p }
        }
        save()
        haptic("strong")
        afterClose {
            update()
            toast("Eintrag gelöscht", {
                if (removed != null && d.getProduct(removed.id) == null) db.products.add(removed)
                db.servings.add(s)
                db.servings.sortByDescending { it.servedAt }
                save()
                update()
                renderSheet()
                // deleted while its photo was being read: that result was dropped, so read it again
                val st = s.str("status")
                if (s.str("productId").isNullOrEmpty() && (st == "reading" || st == "recognizing")) l.feeding.retryNow(s.id)
            })
        }
    }

    fun removeCode(code: String) {
        val p = d.getProduct(sheet?.id) ?: return
        if (p.obj("codes")?.containsKey(code) != true) return
        p["codes"] = JsonObject(p.obj("codes")!! - code)
        save()
        haptic("strong")
        renderSheet()
        toast("Barcode entfernt", {
            val cur = d.getProduct(p.id)
            if (cur != null) {
                cur["codes"] = JsonObject((cur.obj("codes") ?: emptyMap()) + (code to JsonPrimitive(true)))
                save()
                if (sheet?.kind == "product" && sheet?.id == cur.id) renderSheet()
            }
        })
    }

    fun deleteProduct() {
        val id = sheet?.id ?: return
        val p = d.getProduct(id) ?: return
        db.products.removeAll { it.id == id }
        db.servings.removeAll { it.str("productId") == id }
        save()
        haptic("strong")
        afterClose {
            update()
            toast("${pname(p)} gelöscht")
        }
    }
}
