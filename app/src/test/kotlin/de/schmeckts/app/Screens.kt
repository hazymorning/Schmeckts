package de.schmeckts.app

import android.os.Looper
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ApplicationProvider
import de.schmeckts.app.ui.SheetState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.Duration

/** HTTP for a phone on a test: what each address answers, everything else out of reach; asked keeps every request. */
class FakeHttp : Http {
    class Req(
        val method: String,
        val url: String,
        val headers: Map<String, String>,
        val body: String?,
    )

    val asked = java.util.Collections.synchronizedList(mutableListOf<String>())
    val sent = java.util.Collections.synchronizedList(mutableListOf<Req>())
    val routes = LinkedHashMap<String, (Req) -> Http.Answer>()

    fun route(
        prefix: String,
        answer: (method: String, url: String, body: String?) -> Http.Answer,
    ) {
        routes[prefix] = { r -> answer(r.method, r.url, r.body) }
    }

    /** the same with the request's headers */
    fun answer(
        prefix: String,
        answer: (Req) -> Http.Answer,
    ) {
        routes[prefix] = answer
    }

    override suspend fun send(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
        timeoutMs: Long,
    ): Http.Answer {
        asked.add("$method $url")
        val req = Req(method, url, headers, body)
        sent.add(req)
        val r = routes.entries.firstOrNull { url.startsWith(it.key) } ?: throw Http.Offline(false, null)
        return r.value(req)
    }

    override fun events(
        url: String,
        onEvent: (String, String) -> Unit,
        onError: () -> Unit,
    ): AutoCloseable {
        asked.add("EVENTS $url")
        return AutoCloseable {}
    }

    override suspend fun download(
        url: String,
        file: File,
        share: (Double) -> Unit,
    ) {
        asked.add("DOWNLOAD $url")
        throw Http.Offline(false, null)
    }
}

const val SRV = "http://192.168.99.9:8486" // a simulated server at a home-network address

/** the household server as the old tests simulated it; failing breaks its recognition, photos collects what it got */
fun FakeHttp.household(
    failing: () -> Boolean = { false },
    photos: MutableList<String>? = null,
) = route(SRV) { method, url, body ->
    val path = url.substringAfter(":8486")
    val now = Time.now()
    if (path.startsWith("/api/recognize") &&
        photos != null
    ) {
        photos.add((parseJson(body ?: "{}").obj()["image"].asString ?: "").takeLast(32))
    }
    val (status, json) =
        when {
            failing() && path.startsWith("/api/recognize") -> 503 to """{"error":"aus""""
            path.startsWith("/api/info") -> 200 to """{"app":"schmeckts","protocol":1,"recognition":true,"features":[],"auth":true"""
            path.startsWith("/api/recognize") -> 200 to """{"brand":"Gourmet","variety":"Gold Pastete","type":"Nassfutter""""
            path.startsWith("/api/changes") && method == "POST" -> {
                val ids =
                    parseJson(body ?: "{}")
                        .obj()["changes"]
                        .asArray
                        .orEmpty()
                        .map { (it as JsonObject)["id"].toString() }
                200 to """{"ok":[${ids.joinToString(",")}]"""
            }
            path.startsWith("/api/changes") -> 200 to """{"epoch":"test","seq":0,"records":[]"""
            else -> 200 to """{"epoch":"test","seq":0,"sum":"","fields":0"""
        }
    Http.Answer(status, "$json,\"now\":$now}")
}

