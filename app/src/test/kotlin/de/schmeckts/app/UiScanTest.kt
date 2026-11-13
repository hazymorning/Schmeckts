package de.schmeckts.app

import android.app.Application
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
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

private const val OFF_HIT =
    """{"status":1,"product":{"product_name_de":"Sheba Fresh Choice Huhn in Sauce 4x50g","brands":"Sheba, Mars",""" +
        """"categories_tags":["en:cat-food","en:wet-cat-food"]}}"""

/** a plain packaging as a camera's photo of this size: orange with a cream label in its middle */
fun jpegOf(
    w: Int,
    h: Int,
): ByteArray {
    val b = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(b)
    c.drawColor(android.graphics.Color.rgb(214, 120, 60))
    val label = android.graphics.Paint().apply { color = android.graphics.Color.rgb(250, 240, 225) }
    c.drawRect(w / 8f, h / 4f, w * 7 / 8f, h * 3 / 4f, label)
    return java.io
        .ByteArrayOutputStream()
        .also { b.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, it) }
        .toByteArray()
}

class UiRecognizeTest : ScreenTest() {
    private var online = 0
    private var failOnline = false
    private var failServer = false

    private fun onePet() {
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
    }

    // schmeckts://ocr-dump shares the last reading as a fixture
    private fun dump(): kotlinx.serialization.json.JsonObject? {
        val before = platform.shared.size
        link("schmeckts://ocr-dump")
        idle(100)
        return platform.shared
            .drop(before)
            .firstOrNull()
            ?.let { parseJson(it.second).obj() }
    }

    private fun ident(
        code: String = "",
        photo: String = "",
    ) = on { recognize.identify(code = code, photo = photo) }

    private fun snap(
        photo: ByteArray,
        done: () -> Boolean,
    ) {
        platform.photo = photo
        act("feed")
        act("photo")
        check(until(10_000) { done() }, "the photo served")
        idle(400)
    }

    @Test
    fun `recognize - known code, product lookup, server photo, text read on the phone`() {
        for (base in listOf("https://world.openpetfoodfacts.org", "https://world.openfoodfacts.org")) {
            http.route(base) { _, url, _ ->
                online++
                if (failOnline) {
                    Http.Answer(500, "")
                } else {
                    Http.Answer(200, if ("openpetfoodfacts" in url && SHEBA in url) OFF_HIT else """{"status":0}""")
                }
            }
        }
        http.household(failing = { failServer })
        platform.pictures = AndroidPictures()
        onePet()
        check(dump() == null, "ocr-dump before any reading: nothing shared")
        val text = "Sheba\nNEU\nSelection in Sauce\nmit Lachs\n4 x 85 g\nZutaten: Fleisch 40 %"
        platform.ocrText = text
        snap(jpegOf(480, 360)) { db.servings.firstOrNull()?.obj("guess") != null }
        val filled = listOf(fieldText("Marke"), fieldText("Sorte"), chosen("Nassfutter"))
        val s = db.servings[0]
        check(
            filled == listOf("Sheba", "Selection in Sauce mit Lachs", true) &&
                calls("processImage").size == 1 &&
                s.str("status") == "noserver" &&
                s.str("error") == null,
            "without a server the phone reads the text and fills brand, variety and type $filled",
        )
        val read = node("Gelesen:").fetchSemanticsNode().boundsInRoot
        val ok = node("Passt so").fetchSemanticsNode().boundsInRoot
        check(ok.top > read.bottom && ok.top - read.bottom < 200, "what was read is confirmed with one tap right under it")
        act("save-name")
        idle(400)
        val p = db.products[0]
        check(
            listOf(p.str("brand"), p.str("variety"), p.str("type"), p.str("texture")) ==
                listOf("Sheba", "Selection in Sauce mit Lachs", "Nassfutter", "sosse") &&
                db.servings[0].obj("guess") == null,
            "confirmed: variety with texture",
        )
        val fixture = dump()!!
        val expected = fixture["expected"]!!.obj()
        check(
            fixture["width"].asDouble == 480.0 &&
                fixture["height"].asDouble == 360.0 &&
                fixture["result"] == j(mapOf("text" to text, "blocks" to emptyList<Any>())) &&
                listOf("brand", "variety", "type", "texture", "locked").map { expected[it]?.let { v -> v.asString ?: v.asBoolean } } ==
                listOf("Sheba", "Selection in Sauce mit Lachs", "Nassfutter", "sosse", false) &&
                fixture["ms"].asDouble!! >= 0,
            "ocr-dump: the last reading with the photo size and what it was named $fixture",
        )
        val files = listOf("db", "prefs", "queue").joinToString { saved(it).toString() }
        check("Zutaten: Fleisch" !in files, "the reading lives in memory only")
        platform.ocrText = "Whiskas\nRind in Gelee"
        val before = phone.recognize.last!!.at
        snap(jpegOf(3000, 2250)) { phone.recognize.last!!.at > before }
        val meal = db.servings[0]
        val sizes =
            listOf(
                phone.recognize.last!!
                    .first
                    .let { it.width to it.height },
                jpegSize(phone.photos.mem[meal.id]),
                jpegSize(meal.str("photo")!!.substringAfter(",")),
            )
        check(sizes == listOf(2400 to 1800, 1100 to 825, 480 to 360), "a large photo is read at 2400 px, kept at 1100 and 480 $sizes")
        act("close")
        idle(400)
        platform.ocrText = "SHEBA  selection-in-sauce mit LACHS 85g"
        var got = ident(photo = "AAA")
        check(
            got.source == "text" &&
                got.products.orEmpty().map { it.str("variety") } == listOf("Selection in Sauce mit Lachs") &&
                got.details == null &&
                got.lines.isNotEmpty(),
            "a known variety found in the text, spelled differently: the variety itself ${got.source}",
        )
        platform.ocrText = "12345\n850 g"
        got = ident(photo = "AAA")
        check(got.source == "" && got.details == null, "no usable text: nothing")
        platform.ocrText = ""
        got = ident(code = SHEBA)
        check(got.source == "" && online == 0, "product lookup off: no request")
        prefs.lookup = true
        got = ident(code = SHEBA)
        val hit = got.details
        check(
            got.source == "online" &&
                listOf(hit?.brand, hit?.variety, hit?.type) == listOf("Sheba", "Fresh Choice Huhn in Sauce", "Nassfutter") &&
                prefs.codes[SHEBA]?.get("found").asBoolean == true,
            "product lookup on: brand and variety tidied ${hit?.variety}",
        )
        val asked = online
        ident(code = SHEBA)
        val miss = ident(code = "96385074")
        check(
            online == asked + 2 && miss.source == "" && prefs.codes["96385074"]?.get("found").asBoolean == false,
            "hit and miss remembered",
        )
        prefs.lookup = false
        connect()
        got = ident(photo = "AAA")
        check(got.source == "server" && got.details?.variety == "Gold Pastete", "connected: the server recognises the photo")
        act("open-settings")
        val switch = prefs.serverPhoto
        act("server-photo")
        back()
        platform.ocrText = "Whiskas\nRind in Gelee"
        got = ident(photo = "AAA")
        check(switch && !prefs.serverPhoto && got.source == "text", "server photos off: read on the phone")
        prefs.serverPhoto = true
        prefs.lookup = true
        val chain = mutableListOf(ident(code = SHEBA, photo = "AAA").source)
        failOnline = true
        chain += ident(code = "96385074", photo = "AAA").source
        failServer = true
        chain += ident(code = "96385074", photo = "AAA").source
        platform.ocrText = ""
        chain += ident(code = "96385074", photo = "AAA").source
        check(chain == listOf("online", "server", "text", ""), "each stage works and falls through to the next $chain")
        db.products[0]["codes"] = j(mapOf(SHEBA to true))
        check(ident(code = SHEBA, photo = "AAA").source == "codes", "a code known in the household beats everything")
    }
}

