package de.schmeckts.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.io.File
import java.io.IOException
import java.io.InterruptedIOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** HTTP as the app uses it; tests put their own in its place. */
interface Http {
    class Answer(
        val status: Int,
        val body: String?,
    )

    /** Fails with [Offline] when no answer came. */
    suspend fun send(
        method: String,
        url: String,
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
        timeoutMs: Long = 20_000,
    ): Answer

    /** Server-sent events; returns what closes the stream. */
    fun events(
        url: String,
        onEvent: (type: String, data: String) -> Unit,
        onError: () -> Unit,
    ): AutoCloseable

    /** share: 0 to 1 while it loads */
    suspend fun download(
        url: String,
        file: File,
        share: (Double) -> Unit,
    )

    class Offline(
        val timedOut: Boolean,
        cause: Throwable?,
    ) : IOException(cause)
}

class OkHttp(
    private val client: OkHttpClient = OkHttpClient(),
) : Http {
    override suspend fun send(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
        timeoutMs: Long,
    ): Http.Answer {
        val req =
            Request
                .Builder()
                .url(url)
                .apply { headers.forEach { (k, v) -> header(k, v) } }
                .header("Cache-Control", "no-store")
                .method(method, body?.toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
        val call =
            client
                .newBuilder()
                .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .build()
                .newCall(req)
        return try {
            call.await()
        } catch (e: InterruptedIOException) {
            throw Http.Offline(true, e)
        } catch (e: IOException) {
            throw Http.Offline(false, e)
        } catch (e: IllegalArgumentException) {
            throw Http.Offline(false, e)
        }
    }

    override fun events(
        url: String,
        onEvent: (String, String) -> Unit,
        onError: () -> Unit,
    ): AutoCloseable {
        val source =
            EventSources
                .createFactory(client.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build())
                .newEventSource(
                    Request.Builder().url(url).build(),
                    object : EventSourceListener() {
                        override fun onEvent(
                            eventSource: EventSource,
                            id: String?,
                            type: String?,
                            data: String,
                        ) = onEvent(type ?: "message", data)

                        override fun onFailure(
                            eventSource: EventSource,
                            t: Throwable?,
                            response: Response?,
                        ) = onError()

                        override fun onClosed(eventSource: EventSource) = onError()
                    },
                )
        return AutoCloseable { source.cancel() }
    }

    // GitHub answers with a redirect to its file host, which OkHttp follows
    override suspend fun download(
        url: String,
        file: File,
        share: (Double) -> Unit,
    ) {
        val call =
            client
                .newBuilder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build()
                .newCall(Request.Builder().url(url).build())
        withContext(Dispatchers.IO) { call.execute() }.use { res ->
            if (res.code != 200) throw IOException("HTTP ${res.code}")
            val total = res.body.contentLength()
            var done = 0L
            var told = 0L
            withContext(Dispatchers.IO) {
                res.body.byteStream().use { input ->
                    file.outputStream().use { out ->
                        val buffer = ByteArray(65536)
                        while (true) {
                            val n = input.read(buffer)
                            if (n <= 0) break
                            out.write(buffer, 0, n)
                            done += n
                            if (total > 0 && (done - told) * 50 >= total) {
                                told = done
                                share(done.toDouble() / total)
                            }
                        }
                    }
                }
            }
        }
    }
}

// the body is read on OkHttp's thread, never on the caller's
private suspend fun Call.await(): Http.Answer =
    suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { cancel() }
        enqueue(
            object : Callback {
                override fun onFailure(
                    call: Call,
                    e: IOException,
                ) = cont.resumeWithException(e)

                override fun onResponse(
                    call: Call,
                    response: Response,
                ) {
                    val answer =
                        try {
                            response.use { Http.Answer(it.code, it.body.string()) }
                        } catch (e: IOException) {
                            cont.resumeWithException(e)
                            return
                        }
                    cont.resume(answer)
                }
            },
        )
    }