/** A phone's whole screen under test: its files, its clock, its parts; the screen drawn by Compose under Robolectric. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
abstract class ScreenTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()
    lateinit var main: Main
    private var shown by mutableStateOf<Main?>(null)
    lateinit var dir: File
    var platform = FakePlatform()
    var http = FakeHttp()
    var clock = 0L

    init {
        berlin()
    }

    val ui get() = main.ui
    val phone get() = main.phone
    val db get() = phone.db
    val prefs get() = phone.prefs
    val sheet: SheetState? get() = ui.sheet

    /** files as they lie on the phone before it starts; reduce: the system's animations off */
    fun open(
        files: Map<String, Any> = emptyMap(),
        now: Long = at("2025-06-17T12:00"),
        reduce: Boolean = true,
        start: Boolean = true,
    ): Main {
        clock = now
        Time.source = { clock }
        val ctx = ApplicationProvider.getApplicationContext<android.app.Application>()
        Settings.Global.putFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, if (reduce) 0f else 1f)
        dir = tempDir()
        writeFiles(dir, files)
        return run(start)
    }

    private fun run(start: Boolean): Main {
        main = Main(Phone(dir, Dispatchers.Main, Dispatchers.IO, platform, http))
        if (start) main.start()
        val first = shown == null
        shown = main
        if (first) rule.setContent { shown?.let { key(it) { AppScreen(it) } } }
        idle()
        return main
    }

    /** the app closed and started again on the same files; link: opened with it, as on a cold start */
    fun restart(link: String? = null): Main {
        write()
        main.phone.close()
        run(true)
        if (link != null) {
            main.phone.scope.launch { main.actions.openLink(link) }
            idle(10)
        }
        return main
    }

    /** the system's back: what the screen takes, or false when it is left to Android */
    fun back(): Boolean {
        val d = rule.activity.onBackPressedDispatcher
        val taken = d.hasEnabledCallbacks()
        if (taken) rule.runOnUiThread { d.onBackPressed() }
        idle(10)
        return taken
    }

    /** a field by its label, typed into anew */
    fun type(
        label: String,
        text: String,
    ) {
        rule.onAllNodes(hasContentDescription(label) and hasSetTextAction())[0].performTextReplacement(text)
        idle(10)
    }

    fun link(url: String) {
        main.phone.scope.launch { main.actions.openLink(url) }
        idle(10)
    }

    /** kind, page and step of the top layer, or null with nothing open */
    val level: List<String?>? get() = sheet?.let { listOf(it.kind, it.page, it.step) }

    /** lets the screen and the main thread run, the clock moved on by ms */
    fun idle(ms: Long = 0) {
        if (ms > 0) {
            clock += ms
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms))
            rule.mainClock.advanceTimeBy(ms)
        }
        repeat(3) {
            shadowOf(Looper.getMainLooper()).idle()
            rule.waitForIdle()
        }
    }

    /** waits, in steps of the clock, until cond holds; false if it never did */
    fun until(
        ms: Long = 5000,
        cond: () -> Boolean,
    ): Boolean {
        var waited = 0L
        while (!cond()) {
            if (waited >= ms) return false
            Thread.sleep(20)
            idle(50)
            waited += 50
        }
        return true
    }

    /** a button's action, as its tap runs it */
    fun act(
        name: String,
        vararg data: Pair<String, String?>,
    ) {
        ui.act(name, *data)
        idle(50)
    }

    fun openSheet(state: SheetState) {
        ui.sheets.openSheet(state)
        idle()
    }

    /** what the screen shows: a node with this text (part of it with substring), or with this label */
    fun shows(
        text: String,
        substring: Boolean = true,
    ) = rule.onAllNodesWithText(text, substring = substring, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()

    fun labelled(label: String) =
        rule.onAllNodesWithContentDescription(label, substring = true, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()

    /** every word on the screen, labels and field contents included, in lower case */
    fun screenText(): String {
        val p = androidx.compose.ui.semantics.SemanticsProperties
        return rule
            .onAllNodes(
                androidx.compose.ui.test
                    .SemanticsMatcher("any") { true },
                useUnmergedTree = true,
            ).fetchSemanticsNodes()
            .joinToString("\n") { n ->
                val c = n.config
                listOfNotNull(
                    c.getOrElseNullable(p.Text) { null }?.joinToString(" "),
                    c.getOrElseNullable(p.ContentDescription) { null }?.joinToString(" "),
                    c.getOrElseNullable(p.EditableText) { null }?.text,
                ).joinToString(" ")
            }.lowercase()
    }

    /** what the field with this label holds */
    fun fieldText(label: String) =
        rule
            .onAllNodes(hasContentDescription(label) and hasSetTextAction())
            .fetchSemanticsNodes()
            .firstOrNull()
            ?.config
            ?.getOrElseNullable(androidx.compose.ui.semantics.SemanticsProperties.EditableText) { null }
            ?.text

    /** connected to the household's server at SRV, as the old tests did it; a server set up before stays */
    fun connect() {
        if (SRV !in http.routes) http.household()
        prefs.server = SRV
        prefs.code = "K7PM-3QXD"
        phone.store.savePrefs()
        phone.sync.start()
        check(until { phone.sync.status.state == "ok" }, "connected to the household server")
    }

    /** shown in the top layer, not on the page beneath it */
    fun inSheet(text: String): Boolean {
        val kind = sheet?.kind ?: return false
        val pane =
            androidx.compose.ui.test.SemanticsMatcher
                .expectValue(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle, kind)
        return rule
            .onAllNodes(
                hasText(text, substring = true) and
                    androidx.compose.ui.test
                        .hasAnyAncestor(pane),
                useUnmergedTree = true,
            ).fetchSemanticsNodes()
            .isNotEmpty()
    }

    /** the test tags starting with prefix, top to bottom, without it; within: inside the node so tagged; sheet: in the top layer */
    fun tags(
        prefix: String,
        within: String? = null,
        sheet: Boolean = false,
    ): List<String> {
        val tag = androidx.compose.ui.semantics.SemanticsProperties.TestTag
        var m =
            androidx.compose.ui.test.SemanticsMatcher("tag $prefix") {
                it.config.getOrElseNullable(tag) { null }?.startsWith(prefix) ==
                    true
            }
        if (within != null) {
            m = m and
                androidx.compose.ui.test
                    .hasAnyAncestor(
                        androidx.compose.ui.test
                            .hasTestTag(within),
                    )
        }
        val kind = this.sheet?.kind
        if (sheet && kind != null) {
            m = m and
                androidx.compose.ui.test.hasAnyAncestor(
                    androidx.compose.ui.test.SemanticsMatcher
                        .expectValue(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle, kind),
                )
        }
        if (!sheet && within == null && kind != null) {
            m = m and
                !androidx.compose.ui.test.hasAnyAncestor(
                    androidx.compose.ui.test.SemanticsMatcher
                        .keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle),
                )
        }
        return rule
            .onAllNodes(m, useUnmergedTree = true)
            .fetchSemanticsNodes()
            .sortedBy { it.positionInRoot.y }
            .map { it.config[tag].removePrefix(prefix) }
    }

    /** shown inside the node with this test tag */
    fun within(
        tag: String,
        text: String,
    ) = rule
        .onAllNodes(
            hasText(text, substring = true) and
                androidx.compose.ui.test
                    .hasAnyAncestor(
                        androidx.compose.ui.test
                            .hasTestTag(tag),
                    ),
            useUnmergedTree = true,
        ).fetchSemanticsNodes()
        .isNotEmpty()

    /** a chip or segment with this text, chosen */
    fun chosen(text: String) = rule.onAllNodes(hasText(text) and isSelected()).fetchSemanticsNodes().isNotEmpty()

    fun node(text: String): SemanticsNodeInteraction = rule.onAllNodes(hasText(text, substring = true), useUnmergedTree = true)[0]

    fun tap(text: String) {
        rule.onAllNodes(hasText(text, substring = true) or hasContentDescription(text, substring = true))[0].performClick()
        idle(10)
    }

    val toast: String? get() =
        ui.toasts.msg
            ?.takeIf { ui.toasts.show }
            ?.text

    /** the files as they are once everything is written */
    fun saved(name: String): JsonElement? {
        write()
        val f = File(dir, "$name.json")
        return if (f.exists()) parseJson(f.readText()) else null
    }

    /** a suspending call on the phone's own scope, the screen running meanwhile */
    fun <T> on(block: suspend Phone.() -> T): T {
        var out: Result<T>? = null
        phone.scope.launch { out = runCatching { phone.block() } }
        check(until(10_000) { out != null }, "done in time")
        return out!!.getOrThrow()
    }

    fun write() {
        var done = false
        phone.scope.launch {
            phone.disk.flush()
            done = true
        }
        check(until(10_000) { done }, "the files written")
    }

    fun calls(name: String) = platform.calls.filter { it.first == name }.map { it.second }

    @After
    fun close() {
        if (::main.isInitialized) main.phone.close()
        Time.source = System::currentTimeMillis
    }
}

