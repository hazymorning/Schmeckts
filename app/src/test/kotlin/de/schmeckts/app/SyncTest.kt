package de.schmeckts.app

import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** The sync against the real Go server: several phones, each in a folder of its own, the server with a data directory
 *  of its own, and a fake Anthropic for photo recognition. At the end both phones and the server hold the same data. */
class SyncTest {
    private val failures = mutableListOf<String>()

    private fun expect(
        cond: Boolean,
        text: String,
    ): Boolean {
        println((if (cond) "  ok   " else "  FAIL ") + text)
        if (!cond) failures.add(text)
        return cond
    }

    private val code = "K7PM-3QXD"
    private val newCode = "W9ZX-4HJT"
    private val miss = "4012345000016"
    private val c1 = "4012345000023"
    private val c2 = "4012345000030"

    private class Handset(
        val dir: File,
        val net: Switch,
        var phone: Phone,
    )

    private fun handset(
        files: Map<String, Any> = emptyMap(),
        now: () -> Long = { Time.now() },
    ): Handset {
        val dir = tempDir()
        writeFiles(dir, files)
        val net = Switch()
        return Handset(dir, net, phone(dir, net, now))
    }

    private fun phone(
        dir: File,
        net: Switch,
        now: () -> Long = { Time.now() },
    ): Phone {
        val main =
            java.util.concurrent.Executors
                .newSingleThreadExecutor {
                    Thread(it, "phone-main").apply { isDaemon = true }
                }.asCoroutineDispatcher()
        return kotlinx.coroutines.runBlocking(main) {
            Phone(dir, main, kotlinx.coroutines.Dispatchers.IO, net, now).also { it.sync.start() }
        }
    }

    // a restart of the app on the same files
    private fun Handset.restart(srv: GoServer) {
        phone.sync.stop()
        phone.flushNow()
        phone.close()
        phone = phone(dir, net)
        repoint(srv)
    }

    private fun Handset.repoint(srv: GoServer) {
        phone.on {
            if (prefs.server != srv.url && prefs.server.isNotEmpty()) {
                prefs.server = srv.url
                store.savePrefs()
            }
        }
    }

    private fun Handset.connect(
        code: String,
        server: String,
    ): String =
        phone.on {
            try {
                sync.startSession(sync.checkServer(code, server))
                "connected"
            } catch (e: ServerError) {
                e.kind
            }
        }

    private fun Handset.edit(block: Phone.() -> Unit) =
        phone.on {
            block()
            store.save()
        }

    private fun pet(
        id: String,
        name: String,
    ) = Rec(parseJson("""{"id":"$id","name":"$name","species":"Katze","photo":null,"createdAt":${Time.now()}}""").obj())

    private fun meal(
        id: String,
        pets: String,
        product: String = "lxprod0001",
    ) = Rec(parseJson("""{"id":"$id","productId":"$product","servedAt":${Time.now()},"pets":$pets,"note":""}""").obj())

    private fun Phone.rating(
        meal: String,
        pet: String,
    ) = ((rec("servings", meal)?.obj("pets")?.get(pet)) as? JsonObject)?.get("r").asString

    private fun Phone.rate(
        meal: String,
        pet: String,
        r: String,
    ) {
        val s = rec("servings", meal)!!
        s["pets"] = s.obj("pets")!!.with(pet, jsonObject("r" to JsonPrimitive(r), "at" to num(Time.now())))
    }

    // what the app holds, as the server would show it
    private fun Phone.projection(): Map<String, Map<String, Map<String, JsonElement>>> =
        on {
            COLLECTIONS.associateWith { c -> db[c].associate { r -> r.id to fieldsOf(c, r).mapValues { parseJson(it.value) } } }
        }