private val OWN_KEY = "sk-proj-" + "Q".repeat(48) // an OpenAI key, as the phone takes it

class UiOwnAiTest : ScreenTest() {
    private var models = listOf("gpt-6.1-sol", "gpt-6-luna", "gpt-5.5", "chat-latest", "gpt-6.1-sol-2026-09-29")
    private var gone = setOf<String>()
    private var fail = false
    private val sent = mutableListOf<FakeHttp.Req>() // what went to OpenAI with a body, then to the others
    private val said = j(mapOf("brand" to "Felix", "variety" to "Huhn in Gelee", "type" to "Nassfutter")).stringify()

    private fun json(
        status: Int,
        v: Any,
    ) = Http.Answer(status, j(v).stringify())

    private fun openai(r: FakeHttp.Req): Http.Answer {
        if (r.headers["Authorization"] != "Bearer $OWN_KEY") {
            return json(401, mapOf("error" to mapOf("message" to "Incorrect API key provided")))
        }
        if (r.url.endsWith("/v1/models")) {
            return json(200, mapOf("object" to "list", "data" to models.map { mapOf("id" to it, "object" to "model", "created" to 1) }))
        }
        sent.add(r)
        val body = parseJson(r.body!!).obj()
        val model = body["model"].asString
        return when {
            model in gone -> json(404, mapOf("error" to mapOf("code" to "model_not_found")))
            model == "gpt-7-sol" && "reasoning" in body ->
                json(400, mapOf("error" to mapOf("message" to "Unsupported parameter: 'reasoning.effort'")))
            fail -> json(500, mapOf("error" to mapOf("message" to "The server had an error")))
            else -> {
                val out =
                    listOf(
                        mapOf("type" to "reasoning", "summary" to emptyList<Any>()),
                        mapOf("type" to "message", "content" to listOf(mapOf("type" to "output_text", "text" to said))),
                    )
                json(200, mapOf("status" to "completed", "output" to out))
            }
        }
    }

    private fun others(r: FakeHttp.Req): Http.Answer {
        sent.add(r)
        val listed = r.method == "GET"
        return if ("anthropic" in r.url) {
            val sonnet =
                mapOf(
                    "line" to "sonnet",
                    "capabilities" to
                        mapOf("image_input" to mapOf("supported" to true), "effort" to mapOf("low" to mapOf("supported" to true))),
                )
            val list =
                listOf(
                    mapOf("id" to "claude-haiku-9", "line" to "haiku"),
                    mapOf("id" to "claude-sonnet-9", "lifecycle" to "deprecated") + sonnet,
                    mapOf("id" to "claude-sonnet-8-5", "display_name" to "Claude Sonnet 8.5", "lifecycle" to "active") + sonnet,
                )
            val content = listOf(mapOf("type" to "thinking", "thinking" to ""), mapOf("type" to "text", "text" to said))
            json(200, if (listed) mapOf("data" to list) else mapOf("content" to content))
        } else {
            val generate = mapOf("supportedGenerationMethods" to listOf("generateContent"))
            val list =
                listOf(
                    mapOf("name" to "models/gemini-3.8-flash") + generate,
                    mapOf("name" to "models/gemini-flash-latest", "displayName" to "Gemini Flash Latest") + generate,
                    mapOf("name" to "models/embedding-9", "supportedGenerationMethods" to listOf("embedContent")),
                )
            val parts = listOf(mapOf("text" to "…", "thought" to true), mapOf("text" to said))
            json(200, if (listed) mapOf("models" to list) else mapOf("candidates" to listOf(mapOf("content" to mapOf("parts" to parts)))))
        }
    }

