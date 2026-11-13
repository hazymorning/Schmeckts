package de.schmeckts.app

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import de.schmeckts.app.views.syncChip
import org.junit.Test
import java.io.File

// Scanning, reading and the phone on its own: the old ui_test.py from test_local on.

const val SHEBA = "4008429087455" // valid test codes; UPC-A becomes 0036000291452
const val UPC = "036000291452"
const val LATEST = "GET https://api.github.com/repos/hazymorning/Schmeckts/releases/latest"
private val SERVER_WORDS = Regex("server|abgleich|abgeglichen|erkennung|erkannt") // „Fotos mit eigener KI erkennen“ needs no server

class UiLocalTest : ScreenTest() {
    @Test
    fun `local - on its own no trace of a server, no request beyond the app, connecting needs an address`() {
        open()
        check(
            shows("Katze anlegen") && shows("Beispieldaten ansehen") && !shows("Füttern", substring = false),
            "first start: a first pet or the demo data, no feeding button",
        )
        val seen = mutableListOf(screenText())
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
        seen += screenText()
        act("open-settings")
        seen += screenText()
        back()
        platform.photo = packJpeg()
        act("feed")
        act("photo")
        check(until { db.servings.firstOrNull()?.str("status") == "noserver" }, "a photo taken")
        idle(400)
        seen += screenText()
        act("close")
        idle(400)
        seen += screenText()
        platform.barcode = SHEBA
        act("feed")
        seen += screenText()
        act("scan")
        check(until { labelled("Marke") }, "an unknown code: on to naming")
        idle(400)
        seen += screenText()
        act("close")
        val found = seen.flatMap { t -> SERVER_WORDS.findAll(t).map { it.value } }.toSortedSet()
        check(found.isEmpty() && phone.syncChip() == null, "no word of a server, sync or recognition anywhere $found")
        check(
            http.asked.toList() == listOf(LATEST) && !prefs.lookup,
            "nothing beyond the app itself but the one question for a newer version at start ${http.asked}",
        )
        act("open-settings")
        act("settings-page", "v" to "backup")
        platform.calls.clear()
        act("export")
        act("export")
        val order = platform.calls.map { it.first }.filter { it == "clearExports" || it == "shareFile" }
        check(
            order == listOf("clearExports", "shareFile", "clearExports", "shareFile"),
            "a shared backup is deleted from the cache before the next export $order",
        )
        act("settings-back")
        act("settings-page", "v" to "house")
        act("connect-form")
        type("Haushaltscode", "K7PM3QXD")
        act("connect")
        check(until { !sheet!!.bool("connecting") }, "connecting ends")
        check(
            sheet!!.str("connectError").isNotEmpty() && shows(sheet!!.str("connectError")) && prefs.code == "",
            "no address: refused",
        )
    }

    @Test
    fun `local - what the cache holds of shared files goes before the next share, nothing else`() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        val names = listOf("schmeckts-backup-2025-06-17.json", "schmeckts-reading-1.json", "other.json")
        for (n in names) File(app.cacheDir, n).writeText("{}")
        File(app.cacheDir, "update").mkdirs()
        AndroidPlatform(app).clearExports()
        val left = app.cacheDir.list()!!.sorted()
        check(left == listOf("other.json", "update"), "only the app's shared files are gone $left")
    }
}

private val OK_ADDRESSES =
    (
        "http://10.0.0.1:8486 10.255.255.255 http://172.16.0.1 http://172.31.255.254:8486 192.168.178.65:8486 http://192.168.0.1/ " +
            "http://100.64.0.1 http://100.127.255.255 http://127.0.0.1:8486 http://127.8.9.10 http://localhost:8486 LOCALHOST " +
            "http://minipc.local:8486 http://MiniPC.Local http://server.home.arpa http://a.b.home.arpa:8486 http://[fc00::1]:8486 " +
            "http://[fd12:3456:789a::1] http://[fdff:ffff::1] http://[fe80::1]:8486 http://[febf::1] http://3232235777 " +
            "https://example.com https://8.8.8.8:8486 https://[2001:db8::1] https://172.32.0.1"
    ).split(" ")
