package de.schmeckts.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.security.MessageDigest

// write order queue → db → sync: after a crash the queue replays and server changes missing from sync are refetched

class Db(
    val pets: MutableList<Rec> = mutableListOf(),
    val products: MutableList<Rec> = mutableListOf(),
    val servings: MutableList<Rec> = mutableListOf(),
    val observations: MutableList<Rec> = mutableListOf(),
) {
    operator fun get(c: String): MutableList<Rec> =
        when (c) {
            "pets" -> pets
            "products" -> products
            "servings" -> servings
            "observations" -> observations
            else -> error(c)
        }

    fun toJson(): JsonObject =
        jsonObject(
            "version" to num(3),
            "pets" to JsonArray(pets.map { it.toJson() }),
            "products" to JsonArray(products.map { it.toJson() }),
            "servings" to JsonArray(servings.map { it.toJson() }),
            "observations" to JsonArray(observations.map { it.toJson() }),
        )
}

val Rec.servedAt: Long get() = num("servedAt")?.toLong() ?: 0L
val Rec.at: Long get() = num("at")?.toLong() ?: 0L

private fun sortKey(
    r: Rec,
    k: String,
) = r.num(k) ?: Double.NaN

// newest first, as JavaScript's sort with b - a (NaN compares as equal)
fun sortNewest(
    list: MutableList<Rec>,
    k: String,
) {
    val sorted =
        list.sortedWith { a, b ->
            val d = sortKey(b, k) - sortKey(a, k)
            if (d.isNaN()) 0 else d.compareTo(0.0)
        }
    list.clear()
    list.addAll(sorted)
}

fun tidy(d: JsonElement?): Db {
    val out = Db()
    val src = d as? JsonObject
    for (c in COLLECTIONS) {
        val seen = HashSet<String>()
        // ids end up in places that take only plain ids, so a backup must not bring others
        (src?.get(c) as? JsonArray)?.forEach {
            val r = it as? JsonObject ?: return@forEach
            val id = r["id"].asString
            if (validId(id) && seen.add(id!!)) out[c].add(Rec(r))
        }
    }
    for (p in out.pets) p.remove("photos") // obsolete field, dropped locally only
    out.servings.retainAll { it["pets"] is JsonObject && it["servedAt"].truthy }
    for (r in out.servings + out.observations) {
        val pets = r["pets"] as? JsonObject ?: continue
        if (pets.keys.any { !validId(it) }) r["pets"] = JsonObject(pets.filterKeys { validId(it) })
    }
    for (s in out.servings) {
        val pid = s["productId"]
        if (!pid.isNull && !validId(pid.asString)) s["productId"] = JsonNull
        val photo = s["photo"].truthy
        if (s.str("status") == "recognizing") s.put("status", if (photo) "waiting" else "failed") // interrupted by a restart
        if (s.str("status") == "reading") s.put("status", if (photo) "noserver" else "failed")
    }
    sortNewest(out.servings, "servedAt")
    out.observations.retainAll { complete("observations", it) }
    sortNewest(out.observations, "at")
    return out
}

/** Settings of this phone; keys this version does not know stay as they are. */
class Prefs {
    var theme = "system"
    var hiddenHints = mutableListOf<String>()
    var remind = 0
    var feedRemind = false
    var server = ""
    var code = ""
    var name = ""
    var activePet = "all"
    var lastPets: List<String> = emptyList()
    var lookup = false
    var serverPhoto = true
    var codes = LinkedHashMap<String, JsonObject>()
    var exchange = LinkedHashMap<String, JsonElement>()
    var photoStamps = LinkedHashMap<String, Long>()
    var calendar = true
    var sheetDay: String? = null
    var updates = true
    val extra = LinkedHashMap<String, JsonElement>()