    private fun snap(done: () -> Boolean) {
        platform.photo = jpegOf(480, 360)
        act("feed")
        act("photo")
        check(until(10_000) { done() }, "the photo served")
        idle(400)
    }

    private fun aiFile() = saved("ai").toString()

    @Test
    fun `own_ai - checked as it is pasted, asked before the server, a retired model replaced, the key kept to itself`() {
        http.answer("https://api.openai.com", ::openai)
        platform.pictures = AndroidPictures()
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
        act("open-settings")
        act("ai-photo")
        type("KI-Schlüssel", "ghp_" + "x".repeat(36))
        check(until { sheet!!.str("aiError").isNotEmpty() }, "a wrong key answered")
        val wrong = sheet!!.str("aiError")
        val told = shows(wrong)
        type("KI-Schlüssel", OWN_KEY)
        val ok = until { phone.ai.model == "gpt-6.1-sol" } && OWN_KEY in aiFile()
        idle(400)
        check(
            "kein Schlüssel von" in wrong && told && ok && shows("gpt-6.1-sol von OpenAI") && fieldText("KI-Schlüssel") == null,
            "a wrong key is named as such; a working one is kept with the newest model of its middle line [$wrong]",
        )
        back()
        snap { db.servings.firstOrNull()?.str("productId") != null }
        val last = parseJson(sent.last().body!!).obj()
        val content =
            last["input"]!!
                .asArray!![0]
                .obj()["content"]!!
                .asArray!!
                .map { it.obj() }
        check(
            db.products.first { it.id == db.servings[0].str("productId") }.str("brand") == "Felix" &&
                last["model"].asString == "gpt-6.1-sol" &&
                last["store"].asBoolean == false &&
                content.map { it["type"].asString } == listOf("input_image", "input_text") &&
                content[0]["image_url"].asString!!.startsWith("data:image/jpeg;base64,/9j/") &&
                calls("processImage").isEmpty(),
            "a photo goes to OpenAI first and names the meal, nothing read on the phone",
        )
        act("open-serving", "id" to db.servings[0].id)
        check(inSheet("von OpenAI erkannt"), "the meal says who recognised its photo")
        act("close")
        idle(400)
        gone = setOf("gpt-6.1-sol")
        models = listOf("gpt-6-luna", "gpt-7-sol")
        snap { db.servings.size == 2 && db.servings[0].str("productId") != null }
        val asked = sent.takeLast(3).map { parseJson(it.body!!).obj().let { b -> b["model"].asString to ("reasoning" in b) } }
        check(
            asked == listOf("gpt-6.1-sol" to true, "gpt-7-sol" to true, "gpt-7-sol" to false) &&
                until { "gpt-7-sol" in aiFile() } &&
                "Products already known" in
                parseJson(sent.last().body!!)
                    .obj()["input"]!!
                    .asArray!![0]
                    .obj()["content"]!!
                    .asArray!![1]
                    .obj()["text"]
                    .asString!!,
            "the model gone: the newest that fits takes over and is kept, asked without what it refuses $asked",
        )
        val photos = mutableListOf<String>()
        http.household(photos = photos)
        connect()
        snap { db.servings.size == 3 && db.servings[0].str("productId") != null }
        check(photos.isEmpty(), "both on: the own key answers, the server is not asked")
        fail = true
        snap { db.servings.size == 4 && db.servings[0].str("productId") != null }
        act("open-serving", "id" to db.servings[0].id)
        check(photos.size == 1 && inSheet("vom Server erkannt"), "the own key fails: the server steps in and says so")
        act("close")
        idle(400)
        act("open-settings")
        val serverSub = shows("eigene KI")
        act("server-photo")
        back()
        platform.ocrText = "Whiskas\nRind in Gelee"
        snap { db.servings.size == 5 && db.servings[0].obj("guess") != null }
        check(
            serverSub &&
                photos.size == 1 &&
                db.servings[0].str("error") == "OpenAI ist gerade gestört." &&
                calls("processImage").size == 1,
            "only the own key: the server is never asked, the phone reads the photo and the meal says why",
        )
        act("open-settings")
        act("settings-page", "v" to "backup")
        act("export")
        val backup = platform.shared.filter { it.first.startsWith("schmeckts-backup") }.joinToString { it.second }
        val leaks =
            http.sent.filter { "api.openai.com" !in it.url && OWN_KEY in it.url + it.headers + (it.body ?: "") }.map { it.url }
        val data = listOf("db", "prefs", "queue", "sync").joinToString { saved(it).toString() }
        check(
            leaks.isEmpty() && backup.isNotEmpty() && OWN_KEY !in backup && OWN_KEY !in data,
            "the key goes only to OpenAI: not to the server, not into a backup, not into the data $leaks",
        )
        http.answer("https://api.anthropic.com", ::others)
        http.answer("https://generativelanguage.googleapis.com", ::others)
        sent.clear()
        val got =
            listOf("sk-ant-api03-" + "k".repeat(90), " AQ.Ab8" + "g".repeat(40) + "\n").map { key ->
                on {
                    val k = ai.check(key)
                    ai.key = k.key
                    ai.provider = k.provider
                    ai.model = k.model
                    ai.name = k.name
                    val hit = ai.recognize("/9j/AAAA")
                    listOf(ai.provider, ai.name, hit?.get("brand").asString)
                }
            }
        val bodies = sent.filter { it.body != null }
        val claude = bodies[1]
        val gemini = bodies[3]
        val claudeBody = parseJson(claude.body!!).obj()
        val geminiBody = parseJson(gemini.body!!).obj()
        check(
            got == listOf(listOf("anthropic", "Claude Sonnet 8.5", "Felix"), listOf("google", "Gemini Flash Latest", "Felix")) &&
                claude.headers["anthropic-version"] == "2023-06-01" &&
                claudeBody["output_config"] == j(mapOf("effort" to "low")) &&
                claudeBody["messages"]!!
                    .asArray!![0]
                    .obj()["content"]!!
                    .asArray!![0]
                    .obj()["source"]!!
                    .obj()["data"]
                    .asString == "/9j/AAAA" &&
                gemini.headers["x-goog-api-key"] == "AQ.Ab8" + "g".repeat(40) &&
                gemini.url.endsWith("/models/gemini-flash-latest:generateContent") &&
                geminiBody["contents"]!!
                    .asArray!![0]
                    .obj()["parts"]!!
                    .asArray!![0] == j(mapOf("inlineData" to mapOf("mimeType" to "image/jpeg", "data" to "/9j/AAAA"))),
            "Anthropic and Google keys too: the newest active Sonnet, the Flash Google keeps current $got",
        )
    }
}

