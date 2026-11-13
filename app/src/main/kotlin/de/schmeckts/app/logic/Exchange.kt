package de.schmeckts.app.logic

import de.schmeckts.app.Remote
import de.schmeckts.app.Time
import de.schmeckts.app.asArray
import de.schmeckts.app.asDouble
import de.schmeckts.app.asString
import de.schmeckts.app.jsonObject
import de.schmeckts.app.num
import de.schmeckts.app.parseJson
import de.schmeckts.app.report
import de.schmeckts.app.stringify
import de.schmeckts.app.ui.SheetState
import de.schmeckts.app.views.Exchanged
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// exchange by file without a server; the file holds data and clocks only, no settings and no household code

private const val KIND = "exchange"
private const val PROTOCOL = 1

/** the phone a received file came from and its clocks, to answer it */
class Peer(
    val device: String,
    val clocks: JsonElement,
)

class Exchange(
    l: Logic,
) : Part(l) {
    private fun fileName() = "schmeckts-$KIND-${utcDay()}.json"

    // without a known device the oldest mark applies, so nothing is left out
    private fun markFor(device: String?): JsonElement? {
        val marks = prefs.exchange
        if (device != null) return (marks[device] as? JsonObject)?.get("mark")
        return if (marks.isNotEmpty()) JsonPrimitive(marks.values.map { (it as? JsonObject)?.get("mark").asString ?: "" }.sorted()[0]) else null
    }

    // the mark moves on only once the device holds everything this phone has
    private fun remember(
        device: String?,
        level: Boolean = true,
    ) {
        if (device == null) return
        val was = (prefs.exchange[device] as? JsonObject)?.get("mark").asString ?: ""
        prefs.exchange[device] = jsonObject("at" to num(Time.now()), "mark" to JsonPrimitive(if (level) ph.store.topClock() else was))
        savePrefs()
    }

    /** peer: when answering a received file */
    suspend fun shareChanges(peer: Peer? = null) {
        val records = ph.store.changesSince(peer?.clocks ?: markFor(null))
        val data =
            jsonObject(
                "app" to JsonPrimitive("schmeckts"),
                "kind" to JsonPrimitive(KIND),
                "protocol" to num(PROTOCOL),
                "device" to JsonPrimitive(ph.clock.device),
                "at" to num(Time.now()),
                "clocks" to ph.store.allClocks(),
                "records" to JsonArray(records.map { it.toJson() }),
            ).stringify()
        val many = "${records.size} ${if (records.size == 1) "Änderung" else "Änderungen"}"
        try {
            if (!ph.platform.shareFile(fileName(), data, "Schmeckt’s-Austausch", "Änderungen an das andere Handy")) return
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            report("exchange file", e)
            toast("Die Datei konnte nicht geteilt werden.")
            return
        }
        haptic("success")
        remember(peer?.device)
        val sh = sheet
        if (peer != null && sh?.kind == "settings") {
            sh["exchange"] = null // the other device is level now
            renderSheet()
        }
        toast("$many weitergegeben")
    }

    suspend fun receiveFile() {
        val text = ph.platform.pickFile() ?: return
        apply(text)
    }

    suspend fun receiveUri(uri: String) {
        val text =
            try {
                ph.platform.readUri(uri)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                report("exchange file", e)
                toast("Die Datei ließ sich nicht öffnen.")
                return
            }
        apply(text)
    }

    fun apply(text: String) {
        val file = runCatching { parseJson(text) }.getOrNull() as? JsonObject
        val bad = check(file)
        if (bad.isNotEmpty()) {
            haptic("strong")
            toast(bad)
            return
        }
        val records = file!!["records"].asArray!!.mapNotNull { Remote.of(it) }
        val took = ph.store.merge(records)
        val back = ph.store.changesSince(file["clocks"])
        val device = file["device"].asString
        remember(device, back.isEmpty())
        val info = Exchanged(message(took, back.size), if (back.isNotEmpty() && device != null) device else null)
        if (back.isNotEmpty() && device != null) peers[device] = Peer(device, file["clocks"]!!)
        haptic(if (took > 0) "success" else "select")
        update()
        val sh = sheet
        if (sh?.kind == "settings") {
            sh["exchange"] = info
            if (sh.page == "exchange") renderSheet() else ui.sheets.openPage("exchange")
        } else {
            ui.sheets.openSheet(SheetState("settings", "page" to "exchange", "exchange" to info))
        }
    }

    private val peers = HashMap<String, Peer>()

    /** the answer to the last file received from that phone */
    fun peerOf(device: String?) = device?.let { peers[it] }

    private fun message(
        took: Int,
        back: Int,
    ) = (if (took > 0) "$took ${if (took == 1) "Änderung" else "Änderungen"} übernommen." else "Nichts Neues dabei.") +
        if (back > 0) " Dem anderen Handy ${if (back == 1) "fehlt noch eine" else "fehlen noch $back"}." else " Beide Handys sind gleich."

    private fun check(file: JsonObject?): String {
        if (file == null) return "Diese Datei ist kein Schmeckt’s-Austausch."
        if (file["app"].asString != "schmeckts" || file["kind"].asString != KIND) {
            return if (file["servings"] is JsonArray) {
                "Das ist ein Backup. Es gehört unter „Daten“ zu „Backup“."
            } else {
                "Diese Datei ist kein Schmeckt’s-Austausch."
            }
        }
        if ((file["protocol"].asDouble ?: 0.0) > PROTOCOL) return "Die Datei kommt von einer neueren App. Bitte diese App aktualisieren."
        if (file["records"] !is JsonArray || file["clocks"] !is JsonObject) return "Diese Austausch-Datei ist beschädigt."
        if (file["device"].asString == ph.clock.device) return "Diese Datei kommt von diesem Handy."
        return ""
    }
}

/** today's date in UTC, as toISOString().slice(0, 10) gave it */
fun utcDay(t: Long = Time.now()): String {
    val c = java.util.GregorianCalendar(java.util.TimeZone.getTimeZone("UTC")).apply { timeInMillis = t }
    return "%04d-%02d-%02d".format(c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH) + 1, c.get(java.util.Calendar.DAY_OF_MONTH))
}
