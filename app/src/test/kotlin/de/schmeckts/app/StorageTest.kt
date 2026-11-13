package de.schmeckts.app

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// Storage of the app: files in app storage, written atomically, a crash while saving, a corrupted file
class StorageTest {
    @Test
    fun `files, crash, corrupted file`() {
        val dir = tempDir()
        writeFiles(dir, mapOf("db" to savedDb(), "prefs" to """{"theme":"dark","name":"Anna"}"""))
        var phone = phoneIn(dir)
        assertEquals(
            "start: data and settings from the files",
            "3|Anna|dark",
            phone.on { "${db.servings.size}|${prefs.name}|${prefs.theme}" },
        )
        assertTrue(
            "records without clocks get some, for the later sync",
            phone.store.state.clocks
                .getValue("servings")
                .values
                .all { it["_del"] != null && it["productId"] != null && it["pets.lxpet00001"] != null },
        )
        val writes = mutableListOf<String>()
        phone.disk.trace = { writes.add(it) }
        phone.on {
            db.pets[0].put("name", "Minka I")
            store.save()
            store.flush()
        }
        assertEquals(
            "written atomically: the temporary file first, then the rename",
            listOf("write db.json.tmp", "rename db.json.tmp db.json"),
            writes.filter { "db.json" in it }.takeLast(2),
        )
        val sent =
            phone.on {
                val t = Time.now().toString().padStart(13, '0') + "-0000-fremd"
                store.merge(listOf(Remote("pets", "lxpet00001", mapOf("zukunft.k1" to (JsonPrimitive("x") to t)))))
                db.pets[0].put("name", "Minka II.")
                store.save()
                store.queue.filter { it.r == "lxpet00001" }.flatMap { it.f.keys }
            }
        assertEquals(
            "entries of a map this device does not know (a newer version) are not deleted household-wide by the next save",
            listOf("name"),
            sent,
        )
        phone.flushNow()
        phone.close()
        File(
            dir,
            "queue.json",
        ).writeText("""[{"id":"crashtest00000001","c":"pets","r":"lxpet00001","t":"9999999999998-0000-absturz","f":{"name":"Minka II"}}]""")
        phone = phoneIn(dir)
        assertEquals("a crash between queue and data: the next start replays the change", "Minka II", phone.on { db.pets[0].str("name") })
        phone.flushNow()
        val db = parseJson(File(dir, "db.json").readText()).obj()
        assertTrue(
            "afterwards it is in db.json, and without a server the queue is empty again",
            ((db["pets"] as kotlinx.serialization.json.JsonArray)[0] as JsonObject)["name"].asString == "Minka II" &&
                File(dir, "queue.json").readText() == "[]",
        )
        phone.close()
        File(dir, "db.json").writeText("{kaputt")
        phone = phoneIn(dir)
        val aside = dir.list()!!.filter { it.startsWith("db.corrupt-") }
        assertTrue(
            "a corrupted db.json is set aside, nothing is overwritten",
            aside.size == 1 && File(dir, aside[0]).readText() == "{kaputt",
        )
        assertTrue(
            "without data the clocks do not count either, and the next sync is a full one",
            phone.store.state.clocks
                .getValue("pets")
                .isEmpty() &&
                phone.store.state.epoch == "",
        )
        assertTrue("set aside, so the next start does not read it", !File(dir, "db.json").exists())
        phone.close()
    }

    @Test
    fun `unreadable file - the app writes nothing until restarted`() {
        val dir = tempDir()
        writeFiles(dir, mapOf("db" to savedDb()))
        File(dir, "prefs.json").mkdirs() // a folder in its place cannot be read as a file
        val phone = phoneIn(dir)
        assertTrue(phone.store.loadError != null)
        phone.on {
            db.pets.add(recOf("id" to JsonPrimitive("neupet0001"), "name" to JsonPrimitive("Neu")))
            store.save()
            store.flush()
        }
        assertTrue("nothing written", !parseJson(File(dir, "db.json").readText()).stringify().contains("neupet0001"))
        phone.close()
    }

    @Test
    fun `a crash between deleting and renaming - the next start reads the temporary file`() {
        val dir = tempDir()
        File(dir, "db.json.tmp").writeText(savedDb().stringify())
        val phone = phoneIn(dir)
        assertEquals(3, phone.on { db.servings.size })
        phone.close()
    }
}