class UiPhotoTest : ScreenTest() {
    private fun onePet() {
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
    }

    private fun snap(
        photo: ByteArray = jpegOf(480, 360),
        done: () -> Boolean = { db.servings.firstOrNull()?.str("status") == "noserver" },
    ) {
        platform.photo = photo
        act("feed")
        act("photo")
        check(until(10_000) { done() }, "the photo served")
        idle(400)
    }

    // a corner of the thumbnail shows either the orange packaging or its cream label
    private fun corners(): Pair<Int, List<String>> {
        val bytes = android.util.Base64.decode(db.servings[0].str("thumb")!!.substringAfter(","), 0)
        val b = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        val px =
            listOf(0.1 to 0.1, 0.9 to 0.1, 0.1 to 0.9, 0.9 to 0.9).map { (fx, fy) ->
                val c = b.getPixel((fx * (b.width - 1)).toInt(), (fy * (b.height - 1)).toInt())
                if (android.graphics.Color.green(c) > 180) "cream" else "orange"
            }
        return b.width to px
    }

    @Test
    fun `text_thumb - the thumbnail shows the square around the text, the middle without places`() {
        platform.pictures = AndroidPictures()
        onePet()
        platform.ocrText = "Sheba\nHuhn in Gelee"
        snap { db.servings.firstOrNull()?.obj("guess") != null }
        val middle = corners()
        act("close")
        idle(400)
        // in the top left of the label, in the pixels of the large photo as it is read (2400 x 1800)
        val lines = listOf(listOf("Whiskas", 350, 500, 1000, 650), listOf("Rind in Gelee", 350, 700, 1250, 850))
        val blocks =
            lines.map { (t, x0, y0, x1, y1) ->
                mapOf(
                    "lines" to listOf(mapOf("text" to t, "boundingBox" to mapOf("left" to x0, "top" to y0, "right" to x1, "bottom" to y1))),
                )
            }
        platform.ocrResult = j(mapOf("text" to "Whiskas\nRind in Gelee", "blocks" to blocks)).obj()
        snap(jpegOf(3000, 2250)) { db.servings.size == 2 && db.servings[0].obj("guess") != null } // the new meal, not the first one
        val moved = corners()
        check(
            middle == (200 to List(4) { "orange" }) && moved == (200 to listOf("orange", "orange", "cream", "cream")),
            "read without places: the middle; with them: up and to the left, where the text stands $middle $moved",
        )
        val thumb = db.servings[0].str("thumb")
        act("save-name")
        idle(400)
        check(db.products.find { it.str("brand") == "Whiskas" }?.str("thumb") == thumb, "the variety named from it has that thumbnail")
    }

    @Test
    fun `discard - a meal broken off after the photo, deleted from naming or its card, with undo, also while it is read`() {
        onePet()
        snap()
        act("delete-serving")
        idle(400)
        var gone = listOf(sheet != null, db.servings.size, tags("pend-").size)
        act("undo")
        idle(400)
        val s = db.servings.firstOrNull()
        val back = listOf(db.servings.size, s?.str("productId"), s?.str("status"), s?.str("photo") != null, s?.str("thumb") != null)
        check(gone == listOf(false, 0, 0) && back == listOf(1, null, "noserver", true, true), "deleted from naming; undo restores it $back")
        act("delete-serving", "id" to db.servings[0].id)
        idle(400)
        gone = listOf(db.servings.size, tags("pend-").size)
        act("undo")
        idle(400)
        val id = db.servings[0].id
        check(
            gone == listOf(0, 0) && db.servings.size == 1 && tags("level-", within = "pend-$id").isNotEmpty(),
            "deleted from its card, undone $gone",
        )
        act("open-serving", "id" to id)
        type("Marke", "Sheba")
        type("Sorte", "Lachs")
        act("save-name")
        act("close")
        idle(400)
        val before = listOf(db.products.size, db.servings.size)
        platform.barcode = SHEBA
        act("feed")
        act("scan")
        check(
            until { db.servings[0].str("scanCode") != null && db.servings[0].str("status") == "noserver" },
            "an unknown code photographed",
        )
        idle(400)
        act("delete-serving")
        idle(400)
        val after = listOf(db.products.size, db.servings.size, db.products.any { it.obj("codes")?.get(SHEBA) != null })
        check(after == before + false, "deleted after an unknown code: no variety got the code $after")
        val reads = calls("processImage").size
        val gate = platform.hold("")
        snap { db.servings.firstOrNull()?.str("status") == "reading" }
        act("close")
        act("delete-serving", "id" to db.servings[0].id)
        gate.complete(Unit)
        idle(200)
        act("undo")
        check(
            until { db.servings.firstOrNull()?.str("status") == "noserver" } && calls("processImage").size == reads + 2,
            "deleted while read, undone: read again ${calls("processImage").size - reads}",
        )
    }
}

class UiNamingPhotoTest : ScreenTest() {
    private fun onePet() {
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
    }

