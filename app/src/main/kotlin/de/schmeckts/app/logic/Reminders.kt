package de.schmeckts.app.logic

import de.schmeckts.app.FeedNote
import de.schmeckts.app.Note
import de.schmeckts.app.RATINGS
import de.schmeckts.app.REMIND_ASKED
import de.schmeckts.app.REMIND_DEFAULT
import de.schmeckts.app.REMIND_MAX_AGE
import de.schmeckts.app.Rec
import de.schmeckts.app.Time
import de.schmeckts.app.callName
import de.schmeckts.app.clockStr
import de.schmeckts.app.fedToday
import de.schmeckts.app.feedReminders
import de.schmeckts.app.hourOf
import de.schmeckts.app.minuteOf
import de.schmeckts.app.pets
import de.schmeckts.app.pname
import de.schmeckts.app.quickOf
import de.schmeckts.app.report
import de.schmeckts.app.servedAt
import de.schmeckts.app.tidyRemind
import de.schmeckts.app.truthy
import de.schmeckts.app.ui.SheetState
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject

// No exact alarms: the app does not hold that permission. Rating reminders are planned from the data, so whatever the
// phone did meanwhile (a restart, an update, a meal rated on another phone), the next plan puts it right.

private const val CATCH_UP = 3000L // ms at most

/** the notification's id, a whole number, as 0.42 made it, so a reminder it showed is the same one */
fun idOf(sid: String): Int = sid.fold(7L) { h, c -> (h * 31 + c.code) % 2147483647 }.toInt().let { if (it == 0) 1 else it }