    @Test
    fun `phones against the real server`() {
        val fake = FakeAnthropic()
        val srv = GoServer(fake.url)
        srv.start()
        val phones = mutableListOf<Handset>()
        try {
            println("connecting")
            val a = handset(mapOf("db" to savedDb())).also(phones::add)
            expect(a.connect("XXXX-YYYY", srv.url) == "auth" && a.phone.prefs.code == "", "wrong code: an error, not connected")
            a.connect("k7pm 3qxd", srv.url)
            expect(
                a.phone.until { prefs.code == code && store.state.epoch != "" && store.queue.isEmpty() },
                "right code, lower case with spaces: connected, everything sent",
            )
            val rec = srv.records()
            expect(
                rec["servings"]!!.size == 3 && rec["pets"]!!["lxpet00001"]?.get("name").asString == "Minka",
                "the data taken over is on the server",
            )
            expect(a.phone.until { sync.status.state == "ok" && !sync.status.busy }, "status ok")

            val b = handset().also(phones::add)
            b.connect(code, srv.url)
            expect(
                b.phone.until { store.state.epoch != "" && db.pets.any { it.id == "lxpet00001" } },
                "phone B connected, sees the household data",
            )

            println("syncing")
            b.edit { db.pets.add(pet("tigerpet0001", "Tiger")) }
            expect(a.phone.until(6.0) { db.pets.any { it.str("name") == "Tiger" } }, "live: a new pet appears on the other phone")
            b.edit { rec("pets", "tigerpet0001")!!["nicknames"] = JsonArray(listOf(JsonPrimitive("Tigi"), JsonPrimitive("Mietz"))) }
            expect(
                a.phone.until(6.0) {
                    (rec("pets", "tigerpet0001")?.get("nicknames") as? JsonArray)?.map { it.asString } ==
                        listOf("Tigi", "Mietz")
                },
                "nicknames reach the other phone as a list",
            )
            a.edit { rec("pets", "tigerpet0001")!!.remove("nicknames") }
            expect(b.phone.until(6.0) { rec("pets", "tigerpet0001")?.has("nicknames") == false }, "and go there too when all are removed")
            b.edit { rec("pets", "tigerpet0001")!!.put("sex", "m") }
            expect(
                a.phone.until(6.0) { rec("pets", "tigerpet0001")?.str("sex") == "m" } &&
                    srv.records()["pets"]!!["tigerpet0001"]?.get("sex").asString == "m",
                "the sex goes through the server as it is",
            )
            expect(a.phone.until { sync.status.live }, "the live connection is up")
            a.edit {
                db.servings.add(
                    0,
                    meal("zweipets0001", """{"lxpet00001":{"r":null,"at":null},"tigerpet0001":{"r":null,"at":null}}"""),
                )
            }
            expect(b.phone.until(6.0) { rec("servings", "zweipets0001") != null }, "a meal for two pets arrives")

            a.edit { db.servings.add(0, meal("wirdgeloescht", """{"lxpet00001":{"r":null,"at":null}}""")) }
            b.phone.until(6.0) { rec("servings", "wirdgeloescht") != null }
            b.net.blocked = true
            a.edit { rate("zweipets0001", "lxpet00001", "gut") }
            b.edit { rate("zweipets0001", "tigerpet0001", "schlecht") }
            a.phone.until { store.queue.isEmpty() }
            b.net.blocked = false
            b.phone.on { sync.online() }
            val both: Phone.() -> Boolean = {
                rating("zweipets0001", "lxpet00001") == "gut" &&
                    rating("zweipets0001", "tigerpet0001") == "schlecht"
            }
            expect(a.phone.until(8.0, both) && b.phone.until(8.0, both), "different pets rated at the same time: both ratings kept")
            b.edit { db.servings.removeAll { it.id == "wirdgeloescht" } }
            expect(a.phone.until(8.0) { rec("servings", "wirdgeloescht") == null }, "a meal deleted on B disappears on A")

            // the server knows of B's meal but not of its treat
            val since = Time.now()
            val before = srv.get("/api/fed?since=$since")
            b.edit {
                db.products.add(
                    Rec(
                        parseJson(
                            """{"id":"snackprod001","brand":"Dreamies","variety":"Käse","type":"Snack","codes":{},
                            "createdAt":${Time.now()}}""",
                        ).obj(),
                    ),
                )
                db.servings.add(
                    0,
                    meal("snackmeal001", """{"lxpet00001":{"r":null,"at":null}}""", "snackprod001").apply { put("by", "Jonas") },
                )
            }
            b.phone.until { store.queue.isEmpty() }
            val treat = srv.get("/api/fed?since=$since")
            b.edit { db.servings.add(0, meal("fedmeal00001", """{"lxpet00001":{"r":null,"at":null}}""").apply { put("by", "Jonas") }) }
            b.phone.until { store.queue.isEmpty() }
            val fed = srv.get("/api/fed?since=$since")
            expect(
                before == parseJson("""{"fed":false,"at":0,"by":""}""") &&
                    treat["fed"].asBoolean == false &&
                    fed["fed"].asBoolean == true &&
                    fed["by"].asString == "Jonas" &&
                    (fed["at"].asLong ?: 0) >= since,
                "the server counts B’s meal for the feeding reminder, not its treat ($fed)",
            )

            // the queue without a connection survives a restart
            a.net.blocked = true
            a.edit { db.pets.add(pet("lunapet00001", "Luna")) }
            a.restart(srv)
            expect(
                a.phone.on { store.queue.isNotEmpty() && db.pets.any { it.str("name") == "Luna" } },
                "offline: queue and data survive a restart",
            )
            a.net.blocked = false
            a.phone.on { sync.online() }
            expect(
                a.phone.until { store.queue.isEmpty() } && b.phone.until(6.0) { db.pets.any { it.str("name") == "Luna" } },
                "online again: the queue is sent and B has it",
            )

            // server down, phone off
            srv.stop()
            b.edit { db.pets.find { it.str("name") == "Tiger" }!!.put("name", "Tiger II") }
            expect(b.phone.until(15.0) { sync.status.state == "offline" }, "server down: status offline")
            b.phone.sync.stop()
            b.phone.flushNow()
            b.phone.close()
            srv.start()
            a.repoint(srv)
            a.edit { db.pets.find { it.str("name") == "Luna" }!!.put("sex", "f") }
            a.phone.on { sync.online() }
            expect(a.phone.until(10.0) { store.queue.isEmpty() }, "server back: A syncs")
            b.phone = phone(b.dir, b.net)
            b.repoint(srv)
            b.phone.on { sync.online() }
            expect(
                b.phone.until(8.0) {
                    db.pets.any { it.str("name") == "Luna" && it.str("sex") == "f" } &&
                        db.pets.none { it.str("name") == "Tiger" }
                },
                "B starts again: sends what waited and catches up",
            )
            expect(a.phone.until(8.0) { db.pets.any { it.str("name") == "Tiger II" } }, "B’s change arrives at A")

            // deleting and undo, lots of changes
            var kept: Rec? = null
            a.edit {
                kept = rec("servings", "zweipets0001")!!.copy()
                db.servings.removeAll { it.id == "zweipets0001" }
            }
            expect(b.phone.until(6.0) { rec("servings", "zweipets0001") == null }, "a deletion arrives")
            a.edit { db.servings.add(0, kept!!) }
            expect(b.phone.until(6.0) { rating("zweipets0001", "tigerpet0001") == "schlecht" }, "undo arrives, ratings and all")
            a.edit {
                for (i in 0 until 620) {
                    db.servings.add(
                        Rec(
                            parseJson(
                                """{"id":"massen${i.toString().padStart(4, '0')}","productId":"lxprod0001","servedAt":${1700000000000 + i},
                                "pets":{"lxpet00001":{"r":"mittel","at":null}},"note":""}""",
                            ).obj(),
                        ),
                    )
                }
            }
            expect(
                a.phone.until(15.0) { store.queue.isEmpty() } && srv.records()["servings"]!!.size >= 620,
                "620 changes in several batches",
            )
            a.phone.on {
                store.replaceDb(
                    Db(db.pets, db.products, db.servings.filterNot { it.id.startsWith("massen") }.toMutableList(), db.observations),
                )
                store.save()
            }
            expect(b.phone.until(10.0) { db.servings.none { it.id.startsWith("massen") } && db.servings.size > 3 }, "and deleted again")

            println("observations")
            a.edit {
                db.observations.add(
                    0,
                    Rec(
                        parseJson(
                            """{"id":"beob00000001","kind":"stink","at":${Time.now()},
                            "pets":{"lxpet00001":true,"tigerpet0001":true},"by":"Anna"}""",
                        ).obj(),
                    ),
                )
            }
            expect(
                b.phone.until(8.0) {
                    rec("observations", "beob00000001")?.let {
                        it.str("kind") == "stink" &&
                            it.obj("pets")?.get("tigerpet0001").asBoolean == true
                    } ==
                        true
                } &&
                    srv.records()["observations"]!!["beob00000001"]?.get("kind").asString == "stink",
                "an observation from A reaches the server and B",
            )
            // /api/info as a server before 1.5.0 gives it
            a.net.info =
                { o -> o.with("features", JsonArray((o["features"] as? JsonArray).orEmpty().filter { it.asString != "collections" })) }
            a.net.posted.clear()
            a.phone.on {
                sync.status.features = null
                sync.serverCan("collections")
            }
            a.edit {
                db.observations.add(
                    0,
                    Rec(parseJson("""{"id":"beob00000002","kind":"tired","at":${Time.now()},"pets":{"lxpet00001":true}}""").obj()),
                )
                db.pets.add(pet("moglipet0001", "Mogli"))
            }
            expect(
                b.phone.until(8.0) { db.pets.any { it.str("name") == "Mogli" } } &&
                    a.phone.until(8.0) { store.queue.size == 1 && store.queue[0].c == "observations" } &&
                    "beob00000002" !in srv.records()["observations"]!! &&
                    a.net.posted.none { "beob00000002" in it },
                "an older server: the pet goes out, the observation waits on the phone",
            )
            a.phone.on { store.state.log.clear() }
            a.phone.on { sync.retrySync() }
            a.phone.until(10.0) { sync.status.state == "ok" && !sync.status.busy }
            val log = a.phone.on { store.state.log.map { it["text"].asString } }
            expect(
                log.none {
                    "checksum" in it!!
                } &&
                    a.phone.until { sync.held().size == 1 },
                "the checksum leaves out what the server cannot hold ($log)",
            )
            a.net.info = null
            a.phone.on { sync.retrySync() }
            expect(
                a.phone.until(10.0) { store.queue.isEmpty() } && b.phone.until(8.0) { rec("observations", "beob00000002") != null },
                "the server updated: what waited goes out and reaches B",
            )

            println("codes")
            a.edit {
                db.products.add(
                    Rec(
                        parseJson(
                            """{"id":"animprod0001","brand":"Animonda","variety":"Carny Rind","type":"Nassfutter",
                            "codes":{"$miss":true},"createdAt":${Time.now()}}""",
                        ).obj(),
                    ),
                )
            }
            val hit: Phone.() -> Rec? = { db.products.find { it.obj("codes")?.containsKey(miss) == true } }
            expect(b.phone.until(8.0) { hit() != null }, "the variety and its code reach B")
            a.net.blocked = true
            a.edit { hit()!!.let { it["codes"] = it.obj("codes")!!.with(c1, JsonPrimitive(true)) } }
            b.edit { hit()!!.let { it["codes"] = it.obj("codes")!!.with(c2, JsonPrimitive(true)) } }
            b.phone.until { store.queue.isEmpty() }
            a.net.blocked = false
            a.phone.on { sync.online() }
            val all: Phone.() -> Boolean = { hit()?.obj("codes")?.keys?.containsAll(listOf(c1, c2, miss)) == true }
            expect(a.phone.until(8.0, all) && b.phone.until(8.0, all), "codes added on two phones at once: all kept")
            a.edit { hit()!!.let { it["codes"] = it.obj("codes")!!.with(c1, null) } }
            expect(
                b.phone.until(6.0) { hit()?.obj("codes")?.let { c1 !in it && c2 in it } == true } &&
                    "codes.$c1" !in srv.records()["products"]!!["animprod0001"]!!,
                "a removed code is gone everywhere",
            )
            a.edit { rec("products", "animprod0001")!!.put("kaufen", "immer") }
            expect(
                b.phone.until(6.0) { rec("products", "animprod0001")?.str("kaufen") == "immer" } &&
                    srv.records()["products"]!!["animprod0001"]!!["kaufen"].asString == "immer",
                "\"always buy\" reaches B and the server",
            )
            a.edit { rec("products", "animprod0001")!!.remove("kaufen") }
            expect(
                b.phone.until(6.0) { rec("products", "animprod0001")?.has("kaufen") == false } &&
                    "kaufen" !in srv.records()["products"]!!["animprod0001"]!!,
                "back to automatic: the field is gone everywhere",
            )

            println("special cases")
            val c = handset(now = { Time.now() + 2 * 3_600_000 }).also(phones::add)
            c.edit { db.pets.add(pet("kiwipet00001", "Kiwi")) }
            c.connect(code, srv.url)
            expect(
                c.phone.until(10.0) {
                    store.state.epoch != "" && store.queue.isEmpty()
                },
                "a phone with a skewed clock: changes restamped and accepted",
            )
            val kiwi =
                (srv.get("/api/changes?since=0")["records"] as JsonArray).map { it.obj() }.filter {
                    it["r"].asString ==
                        "kiwipet00001"
                }
            val skew =
                kiwi.firstOrNull()?.let {
                    Math.abs(
                        it["f"]!!
                            .obj()["name"]!!
                            .obj()["t"]
                            .asString!!
                            .take(13)
                            .toLong() - System.currentTimeMillis(),
                    ) /
                        1000.0
                }
                    ?: 1e9
            expect(skew < 120, "the server’s clock counts (skew ${skew.toInt()} s)")
            expect(
                a.phone.until {
                    db.pets.any {
                        it.str("name") == "Kiwi"
                    }
                } &&
                    b.phone.until { db.pets.any { it.str("name") == "Kiwi" } },
                "the third phone’s pet reaches the others",
            )
            c.phone.sync.stop()
            c.phone.close()
            phones.remove(c)

            // the server's state file unreadable: set aside, a new epoch, and the phones send everything again
            val old = srv.get("/api/info")["epoch"].asString
            a.net.blocked = true
            b.net.blocked = true
            srv.stop()
            File(srv.dir, "state.json").writeText("{kaputt")
            srv.start()
            a.repoint(srv)
            b.repoint(srv)
            val epoch = srv.get("/api/info")["epoch"].asString
            expect(
                epoch != old &&
                    (srv.get("/api/changes?since=0")["records"] as JsonArray).isEmpty() &&
                    srv.dir.list()!!.count { it.startsWith("state-unreadable-") && it.endsWith(".json") } == 1,
                "unreadable state: kept aside, the server starts empty under a new epoch",
            )
            a.net.blocked = false
            b.net.blocked = false
            a.phone.on { sync.online() }
            b.phone.on { sync.online() }
            var ok = a.phone.until(10.0) { store.queue.isEmpty() && store.state.epoch == epoch }
            ok = b.phone.until(10.0) { store.queue.isEmpty() && store.state.epoch == epoch } && ok
            val names =
                srv
                    .records()["pets"]!!
                    .values
                    .mapNotNull { it["name"].asString }
                    .toSet()
            expect(
                ok && names.containsAll(listOf("Minka", "Luna", "Tiger II", "Kiwi")),
                "the phones send everything again (${names.sorted()})",
            )

            // the checksum uncovers a gap
            srv.stop()
            val st = parseJson(File(srv.dir, "state.json").readText()).obj()
            val pets = (st["records"]!!.obj()["pets"] as JsonObject)
            val luna =
                pets.entries
                    .firstOrNull {
                        ((it.value.obj()["f"] as JsonObject)["name"] as? JsonObject)
                            ?.get(
                                "v",
                            ).asString == "Luna"
                    }?.key
            val records = st["records"]!!.obj().with("pets", JsonObject(pets.filterKeys { it != luna }))
            File(srv.dir, "state.json").writeText(st.with("records", records).stringify())
            srv.start()
            a.restart(srv) // the app compares the checksum at start-up
            expect(
                a.phone.until(10.0) { store.state.log.any { "checksum differs" in it["text"].asString!! } } &&
                    a.phone.until(10.0) { store.queue.isEmpty() } &&
                    luna in srv.records()["pets"]!!,
                "checksum differs: a full sync fills the gap",
            )

            // a new code on the server
            srv.code = newCode
            Thread.sleep(1100) // a new mtime, so the server rereads its config
            srv.writeConfig()
            a.phone.on { sync.online() }
            expect(a.phone.until { sync.status.kind == "auth" }, "a new code: the phone stops and says so")
            a.connect(newCode.lowercase(), a.phone.prefs.server)
            expect(a.phone.until(10.0) { prefs.code == newCode && store.queue.isEmpty() }, "new code typed in: syncing carries on")
            b.phone.on { sync.online() }
            b.phone.until { sync.status.kind == "auth" }
            b.connect(newCode, b.phone.prefs.server)
            b.phone.until(10.0) { prefs.code == newCode }

            // a server with a newer protocol
            val d = handset().also(phones::add)
            d.net.info = { parseJson("""{"app":"schmeckts","protocol":2,"auth":true,"now":${System.currentTimeMillis()}}""").obj() }
            val kind =
                d.phone.on {
                    runCatching { sync.checkServer(newCode, srv.url) }.exceptionOrNull()?.let { (it as ServerError).kind }
                        ?: "connected"
                }
            expect(kind == "protocol", "a server with a newer protocol is refused ($kind)")

            println("final state")
            for (x in listOf(a, b)) x.phone.on { sync.retrySync() }
            a.phone.until(10.0) { store.queue.isEmpty() }
            b.phone.until(10.0) { store.queue.isEmpty() }
            val server = srv.get("/api/checksum?c=pets,products,servings,observations")
            val sums = listOf(a, b).map { x -> x.phone.on { store.checksum().first } }
            expect(
                sums == listOf(server["sum"].asString, server["sum"].asString),
                "checksum: both phones match the server (${server["fields"]} fields)",
            )
            val ps = srv.records()
            expect(a.phone.projection() == ps && b.phone.projection() == ps, "contents: both phones and the server are level")
        } finally {
            for (h in phones) {
                h.phone.sync.stop()
                h.phone.close()
            }
            srv.stop()
            if (failures.isNotEmpty()) println("\nserver log:\n" + File(srv.dir, "server.log").readText().takeLast(3000))
        }
        assertEquals(emptyList<String>(), failures)
    }
}