    private fun snap(
        photo: ByteArray = jpegOf(480, 360),
        done: () -> Boolean = { db.servings.firstOrNull()?.str("status") == "noserver" },
    ) {
        platform.photo = photo
        act("feed")
        act("photo")
        check(until(10_000) { done() }, "the photo served")
        idle(400)
    }

    private val fields get() = listOf(fieldText("Marke"), fieldText("Sorte"))

    private fun field(label: String) =
        rule.onAllNodes(
            androidx.compose.ui.test
                .hasContentDescription(label) and
                androidx.compose.ui.test
                    .hasSetTextAction(),
        )[0]

    private fun focused(label: String) =
        rule
            .onAllNodes(
                androidx.compose.ui.test
                    .hasContentDescription(label) and
                    androidx.compose.ui.test
                        .hasSetTextAction() and
                    androidx.compose.ui.test
                        .isFocused(),
            ).fetchSemanticsNodes()
            .isNotEmpty()

    // the lines read off the packaging, as chips for the variety, with whether each is pressed
    private fun chips(): List<Pair<String, Boolean>> {
        val p = androidx.compose.ui.semantics.SemanticsProperties
        return rule
            .onAllNodes(
                androidx.compose.ui.test.SemanticsMatcher("line chip") {
                    it.config.getOrElseNullable(p.ContentDescription) { null }?.any { d -> d.startsWith("Sorte: ") } == true
                },
            ).fetchSemanticsNodes()
            .map { n -> n.config[p.ContentDescription][0].removePrefix("Sorte: ") to n.config.getOrElseNullable(p.Selected) { false }!! }
    }

    private fun chip(line: String) {
        rule
            .onAllNodes(
                androidx.compose.ui.test
                    .hasContentDescription("Sorte: $line"),
            )[0]
            .performClick()
        idle(50)
    }

    @Test
    fun `pack_lines - chips that set the variety, in memory only, none after server recognition`() {
        onePet()
        http.household()
        platform.ocrText = "Katzenglück\nZarte Häppchen\nmit Huhn\n4 x 85 g\nZutaten: Fleisch"
        snap { db.servings.firstOrNull()?.obj("guess") != null }
        val all = chips().map { it.first }
        field("Sorte").performClick()
        type("Sorte", "Zart")
        val got =
            listOf("Zarte Häppchen", "mit Huhn", "mit Huhn").map { line ->
                chip(line)
                listOf(fieldText("Sorte"), chips().filter { it.second }.map { it.first }, focused("Sorte"))
            }
        chip("Katzenglück")
        field("Sorte").performTextInput("x")
        idle(50)
        check(
            all == listOf("Katzenglück", "Zarte Häppchen", "mit Huhn") &&
                got ==
                listOf(
                    listOf("Zarte Häppchen", listOf("Zarte Häppchen"), true),
                    listOf("mit Huhn", listOf("mit Huhn"), true),
                    listOf("", emptyList<String>(), true),
                ) &&
                chips().none { it.second },
            "a chip sets the variety, the next replaces it, the pressed one clears it, typing unpresses $all $got",
        )
        act("close")
        idle(400)
        val kept = listOf("db", "queue").joinToString { saved(it).toString() }
        restart()
        act("open-serving", "id" to db.servings[0].id)
        check("Zarte Häppchen" !in kept && chips().isEmpty(), "the lines are never stored: gone after a restart")
        act("close")
        idle(400)
        connect()
        snap { db.servings[0].str("productId") != null }
        act("open-serving", "id" to db.servings[0].id)
        act("edit-name")
        check(fields == listOf("Gourmet", "Gold Pastete") && chips().isEmpty(), "recognised by the server: no chips $fields")
    }

    private val meal get() =
        db.servings[0].let { s ->
            listOf(
                s.str("productId"),
                s.str("status"),
                s.str("photo") != null,
                s.str("thumb") != null,
                s.obj("guess")?.let { listOf(it["brand"].asString, it["variety"].asString) },
            )
        }

    @Test
    fun `known_photo - served without the sheet, undo takes the recognition back, not the meal`() {
        platform.pictures = AndroidPictures()
        onePet()
        http.household()
        val now = Time.now()
        db.products.add(Rec(j(product("sheba000001", "Sheba", "Lachs in Soße") + ("createdAt" to now)).obj()))
        db.servings.add(0, Rec(j(meal("first0000001", "sheba000001", now - 86_400_000, mapOf(db.pets[0].id to "top"))).obj()))
        phone.store.save()
        ui.update()
        idle(100)

        fun photo(
            text: String,
            n: Int,
        ): List<Any?> {
            platform.ocrText = text
            snap {
                db.servings.size == n &&
                    (
                        db.servings[0].str(
                            "productId",
                        ) == "sheba000001" ||
                            db.servings[0].str("status") == "noserver"
                    )
            }
            return meal
        }
        var m = photo("SHEBA\nLachs in Soße\n85 g", 2)
        check(
            m == listOf("sheba000001", null, false, false, null) &&
                sheet == null &&
                ui.toasts.undo != null &&
                phone.photos.keptPhoto("sheba000001"),
            "served as that variety, no sheet, undo offered, the photo kept for the variety $m",
        )
        act("undo")
        idle(400)
        check(
            meal == listOf(null, "noserver", true, true, listOf("Sheba", "Lachs in Soße")) &&
                level == listOf("serving", null, "name") &&
                fields == listOf("Sheba", "Lachs in Soße") &&
                chips().isNotEmpty() &&
                db.products.size == 1 &&
                db.servings.size == 2 &&
                phone.photos.keptPhoto("sheba000001"),
            "undo takes the variety off, not the meal: naming opens with the reading, the variety keeps its photo $meal",
        )
        act("delete-serving")
        idle(400)
        check(db.servings.size == 1 && db.products.size == 1 && sheet == null, "deleted there, variety kept")
        prefs.serverPhoto = false
        connect()
        m = photo("Sheba\nLachs in Soße", 2)
        check(m.take(2) == listOf("sheba000001", null) && sheet == null, "in a household without server photos: served at once as well $m")
        act("undo")
        idle(400)
        check(
            meal == listOf(null, "noserver", true, true, listOf("Sheba", "Lachs in Soße")) && level == listOf("serving", null, "name"),
            "and undo opens naming",
        )
    }

