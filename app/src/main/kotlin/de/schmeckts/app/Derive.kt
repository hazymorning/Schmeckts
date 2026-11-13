package de.schmeckts.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Read-only lookups and cached models over the data.

fun pname(p: Rec?): String =
    if (p !=
        null
    ) {
        p.str("variety")?.takeIf { it.isNotEmpty() } ?: p.str("brand")?.takeIf { it.isNotEmpty() } ?: "Unbekannt"
    } else {
        "Unbekannte Sorte"
    }

fun timeOf(x: Rec): Long = if (x.has("servedAt")) x.servedAt else x.at

fun isObservation(x: Rec) = !x.has("servedAt") && x.num("at") != null

// both lists come in newest first
fun diary(
    servings: List<Rec>,
    observations: List<Rec>,
): List<Rec> {
    val out = mutableListOf<Rec>()
    var i = 0
    var j = 0
    while (i < servings.size || j < observations.size) {
        out.add(
            if (j >= observations.size ||
                (i < servings.size && servings[i].servedAt >= observations[j].at)
            ) {
                servings[i++]
            } else {
                observations[j++]
            },
        )
    }
    return out
}

// its own name first; data from another phone may hold anything
fun namesOf(pet: Rec?): List<String> =
    (listOfNotNull(pet?.str("name")) + (pet?.get("nicknames") as? JsonArray).orEmpty().mapNotNull { it.asString })
        .filter { it.trim().isNotEmpty() }
        .distinct()

private fun hashOf(text: String) = text.fold(7L) { h, c -> (h * 31 + c.code) % 2147483647 }

// a pet goes by its name or a nickname, always the same for one seed
fun callName(
    pet: Rec?,
    seed: String,
): String {
    val names = namesOf(pet)
    return if (names.isNotEmpty()) names[(hashOf(seed) % names.size).toInt()] else ""
}

fun petMap(ids: List<String>) =
    JsonObject(
        ids.associateWith {
            jsonObject(
                "r" to kotlinx.serialization.json.JsonNull,
                "at" to kotlinx.serialization.json.JsonNull,
            )
        },
    )

class Evaluation(
    val moves: Moves,
    val trend: List<Trend>,
    val insights: List<Insight>,
    val taste: Taste,
    val next: NextUp,
    val observed: Observed,
    val basis: Basis,
    val last: Map<String, Long>,
)

class Listed(
    val product: Rec,
    val at: Long,
)

class DefaultPets(
    val ids: List<String>,
    val auto: Boolean,
)

