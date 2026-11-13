package de.schmeckts.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// The update installs over 0.42.0: everything it wrote is read, and written back unchanged
class Files042Test {
    private val source = File(FIXTURES, "files-0.42")

    private fun copy(): File = tempDir("042").also { source.copyRecursively(it, overwrite = true) }

    private fun json(
        dir: File,
        name: String,
    ) = parseJson(File(dir, "$name.json").readText())

    @Test
    fun `everything 0_42_0 wrote is there`() {
        val dir = copy()
        val phone = phoneIn(dir)
        val db = json(source, "db").obj()
        val prefs = json(source, "prefs").obj()
        phone.on {
            for (c in COLLECTIONS) assertEquals(c, (db[c] as JsonArray).size, store.db[c].size)
            assertEquals("Mau II", store.db.pets[0].str("name"))
            assertEquals("2019-04-01", store.db.pets[0].str("birthday"))
            assertEquals("""{"farbe":"grau"}""", store.db.pets[0]["zukunft"]!!.stringify())
            assertEquals("Katze", store.db.products[0].str("animal"))
            assertEquals("""["x",1.5]""", store.db.products[1]["bewertetVon"]!!.stringify())
            assertTrue("an observation of a kind from a newer version stays", store.db.observations.any { it.str("kind") == "sneeze" })
            assertEquals("dark", store.prefs.theme)
            assertEquals("Jonas", store.prefs.name)
            assertEquals(prefs["code"].asString, store.prefs.code)
            assertEquals(prefs["server"].asString, store.prefs.server)
            assertEquals(180, store.prefs.remind)
            assertTrue(store.prefs.feedRemind && store.prefs.lookup && !store.prefs.serverPhoto)
            assertEquals((prefs["hiddenHints"] as JsonArray).map { it.asString }, store.prefs.hiddenHints)
            assertEquals("2026-11-12", store.prefs.sheetDay)
            assertEquals("""{"a":1}""", store.prefs.extra["zukunftPref"]!!.stringify())
            assertEquals(listOf("pets", "servings"), store.queue.map { it.c })
            val sync = json(source, "sync").obj()
            assertEquals(sync["epoch"].asString, store.state.epoch)
            assertEquals(sync["seq"].asLong, store.state.seq)
            assertEquals(sync["device"].asString, store.clock.device)
        }
        assertTrue(
            "the packaging photo stays in its place",
            File(dir, "photos/mu9vscy1o8shs.jpg").readBytes().contentEquals(File(source, "photos/mu9vscy1o8shs.jpg").readBytes()),
        )
        phone.close()
    }

    @Test
    fun `saving writes the same content back, unknown fields included`() {
        val dir = copy()
        val phone = phoneIn(dir)
        phone.on {
            store.purge(emptyMap()) // writes queue, db, sync and prefs
            store.flush()
        }
        for (name in listOf("db", "prefs", "sync", "queue", "ai")) {
            assertEquals(name, json(source, name), json(dir, name))
        }
        phone.on {
            store.db.pets[0].put("name", "Mau III")
            store.save()
            store.flush()
        }
        val pet = (json(dir, "db").obj()["pets"] as JsonArray)[0] as JsonObject
        assertEquals("""{"farbe":"grau"}""", pet["zukunft"]!!.stringify())
        assertEquals(
            "a change after the update keeps every other field",
            (((json(source, "db").obj()["pets"] as JsonArray)[0] as JsonObject).keys),
            pet.keys,
        )
        phone.close()
    }
}