    @Test
    fun `skeleton - fields once patience runs out, typing meanwhile stays, the reading fills only empty fields`() {
        onePet()
        val gate = platform.hold("Whiskas\nRind in Gelee")
        platform.photo = jpegOf(480, 360)
        act("feed")
        act("photo")
        check(until { db.servings.firstOrNull()?.str("status") == "reading" && sheet?.kind == "serving" }, "reading")
        val early = fieldText("Marke") != null
        check(until(6000) { fieldText("Marke") != null }, "fields once patience runs out")
        field("Marke").performClick()
        type("Marke", "Animonda")
        gate.complete(Unit)
        check(until { db.servings[0].obj("guess") != null }, "read")
        idle(400)
        val s = db.servings[0]
        check(
            !early &&
                fields == listOf("Animonda", "Rind in Gelee") &&
                focused("Marke") &&
                listOf(s.str("status"), s.obj("guess")!!["brand"].asString) == listOf("noserver", "Whiskas"),
            "no fields while it reads at first; typed brand stays, the variety is filled, the focus stays $fields",
        )
    }

    private fun snapshot() =
        db.servings[0].let { s ->
            listOf(
                s.str("status"),
                s.obj("guess")?.let { listOf(it["brand"].asString, it["variety"].asString) },
                (s.str("thumb") ?: "").takeLast(32),
                (s.str("photo") ?: "").takeLast(32),
            )
        } + listOf(fields)

    private fun again(
        text: String,
        photo: ByteArray?,
    ) {
        platform.ocrText = text
        platform.photo = photo
        act("rephoto")
    }

    @Test
    fun `rephoto - replaces the photo and reads it anew, a late old reading counts for nothing`() {
        var fail = false
        val photos = mutableListOf<String>()
        platform.pictures = AndroidPictures()
        onePet()
        http.household(failing = { fail }, photos = photos)
        platform.ocrText = "Whiskas\nRind in Gelee"
        snap()
        val first = snapshot()
        platform.calls.clear()
        again("Sheba\nLachs in Soße", jpegOf(3000, 2250))
        check(
            until {
                db.servings[0]
                    .obj("guess")
                    ?.get("brand")
                    .asString == "Sheba"
            },
            "read anew",
        )
        idle(400)
        val second = snapshot()
        check(
            first.take(2) == listOf("noserver", listOf("Whiskas", "Rind in Gelee")) &&
                second.take(2) == listOf("noserver", listOf("Sheba", "Lachs in Soße")) &&
                second[4] == listOf("Sheba", "Lachs in Soße") &&
                second.subList(2, 4) != first.subList(2, 4) &&
                calls("capture").size == 1 &&
                (calls("capture")[0] as String?).isNullOrEmpty(),
            "a new photo replaces photo and thumbnail and is read anew",
        )
        again("Animonda\nCarny", null)
        idle(400)
        check(snapshot() == second, "cancelled: nothing changes")
        val gate = platform.hold("Animonda\nCarny")
        again("", jpegOf(480, 360))
        check(until(6000) { fieldText("Marke") != null && db.servings[0].str("status") == "reading" }, "fields while it reads")
        val waiting = listOf(db.servings[0].str("status"), shows("Neues Foto"))
        again("Felix\nHuhn in Gelee", jpegOf(3000, 2250))
        check(
            until {
                db.servings[0]
                    .obj("guess")
                    ?.get("brand")
                    .asString == "Felix"
            },
            "the newer photo read",
        )
        gate.complete(Unit)
        idle(200)
        idle(400)
        val late = snapshot()
        check(
            waiting == listOf("reading", true) &&
                late.take(2) == listOf("noserver", listOf("Felix", "Huhn in Gelee")) &&
                late[4] == listOf("Felix", "Huhn in Gelee"),
            "a late old reading changes nothing $waiting $late",
        )
        act("close")
        idle(400)
        connect()
        fail = true
        platform.ocrText = ""
        snap { db.servings.firstOrNull()?.str("status") == "waiting" }
        act("open-serving", "id" to db.servings[0].id)
        val link = shows("Neues Foto")
        fail = false
        again("", jpegOf(3000, 2250))
        check(
            until { db.servings[0].str("productId") != null && db.products.any { it.str("variety") == "Gold Pastete" } },
            "recognised by the server",
        )
        check(link && photos.size == 2 && photos[0] != photos[1], "household: the new photo goes to the server ${photos.size}")
    }
}

class UiProductPhotoTest : ScreenTest() {
    private fun onePet() {
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
    }

    // the variety's thumbnail, its photo file and its mark for a photo on the server
    private fun photoOf(pid: String): List<String?> {
        write()
        val p = db.products.first { it.id == pid }
        val f = File(dir, "photos/$pid.jpg")
        val file =
            if (f.exists()) {
                java.util.Base64
                    .getEncoder()
                    .encodeToString(f.readBytes())
            } else {
                ""
            }
        return listOf((p.str("thumb") ?: "").takeLast(32), file.takeLast(32), p.str("sharedPhoto"))
    }