class Derive(
    private val store: Store,
) {
    private val db get() = store.db
    private val prefs get() = store.prefs

    fun getPet(id: String?) = db.pets.find { it.id == id }

    fun getProduct(id: String?) = if (!id.isNullOrEmpty()) db.products.find { it.id == id } else null

    fun getServing(id: String?) = db.servings.find { it.id == id }

    fun getObservation(id: String?) = db.observations.find { it.id == id }

    fun inFilter(pid: String) = prefs.activePet == "all" || prefs.activePet == pid

    fun findProduct(
        brand: String?,
        variety: String?,
    ) = db.products.find { norm(it.str("brand")) == norm(brand) && norm(it.str("variety")) == norm(variety) }

    // several for multipacks
    fun productsByCode(code: String) = db.products.filter { it.obj("codes")?.get(code).truthy }

    private fun openPets(s: Rec) =
        s.pets.keys.filter { pid ->
            !(s.pets[pid] as? JsonObject)?.get("r").truthy &&
                inFilter(pid) &&
                getPet(pid) != null
        }

    fun servingPets(s: Rec) = s.pets.keys.filter { inFilter(it) && getPet(it) != null }

    fun servingsInFilter() = db.servings.filter { servingPets(it).isNotEmpty() }

    fun observedPets(o: Rec) = o.pets.keys.filter { inFilter(it) && getPet(it) != null }

    fun observationsInFilter() = db.observations.filter { observedPets(it).isNotEmpty() }

    fun petNames(ids: List<String>) = andList(ids.mapNotNull { getPet(it)?.str("name") })

    // One pet by any of its names, the same in one place all day and likely another tomorrow. Several by their own
    // names, so they stay apart.
    fun calledNames(
        ids: List<String>,
        place: String,
        now: Long = Time.now(),
    ) = if (ids.size == 1) callName(getPet(ids[0]), "$place:${dayKey(now)}") else petNames(ids)

    // The hour is in the key because some windows are time based. Per-variety sums are kept, and only varieties with
    // changed meals are recomputed.
    private val cache = HashMap<String, Pair<String, Any>>()
    private var sums: Sums? = null

    @Suppress("UNCHECKED_CAST")
    private fun <T : Any> cached(
        name: String,
        parts: List<Any?>,
        fn: (Long) -> T,
    ): T {
        val now = Time.now()
        val key = (listOf(store.revision, now / 3_600_000) + parts).joinToString("|")
        val hit = cache[name]
        if (hit?.first != key) {
            refresh(now)
            val v = fn(now)
            cache[name] = key to v
            return v
        }
        return hit.second as T
    }

    private fun refresh(now: Long) {
        val stale = store.takeStale()
        val s = sums
        if (s == null || stale == null || now >= s.next) {
            sums = tally(db, now)
        } else if (stale.isNotEmpty()) {
            tally(db, now, stale, s)
        }
    }

    fun model(): Model =
        cached(
            "model",
            listOf(prefs.activePet, prefs.hiddenHints.joinToString(",")),
        ) { now -> analyze(db, Filter(prefs.activePet, prefs.hiddenHints), now, sums!!) }

    // the home card needs only the ranking; the rest waits until the page opens
    fun rankingModel(): Ranking = cached("ranking", listOf(prefs.activePet)) { now -> ranking(model(), now) }

    fun evaluationModel(): Evaluation =
        cached("evaluation", listOf(prefs.activePet)) { now ->
            val m = model()
            val r = rankingModel()
            val last = lastServed()
            Evaluation(
                moves = moves(m, now, r),
                trend = trend(db, m, now),
                insights = insights(db, m, now),
                taste = taste(m),
                next = nextUp(m, now, r, last, slowStarters(m)),
                observed = observed(db, m.pets, now),
                basis = basis(m, r),
                last = last,
            )
        }

    fun sortOf(id: String) = model().byId[id]

    fun pendingServings(): List<Rec> {
        val cut = Time.now() - PENDING_WINDOW
        return db.servings.filter { it.servedAt > cut && openPets(it).isNotEmpty() }
    }

    fun defaultPets(p: Rec?): DefaultPets {
        val valid = { ids: List<String> -> ids.filter { getPet(it) != null } }
        if (prefs.activePet != "all" && getPet(prefs.activePet) != null) return DefaultPets(listOf(prefs.activePet), false)
        if (db.pets.size == 1) return DefaultPets(listOf(db.pets[0].id), false)
        val lp = valid((p?.get("lastPets") as? JsonArray).orEmpty().mapNotNull { it.asString })
        if (lp.isNotEmpty()) return DefaultPets(lp, false)
        val last = valid(prefs.lastPets)
        if (last.isNotEmpty()) return DefaultPets(last, true)
        return DefaultPets(db.pets.map { it.id }, true)
    }

    private fun lastServed(): Map<String, Long> {
        val last = LinkedHashMap<String, Long>()
        val pet = if (prefs.activePet != "all" && getPet(prefs.activePet) != null) prefs.activePet else null // same pet rule as the model
        for (s in db.servings) {
            val pid = s.str("productId")
            if (pid.isNullOrEmpty() || last.containsKey(pid)) continue
            if (pet != null && s.pets[pet] == null) continue
            last[pid] = s.servedAt
        }
        return last
    }

    fun withLast(
        products: List<Rec>,
        last: Map<String, Long> = lastServed(),
    ) = products.map { Listed(it, last[it.id] ?: 0L) }

    // all: every variety, as a search must find each one or it gets made twice; flops last
    fun quickProducts(
        limit: Int = Int.MAX_VALUE,
        all: Boolean = false,
    ): List<Listed> {
        val last = lastServed()
        val flop =
            model()
                .sorts
                .filter { it.choice == "nicht" }
                .map { it.id }
                .toSet()
        val later = { p: Rec -> if (p.id in flop) 1 else 0 }
        val products =
            db.products
                .filter { all || later(it) == 0 }
                .sortedWith(
                    compareBy<Rec> { later(it) }
                        .thenByDescending { last[it.id] ?: 0L }
                        .thenByDescending { it.num("createdAt") ?: 0.0 },
                ).take(limit)
        return withLast(products, last)
    }

    class Shopping(
        val title: String,
        val text: String,
    )

    fun shoppingList(): Shopping {
        val m = model()
        val g = shopGroups(m)
        val full = { p: Rec ->
            listOfNotNull(p.str("brand"), p.str("variety")).filter { it.isNotEmpty() }.joinToString(" ").ifEmpty { pname(p) }
        }
        val line = { e: Sort ->
            "- ${full(e.product)}${if (e.kaufen == null && e.choice == "gemischt") " (nur für ${petNames(e.yes)})" else ""}"
        }
        val title = "Einkaufen für ${petNames(if (m.pet != null) listOf(m.pet) else db.pets.map { it.id })}"
        val blocks =
            TYPES
                .map { t -> t to g.nachkaufen.filter { typeOf(it.product) == t } }
                .filter { it.second.isNotEmpty() }
                .map { (t, list) -> "$t\n${list.joinToString("\n") { line(it) }}" }
        return Shopping(title, (listOf(title) + blocks).joinToString("\n\n"))
    }

    fun byMe(): JsonPrimitive? = prefs.name.takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) }
}
