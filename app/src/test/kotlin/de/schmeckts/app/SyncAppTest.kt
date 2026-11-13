package de.schmeckts.app

import de.schmeckts.app.ui.SheetState
import de.schmeckts.app.views.syncChip
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import java.io.File

// The app on several phones against the real server: connecting from the settings, reminders, recognition by the
// server and the packaging photo it shares, scanning. The rest of the old sync_test.py; the data part is SyncTest.

private const val CODE = "K7PM-3QXD"
private const val MISS = "4012345000016"

/** A phone with the whole app on it, its work on a thread of its own, its network a switch. */
private class Hand(
    val dir: File,
    val net: Switch,
    val platform: FakePlatform,
) {
    lateinit var main: Main
    val phone get() = main.phone
    val ui get() = main.ui
    val db get() = main.phone.db
    val prefs get() = main.phone.prefs

    fun start() {
        val thread =
            java.util.concurrent.Executors
                .newSingleThreadExecutor { Thread(it, "phone-main").apply { isDaemon = true } }
                .asCoroutineDispatcher()
        main = runBlocking(thread) { Main(Phone(dir, thread, kotlinx.coroutines.Dispatchers.IO, platform, net)).also { it.start() } }
    }

    fun <T> on(block: suspend Main.() -> T): T = runBlocking(phone.main) { main.block() }

    fun act(
        name: String,
        vararg data: Pair<String, String?>,
    ) = on { ui.act(name, *data) }

    fun edit(block: Phone.() -> Unit) =
        on {
            phone.block()
            phone.store.save()
        }

    fun until(
        seconds: Double = 10.0,
        cond: Main.() -> Boolean,
    ): Boolean {
        val end = System.currentTimeMillis() + (seconds * 1000).toLong()
        while (System.currentTimeMillis() < end) {
            if (on { cond() }) return true
            Thread.sleep(100)
        }
        return on { cond() }
    }

    fun restart() {
        on {
            phone.sync.stop()
            phone.store.flush()
        }
        phone.close()
        start()
    }

    fun close() {
        phone.sync.stop()
        phone.close()
    }
}

/** waits for a condition across phones */
private fun poll(
    seconds: Double = 8.0,
    cond: () -> Boolean,
): Boolean {
    val end = System.currentTimeMillis() + (seconds * 1000).toLong()
    while (!cond()) {
        if (System.currentTimeMillis() > end) return false
        Thread.sleep(100)
    }
    return true
}