private val BAD_ADDRESSES =
    (
        "http://9.255.255.255 http://11.0.0.1 http://172.15.255.255:8486 http://172.32.0.1:8486 http://192.167.1.1 " +
            "http://192.169.1.1 http://100.63.255.255 http://100.128.0.1 http://126.0.0.1 http://128.0.0.1 http://8.8.8.8 example.com " +
            "http://example.com:8486 http://local http://notlocal http://evil-local http://home.arpa http://xhome.arpa " +
            "http://minipc.local.example.com http://localhost.example.com http://[2001:db8::1]:8486 http://[2a02:8109::1] " +
            "http://[fbff::1] http://[fe00::1] http://[fec0::1] http://[::1] http://[::ffff:192.168.1.1] http://[fc] " +
            "http://10.0.0.1.example.com"
    ).split(" ")

class UiNetworkTest : ScreenTest() {
    private fun run(v: String) =
        try {
            normServer(v)
        } catch (e: ServerError) {
            "error ${e.kind}"
        }

    @Test
    fun `network - http on the home network only, https elsewhere, for every request`() {
        val ok = OK_ADDRESSES.map(::run)
        check(ok.none { !it.startsWith("http") }, "allowed: http at home, https anywhere $ok")
        val bad = BAD_ADDRESSES.map(::run)
        check(bad.toSet() == setOf("error input"), "refused: http outside the home network, near misses too $bad")
        val edge = listOf(run(""), run("  192.168.1.20:8486// "))
        check(edge == listOf("", "http://192.168.1.20:8486"), "empty stays empty, http when none is given $edge")
        open()
        act("open-settings")
        act("settings-page", "v" to "house")
        act("connect-form")
        http.asked.clear()
        type("Adresse des Servers", "http://schmeckts.example.com:8486")
        type("Haushaltscode", "K7PM-3QXD")
        act("connect")
        check(until { !sheet!!.bool("connecting") }, "connecting ends")
        check(
            shows(sheet!!.str("connectError").ifEmpty { "-" }) && http.asked.none { "/api/" in it } && prefs.code == "",
            "http outside: refused, no request ${http.asked}",
        )
    }

    @Test
    fun `network - a stored outside address is refused for every request`() {
        val stored = j(mapOf("server" to "http://93.184.216.34:8486", "code" to "K7PM-3QXD"))
        open(mapOf("prefs" to stored, "db" to j(mapOf("version" to 3, "pets" to emptyList<Any>()))))
        http.asked.clear()
        val res =
            on {
                val asks: List<suspend () -> Unit> =
                    listOf(
                        { api.request("GET", "/api/info") },
                        { api.request("POST", "/api/push", kotlinx.serialization.json.JsonObject(emptyMap())) },
                    )
                asks.map { r ->
                    try {
                        r()
                        "sent"
                    } catch (e: ServerError) {
                        e.kind
                    }
                } + sync.retrySync().await().let { sync.status.kind }
            }
        check(res == listOf("input", "input", "input") && http.asked.none { "/api/" in it }, "refused for every request $res ${http.asked}")
    }
}

class UiScanTest : ScreenTest() {
    private fun onePet() {
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
    }

    private val feeding get() = listOf("feed", null, null)

    private fun scan() {
        act("feed")
        act("scan")
        idle(400)
    }

