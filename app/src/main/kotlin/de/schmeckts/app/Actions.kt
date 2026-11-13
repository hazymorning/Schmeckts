package de.schmeckts.app

import de.schmeckts.app.logic.Logic
import de.schmeckts.app.ui.SheetState
import de.schmeckts.app.ui.Ui
import de.schmeckts.app.views.reportState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// What the buttons do: each names an action, the entry of that name in ACTIONS runs with the button's data.

private const val ARM_FOR = 3500L

class Actions(
    private val ui: Ui,
    private val l: Logic,
) {
    private val ph get() = ui.phone
    private val db get() = ph.db
    private val prefs get() = ph.prefs
    private val d get() = ph.derive
    private val sheet get() = ui.sheet

    private fun launch(block: suspend () -> Unit) = ph.scope.launch { block() }

    private fun haptic(level: String = "select") = ui.haptic(level)

    private fun toast(
        text: String,
        undo: (() -> Unit)? = null,
    ) = ui.toast(text, undo)

    private suspend fun connectServer() {
        val s = sheet ?: return
        if (s.kind != "settings" || s.bool("connecting")) return
        s.assign("connecting" to true, "connectError" to "")
        ui.blurField()
        ui.renderSheet()
        try {
            val found = ph.sync.checkServer(s.str("code"), (s["server"] as? String) ?: prefs.server)
            l.data.purgeDemo()
            val first = ph.sync.startSession(found)
            haptic("success")
            if (sheet?.kind == "settings") {
                sheet!!.assign("connecting" to false, "connectForm" to false, "code" to "", "editServer" to false, "server" to null)
                ui.renderSheet()
            }
            ui.update()
            toast("Verbunden. Die Daten werden abgeglichen.")
            first.await()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            haptic("strong")
            if (sheet?.kind == "settings") {
                sheet!!.assign("connecting" to false, "connectError" to (e.message ?: ""))
                ui.renderSheet()
                ui.focus("f-code")
            }
        }
    }

    // the key is checked as it is pasted; only one that works is kept
    private var aiTimer: Job? = null

    private suspend fun checkAiKey() {
        aiTimer?.cancel()
        val s = sheet ?: return
        if (s.kind != "settings" || s.bool("aiChecking") || s.str("aiKey").isBlank()) return
        s.assign("aiChecking" to true, "aiError" to "")
        ui.blurField() // the field is drawn anew, its keyboard goes
        ui.renderSheet()
        var error = ""
        try {
            val k = ph.ai.check(s.str("aiKey"))
            ph.ai.key = k.key
            ph.ai.provider = k.provider
            ph.ai.model = k.model
            ph.ai.name = k.name
            ph.ai.on = true
            ph.ai.trouble = ""
            ph.ai.save()
            haptic("success")
            toast("Der Schlüssel funktioniert.")
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            haptic("strong")
            error = e.message ?: ""
        }
        if (sheet?.kind != "settings") return
        s.assign("aiChecking" to false, "aiError" to error, "aiKey" to if (error.isNotEmpty()) s.str("aiKey") else "")
        ui.renderSheet()
    }

    private fun forgetAiKey() {
        val ai = ph.ai
        val was = listOf(ai.key, ai.provider, ai.model, ai.name)
        ai.key = ""
        ai.provider = ""
        ai.model = ""
        ai.name = ""
        ai.save()
        haptic("select")
        ui.renderSheet()
        ui.toast("Schlüssel gelöscht", {
            ai.key = was[0]
            ai.provider = was[1]
            ai.model = was[2]
            ai.name = was[3]
            ai.save()
            ui.renderSheet()
        })
    }

    private fun disconnectServer() {
        ph.sync.disconnect()
        ui.renderSheet()
        ui.update()
        toast("Verbindung getrennt. Die Daten bleiben auf diesem Handy.")
    }

    private fun openConnect() {
        val s = sheet
        if (s?.kind == "settings") {
            s["connectForm"] = true
            if (s.page == "house") ui.renderSheet() else ui.sheets.openPage("house")
        } else {
            ui.sheets.openSheet(SheetState("settings", "page" to "house", "connectForm" to true))
        }
        ui.focus(if (prefs.server.isNotEmpty()) "f-code" else "f-server")
    }

    private suspend fun syncByHand() {
        val s = sheet ?: return
        if (s.kind != "settings" || s.has("syncing") && s.str("syncing").isNotEmpty()) return
        s["syncing"] = "shown"
        ui.renderSheet()
        try {
            ph.sync.retrySync().await()
        } finally {
            s["syncing"] = ""
            if (sheet === s) ui.renderSheet()
        }
    }

    // tap twice instead of a confirmation dialog; the id tells apart the buttons of one kind
    private val armed: Map<String, (Map<String, String>) -> Unit> =
        mapOf(
            "delete-product" to { _ -> l.editing.deleteProduct() },
            "delete-pet" to { _ -> l.pets.deletePet() },
            "wipe" to { _ -> l.data.wipe() },
            "disconnect" to { _ -> disconnectServer() },
            "merge" to { x -> l.editing.useProduct(x["id"] ?: "") },
        )
    private var armTimer: Job? = null

    private fun arm(
        key: String,
        run: () -> Unit,
    ) {
        val s = sheet ?: return
        if (s["armed"] == key) {
            s["armed"] = null
            armTimer?.cancel()
            run()
            return
        }
        s["armed"] = key
        haptic("select")
        ui.renderSheet()
        armTimer?.cancel()
        armTimer =
            launch {
                delay(ARM_FOR)
                if (sheet?.get("armed") == key) {
                    sheet!!["armed"] = null
                    ui.renderSheet()
                }
            }
    }

    /** a variety renamed into another one is merged with it, so that takes a second tap like a suggestion does */
    private fun nameOrMerge() {
        val other = l.editing.mergeTarget()
        if (other != null) arm("merge:" + other.id) { l.editing.useProduct(other.id) } else l.editing.saveName()
    }

    private fun petState(p: Rec?) = l.pets.petState(p)

    private fun redrawAll() {
        ui.renderSheet()
        ui.update()
    }

    val actions: Map<String, (Map<String, String>) -> Unit> =
        mapOf(
            "filter" to { x ->
                val id = x["id"] ?: "all"
                if (id != "all" && (db.pets.size == 1 || prefs.activePet == id)) {
                    l.pets.openPet(id) // tapping again edits
                } else {
                    prefs.activePet = id
                    ph.store.savePrefs()
                    haptic("select")
                    ui.update()
                }
            },
            "add-pet" to { _ ->
                if (sheet?.kind ==
                    "settings"
                ) {
                    ui.sheets.openPage("pet", *petState(null))
                } else {
                    ui.sheets.openSheet(SheetState("pet", *petState(null)))
                }
            },
            "edit-pet" to { x -> l.pets.openPet(x["id"] ?: "", true) },
            "open-pet" to { x -> l.pets.openPet(x["id"] ?: "") },
            "observe" to { x -> l.observations.observe(x["v"] ?: "") },
            "pick" to { x -> launch { pickTime(x["field"] ?: "", x["id"] ?: "") } },
            "open-observation" to { x -> ui.sheets.openSheet(SheetState("observation", "id" to x["id"])) },
            "set-observation-kind" to { x -> l.observations.setObservationKind(x["v"] ?: "") },
            "toggle-observation-pet" to { x -> l.observations.toggleObservationPet(x["id"] ?: "") },
            "delete-observation" to { x -> l.observations.deleteObservation(x["id"] ?: "") },
            "open-settings" to { _ -> ui.sheets.openSheet(SheetState("settings")) },
            "settings-page" to { x ->
                haptic("select")
                ui.sheets.openPage(x["v"] ?: "")
            },
            "settings-back" to { _ ->
                haptic("select")
                ui.sheets.sheetBack()
            },
            "open-report" to { x -> ui.sheets.openSheet(reportState(x["v"])) },
            "open-evaluation" to { _ -> ui.sheets.openSheet(SheetState("evaluation")) },
            // the shopping list's folds start closed each time
            "open-level" to { x -> ui.sheets.openPage(x["v"] ?: "", "open" to null) },
            "open-server" to { _ -> ui.sheets.openSheet(SheetState("settings", "page" to "house")) },
            "connect" to { _ -> launch { connectServer() } },
            "connect-form" to { _ ->
                haptic("select")
                openConnect()
            },
            "edit-server" to { _ ->
                sheet?.set("editServer", true)
                ui.renderSheet()
                ui.focus("f-server")
            },
            "sync-now" to { _ ->
                haptic("select")
                launch { syncByHand() }
            },
            "close" to { _ -> ui.sheets.closeSheet() },
            "feed" to { _ -> ui.sheets.openSheet(SheetState("feed")) },
            "serve" to { x ->
                val id = x["id"] ?: ""
                val code = x["code"] ?: ""
                val gone = ui.sheets.closeAll()
                launch {
                    gone.await()
                    l.feeding.serveProduct(id, code) // the meal is rated on the home page
                }
            },
            "scan" to { _ -> launch { l.scan.scan() } },
            "photo" to { _ -> launch { l.feeding.shootPhoto("", if (sheet?.kind == "feed") sheet!!.str("code") else "") } },
            "new-product" to
                { x -> ui.sheets.openSheet(SheetState("new", "brand" to "", "variety" to (x["v"] ?: ""), "type" to "Nassfutter")) },
            "rate" to { x -> l.rating.rate(x["s"] ?: "", x["p"] ?: "", x["r"] ?: "") },
            // a photo found nowhere is let go, and so is a sharedPhoto mark the server cannot back up
            "view-photo" to { x -> launch { viewPhoto(x["s"] ?: "", x["p"] ?: "") } },
            "open-serving" to { x ->
                val s = d.getServing(x["id"])
                if (s != null) {
                    val unknown = s.str("productId").isNullOrEmpty() && s.str("status") != "recognizing"
                    ui.sheets.openSheet(
                        SheetState("serving", "id" to s.id, "step" to (if (unknown) "name" else null), *l.feeding.guessOf(s)),
                    )
                }
            },
            "edit-name" to { _ ->
                val sh = sheet
                val s = d.getServing(sh?.id)
                val p = d.getProduct(s?.str("productId"))
                if (sh != null) {
                    sh.assign("step" to "name", "error" to "")
                    if (p != null) {
                        sh.assign(
                            "brand" to (p.str("brand") ?: ""),
                            "variety" to (p.str("variety") ?: ""),
                            "type" to (p.str("type")?.ifEmpty { null } ?: "Nassfutter"),
                            "texture" to p.str("texture"),
                        )
                    } else {
                        sh.assign(*l.feeding.guessOf(s))
                    }
                    ui.renderSheet()
                }
            },
            "save-name" to { _ -> nameOrMerge() },
            "rephoto" to { _ -> launch { l.feeding.rephoto() } },
            "product-photo" to { x -> launch { l.feeding.reshootProduct(x["id"] ?: "") } },
            "use-product" to { x -> l.editing.useProduct(x["id"] ?: "") },
            "pack-line" to { x -> l.editing.setPackLine(x["field"] ?: "", x["v"] ?: "") },
            "set-type" to { x ->
                val sh = sheet
                if (sh != null) {
                    sh["type"] = x["v"]
                    if (textureOf(Rec().apply { put("type", x["v"]) }, sh.str("texture").ifEmpty { null }) == null) sh.remove("texture")
                    ui.renderSheet()
                }
            },
            // a second tap clears it; saved at once in the food sheet, on save while naming
            "set-texture" to { x ->
                val sh = sheet
                val v = x["v"] ?: ""
                if (sh != null) {
                    if (sh.kind == "product" && sh.step != "name") {
                        l.products.toggleTexture(sh.id!!, v)
                        ui.update()
                    } else {
                        sh["texture"] = if (sh.str("texture") == v) "" else v
                    }
                    haptic("select")
                    ui.renderSheet()
                }
            },
            "toggle-serving-pet" to { x -> toggleServingPet(x["id"] ?: "") },
            "retry" to { _ -> sheet?.id?.let { l.feeding.retryNow(it) } },
            "delete-serving" to { x -> l.editing.deleteServing(x["id"] ?: sheet?.id ?: "") },
            "open-product" to { x -> ui.sheets.openSheet(SheetState("product", "id" to x["id"])) },
            "remove-code" to { x -> l.editing.removeCode(x["code"] ?: "") },
            "buy" to { x ->
                sheet?.id?.let { l.products.setKaufen(it, x["v"]) }
                haptic("select")
                redrawAll()
            },
            "hint-buy" to { x -> hintBuy(x["id"] ?: "", x["v"] ?: "") },
            "remind-yes" to { _ ->
                haptic("select")
                launch {
                    l.reminders.setRemind(REMIND_DEFAULT)
                    ui.update()
                    if (prefs.remind > 0) toast("Die Erinnerung ist an. Ändern lässt sie sich in den Einstellungen.")
                }
            },
            "hide-hint" to { x ->
                ph.store.hideHint(x["v"] ?: "")
                haptic("select")
                ui.update()
            },
            "share-list" to { _ -> launch { l.products.shareShopping() } },
            "rename-product" to { _ ->
                val sh = sheet
                val p = d.getProduct(sh?.id)
                if (sh != null && p != null) {
                    sh.assign(
                        "step" to "name",
                        "error" to "",
                        "brand" to (p.str("brand") ?: ""),
                        "variety" to (p.str("variety") ?: ""),
                        "type" to (p.str("type")?.ifEmpty { null } ?: "Nassfutter"),
                        "texture" to p.str("texture"),
                    )
                    ui.renderSheet()
                }
            },
            "arm" to { x ->
                val then = x["then"] ?: ""
                val id = x["id"]
                armed[then]?.let { run -> arm(then + (if (id != null) ":$id" else "")) { run(x) } }
            },
            "set-sex" to { x ->
                sheet?.set("sex", x["v"] ?: "")
                ui.renderSheet()
            },
            "save-pet" to { _ -> l.pets.savePet() },
            "add-nick" to { _ -> l.pets.addNick() },
            "drop-nick" to { x -> l.pets.dropNick(x["v"] ?: "") },
            "pet-photo" to { _ -> launch { l.pets.pickPhoto() } },
            "crop-apply" to { _ -> l.pets.closeCrop(true) },
            "crop-cancel" to { _ -> l.pets.closeCrop(false) },
            "lookup" to { _ -> toggle { prefs.lookup = !prefs.lookup } },
            "server-photo" to { _ -> toggle { prefs.serverPhoto = !prefs.serverPhoto } },
            "ai-photo" to { _ ->
                ph.ai.on = !ph.ai.on
                ph.ai.save()
                haptic("select")
                ui.renderSheet()
                if (ph.ai.on && ph.ai.key.isEmpty()) ui.focus("f-ai")
            },
            "ai-forget" to { _ -> forgetAiKey() },
            "update-check" to { _ ->
                haptic("select")
                launch { ph.release.check() }
            },
            "update-install" to { _ ->
                haptic("select")
                launch {
                    try {
                        ph.release.install()
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        report("update", e)
                        toast("Das Update ließ sich nicht laden. Versuch es später noch mal.")
                    }
                }
            },
            "update-later" to { _ ->
                ph.release.later = true
                haptic("select")
                ui.update()
            },
            "update-auto" to { _ -> toggle { prefs.updates = !prefs.updates } },
            "calendar" to { _ ->
                toggle { prefs.calendar = !prefs.calendar }
                ui.update()
            },
            "tear" to { _ -> tearSheet() },
            "turn" to { _ -> turnSheet() },
            "feed-remind" to { _ ->
                haptic("select")
                launch { l.reminders.setFeedRemind(!prefs.feedRemind) }
            },
            "remind-on" to { _ ->
                haptic("select")
                sheet?.set("ownRemind", false)
                launch { l.reminders.setRemind(if (prefs.remind > 0) 0 else l.reminders.remindStep()) }
            },
            "remind" to { x ->
                haptic("select")
                sheet?.set("ownRemind", false)
                launch { l.reminders.setRemind(x["v"]?.toIntOrNull() ?: 0) }
            },
            // minutes; 2 h when coming from off
            "remind-own" to { _ ->
                haptic("select")
                sheet?.set("ownRemind", true)
                launch {
                    l.reminders.setRemind(if (prefs.remind > 0) prefs.remind else 120)
                    ui.focus("f-remind")
                }
            },
            "theme" to { x ->
                prefs.theme = x["v"] ?: "system"
                ph.store.savePrefs()
                ui.renderSheet()
                haptic("select")
            },
            "export" to { _ -> launch { l.data.exportData() } },
            "import" to { _ -> launch { l.data.importData() } },
            "share-changes" to { _ ->
                haptic("select")
                launch { l.exchange.shareChanges() }
            },
            "receive" to { _ -> launch { l.exchange.receiveFile() } },
            "send-answer" to { _ ->
                haptic("select")
                val peer = (sheet?.get("exchange") as? de.schmeckts.app.views.Exchanged)?.peer
                launch { l.exchange.shareChanges(l.exchange.peerOf(peer)) }
            },
            "demo" to { _ -> l.data.loadDemo() },
            "fold" to { x ->
                haptic("select")
                val sh = sheet
                val key = x["v"] ?: ""
                if (sh != null) {
                    val open = (sh["open"] as? Set<*>)?.filterIsInstance<String>()?.toSet().orEmpty()
                    sh["open"] = if (key in open) open - key else open + key
                    ui.renderSheet()
                }
            },
            "jump-day" to { x ->
                haptic("select")
                val day = x["day"] ?: ""
                if (sheet?.kind == "report") ui.jump = day else ui.sheets.openSheet(reportState("d-$day"))
            },
            "undo" to { _ -> ui.toasts.undoNow { haptic("select") } },
        )

    private fun toggle(flip: () -> Unit) {
        flip()
        ph.store.savePrefs()
        haptic("select")
        ui.renderSheet()
    }

    private fun toggleServingPet(id: String) {
        val s = d.getServing(sheet?.id) ?: return
        val pets = s.pets
        if (pets.containsKey(id)) {
            if (pets.size == 1) {
                toast("Mindestens eine Katze muss dabei sein.")
                return
            }
            s["pets"] = JsonObject(pets - id)
        } else {
            s["pets"] = JsonObject(pets + (id to petMap(listOf(id)).getValue(id)))
        }
        s.remove("autoPets")
        val p = d.getProduct(s.str("productId"))
        val ids = s.pets.keys.toList()
        if (p != null) p["lastPets"] = kotlinx.serialization.json.JsonArray(ids.map { JsonPrimitive(it) })
        prefs.lastPets = ids
        ph.store.save()
        ph.store.savePrefs()
        haptic("select")
        redrawAll()
    }

    private fun hintBuy(
        id: String,
        v: String,
    ) {
        val p = d.getProduct(id) ?: return
        val was = p.str("kaufen")
        l.products.setKaufen(id, v)
        haptic("success")
        ui.update()
        val (said, ic, tone) =
            if (v ==
                "immer"
            ) {
                Triple("kommt auf die Einkaufsliste", "champ", "r-good")
            } else {
                Triple("wird nicht mehr gekauft", "flop", "r-bad")
            }
        ui.toast("${pname(p)} $said.", {
            l.products.setKaufen(id, was)
            redrawAll()
        }, ic, tone)
    }

    private suspend fun viewPhoto(
        sid: String,
        pid: String,
    ) {
        val s = d.getServing(sid)
        val p = d.getProduct(pid)
        val key =
            de.schmeckts.app.views
                .photoKey(s, p)
        if (p != null && !ph.photos.keptPhoto(p.id)) ui.photoBusy = key
        var away: ServerError? = null
        var stale: Exception? = null
        var missing = false
        val load: suspend () -> String? = {
            try {
                ph.photos.photoSrc(s, p) { stale = it }.also { missing = it == null }
            } catch (e: ServerError) {
                away = e
                null
            } finally {
                ui.photoBusy = ""
            }
        }
        if (ui.viewer.openViewer(load, key) != false) {
            if (stale != null) toast("Das Foto liegt auf dem Server, und der ist gerade nicht erreichbar.")
            return
        }
        away?.let {
            toast(if (it.kind == "offline") "Das Foto liegt auf dem Server, und der ist gerade nicht erreichbar." else it.message)
            return
        }
        if (!missing) return toast("Das Foto ließ sich nicht öffnen.")
        if (p != null) {
            ph.photos.forgetPhoto(p.id)
            if (p["sharedPhoto"].truthy && ph.sync.isConnected()) l.products.unsharePhoto(p)
        }
        toast("Das Foto ist nicht mehr da.")
        if (sheet != null) ui.renderSheet() else ui.update()
    }

    // the system's pickers stand in for the old datetime field
    private suspend fun pickTime(
        field: String,
        id: String,
    ) {
        val now = Time.now()
        if (field == "obs-time") {
            val o = d.getObservation(id) ?: return
            val t = ph.platform.pickDateTime(o.at, now) ?: return
            l.observations.setObservationTime(id, t)
            return
        }
        val s = d.getServing(id) ?: return
        val t = ph.platform.pickDateTime(s.servedAt, now) ?: return
        s["servedAt"] = num(minOf(t, Time.now()))
        db.servings.sortByDescending { it.servedAt }
        ph.store.save()
        haptic("select")
        redrawAll()
        toast("Zeitpunkt: ${whenStr(s.servedAt)}")
    }

    // the sheet left hanging comes off at the perforation and falls over what lies below; today's is already in place
    private fun tearSheet() {
        prefs.sheetDay = dayKey(Time.now())
        ph.store.savePrefs()
        haptic()
        if (!ui.hosted || ui.reduced) ui.update() else ui.home.tearing = true
    }

    // today's Stimmt’s? turns over and back
    private fun turnSheet() {
        val sheet =
            de.schmeckts.app.views
                .sheetOn(Time.now())
                .sheet
        if (sheet.back == null) return // only a Stimmt’s? has a back
        ui.home.turned = if (ui.home.turned == sheet.id) null else sheet.id
        haptic()
        ui.update()
    }

    private var noteTimer: Job? = null

    /** what is typed: into the sheet, a meal's note, a setting, the hours of the reminder or the search */
    fun input(
        channel: String,
        key: String,
        value: String,
    ) {
        val s = sheet
        when (channel) {
            "field" -> {
                if (s == null) return
                // pasted whole; typed by hand it waits for a pause
                if (key == "aiKey" && value.trim().length >= 30) {
                    aiTimer?.cancel()
                    aiTimer =
                        launch {
                            delay(600)
                            checkAiKey()
                        }
                }
                if (s.str("error").isNotEmpty() && key in listOf("name", "brand", "variety")) s["error"] = ""
                if (key == "brand" || key == "variety" || key == "name") ui.renderSheet()
            }
            "note" -> {
                val sv = d.getServing(key) ?: return
                sv.put("note", value)
                noteTimer?.cancel()
                noteTimer =
                    launch {
                        delay(400)
                        ph.store.save()
                    }
            }
            "setting" -> {
                if (key == "name") prefs.name = value.trim()
                ph.store.savePrefs()
            }
            // valid values apply at once, without a redraw that would interrupt typing
            "remind" -> {
                val h = value.trim().toIntOrNull()
                if (h != null && h in 1..REMIND_MAX_H) launch { l.reminders.setRemind(h * 60, false) }
            }
            "search" -> {
                s?.set("search", value)
                ui.renderSheet()
            }
        }
    }

    /** Enter in a field, by its id */
    fun enter(id: String) {
        val s = sheet ?: return
        when {
            id == "f-server" && s.str("code").isEmpty() -> ui.focus("f-code")
            id == "f-code" || id == "f-server" -> launch { connectServer() }
            id == "f-remind" -> {
                ui.blurField()
                ui.renderSheet()
            }
            id == "f-ai" -> launch { checkAiKey() }
            id == "f-nick" -> l.pets.addNick()
            l.pets.editing(s) -> l.pets.savePet()
            s.step == "name" || s.kind == "new" -> if (id == "f-brand") ui.focus("f-variety") else nameOrMerge()
        }
    }

    fun act(
        name: String,
        data: Map<String, String>,
    ) {
        actions[name]?.invoke(data)
    }

    // fuettern and foto are the old names, still in people's shortcuts
    private val links: Map<String, (suspend () -> Unit)?> =
        mapOf(
            "feed" to null,
            "fuettern" to null,
            "scan" to { l.scan.scan() },
            "photo" to { l.feeding.shootPhoto() },
            "foto" to { l.feeding.shootPhoto() },
        )

    suspend fun openLink(url: String?): Boolean {
        val raw = url ?: ""
        if (Regex("^(content|file):", RegexOption.IGNORE_CASE).containsMatchIn(raw)) {
            l.exchange.receiveUri(raw)
            return true
        }
        val path = raw.replace(Regex("^schmeckts:/*", RegexOption.IGNORE_CASE), "").replace(Regex("[/?#].*$"), "").lowercase()
        if (path == "ocr-dump") {
            l.data.exportReading()
            return true
        }
        if (path == "ocr-measure") {
            ph.recognize.timing = !ph.recognize.timing
            toast(if (ph.recognize.timing) "Lesezeiten werden gemessen." else "Lesezeiten werden nicht mehr gemessen.")
            return true
        }
        if (path !in links) return false
        if (db.pets.isEmpty()) {
            ui.sheets.openSheet(SheetState("pet", *petState(null)))
            toast("Leg zuerst deine Katze an.")
            return true
        }
        ui.sheets.closeAll().await()
        ui.sheets.openSheet(SheetState("feed"))
        links[path]?.invoke()
        return true
    }
}
