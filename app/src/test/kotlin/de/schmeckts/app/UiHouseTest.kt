package de.schmeckts.app

import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import de.schmeckts.app.ui.SheetState
import de.schmeckts.app.views.Exchanged
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import org.junit.Test

// Phones exchanging data without a server: the old ui_test.py from test_exchange on.

class UiExchangeTest : ScreenTest() {
    // comparable: keys sorted, an empty field counts as a missing one
    private fun data(p: Phone): String {
        fun tidy(e: JsonElement): JsonElement? =
            when (e) {
                is JsonNull -> null
                is JsonObject ->
                    e.entries
                        .mapNotNull { (k, v) -> tidy(v)?.let { k to it } }
                        .sortedBy { it.first }
                        .takeIf { it.isNotEmpty() }
                        ?.let { JsonObject(it.toMap()) }
                is JsonArray -> JsonArray(e.map { tidy(it) ?: JsonNull })
                else -> e
            }
        return listOf(p.db.pets, p.db.products, p.db.servings).joinToString { list ->
            JsonArray(list.map { tidy(it.toJson()) ?: JsonNull }).toString()
        }
    }

    private fun newest(p: FakePlatform) = parseJson(p.shared.last { "exchange" in it.first }.second).obj()

    private fun Main.exchange() {
        if (ui.sheet?.kind != "settings" || ui.sheet?.page != "exchange") {
            ui.sheets.closeAll()
            ui.sheets.openSheet(SheetState("settings", "page" to "exchange"))
        }
        idle()
    }

    private fun receive(
        m: Main,
        p: FakePlatform,
        text: String,
    ) {
        m.exchange()
        p.file = text
        m.ui.act("receive")
        idle(100)
    }

    private fun answer(m: Main) = (m.ui.sheet?.get("exchange") as? Exchanged)?.peer

    @Test
    fun `exchange - share, receive, answer, refuse foreign files`() {
        open(mapOf("db" to savedDb()))
        val bp = FakePlatform()
        val b = Main(Phone(tempDir("b"), Dispatchers.Main, Dispatchers.IO, bp, FakeHttp()))
        try {
            b.start()
            idle()
            prefs.name = "Geheimniskraemer"
            phone.store.savePrefs()
            main.exchange()
            act("share-changes")
            idle(100)
            val first = newest(platform)
            check(
                first.keys.sorted() == listOf("app", "at", "clocks", "device", "kind", "protocol", "records") &&
                    listOf(
                        first["app"].asString,
                        first["kind"].asString,
                        first["records"]!!.asArray!!.size,
                        first["clocks"]!!.obj()["servings"]!!.obj().size,
                    ) == listOf("schmeckts", "exchange", 5, 3) &&
                    "Geheimniskraemer" !in first.toString() &&
                    calls("shareFile").isNotEmpty(),
                "first share: every record with its clocks, nothing from the settings",
            )
            receive(b, bp, first.toString())
            check(data(b.phone) == data(phone) && answer(b) == null, "received on an empty phone: everything, no answer needed")
            db.products[0]["variety"] = j("Lachs pur")
            phone.store.save()
            b.phone.db.products[0]["kaufen"] = j("immer")
            b.phone.db.servings
                .removeAll { it.id == "lxserv0001" }
            b.phone.store.save()
            b.exchange()
            b.ui.act("share-changes")
            idle(100)
            val second = newest(bp)
            receive(main, platform, second.toString())
            check(second["records"]!!.asArray!!.size == 2 && shows("Antwort senden"), "second share: only what is new, an answer offered")
            check(
                db.products[0].str("kaufen") == "immer" && db.products[0].str("variety") == "Lachs pur" && db.servings.size == 2,
                "merged per field, deletion kept",
            )
            act("send-answer")
            idle(100)
            val answer = newest(platform)
            receive(b, bp, answer.toString())
            check(
                answer["records"]!!.asArray!!.size == 1 && data(b.phone) == data(phone) && !shows("Antwort senden"),
                "the answer levels both",
            )
            b.ui.sheets.closeAll()
            val uri = "content://media/external/file/schmeckts-exchange-shared.json"
            bp.uris[uri] = answer.toString()
            b.phone.scope.launch { b.actions.openLink(uri) }
            idle(100)
            check(
                b.ui.sheet?.let {
                    listOf(it.kind, it.page, it.step)
                } == listOf("settings", "exchange", null),
                "a file shared from another app opens the exchange page",
            )
            val before = data(b.phone)
            val told =
                listOf(
                    j(mapOf("app" to "other", "kind" to "exchange")).toString(),
                    "kein json",
                    j(
                        mapOf("version" to 3, "pets" to emptyList<Any>(), "products" to emptyList<Any>(), "servings" to emptyList<Any>()),
                    ).toString(),
                    j(mapOf("app" to "schmeckts", "kind" to "exchange", "protocol" to 1, "device" to "x")).toString(),
                    j(
                        mapOf(
                            "app" to "schmeckts",
                            "kind" to "exchange",
                            "protocol" to 9,
                            "device" to "x",
                            "clocks" to emptyMap<String, Any>(),
                            "records" to emptyList<Any>(),
                        ),
                    ).toString(),
                ).map { body ->
                    val was = b.ui.toasts.msg
                    receive(b, bp, body)
                    b.ui.toasts.msg !== was && b.ui.toasts.show
                }
            check(told == List(5) { true } && data(b.phone) == before, "foreign, broken or newer files: a message, nothing changed $told")
        } finally {
            b.phone.close()
        }
    }
}