private fun hand(files: Map<String, Any> = emptyMap()): Hand {
    val dir = tempDir()
    writeFiles(dir, mapOf("prefs" to j(mapOf("updates" to false))) + files)
    return Hand(dir, Switch(), FakePlatform()).also { it.start() }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SyncAppTest {
    private val failures = mutableListOf<String>()

    private fun expect(
        cond: Boolean,
        text: String,
    ): Boolean {
        println((if (cond) "  ok   " else "  FAIL ") + text)
        if (!cond) failures.add(text)
        return cond
    }

    // address and code typed into the household page, as a person does it
    private fun Hand.connect(
        code: String,
        server: String? = null,
    ) {
        on {
            if (ui.sheet?.page != "house") {
                ui.sheets.closeAll()
                ui.sheets.openSheet(SheetState("settings", "page" to "house"))
            }
            if (ui.sheet?.bool("connectForm") != true) ui.act("connect-form")
            val s = ui.sheet!!
            if (server != null) s["server"] = server
            s["code"] = code
            ui.act("connect")
        }
        until { ui.sheet?.bool("connecting") != true }
    }

    private fun Hand.serve(
        id: String,
        pets: String,
        product: String = "lxprod0001",
    ) = edit {
        db.servings.add(
            0,
            Rec(parseJson("""{"id":"$id","productId":"$product","servedAt":${Time.now()},"pets":$pets,"note":""}""").obj()),
        )
    }

    private fun Hand.rating(
        meal: String,
        pet: String,
    ) = on {
        (
            phone.db.servings
                .find { it.id == meal }
                ?.pets
                ?.get(pet) as? JsonObject
        )?.get("r").asString
    }

    private fun Hand.rate(
        meal: String,
        pet: String,
        r: String,
    ) = edit {
        val s = db.servings.first { it.id == meal }
        s["pets"] = JsonObject(s.pets + (pet to j(mapOf("r" to r, "at" to Time.now()))))
    }

    private fun Hand.planned() = (platform.notifications.planned.mapNotNull { it.serving }).sorted()

    private fun Hand.photo(pid: String) = File(dir, "photos/$pid.jpg")

    @Test
    fun `the app against the real server`() {
        val fake = FakeAnthropic()
        val srv = GoServer(fake.url)
        srv.start()
        val hands = mutableListOf<Hand>()
        try {
            // phone A is in use (data without clocks) and connects from the settings
            val a = hand(mapOf("db" to savedDb()))
            hands += a
            a.connect("XXXX-YYYY", srv.url)
            expect(
                a.on {
                    ui.sheet?.str("connectError")?.isNotEmpty() == true
                } &&
                    a.on { phone.prefs.code } == "",
                "wrong code: an error, not connected",
            )
            a.connect("k7pm 3qxd")
            expect(
                a.until { phone.prefs.code == CODE && phone.store.state.epoch != "" && phone.store.queue.isEmpty() },
                "right code, lower case with spaces: connected, everything sent",
            )
            expect(a.until { phone.sync.status.state == "ok" && !phone.sync.status.busy }, "status ok")

            // phone B: the sample data, then connect
            val b = hand()
            hands += b
            b.act("demo")
            b.connect(CODE, srv.url)
            expect(
                b.until { phone.store.state.epoch != "" && phone.db.pets.any { it.id == "lxpet00001" } },
                "phone B connected, sees the household data",
            )
            expect(
                b.on { (phone.db.pets + phone.db.products + phone.db.servings).none { it.id.startsWith("demo") } } &&
                    srv.records().values.none { c -> c.keys.any { it.startsWith("demo") } },
                "sample data removed on connecting, never sent",
            )
            b.on { ui.sheets.closeAll() }
            a.on { ui.sheets.closeAll() }

            // rating reminders on A, planned from the data: cancelled only once the other phone has rated too
            b.edit {
                db.pets.add(
                    Rec(parseJson("""{"id":"tigerpet0001","name":"Tiger","species":"Katze","createdAt":${Time.now()}}""").obj()),
                )
            }
            a.until(6.0) { phone.db.pets.any { it.id == "tigerpet0001" } }
            a.on { phone.prefs.remind = 60 }
            a.serve("zweipets0001", """{"lxpet00001":{"r":null,"at":null},"tigerpet0001":{"r":null,"at":null}}""")
            a.serve("wirdgeloescht", """{"lxpet00001":{"r":null,"at":null}}""")
            expect(
                b.until(6.0) { phone.db.servings.any { it.id == "wirdgeloescht" } } &&
                    poll(3.0) { a.planned() == listOf("wirdgeloescht", "zweipets0001") },
                "reminders planned on A ${a.planned()}",
            )
            b.net.blocked = true
            a.rate("zweipets0001", "lxpet00001", "gut")
            b.rate("zweipets0001", "tigerpet0001", "schlecht")
            a.until { phone.store.queue.isEmpty() }
            Thread.sleep(500)
            val half = a.planned()
            b.net.blocked = false
            b.on { phone.sync.syncSoon(0) }
            val both: Hand.() -> Boolean = {
                rating("zweipets0001", "lxpet00001") == "gut" &&
                    rating("zweipets0001", "tigerpet0001") == "schlecht"
            }
            expect(poll { a.both() && b.both() }, "different pets rated at the same time: both ratings kept")
            expect(
                "zweipets0001" in half && poll(5.0) { a.planned() == listOf("wirdgeloescht") },
                "reminder kept after our rating, cancelled once B rates the rest ${a.planned()}",
            )
            b.edit { db.servings.removeAll { it.id == "wirdgeloescht" } }
            expect(a.until(8.0) { phone.db.servings.none { it.id == "wirdgeloescht" } }, "a meal deleted on B disappears on A")
            expect(poll(5.0) { a.planned().isEmpty() }, "reminder cancelled when another phone deletes the meal")
            a.on { phone.prefs.remind = 0 }

            // a reminder's button waits for the household: a pet B rated meanwhile opens on A instead of being rated over
            a.serve("knopfmahl01", """{"lxpet00001":{"r":null,"at":null}}""")
            b.until(6.0) { phone.db.servings.any { it.id == "knopfmahl01" } }
            val release = CompletableDeferred<Unit>()
            a.net.noLive = true
            a.net.hold = { method, url -> if (method == "GET" && "/api/changes" in url) release.await() }
            a.on {
                phone.sync.stop()
                phone.sync.start()
            }
            b.rate("knopfmahl01", "lxpet00001", "schlecht")
            b.until { phone.store.queue.isEmpty() }
            val stale = a.rating("knopfmahl01", "lxpet00001")
            a.on { phone.scope.launch { logic.reminders.onAction("gut", "knopfmahl01", "lxpet00001") } }
            Thread.sleep(500)
            release.complete(Unit)
            expect(
                stale == null &&
                    a.until(6.0) { ui.sheet?.kind == "serving" && ui.sheet?.id == "knopfmahl01" } &&
                    a.rating("knopfmahl01", "lxpet00001") == "schlecht",
                "a reminder button first catches up: what B rated meanwhile opens on A and stays",
            )
            a.net.hold = null
            a.net.noLive = false
            a.on { ui.sheets.closeAll() }
            a.net.blocked = true
            a.serve("knopfmahl02", """{"lxpet00001":{"r":null,"at":null}}""")
            a.until(15.0) { phone.sync.status.state == "offline" }
            a.on { phone.scope.launch { logic.reminders.onAction("gut", "knopfmahl02", "lxpet00001") } }
            expect(poll(0.5) { a.rating("knopfmahl02", "lxpet00001") == "gut" }, "with the server out of reach the button rates at once")
            a.net.blocked = false
            a.on { phone.sync.syncSoon(0) }
            a.until { phone.store.queue.isEmpty() }

            // the feeding reminder gets server and code; the server counting meals is in SyncTest
            a.on {
                phone.prefs.feedRemind = true
                logic.reminders.syncReminders()
            }
            val n = a.platform.notifications
            expect(a.until { n.feedServer == srv.url && n.feedCode == CODE }, "feeding reminder: server and code handed over")
            a.on { phone.prefs.feedRemind = false }

            // without a connection: a notice at the top, the queue survives a restart
            a.net.blocked = true
            a.edit {
                db.pets.add(
                    Rec(parseJson("""{"id":"lunapet00001","name":"Luna","species":"Katze","createdAt":${Time.now()}}""").obj()),
                )
            }
            a.until(15.0) { phone.syncChip() != null }
            a.restart()
            expect(
                a.on {
                    phone.store.queue.isNotEmpty() && phone.db.pets.any { it.str("name") == "Luna" }
                },
                "offline: queue and data survive a restart",
            )
            a.net.blocked = false
            a.on { phone.sync.syncSoon(0) }
            expect(
                a.until { phone.store.queue.isEmpty() } && b.until(6.0) { phone.db.pets.any { it.str("name") == "Luna" } },
                "online again: the queue is sent and B has it",
            )
            expect(a.until(5.0) { phone.syncChip() == null }, "no notice at the top afterwards")

            // photo recognition through the server, and the packaging photo shared with every phone
            for (h in listOf(a, b)) h.platform.pictures = AndroidPictures()
            val pack = jpegOf(480, 360)
            a.platform.photo = pack
            a.act("feed")
            a.act("photo")
            expect(
                a.until { phone.db.products.any { it.str("variety") == "Lachs in Soße" } } && fake.calls == 1,
                "photo recognised by the server",
            )
            expect(
                b.until(6.0) {
                    phone.db.products.any { it.str("variety") == "Lachs in Soße" } &&
                        phone.db.servings[0].str("productId") != null
                },
                "the recognised food reaches B",
            )
            val pid =
                a.on {
                    phone.db.products
                        .first { it.str("variety") == "Lachs in Soße" }
                        .id
                }
            val onServer = File(srv.dir, "photos/$pid.jpg")
            expect(
                b.until {
                    phone.db.products
                        .find { it.id == pid }
                        ?.get("sharedPhoto")
                        .truthy
                } &&
                    onServer.exists() &&
                    onServer.readBytes().contentEquals(a.photo(pid).readBytes()),
                "A hands its photo to the server, and the variety is marked on every phone",
            )
            b.on { ui.sheets.closeAll() }
            val view: (Hand) -> Int? = { h ->
                h.on { ui.toasts.hideToast() }
                h.act("view-photo", "s" to "", "p" to pid)
                h.until { ui.viewer.open || ui.toasts.show }
                h.on { ui.viewer.image?.width }.also { h.on { ui.viewer.dropViewer() } }
            }
            expect(view(b) == 480, "B, which did not take it, opens the photo large from the server")
            // B keeps what it fetched; without that copy the server's is the only one
            b.on { phone.photos.forgetPhoto(pid) }
            onServer.delete()
            b.act("view-photo", "s" to "", "p" to pid)
            b.until { ui.toasts.show }
            b.on { ui.viewer.dropViewer() }
            expect(
                b.until(6.0) {
                    !phone.db.products
                        .first { it.id == pid }["sharedPhoto"]
                        .truthy
                },
                "a photo the server has lost: the mark goes",
            )
            expect(
                b.until(15.0) {
                    phone.db.products
                        .first { it.id == pid }["sharedPhoto"]
                        .truthy
                } &&
                    onServer.exists(),
                "A, which still has it, hands it over again",
            )
            val changePhoto: (ByteArray) -> Unit = { jpeg ->
                a.platform.photo = jpeg
                a.on { ui.sheets.openSheet(SheetState("product", "id" to pid)) }
                a.act("product-photo", "id" to pid)
            }
            changePhoto(jpegOf(3000, 2250))
            expect(
                a.until {
                    phone.db.products
                        .first { it.id == pid }["sharedPhoto"]
                        .asDouble
                        .let { it != null && it > 1 } &&
                        (phone.prefs.photoStamps[pid] ?: 0) > 0
                } &&
                    b.until {
                        phone.db.products
                            .first { it.id == pid }["sharedPhoto"]
                            .asDouble
                            .let { it != null && it > 1 }
                    } &&
                    a.until { onServer.readBytes().contentEquals(a.photo(pid).readBytes()) } &&
                    onServer.length() != pack.size.toLong(),
                "a new photo on A: the server replaces its own, the mark carries the stamp",
            )
            a.on { ui.sheets.closeAll() }
            val width = view(b)
            expect(
                width == 1100 &&
                    b.on {
                        phone.prefs.photoStamps[pid]?.toDouble() ==
                            phone.db.products
                                .first { it.id == pid }["sharedPhoto"]
                                .asDouble
                    },
                "B fetches the new photo and notes its stamp ($width px)",
            )

            // a server before 1.4.0 (no "replace") keeps its photo; A says so and marks nothing
            a.net.info =
                { o ->
                    JsonObject(
                        o +
                            (
                                "features" to
                                    kotlinx.serialization.json.JsonArray(
                                        o["features"].asArray.orEmpty().filter { it.asString != "replace" },
                                    )
                            ),
                    )
                }
            a.on {
                phone.sync.status.features = null
                phone.sync.serverCan("replace")
            }
            val stamp = a.on { phone.db.products.first { it.id == pid }["sharedPhoto"] }
            val serverBefore = onServer.readBytes()
            changePhoto(pack)
            a.until(15.0) { ui.toasts.show }
            Thread.sleep(500)
            expect(
                a.on { phone.db.products.first { it.id == pid }["sharedPhoto"] } == stamp &&
                    onServer.readBytes().contentEquals(serverBefore) &&
                    !a.photo(pid).readBytes().contentEquals(serverBefore),
                "a server that cannot replace photos: a notice, the mark stays, only A has the new photo",
            )
            a.on { ui.sheets.closeAll() }
            a.net.info = null
            a.on {
                phone.sync.status.features = null
                phone.sync.serverCan("replace")
            }
            expect(
                b.on {
                    phone.db.servings[0].str("photo") == null &&
                        phone.db.products
                            .find { it.id == phone.db.servings[0].str("productId") }
                            ?.str("thumb") != null
                },
                "only the thumbnail is shared, on the food",
            )
            a.net.blocked = true
            fake.reply = """{"brand":"Felix","variety":"So gut wie es aussieht","type":"Nassfutter"}"""
            a.act("feed")
            a.act("photo")
            expect(
                a.until(6.0) { phone.db.servings[0].str("status") in listOf("waiting", "noserver") },
                "server out of reach: the photo waits",
            )
            a.net.blocked = false
            a.on { phone.sync.syncSoon(0) }
            expect(
                a.until { phone.db.products.any { it.str("brand") == "Felix" } && phone.db.servings[0].str("status") == null } &&
                    fake.calls == 2,
                "server back: recognised automatically",
            )
            a.on { ui.sheets.closeAll() }
            expect(
                srv
                    .records()
                    .getValue("servings")
                    .values
                    .none { r -> listOf("photo", "status", "error", "scanCode").any { it in r } },
                "fields local to the phone stay there",
            )

            // scanning: an unknown code with the lookup off goes to the camera
            var barcodeAsked = 0
            a.net.hold = { _, url -> if ("/api/barcode" in url) barcodeAsked++ }
            fake.reply = """{"brand":"Animonda","variety":"Carny Rind","type":"Nassfutter"}"""
            a.platform.calls.clear()
            a.platform.barcode = MISS
            a.platform.photo = pack
            a.act("feed")
            a.act("scan")
            expect(
                a.until(12.0) {
                    phone.db.products
                        .find { it.obj("codes")?.containsKey(MISS) == true }
                        ?.str("brand") == "Animonda"
                } &&
                    a.platform.calls.any { it.first == "capture" } &&
                    barcodeAsked == 0,
                "unknown code: straight to the camera, recognised, the code on the variety, no barcode request",
            )
            expect(
                b.until(8.0) { phone.db.products.any { it.obj("codes")?.containsKey(MISS) == true } },
                "the variety and its code reach B",
            )
            a.net.hold = null
        } finally {
            hands.forEach { runCatching { it.close() } }
            srv.stop()
        }
        assertTrue("${failures.size} failed: $failures", failures.isEmpty())
    }
}

class SyncBoxTest : ScreenTest() {
    @Test
    fun `the server box - connected from the settings on a first start, synced by hand, disconnected`() {
        val srv = GoServer(FakeAnthropic().url)
        srv.start()
        val other = phoneIn(tempDir().also { writeFiles(it, mapOf("db" to savedDb())) })
        try {
            other.on { sync.startSession(sync.checkServer(CODE, srv.url)).await() }
            val sw = Switch()
            net = sw
            open(mapOf("prefs" to j(mapOf("updates" to false))))
            act("open-settings")
            act("settings-page", "v" to "house")
            act("connect-form")
            type("Adresse des Servers", srv.url.removePrefix("http://"))
            type("Haushaltscode", CODE)
            act("connect")
            check(
                until(10_000) { phone.store.state.epoch != "" && db.pets.any { it.id == "lxpet00001" } } && prefs.server == srv.url,
                "first start: connected from the settings, the address works without http://",
            )
            until(10_000) { phone.sync.status.state == "ok" && !phone.sync.status.busy }
            idle(400)
            check(!shows("Abgleichen", substring = false), "all synced: no button to sync")
            sw.blocked = true
            db.servings[0]["note"] = j("wartet")
            phone.store.save()
            check(until(15_000) { shows("Abgleichen", substring = false) }, "a change waiting: the button to sync")
            sw.blocked = false // reachable again, but nothing tells the phone
            tap("Abgleichen")
            check(
                until(6000) { phone.store.queue.isEmpty() } && until(6000) { !shows("Abgleichen", substring = false) },
                "a change waiting: synced by hand, then the button goes",
            )
            val n = db.servings.size
            act("arm", "then" to "disconnect")
            act("arm", "then" to "disconnect")
            idle(400)
            check(
                prefs.code == "" &&
                    db.servings.size == n &&
                    db.pets.isNotEmpty() &&
                    shows("Mit Haushalt verbinden") &&
                    !shows("Verbindung trennen"),
                "disconnected: the data stays, the page offers to connect again",
            )
            act("connect-form")
            check(fieldText("Adresse des Servers") == srv.url, "connecting again: the last address is in the field")
        } finally {
            other.close()
            srv.stop()
        }
    }
}