    // known keys keep their place where the stored file had them, as {...defaults, ...stored} does
    fun toJson(): JsonObject {
        val m = LinkedHashMap<String, JsonElement>()
        m["theme"] = JsonPrimitive(theme)
        m["hiddenHints"] = JsonArray(hiddenHints.map(::JsonPrimitive))
        m["remind"] = num(remind)
        m["feedRemind"] = JsonPrimitive(feedRemind)
        m["server"] = JsonPrimitive(server)
        m["code"] = JsonPrimitive(code)
        m["name"] = JsonPrimitive(name)
        m["activePet"] = JsonPrimitive(activePet)
        m["lastPets"] = JsonArray(lastPets.map(::JsonPrimitive))
        m["lookup"] = JsonPrimitive(lookup)
        m["serverPhoto"] = JsonPrimitive(serverPhoto)
        m["codes"] = JsonObject(codes)
        m["exchange"] = JsonObject(exchange)
        m["photoStamps"] = JsonObject(photoStamps.mapValues { num(it.value) })
        m["calendar"] = JsonPrimitive(calendar)
        m["sheetDay"] = str(sheetDay)
        m["updates"] = JsonPrimitive(updates)
        m.putAll(extra)
        return JsonObject(m)
    }

    companion object {
        private val DROPPED = setOf("feedStart", "backdrop", "closedWeek", "overview", "torn", "milestones", "aiKey")
        private val KNOWN =
            setOf(
                "theme",
                "hiddenHints",
                "remind",
                "feedRemind",
                "server",
                "code",
                "name",
                "activePet",
                "lastPets",
                "lookup",
                "serverPhoto",
                "codes",
                "exchange",
                "photoStamps",
                "calendar",
                "sheetDay",
                "updates",
            )

        fun tidy(p: JsonElement?): Prefs {
            val o = p as? JsonObject ?: JsonObject(emptyMap())
            val out = Prefs()
            o["theme"].asString?.let { out.theme = it }
            // the newest 300 hidden hints; what is said only once stays, or it would come back
            val hints = (o["hiddenHints"] as? JsonArray)?.mapNotNull { it.asString }?.distinct() ?: emptyList()
            val once = { k: String -> Regex("^(tipp|neu):").containsMatchIn(k) }
            out.hiddenHints = (hints.filter(once) + hints.filterNot(once).takeLast(300)).toMutableList()
            out.remind = tidyRemind(o["remind"].asDouble)
            out.feedRemind = o["feedRemind"].asBoolean == true
            o["server"].asString?.let { out.server = it }
            o["code"].asString?.let { out.code = it }
            o["name"].asString?.let { out.name = it }
            o["activePet"].asString?.let { out.activePet = it }
            (o["lastPets"] as? JsonArray)?.let { a -> out.lastPets = a.mapNotNull { it.asString } }
            out.lookup = o["lookup"].asBoolean == true
            out.serverPhoto = o["serverPhoto"].asBoolean != false
            out.calendar = o["calendar"].asBoolean != false
            out.updates = o["updates"].asBoolean != false
            out.sheetDay = o["sheetDay"].asString?.takeIf { Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(it) }
            (o["codes"] as? JsonObject)?.forEach { (k, v) -> if (v is JsonObject) out.codes[k] = v }
            (o["exchange"] as? JsonObject)?.let { out.exchange.putAll(it) }
            // variety id → stamp of the packaging photo this phone holds
            (o["photoStamps"] as? JsonObject)?.forEach { (k, v) ->
                val n = v.asDouble
                if (n != null && n.isFinite() && n > 0) out.photoStamps[k] = n.toLong()
            }
            for ((k, v) in o) if (k !in KNOWN && k !in DROPPED) out.extra[k] = v
            return out
        }
    }
}

class Change(
    val id: String,
    val c: String,
    val r: String,
    var t: String,
    val f: JsonObject,
) {
    fun toJson() =
        jsonObject("id" to JsonPrimitive(id), "c" to JsonPrimitive(c), "r" to JsonPrimitive(r), "t" to JsonPrimitive(t), "f" to f)

    companion object {
        fun of(x: JsonElement): Change? {
            val o = x as? JsonObject ?: return null
            val id = o["id"].asString ?: return null
            val c = o["c"].asString?.takeIf { it in COLLECTIONS } ?: return null
            val r = o["r"].asString ?: return null
            val t = o["t"].asString ?: return null
            val f = o["f"] as? JsonObject ?: return null
            return Change(id, c, r, t, f)
        }
    }
}

