package de.schmeckts.app.logic

import de.schmeckts.app.Rec
import de.schmeckts.app.normBarcode
import de.schmeckts.app.ui.SheetState

private const val FRONT = "Barcode unbekannt. Fotografier die Vorderseite."

class Scan(
    l: Logic,
) : Part(l) {
    private var running = false

    suspend fun scan() {
        val feed = sheet
        if (running || feed?.kind != "feed") return
        running = true
        feed.assign("step" to null, "code" to "")
        try {
            run(feed)
        } finally {
            running = false
            note(feed, "")
        }
    }

    private fun open(feed: SheetState) = sheet === feed

    private fun note(
        feed: SheetState,
        text: String,
    ) {
        if (feed.str("busy") == text) return
        feed["busy"] = text
        if (open(feed)) renderSheet()
    }

    private suspend fun run(feed: SheetState) {
        val raw =
            try {
                ph.platform.scanBarcode { note(feed, "Der Scanner wird eingerichtet …") }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                return offerPhoto(feed, "Scannen klappt auf diesem Handy gerade nicht. Mach stattdessen ein Foto.")
            }
        note(feed, "")
        if (raw == null || !open(feed)) return // cancelled: the sheet stays open
        val code = normBarcode(raw)
        if (code.isEmpty()) {
            haptic("strong")
            toast("Das ist kein gültiger Barcode.")
            return
        }
        val found = ph.recognize.identify(code = code, note = { note(feed, it) })
        if (!open(feed)) return
        val known = found.products.orEmpty()
        if (known.size == 1) return serve(known[0], code)
        if (known.size > 1) {
            haptic("select")
            feed.assign("step" to "pick", "code" to code)
            renderSheet()
            return
        }
        val hit = found.details
        if (hit != null) {
            val details = Details(hit.brand, hit.variety, hit.type, hit.texture)
            val p = d.findProduct(hit.brand, hit.variety)
            if (p != null) l.products.applyTexture(p, details)
            return serve(p ?: l.products.newProduct(details), code)
        }
        // on cancel the sheet stays and its photo button takes the code over
        feed["code"] = code
        l.feeding.shootPhoto(FRONT, code)
    }

    private suspend fun serve(
        p: Rec,
        code: String,
    ) {
        ui.sheets.closeAll().await()
        l.feeding.serveProduct(p.id, code)
    }

    private fun offerPhoto(
        feed: SheetState,
        msg: String,
    ) {
        if (!open(feed)) return
        haptic("strong")
        renderSheet()
        toast(msg)
    }
}