class UiPopupTest : ScreenTest() {
    private val layers get() =
        listOf(
            ui.sheets.base.state
                ?.kind,
            ui.sheets.over.state
                ?.kind,
        )

    private val onPage =
        androidx.compose.ui.test.hasAnyAncestor(
            androidx.compose.ui.test.SemanticsMatcher
                .expectValue(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle, "report"),
        )

    private fun row(id: String) =
        rule.onNode(
            androidx.compose.ui.test
                .hasTestTag("row-$id") and onPage,
            useUnmergedTree = true,
        )

    private fun has(id: String) =
        rule
            .onAllNodes(
                androidx.compose.ui.test
                    .hasTestTag("row-$id") and onPage,
                useUnmergedTree = true,
            ).fetchSemanticsNodes()
            .isNotEmpty()

    private fun y(id: String) = row(id).fetchSemanticsNode().positionInRoot.y

    private fun list() =
        rule.onAllNodes(
            androidx.compose.ui.test
                .hasScrollToIndexAction() and onPage,
        )[0]

    // the meals on screen in the middle of the page, top to bottom
    private fun inView(): List<String> {
        val h =
            rule
                .onRoot()
                .fetchSemanticsNode()
                .size.height
        return tags("row-", sheet = true).filter { id ->
            y(id).let { it > h * 0.15f && it < h * 0.8f } &&
                db.servings.any { s -> s.id == id }
        }
    }

    private fun tapRow(id: String) {
        row(id).performClick()
        idle(600)
    }

    private fun gesture() {
        val d = rule.activity.onBackPressedDispatcher
        rule.runOnUiThread {
            d.dispatchOnBackStarted(androidx.activity.BackEventCompat(0f, 400f, 0f, androidx.activity.BackEventCompat.EDGE_LEFT))
            d.dispatchOnBackProgressed(androidx.activity.BackEventCompat(200f, 400f, 0.5f, androidx.activity.BackEventCompat.EDGE_LEFT))
            d.onBackPressed()
        }
        idle(10)
    }

    @Test
    fun `popup - a sheet opened from a page lies over it, closing or back leads to the page as it was`() {
        open(reduce = false)
        act("demo")
        idle(1000)
        act("open-report")
        idle(600)
        list().performScrollToIndex(5)
        idle(100)
        val item = inView().first()
        val at = y(item)
        tapRow(item)
        val over = layers
        check(over == listOf("report", "serving") && y(item) == at, "a meal opens over the page, which keeps its scroll $over")
        val ways =
            listOf({ tap("Schließen") }, { back() }, { gesture() }).map { close ->
                close()
                idle(600)
                val was = layers + listOf(y(item) == at)
                tapRow(item)
                was
            }
        act("close")
        idle(600)
        check(ways.all { it == listOf("report", null, true) }, "X, back button, gesture close the sheet only $ways")
        var meal: String? = null
        for (i in 0..12) {
            list().performScrollToIndex(2 * i)
            idle(100)
            meal =
                inView().firstOrNull { id ->
                    db.servings
                        .first { it.id == id }
                        .pets.values
                        .any { !(it as JsonObject)["r"].truthy }
                }
            if (meal != null) break
        }
        check(meal != null, "an open meal on the page")
        val s = db.servings.first { it.id == meal }
        val pet =
            s.pets.entries
                .first { !(it.value as JsonObject)["r"].truthy }
                .key
        val y0 = y(meal!!)
        tapRow(meal)
        act("rate", "s" to meal, "p" to pet, "r" to "gut")
        check(until(6000) { ui.sheets.over.state == null }, "the sheet closes by itself")
        idle(600)
        check(
            layers == listOf("report", null) && y(meal) == y0 && toast != null && (s.pets[pet] as JsonObject)["r"].asString == "gut",
            "rated over the page: the sheet closes by itself, the page shows it in place, the toast on the page $layers",
        )
        act("undo")
        idle(400)
        check(!(db.servings.first { it.id == meal }.pets[pet] as JsonObject)["r"].truthy, "undo on the page takes the rating back there")
        tapRow(meal)
        act("delete-serving", "id" to meal)
        idle(600)
        val gone = layers + listOf(has(meal))
        act("undo")
        idle(600)
        check(gone == listOf("report", null, false) && has(meal), "deleted over the page, undone there $gone")
        act("settings-back")
        idle(600)
        act("open-evaluation")
        idle(600)
        val first = tags("pick-", sheet = true).ifEmpty { tags("place-", sheet = true) }.first()
        act("open-product", "id" to first)
        idle(600)
        val product = layers
        act("close")
        idle(600)
        val stays = layers
        act("open-product", "id" to first)
        idle(600)
        act("serve", "id" to first)
        idle(1000)
        val served = layers
        check(
            product == listOf("evaluation", "product") && stays == listOf("evaluation", null) && served == listOf(null, null) && !back(),
            "a variety over „Vorlieben“ closes back to it; serving from it ends on the home page, nothing left to go back to $served",
        )
        act("open-evaluation")
        idle(600)
        act("open-level", "v" to "shop")
        idle(600)
        act("open-product", "id" to tags("shop-", sheet = true).first())
        idle(600)
        openSheet(
            de.schmeckts.app.ui
                .SheetState("settings", "page" to "house"),
        )
        idle(600)
        val swapped = layers
        act("settings-back")
        act("settings-back")
        idle(600)
        check(
            swapped == listOf("settings", null) && layers == listOf(null, null),
            "a page over both replaces them, back leads home $swapped",
        )
    }
}