    private fun take(
        photo: ByteArray,
        pid: String,
    ): Pair<List<String?>, List<String?>> {
        platform.photo = photo
        val old = photoOf(pid)
        act("product-photo", "id" to pid)
        check(until { (db.products.first { it.id == pid }.str("thumb") ?: "").takeLast(32) != old[0] }, "a new thumbnail")
        idle(400)
        return old to photoOf(pid)
    }

    private fun bounds(tag: String) =
        rule
            .onNode(
                androidx.compose.ui.test
                    .hasTestTag(tag),
                useUnmergedTree = true,
            ).fetchSemanticsNode()
            .boundsInRoot

    @Test
    fun `product_photo - thumbnail and file change from its sheets, cancel changes nothing, typed fields stay`() {
        platform.pictures = AndroidPictures()
        onePet()
        platform.ocrText = "Whiskas\nRind in Gelee"
        platform.photo = jpegOf(480, 360)
        act("feed")
        act("photo")
        check(until { db.servings.firstOrNull()?.str("status") == "noserver" }, "the photo served")
        idle(400)
        act("save-name")
        idle(400)
        val pid = db.products[0].id
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to pid),
        )
        platform.calls.clear()
        val (before, after) = take(jpegOf(3000, 2250), pid)
        check(
            before[1]!!.isNotEmpty() &&
                after[0] != before[0] &&
                after[1] != before[1] &&
                after[2] == null &&
                calls("capture").size == 1 &&
                (calls("capture")[0] as String?).isNullOrEmpty(),
            "food sheet: new thumbnail and file $after",
        )
        val card = bounds("pack-card")
        val pic = bounds("pack-photo")
        check(
            pic.width == card.width && kotlin.math.abs(pic.width / pic.height - 4f / 3f) < 0.02f,
            "the photo as wide as its card, cut to 4:3 $pic $card",
        )
        platform.photo = null
        act("product-photo", "id" to pid)
        idle(400)
        check(photoOf(pid) == after, "cancelled: nothing changes")
        act("close")
        idle(400)
        db.products.add(Rec(j(product("ohnefoto0001", "Felix", "Huhn") + ("createdAt" to Time.now())).obj()))
        phone.store.save()
        openSheet(
            de.schmeckts.app.ui
                .SheetState("product", "id" to "ohnefoto0001"),
        )
        val wide = tags("pack-card", sheet = true).size
        val (none, added) = take(jpegOf(480, 360), "ohnefoto0001")
        check(
            none.subList(0, 2) == listOf("", "") &&
                added[0]!!.isNotEmpty() &&
                added[1]!!.isNotEmpty() &&
                listOf(wide, tags("pack-card", sheet = true).size) == listOf(0, 1),
            "a variety without a photo gets one, and only then the picture across the card",
        )
        act("close")
        idle(400)
        act("open-serving", "id" to db.servings[0].id)
        act("edit-name")
        type("Marke", "Whiskas Neu")
        val (old, new) = take(jpegOf(480, 360), pid)
        check(
            new[0] != old[0] && new[1] != old[1] && fieldText("Marke") == "Whiskas Neu",
            "while naming: photo changes, typed brand stays",
        )
    }
}