/** One record as the server and the exchange file carry it: every field with its value and clock. */
class Remote(
    val c: String,
    val r: String,
    val f: Map<String, Pair<JsonElement?, String>>,
) {
    companion object {
        fun of(x: JsonElement): Remote? {
            val o = x as? JsonObject ?: return null
            val c = o["c"].asString ?: return null
            val r = o["r"].asString ?: return null
            val f = LinkedHashMap<String, Pair<JsonElement?, String>>()
            (o["f"] as? JsonObject)?.forEach { (k, v) ->
                val fo = v as? JsonObject ?: return@forEach
                val t = fo["t"].asString ?: return@forEach
                f[k] = fo["v"] to t
            }
            return Remote(c, r, f)
        }
    }

    fun toJson(): JsonObject =
        jsonObject(
            "c" to JsonPrimitive(c),
            "r" to JsonPrimitive(r),
            "f" to JsonObject(f.mapValues { (_, x) -> jsonObject("v" to (x.first ?: JsonNull), "t" to JsonPrimitive(x.second)) }),
        )
}

typealias Clocks = LinkedHashMap<String, String>

class SyncState {
    var epoch = ""
    var seq = 0L
    val clocks = LinkedHashMap<String, LinkedHashMap<String, Clocks>>().apply { COLLECTIONS.forEach { put(it, LinkedHashMap()) } }
    val log = mutableListOf<JsonObject>()
}

