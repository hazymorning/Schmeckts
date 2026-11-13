package de.schmeckts.app

import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.File
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.URI
import java.nio.file.Files

/** Answers like the Messages API with reply as the packaging, and counts the calls. */
class FakeAnthropic {
    @Volatile var calls = 0

    @Volatile var reply = """{"brand":"Sheba","variety":"Lachs in Soße","type":"Nassfutter"}"""
    private val server =
        HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/") { ex ->
                ex.requestBody.readBytes()
                calls++
                val raw =
                    jsonObject(
                        "content" to JsonArray(listOf(jsonObject("type" to JsonPrimitive("text"), "text" to JsonPrimitive(reply)))),
                    ).stringify().toByteArray()
                ex.responseHeaders.add("content-type", "application/json")
                ex.sendResponseHeaders(200, raw.size.toLong())
                ex.responseBody.use { it.write(raw) }
            }
            start()
        }
    val url = "http://127.0.0.1:${server.address.port}"
}

/** The real server from server/, built once, with a data directory of its own. */
class GoServer(
    anthropic: String,
    val code0: String = "K7PM-3QXD",
) {
    val dir: File = Files.createTempDirectory("schmeckts-server-").toFile()
    var code = code0
    var port = freePort()
    private var proc: Process? = null
    val url get() = "http://127.0.0.1:$port"
    private val binary = build(anthropic)

    fun writeConfig() = File(dir, "config.json").writeText("""{"code":"$code","apiKey":"sk-ant-test","port":$port}""")

    // on its port while that is free, otherwise on another one; only an answer with our own epoch counts
    fun start() {
        val log = File(dir, "server.log")
        repeat(10) { attempt ->
            writeConfig()
            proc =
                ProcessBuilder(binary.path)
                    .apply { environment()["STATE_DIRECTORY"] = dir.path }
                    .redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.appendTo(log))
                    .start()
            if (answers()) return
            proc!!.destroyForcibly().waitFor()
            if (attempt >= 2) port = freePort()
        }
        error("server does not start:\n" + log.readText().takeLast(2000))
    }

    private fun answers(): Boolean {
        repeat(100) {
            if (proc?.isAlive != true) return false
            try {
                val info = get("/api/info", auth = false)
                val ours = parseJson(File(dir, "state.json").readText()).obj()["epoch"].asString
                return info["epoch"].asString == ours && proc!!.isAlive
            } catch (e: Exception) {
                Thread.sleep(50)
            }
        }
        return false
    }

    fun stop() {
        proc?.destroy()
        proc?.waitFor()
    }

    fun get(
        path: String,
        auth: Boolean = true,
    ): JsonObject {
        val con = URI(url + path).toURL().openConnection() as HttpURLConnection
        con.connectTimeout = 1000
        con.readTimeout = 10_000
        if (auth) con.setRequestProperty("Authorization", "Bearer $code")
        return con.inputStream.use { parseJson(it.readBytes().toString(Charsets.UTF_8)).obj() }
    }

    /** visible records as in the app: {collection: {id: {field: value}}}, without _del and null */
    fun records(): Map<String, Map<String, Map<String, JsonElement>>> {
        val out = LinkedHashMap<String, LinkedHashMap<String, Map<String, JsonElement>>>()
        COLLECTIONS.forEach { out[it] = LinkedHashMap() }
        for (x in get("/api/changes?since=0")["records"] as JsonArray) {
            val o = x.obj()
            val f = o["f"]!!.obj()
            if ((f["_del"] as? JsonObject)?.get("v").asBoolean == true) continue
            val c = o["c"].asString!!
            out.getOrPut(c) { LinkedHashMap() }[o["r"].asString!!] =
                f.filter { (k, v) -> k != "_del" && !v.obj()["v"].isNull }.mapValues { it.value.obj()["v"]!! }
        }
        return out
    }

    companion object {
        private val built = HashMap<String, File>()

        @Synchronized
        fun build(anthropic: String): File =
            built.getOrPut(anthropic) {
                val out = File(Files.createTempDirectory("schmeckts-bin-").toFile(), "schmeckts-server")
                val go =
                    listOf("go", "/usr/local/go/bin/go").first {
                        runCatching { ProcessBuilder(it, "version").start().waitFor() == 0 }.getOrDefault(false)
                    }
                // -buildvcs=false: the git call behind the stamp fails when the checkout belongs to another user, as in CI
                val p =
                    ProcessBuilder(go, "build", "-buildvcs=false", "-ldflags", "-X main.anthropicURL=$anthropic", "-o", out.path, ".")
                        .directory(File("../server"))
                        .redirectErrorStream(true)
                        .start()
                val log = p.inputStream.readBytes().toString(Charsets.UTF_8)
                check(p.waitFor() == 0) { log }
                out
            }

        fun freePort(): Int = ServerSocket(0).use { it.localPort }
    }
}

/** HTTP that can be cut off for one phone, as without Wi-Fi, and watched. */
class Switch(
    private val inner: Http = OkHttp(),
) : Http {
    @Volatile var blocked = false

    @Volatile var hold: (suspend (String, String) -> Unit)? = null // runs before a request goes out

    @Volatile var noLive = false

    @Volatile var info: ((JsonObject) -> JsonObject)? = null
    val posted = java.util.Collections.synchronizedList(mutableListOf<String>())

    override suspend fun send(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
        timeoutMs: Long,
    ): Http.Answer {
        if (blocked) throw Http.Offline(false, null)
        hold?.invoke(method, url)
        if (blocked) throw Http.Offline(false, null)
        if (method == "POST" && "/api/changes" in url) posted.add(body ?: "")
        val answer = inner.send(method, url, headers, body, timeoutMs)
        val change = info
        if (change != null &&
            "/api/info" in url &&
            answer.body != null
        ) {
            return Http.Answer(answer.status, change(parseJson(answer.body!!).obj()).stringify())
        }
        return answer
    }

    override fun events(
        url: String,
        onEvent: (String, String) -> Unit,
        onError: () -> Unit,
    ): AutoCloseable {
        if (blocked || noLive) {
            Thread { onError() }.start()
            return AutoCloseable { }
        }
        return inner.events(url, onEvent, onError)
    }

    override suspend fun download(
        url: String,
        file: File,
        share: (Double) -> Unit,
    ) = inner.download(url, file, share)
}