class UiCropTest : ScreenTest() {
    // four quadrants for cropping: red, green, blue, yellow
    private fun quadrants(): ByteArray {
        val b = android.graphics.Bitmap.createBitmap(800, 400, android.graphics.Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(b)
        val paint = android.graphics.Paint()
        for ((rect, color) in listOf(
            android.graphics.Rect(0, 0, 400, 200) to android.graphics.Color.rgb(220, 30, 30),
            android.graphics.Rect(400, 0, 800, 200) to android.graphics.Color.rgb(30, 160, 60),
            android.graphics.Rect(0, 200, 400, 400) to android.graphics.Color.rgb(30, 60, 220),
            android.graphics.Rect(400, 200, 800, 400) to android.graphics.Color.rgb(230, 210, 40),
        )) {
            paint.color = color
            c.drawRect(rect, paint)
        }
        return java.io
            .ByteArrayOutputStream()
            .also { b.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            .toByteArray()
    }

    private fun rect() = (sheet!!["crop"] as de.schmeckts.app.ui.Crop).rect().let { listOf(it.x, it.y, it.side) }

    @Test
    fun `crop - zoom and drag, applied at 320 px, cancel keeps the old one`() {
        platform.pictures = AndroidPictures()
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
        main.logic.pets.openPet(db.pets[0].id)
        idle(100)
        platform.image = quadrants()
        act("pet-photo")
        idle(100)
        check(sheet?.step == "crop", "cropping $level ${calls("pickImage")} $toast")
        val start = rect()
        rule
            .onNode(
                androidx.compose.ui.test
                    .hasContentDescription("Zoom"),
                useUnmergedTree = true,
            ).performTouchInput {
                click(
                    Offset(
                        width / 3f,
                        centerY,
                    ),
                )
            }
        idle(50)
        rule
            .onNode(
                androidx.compose.ui.test
                    .hasTestTag("crop"),
                useUnmergedTree = true,
            ).performTouchInput {
                down(center)
                repeat(4) { moveBy(Offset(width / 8f, height / 8f)) }
                up()
            }
        idle(50)
        check(
            listOf(start, rect()) == listOf(listOf(200, 0, 400), listOf(200, 0, 200)),
            "opens on the whole middle; zoomed and dragged, it stops at the edge ${rect()}",
        )
        act("crop-apply")
        val photo = sheet!!.str("photo")!!
        val bytes = android.util.Base64.decode(photo.substringAfter(","), 0)
        val b = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        val red =
            listOf(0.1 to 0.1, 0.9 to 0.1, 0.1 to 0.9, 0.9 to 0.9).all { (fx, fy) ->
                val c = b.getPixel((fx * (b.width - 1)).toInt(), (fy * (b.height - 1)).toInt())
                android.graphics.Color.red(c) > 150 && android.graphics.Color.green(c) < 100
            }
        check(
            sheet!!.step == null && photo.startsWith("data:image/jpeg") && b.width == 320 && b.height == 320 && red,
            "applied: 320 px, red quadrant ${b.width}",
        )
        act("save-pet")
        idle(400)
        check(db.pets[0].str("photo") == photo, "saved on the pet")
        main.logic.pets.openPet(db.pets[0].id)
        idle(100)
        platform.image = jpegOf(480, 360)
        act("pet-photo")
        idle(100)
        act("crop-cancel")
        check(
            sheet!!.step == null && sheet!!.str("photo") == photo && fieldText("Name") != null,
            "cancel: back in the pet sheet, the picture stays",
        )
    }
}

class UiCameraTest : ScreenTest() {
    private fun onePet() {
        open()
        act("add-pet")
        type("Name", "Minka")
        act("save-pet")
        idle(400)
    }

    private val cam get() = ui.camera.open

    private fun feedPhoto() {
        act("feed")
        act("photo")
        idle(100)
    }

    // the system's question for the camera, still open when our camera closed, answered; Android asks one at a time
    private fun answer(granted: Boolean = false) {
        val shadow = org.robolectric.Shadows.shadowOf(rule.activity)
        val asked = shadow.nextStartedActivityForResult ?: return
        val result = if (granted) android.content.pm.PackageManager.PERMISSION_GRANTED else android.content.pm.PackageManager.PERMISSION_DENIED
        val names = asked.intent.getStringArrayExtra("android.content.pm.extra.REQUEST_PERMISSIONS_NAMES")
        val data =
            android.content
                .Intent()
                .putExtra("android.content.pm.extra.REQUEST_PERMISSIONS_NAMES", names)
                .putExtra("android.content.pm.extra.REQUEST_PERMISSIONS_RESULTS", IntArray(names?.size ?: 0) { result })
        shadow.receiveResult(asked.intent, android.app.Activity.RESULT_OK, data)
        idle(10)
    }

    // what the shutter hands over once the sensor has the still
    private fun shutter(n: Int): Boolean {
        ui.camera.close(jpegOf(1920, 1440))
        answer()
        check(until { db.servings.size == n && fieldText("Marke") != null }, "served from our camera")
        idle(400)
        return db.servings.size == n && db.servings[0].str("photo")!!.startsWith("data:image/jpeg") && !cam
    }

    @Test
    fun `camera - our own camera serves at once, released on every way out, falls back to the camera app`() {
        platform.camera = true
        onePet()
        feedPhoto()
        check(cam && shows("Packung fotografieren") && labelled("Auslösen"), "feeding → photo: our camera with its shutter")
        check(
            shutter(1) &&
                level == listOf("serving", null, "name") &&
                db.servings[0].str("status") == "noserver" &&
                db.servings[0].str("thumb") != null,
            "the shutter serves at once and releases the camera, on to naming",
        )
        act("close")
        idle(400)
        val ways =
            listOf<Pair<String, () -> Unit>>(
                "cancel" to { tap("Abbrechen") },
                "back button" to { back() },
                "background" to {
                    rule.activityRule.scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED)
                    idle(10)
                    rule.activityRule.scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED)
                },
            )
        for ((how, out) in ways) {
            feedPhoto()
            val opened = cam
            out()
            idle(400)
            answer()
            check(
                opened && listOf(cam, db.servings.size, sheet?.kind) == listOf(false, 1, "feed"),
                "$how: closed and released at once, nothing served, the feeding sheet stays",
            )
            act("close")
            idle(400)
        }
        platform.barcode = SHEBA
        act("feed")
        act("scan")
        check(until { cam }, "our camera for an unknown code")
        val hint = ui.camera.hint
        check(
            shutter(2) && db.servings[0].str("scanCode") == SHEBA && hint!!.startsWith("Barcode unbekannt."),
            "unknown barcode: our camera says why it opens, the code on the meal ($hint)",
        )
        act("close")
        idle(400)
        link("schmeckts://photo")
        check(cam, "schmeckts://photo opens our camera")
        platform.photo = jpegOf(480, 360)
        platform.calls.clear()
        ui.camera.fail(
            de.schmeckts.app.ui
                .CameraFailed("Das Foto ließ sich nicht aufnehmen."),
        )
        answer()
        check(until { db.servings.size == 3 }, "served")
        idle(400)
        check(calls("capture").size == 1 && !cam, "no still from the sensor: the camera app takes the photo")
        act("close")
        idle(400)
        platform.calls.clear()
        feedPhoto()
        val asked =
            org.robolectric.Shadows
                .shadowOf(rule.activity)
                .lastRequestedPermission
        check(cam && asked.requestedPermissions.toList() == listOf(android.Manifest.permission.CAMERA), "the camera asked for")
        answer(false)
        check(until { db.servings.size == 4 && fieldText("Marke") != null }, "served by the camera app")
        idle(400)
        check(calls("capture").size == 1 && !cam && db.servings.size == 4, "camera denied: the camera app serves")
        act("close")
        idle(400)
        platform.photoError = "camera unavailable"
        feedPhoto()
        answer(false)
        idle(400)
        check(toast != null && db.servings.size == 4, "the camera app blocked as well: a notice, nothing served")
        act("close")
        idle(400)
        platform.calls.clear()
        main.logic.pets.openPet(db.pets[0].id)
        idle(100)
        act("pet-photo")
        idle(100)
        check(calls("pickImage").size == 1 && calls("capture").isEmpty() && !cam, "the profile picture comes from the gallery")
    }

    @Test
    fun `no_camera - without a camera of its own, the camera app`() {
        open()
        act("demo")
        act("feed")
        act("photo")
        idle(100)
        check(calls("capture").size == 1 && !cam, "no camera: the camera app")
    }
}