class Store(
    private val disk: Disk,
    val clock: Clock,
    private val scope: CoroutineScope,
    private val report: (String, Any?) -> Unit,
) {
    var db = Db()
        private set
    var prefs = Prefs()
    var queue = mutableListOf<Change>()
        private set
    val state = SyncState()
    var revision by mutableIntStateOf(0)
        private set
    var loadError: Throwable? = null // stored data unreadable: write nothing
        private set
    var dbFound = false // only then may records missing from db.json be tidied away
        private set
    private var snap =
        HashMap<String, HashMap<String, LinkedHashMap<String, String>>>().apply {
            COLLECTIONS.forEach {
                put(
                    it,
                    HashMap(),
                )
            }
        }

    var onChanged: () -> Unit = {}
    var onSaved: () -> Unit = {}

    // varieties whose meals changed since the last takeStale(); null means all
    private var stale: MutableSet<String?>? = null

    fun takeStale(): Set<String?>? {
        val taken = stale
        stale = HashSet()
        return taken
    }

    private fun markStale(
        c: String,
        vararg productIds: String?,
    ) {
        if (c == "pets") stale = null
        if (c != "servings") return
        val s = stale ?: return
        s.addAll(productIds)
    }

    private fun stateForDisk(): JsonObject =
        jsonObject(
            "device" to JsonPrimitive(clock.device),
            "epoch" to JsonPrimitive(state.epoch),
            "seq" to num(state.seq),
            "offset" to num(clock.offset),
            "ms" to num(clock.ms),
            "n" to num(clock.n),
            "clocks" to
                JsonObject(
                    state.clocks.mapValues { (_, ids) ->
                        JsonObject(ids.mapValues { (_, f) -> JsonObject(f.mapValues { JsonPrimitive(it.value) }) })
                    },
                ),
            "log" to JsonArray(state.log),
        )

    private fun connected() = prefs.code.isNotEmpty()

    private fun persist(vararg names: String) {
        if ("db" in names) revision++
        if (loadError != null) return
        for (n in names) {
            when (n) {
                "queue" -> disk.schedule("queue", { JsonArray(queue.map { it.toJson() }).stringify() to null })
                "db" -> disk.schedule("db", { db.toJson().stringify() to null })
                "prefs" -> disk.schedule("prefs", { prefs.toJson().stringify() to null })
                "sync" ->
                    disk.schedule(
                        "sync",
                        { stateForDisk().stringify() to (if (connected()) null else queue.map { it.id }) },
                        { trimJournal(it) },
                    )
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun trimJournal(ids: Any?) {
        val list = ids as? List<String>
        if (list.isNullOrEmpty() || connected()) return
        val done = list.toSet()
        queue = queue.filter { it.id !in done }.toMutableList()
        persist("queue")
    }

    fun log(text: String) {
        report("sync", text)
        state.log.add(jsonObject("at" to num(Time.now()), "text" to JsonPrimitive(text)))
        while (state.log.size > 30) state.log.removeAt(0)
        persist("sync")
    }

    private fun zero() = "0000000000000-0000-${clock.device}" // loses against every real clock

    private fun clocksOf(
        c: String,
        id: String,
    ): Clocks = state.clocks.getValue(c).getOrPut(id) { Clocks() }

    private fun snapshot() =
        HashMap<String, HashMap<String, LinkedHashMap<String, String>>>().apply {
            for (c in COLLECTIONS) put(c, db[c].filter { validId(it.id) }.associateTo(HashMap()) { it.id to fieldsOf(c, it) })
        }

    private fun sortServings() {
        sortNewest(db.servings, "servedAt")
        sortNewest(db.observations, "at")
    }

    fun load() {
        try {
            val d = disk.read("db")
            val p = disk.read("prefs")
            val s = disk.read("sync")
            val q = disk.read("queue")
            dbFound = d != null
            db = tidy(d)
            prefs = Prefs.tidy(p)
            tidyState(s)
            // clocks without data do not count
            if (d == null) {
                state.epoch = ""
                state.seq = 0
                state.clocks.values.forEach { it.clear() }
            }
            queue = (q as? JsonArray)?.mapNotNull(Change::of)?.toMutableList() ?: mutableListOf()
            for (x in queue) clock.observe(x.t)
            var fixed = false // replay what a crash kept out of db or sync
            for (x in queue) if (applyRecord(x.c, x.r, x.f.mapValues { (_, v) -> v to x.t }, false)) fixed = true
            sortServings()
            if (ensureClocks()) fixed = true
            snap = snapshot()
            if (fixed) persist("db", "sync")
            if (prefs.activePet != "all" && db.pets.none { it.id == prefs.activePet }) prefs.activePet = "all"
            // news are for an update: a phone without pets of its own has seen them all
            if (db.pets.none { !it.id.startsWith(DEMO) }) for (n in NEWS) hideHint("neu:" + n.v)
        } catch (e: Exception) {
            loadError = e
            report("stored data unreadable", e)
        }
    }

    private fun tidyState(s: JsonElement?) {
        val o = s as? JsonObject ?: JsonObject(emptyMap())

        fun n(k: String) = o[k].asDouble?.takeIf { it.isFinite() } ?: 0.0
        clock.device = o["device"].asString?.takeIf { Regex("^[a-z0-9]{4,16}$").matches(it) } ?: randomId(8)
        state.epoch = o["epoch"].asString ?: ""
        state.seq = n("seq").toLong()
        clock.offset = n("offset").toLong()
        clock.ms = n("ms").toLong()
        clock.n = n("n").toInt()
        for (c in COLLECTIONS) {
            val ids = state.clocks.getValue(c)
            ids.clear()
            ((o["clocks"] as? JsonObject)?.get(c) as? JsonObject)?.forEach { (id, f) ->
                val clocks = Clocks()
                (f as? JsonObject)?.forEach { (k, t) -> t.asString?.let { clocks[k] = it } }
                ids[id] = clocks
            }
        }
        state.log.clear()
        (o["log"] as? JsonArray)?.takeLast(30)?.forEach { if (it is JsonObject) state.log.add(it) }
    }

    private fun ensureClocks(): Boolean {
        var n = 0
        for (c in COLLECTIONS) {
            for (rec in db[c]) {
                if (!validId(rec.id)) continue
                val had = state.clocks.getValue(c)[rec.id]
                val clocks = had ?: Clocks()
                for (k in fieldsOf(c, rec).keys) {
                    if (clocks[k] == null) {
                        clocks[k] = zero()
                        n++
                    }
                }
                if (had == null) {
                    clocks["_del"] = zero()
                    state.clocks.getValue(c)[rec.id] = clocks
                    n++
                }
            }
        }
        return n > 0
    }

    fun replaceDb(next: Db) {
        db = next
        revision++
        stale = null
    }

    fun save() {
        val changes = diff()
        if (changes.isNotEmpty()) {
            queue.addAll(changes)
            persist("queue", "db", "sync")
            onSaved()
        } else {
            persist("db") // local-only fields such as photo and status
        }
    }

    fun savePrefs() = persist("prefs")

    fun hideHint(key: String) {
        if (key in prefs.hiddenHints) return
        prefs.hiddenHints.add(key)
        savePrefs()
    }

    private fun mealOf(fields: Map<String, String>?): String? = fields?.get("productId")?.let { parseJson(it).asString }

    private fun diff(): List<Change> {
        val out = mutableListOf<Change>()
        for (c in COLLECTIONS) {
            val prev = snap.getValue(c)
            val cur = HashMap<String, LinkedHashMap<String, String>>()
            for (rec in db[c]) {
                if (!validId(rec.id)) continue // the server would reject it
                val f = fieldsOf(c, rec) { what, where -> report(what, where) }
                val p = prev[rec.id]
                val ch = LinkedHashMap<String, String>()
                cur[rec.id] = f
                if (p == null) {
                    ch.putAll(f)
                    ch["_del"] = "false"
                } else {
                    for ((k, v) in f) if (p[k] != v) ch[k] = v
                    for (k in p.keys) if (k !in f) ch[k] = "null"
                }
                if (ch.isNotEmpty()) {
                    out.add(change(c, rec.id, ch))
                    markStale(c, rec.str("productId"), *(if (p != null) arrayOf(mealOf(p)) else emptyArray()))
                }
            }
            for (id in prev.keys.toList()) {
                if (id !in cur) {
                    out.add(change(c, id, linkedMapOf("_del" to "true")))
                    markStale(c, mealOf(prev[id]))
                }
            }
            snap[c] = cur
        }
        return out
    }

    private fun change(
        c: String,
        r: String,
        json: Map<String, String>,
    ): Change {
        val t = clock.stamp()
        val clocks = clocksOf(c, r)
        val f = LinkedHashMap<String, JsonElement>()
        for ((k, j) in json) {
            f[k] = parseJson(j)
            clocks[k] = t
        }
        return Change(randomId(16), c, r, t, JsonObject(f))
    }

    private var changedTimer: Job? = null

    private fun notifyChanged() {
        changedTimer?.cancel()
        changedTimer =
            scope.launch {
                delay(120)
                onChanged()
            }
    }

    // records each complete; returns how many changed
    fun merge(records: List<Remote>): Int {
        save() // capture our own changes first
        var changed = 0
        for (x in records) if (applyRecord(x.c, x.r, x.f, true)) changed++
        if (changed > 0) {
            sortServings()
            notifyChanged()
        }
        persist("db", "sync")
        return changed
    }

    fun allClocks(): JsonObject =
        JsonObject(
            COLLECTIONS.associateWith { c ->
                JsonObject(state.clocks.getValue(c).mapValues { (_, f) -> JsonObject(f.mapValues { JsonPrimitive(it.value) }) })
            },
        )

    fun topClock(): String {
        var top = ""
        for (c in COLLECTIONS) for (clocks in state.clocks.getValue(c).values) for (t in clocks.values) if (t > top) top = t
        return top
    }

    /** peer: their clocks (a JSON object), or the highest clock at the last exchange (text), or null for everything */
    fun changesSince(peer: JsonElement?): List<Remote> {
        val out = mutableListOf<Remote>()
        for (c in COLLECTIONS) {
            val visible = db[c].associateBy { it.id }
            for ((id, clocks) in state.clocks.getValue(c)) {
                val theirs = if (peer is JsonObject) ((peer[c] as? JsonObject)?.get(id) as? JsonObject) ?: JsonObject(emptyMap()) else null
                val since = if (peer is JsonPrimitive && peer.isString) peer.content else null
                val newer = { k: String, t: String ->
                    if (theirs != null) {
                        val their = theirs[k].asString
                        their == null || t > their
                    } else {
                        peer.isNull || peer !is JsonPrimitive || !peer.isString || t > since!!
                    }
                }
                if (clocks.none { (k, t) -> newer(k, t) }) continue
                val rec = visible[id]
                val f = LinkedHashMap<String, Pair<JsonElement?, String>>()
                if (rec != null) {
                    for ((k, t) in clocks) f[k] = (if (k == "_del") JsonPrimitive(false) else (valueOf(rec, k) ?: JsonNull)) to t
                } else if (clocks["_del"] != null) {
                    f["_del"] = JsonPrimitive(true) to clocks.getValue("_del")
                } else {
                    continue
                }
                out.add(Remote(c, id, f))
            }
        }
        return out
    }

    // full: fields holds every field the server knows
    private fun applyRecord(
        c: String,
        id: String,
        fields: Map<String, Pair<JsonElement?, String>>,
        full: Boolean,
    ): Boolean {
        val ids = state.clocks[c] ?: return false
        if (!validId(id)) return false
        val list = db[c]
        val idx = list.indexOfFirst { it.id == id }
        val rec = if (idx >= 0) list[idx] else null
        val known = ids.containsKey(id)
        val clocks = clocksOf(c, id)
        val win = winningFields(rec, clocks, fields)
        if (clocks.isEmpty()) ids.remove(id)
        if (win.isEmpty()) return false
        val deleted =
            if ("_del" in win) {
                win["_del"].asBoolean == true
            } else if (rec != null) {
                false
            } else {
                known
            }
        if (rec != null) return updateRecord(c, id, idx, rec, win, deleted)
        if (deleted) return false
        return createRecord(c, id, clocks, fields, full)
    }

    // clocks are taken over even where this device cannot use the value, so the field counts as seen
    private fun winningFields(
        rec: Rec?,
        clocks: Clocks,
        fields: Map<String, Pair<JsonElement?, String>>,
    ): LinkedHashMap<String, JsonElement> {
        val win = LinkedHashMap<String, JsonElement>()
        for ((k, x) in fields) {
            val (v, t) = x
            clock.observe(t)
            val lt = clocks[k]
            if (lt != null && lt > t) continue
            if (lt == t && rec != null && sameValue(if (k == "_del") JsonPrimitive(false) else valueOf(rec, k), v)) continue
            clocks[k] = t
            win[k] = v ?: JsonNull
        }
        return win
    }

    private fun updateRecord(
        c: String,
        id: String,
        idx: Int,
        rec: Rec,
        win: Map<String, JsonElement>,
        deleted: Boolean,
    ): Boolean {
        val before = rec.str("productId")
        if (deleted) {
            db[c].removeAt(idx)
            snap.getValue(c).remove(id)
            markStale(c, before)
            if (c == "pets" && prefs.activePet == id) {
                prefs.activePet = "all"
                persist("prefs")
            }
            return true
        }
        val s = snap.getValue(c)[id] ?: LinkedHashMap()
        for ((k, v) in win) {
            if (k == "_del") continue
            // remember only what this device holds, or the next save would delete the rest household-wide
            if (setField(c, rec, k, v) && !v.isNull) s[k] = v.stringify() else s.remove(k)
        }
        snap.getValue(c)[id] = s
        markStale(c, before, rec.str("productId"))
        return true
    }

    // queued values win where the clock is our own
    private fun createRecord(
        c: String,
        id: String,
        clocks: Clocks,
        fields: Map<String, Pair<JsonElement?, String>>,
        full: Boolean,
    ): Boolean {
        val values = LinkedHashMap<String, JsonElement?>()
        val mine = queuedValues(c, id)
        for ((k, x) in fields) if (k != "_del") values[k] = x.first
        for (k in clocks.keys.toList()) {
            if (k == "_del") continue
            val m = mine[k]
            if (m != null && m.second == clocks[k]) {
                values[k] = m.first
            } else if (full) {
                val f = fields[k]
                if (f != null) clocks[k] = f.second else clocks.remove(k)
            }
        }
        val made = fromFields(c, id, values)
        if (!complete(c, made)) return false
        db[c].add(made)
        markStale(c, made.str("productId"))
        snap.getValue(c)[id] = fieldsOf(c, made)
        return true
    }

    private fun queuedValues(
        c: String,
        r: String,
    ): Map<String, Pair<JsonElement, String>> {
        val out = HashMap<String, Pair<JsonElement, String>>()
        for (x in queue) if (x.c == c && x.r == r) for ((k, v) in x.f) out[k] = v to x.t
        return out
    }

    // full sync: merge everything, then resend every field whose own clock is newer
    fun reconcile(records: List<Remote>): Int {
        merge(records)
        val server = HashMap<String, HashMap<String, Map<String, Pair<JsonElement?, String>>>>()
        for (x in records) server.getOrPut(x.c) { HashMap() }[x.r] = x.f
        val queued = queue.flatMap { x -> x.f.keys.map { k -> "${x.c}/${x.r}/$k@${x.t}" } }.toHashSet()
        val out = mutableListOf<Change>()
        for (c in COLLECTIONS) {
            val visible = db[c].associateBy { it.id }
            for ((id, clocks) in state.clocks.getValue(c)) {
                val remote = server[c]?.get(id) ?: emptyMap()
                val rec = visible[id]
                val groups = LinkedHashMap<String, LinkedHashMap<String, JsonElement>>()
                for ((k, t) in clocks.entries.toList()) {
                    val rt = remote[k]?.second
                    if ((rt != null && rt >= t) || "$c/$id/$k@$t" in queued) continue
                    when {
                        rec != null ->
                            groups.getOrPut(t) { LinkedHashMap() }[k] =
                                if (k == "_del") JsonPrimitive(false) else (valueOf(rec, k) ?: JsonNull)
                        k == "_del" -> groups.getOrPut(t) { LinkedHashMap() }[k] = JsonPrimitive(true)
                        rt != null -> clocks[k] = rt
                        else -> clocks.remove(k)
                    }
                }
                for ((t, f) in groups) out.add(Change(randomId(16), c, id, t, JsonObject(f)))
            }
        }
        queue.addAll(out)
        persist("queue", "sync")
        return out.size
    }

    // confirmed, or rejected for good
    fun ack(ids: Collection<String>) {
        val done = ids.toSet()
        val before = queue.size
        queue = queue.filter { it.id !in done }.toMutableList()
        if (queue.size != before) persist("queue")
    }

    fun restamp(id: String) {
        val x = queue.find { it.id == id } ?: return
        clock.rebase()
        val t = clock.stamp()
        val clocks = state.clocks[x.c]?.get(x.r) ?: Clocks()
        for (k in x.f.keys) if (clocks[k] == x.t) clocks[k] = t
        x.t = t
        persist("queue", "sync")
    }

    fun setPosition(
        epoch: String,
        seq: Long,
    ) {
        state.epoch = epoch
        state.seq = seq
        persist("sync")
    }

    fun resetSync() {
        queue = mutableListOf()
        state.epoch = ""
        state.seq = 0
        persist("queue", "sync")
    }

    // local only, e.g. sample data before connecting
    fun purge(ids: Map<String, Set<String>>) {
        for (c in COLLECTIONS) {
            val gone = ids[c]
            if (gone.isNullOrEmpty()) continue
            db[c].removeAll { it.id in gone }
            for (id in gone) {
                state.clocks.getValue(c).remove(id)
                snap.getValue(c).remove(id)
            }
        }
        queue = queue.filter { ids[it.c]?.contains(it.r) != true }.toMutableList()
        if (prefs.activePet != "all" && ids["pets"]?.contains(prefs.activePet) == true) prefs.activePet = "all"
        persist("queue", "db", "sync", "prefs")
    }

    /** must match the server: SHA-256 over the sorted lines "c/id/field@clock\n" */
    fun checksum(colls: List<String> = COLLECTIONS): Pair<String, Int> {
        val lines = mutableListOf<String>()
        for (c in colls) for ((id, clocks) in state.clocks.getValue(c)) for ((k, t) in clocks) lines.add("$c/$id/$k@$t\n")
        lines.sort()
        val hash = MessageDigest.getInstance("SHA-256").digest(lines.joinToString("").toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) } to lines.size
    }

    suspend fun flush() = disk.flush()
}