class Reminders(
    l: Logic,
) : Part(l) {
    private fun openPets(s: Rec) = s.pets.keys.filter { pid -> d.getPet(pid) != null && !(s.pets[pid] as? JsonObject)?.get("r").truthy }

    private fun isOpen(s: Rec) = openPets(s).isNotEmpty()

    // one pet by any of its names, the same for one reminder, so its text does not change once planned
    private fun calling(
        ids: List<String>,
        seed: String,
    ) = if (ids.size == 1) callName(d.getPet(ids[0]), seed) else d.petNames(ids)

    // served on this phone as it happened: a meal entered for the past, or on another phone, is not asked about
    private fun servedHere(s: Rec): Boolean {
        val made =
            ph.store.state.clocks["servings"]
                ?.get(s.id)
                ?.get("_del") ?: return false
        val parts = made.split("-")
        val ms = parts.getOrNull(0)?.toLongOrNull() ?: return false
        return parts.getOrNull(2) == ph.clock.device && ms > 0 && ms - s.servedAt <= REMIND_MAX_AGE
    }

    // with one pet left to rate, buttons rate it
    fun notice(s: Rec): Note {
        val p = d.getProduct(s.str("productId"))
        val open = openPets(s)
        return Note(
            id = idOf(s.id),
            title = "Wie war’s?",
            body = "${if (p != null) pname(p) else "Mahlzeit von " + clockStr(s.servedAt)} für ${calling(open, s.id)}",
            at = s.servedAt + prefs.remind * 60_000L,
            serving = s.id,
            pet = if (open.size == 1) open[0] else null,
            rate = if (open.size == 1) quickOf(p) else emptyList(),
        )
    }

    /** every rating reminder there should be now */
    fun wanted(): List<Note> = if (prefs.remind <= 0) emptyList() else db.servings.filter { isOpen(it) && servedHere(it) }.map(::notice)

    // sure: the text once the server confirmed nothing was served since `since`
    private fun dayPart(at: Long): String {
        val h = hourOf(at) + minuteOf(at) / 60.0
        return if (h < 10.5) {
            "Heute Morgen"
        } else if (h < 14) {
            "Heute Mittag"
        } else if (h < 17.5) {
            "Heute Nachmittag"
        } else {
            "Heute Abend"
        }
    }

    private fun feedNotice(x: de.schmeckts.app.FeedDue): FeedNote {
        val body = "Um diese Zeit gibt es sonst Futter für ${calling(db.pets.map { it.id }, x.key)}."
        return FeedNote(
            idOf("feed" + x.key),
            x.key,
            x.at,
            x.since,
            "Schon gefüttert?",
            body,
            "${dayPart(x.at)} ist noch nichts eingetragen. $body",
        )
    }

    private suspend fun allowed(
        wanted: Boolean,
        which: String,
    ): Boolean {
        var ok = false
        try {
            val n = ph.platform.notifications
            ok = !wanted || n.permission() == "granted" || n.request() == "granted"
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            report("notification permission", e)
        }
        if (!ok && sheet?.kind != "settings") toast("Benachrichtigungen sind nicht erlaubt.") // there the switch's line says it
        sheet?.set("denied", if (ok) null else which)
        return ok
    }

    // this run only; after a fresh start the switch turns on with REMIND_DEFAULT
    private var lastStep = 0

    fun remindStep() = if (lastStep > 0) lastStep else REMIND_DEFAULT

    suspend fun setRemind(
        minutes: Int,
        redraw: Boolean = true,
    ) {
        ph.store.hideHint(REMIND_ASKED) // chosen, so the home page need not ask
        val ok = allowed(minutes > 0, "remind")
        prefs.remind = if (ok) tidyRemind(minutes.toDouble()) else 0
        if (prefs.remind > 0) lastStep = prefs.remind
        savePrefs()
        syncReminders()
        if (redraw || !ok) renderSheet() // a full redraw would interrupt typing in the hours field
    }

    suspend fun setFeedRemind(on: Boolean) {
        prefs.feedRemind = on && allowed(true, "feed")
        savePrefs()
        syncReminders()
        renderSheet()
    }

    private var timer: Job? = null

    fun syncReminders() {
        timer?.cancel()
        timer =
            launch {
                delay(250)
                reconcile()
            }
    }

    /** at once, for a start without the screen (after a restart or an update) */
    fun reconcile() {
        try {
            ph.platform.notifications.plan(wanted())
        } catch (e: Exception) {
            report("reminders", e)
        }
        setFeed()
    }

    // the phone replaces what it held and asks the server, when one is due, whether a meal was served since
    private var lastFeed = ""

    private fun setFeed() {
        val now = Time.now()
        val reminders = if (prefs.feedRemind) feedReminders(db, now).map(::feedNotice) else emptyList()
        val dismiss = fedToday(db, now).map { idOf("feed$it") }
        val server = if (ph.sync.isConnected()) prefs.server else ""
        val code = if (ph.sync.isConnected()) prefs.code else ""
        val key =
            reminders.joinToString("|") { "${it.id},${it.at},${it.since},${it.body}" } + "/" + dismiss.joinToString(",") + "/$server/$code"
        if (key == lastFeed) return
        try {
            ph.platform.notifications.feed(reminders, dismiss, server, code)
            lastFeed = key
        } catch (e: Exception) {
            report("feeding reminders", e) // lastFeed stays, so the next reconcile tries again
        }
    }

    /** A tap or a button on a reminder opens the app; a button rates only a pet still open once the household's changes
     are in, else the meal opens to show what it holds. */
    suspend fun onAction(
        actionId: String,
        serving: String?,
        pet: String?,
    ) {
        if (actionId in RATINGS && ph.sync.reachable()) ph.sync.caughtUp(CATCH_UP)
        val s = d.getServing(serving) ?: return
        val open = pet != null && (s.pets[pet] as? JsonObject)?.let { !it["r"].truthy } == true
        if (actionId in RATINGS && open && l.rating.rateMeal(s.id, pet!!, actionId)) {
            update()
            renderSheet()
        } else {
            ui.sheets.openSheet(SheetState("serving", "id" to s.id))
        }
    }

    fun onFeedTap() = ui.sheets.openSheet(SheetState("feed"))
}