fun check(
    ok: Boolean,
    what: String,
) = assertTrue(what, ok)

fun pet(
    id: String,
    name: String = "Minka",
    vararg more: Pair<String, Any?>,
) = mapOf("id" to id, "name" to name, "species" to "Katze", "createdAt" to 1) + more

fun product(
    id: String,
    brand: String = "Sheba",
    variety: String = "Lachs",
    type: String = "Nassfutter",
    vararg more: Pair<String, Any?>,
) = mapOf("id" to id, "brand" to brand, "variety" to variety, "type" to type, "codes" to emptyMap<String, Any>(), "createdAt" to 1) + more

fun meal(
    id: String,
    pid: String?,
    whenAt: Long,
    rated: Map<String, String?>,
    vararg more: Pair<String, Any?>,
) = mapOf(
    "id" to id,
    "productId" to pid,
    "servedAt" to whenAt,
    "note" to "",
    "pets" to rated.mapValues { (_, r) -> mapOf("r" to r, "at" to (if (r != null) whenAt else null)) },
) + more

fun dbOf(
    pets: List<Map<String, Any?>>,
    products: List<Map<String, Any?>> = emptyList(),
    servings: List<Map<String, Any?>> = emptyList(),
    observations: List<Map<String, Any?>> = emptyList(),
) = j(
    mapOf(
        "version" to 3,
        "pets" to pets,
        "products" to products,
        "servings" to servings.sortedByDescending { (it["servedAt"] as Number).toLong() },
        "observations" to observations,
    ),
)

/** a db as the old tests put it in place: the records as they are, nothing tidied away */
fun dbRaw(d: JsonElement): Db {
    val o = d.obj()
    val list = { c: String ->
        o[c]
            .asArray
            .orEmpty()
            .map { Rec(it.obj()) }
            .toMutableList()
    }
    return Db(list("pets"), list("products"), list("servings"), list("observations"))
}