    @Test
    fun `scan - unknown code to the photo, known one served, multipacks, removing codes, scanner module, deep links`() {
        onePet()
        act("feed")
        act("scan")
        check(calls("scan") == listOf(listOf("EAN_13", "EAN_8", "UPC_A")), "scan() only, EAN-13, EAN-8, UPC-A ${calls("scan")}")
        check(level == feeding && db.servings.isEmpty(), "cancelled: nothing stored")
        platform.barcode = SHEBA
        platform.photo = packJpeg()
        act("scan")
        check(until { labelled("Marke") }, "on to naming")
        idle(400)
        val cam = calls("capture")
        check(
            cam.size == 1 &&
                !(cam[0] as String?).isNullOrEmpty() &&
                db.servings.size == 1 &&
                db.servings[0].str("scanCode") == SHEBA &&
                db.servings[0].str("status") == "noserver",
            "unknown code: straight to the camera with a hint, the photo served with the code, on to naming $cam",
        )
        check(fieldsOf("servings", db.servings[0]).keys.none { it.startsWith("scan") }, "scanCode is never synced")
        type("Marke", "Sheba")
        type("Sorte", "Lachs in Soße")
        act("save-name")
        idle(400)
        check(
            db.products.size == 1 &&
                db.products[0]
                    .obj("codes")
                    ?.get(SHEBA)
                    .truthy,
            "named: the code hangs on the variety",
        )
        val sheba = db.products[0].id
        scan()
        check(
            db.servings.size == 2 &&
                db.servings[0].str("productId") == sheba &&
                db.servings[0].str("scanCode") == SHEBA &&
                sheet == null &&
                ui.toasts.undo != null,
            "known code: served at once, with undo",
        )
        act("undo")
        check(db.servings.size == 1 && db.products.size == 1, "undo takes the meal back, the variety stays")
        scan()
        act("open-serving", "id" to db.servings[0].id)
        act("edit-name")
        type("Sorte", "Huhn in Gelee")
        act("save-name")
        idle(400)
        check(db.products.size == 2 && db.products.all { it.obj("codes")?.get(SHEBA).truthy }, "changed to another variety: code on both")
        act("close")
        idle(400)
        val huhn = db.products.first { it.str("variety") == "Huhn in Gelee" }.id
        var n = db.servings.size
        scan()
        check(
            sheet?.step == "pick" && tags("serve-", sheet = true).sorted() == listOf(sheba, huhn).sorted(),
            "several hits: a choice of those two",
        )
        act("serve", "id" to huhn, "code" to SHEBA)
        idle(400)
        check(
            db.servings.size == n + 1 &&
                db.servings[0].str(
                    "productId",
                ) == huhn &&
                db.servings[0].str("scanCode") == SHEBA &&
                sheet == null,
            "the chosen one is served",
        )
        act("open-product", "id" to sheba)
        val remove = "Barcode $SHEBA entfernen"
        val has = labelled(remove)
        act("remove-code", "code" to SHEBA)
        val removed =
            listOf(
                !db.products
                    .first { it.id == sheba }
                    .obj("codes")
                    ?.get(SHEBA)
                    .truthy,
                labelled(remove),
            )
        act("undo")
        check(
            has &&
                removed == listOf(true, false) &&
                db.products
                    .first { it.id == sheba }
                    .obj("codes")
                    ?.get(SHEBA)
                    .truthy,
            "code removed, undo restores it $removed",
        )
        act("remove-code", "code" to SHEBA)
        act("close")
        idle(400)
        n = db.servings.size
        scan()
        check(db.servings.size == n + 1 && db.servings[0].str("productId") == huhn && sheet == null, "one left: served")
        platform.barcode = UPC
        platform.photo = null
        scan()
        check(level == feeding && db.servings.size == n + 1, "camera cancelled: sheet stays")
        platform.barcode = SHEBA
        platform.scanModule = false
        act("scan")
        check(until { db.servings.size == n + 2 }, "scanned once installed")
        idle(400)
        check(
            calls("installModule").size == 1 && sheet == null && db.servings[0].str("productId") == huhn,
            "scanner module missing: installed, then scanned",
        )
        platform.scanError = "Play-Dienste fehlen"
        scan()
        check(level == feeding && toast != null && db.servings.size == n + 2, "scanner broken: a toast, the sheet stays")
        platform.scanError = null
        act("close")
        idle(400)
        link("schmeckts://scan")
        check(until { db.servings.size == n + 3 }, "scanned by link")
        idle(400)
        check(db.servings[0].str("productId") == huhn, "schmeckts://scan while running: scanned and served")
        platform.barcode = null
        link("schmeckts://scan")
        idle(400)
        check(level == feeding, "schmeckts://scan cancelled: the feeding sheet stays")
        platform.barcode = SHEBA
        restart("schmeckts://scan")
        check(until { db.servings.size == n + 4 && db.servings[0].str("productId") == huhn }, "cold start with schmeckts://scan")
    }
}
