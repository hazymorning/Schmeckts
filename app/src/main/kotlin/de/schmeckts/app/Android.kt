package de.schmeckts.app

import android.app.Activity
import android.app.Application
import android.app.DatePickerDialog
import android.app.PendingIntent
import android.app.TimePickerDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.view.HapticFeedbackConstants
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.android.gms.common.moduleinstall.InstallStatusListener
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okio.ByteString.Companion.decodeBase64
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

// The phone's own parts on Android: what Platform asks for, done the way Android apps do it.

private suspend fun <T> Task<T>.await(): T =
    suspendCancellableCoroutine { c ->
        addOnSuccessListener { c.resume(it) }
        addOnFailureListener { c.resumeWithException(it) }
        addOnCanceledListener { c.cancel() }
    }

class AndroidNotifications(
    private val context: Context,
    private val platform: AndroidPlatform,
) : Notifications {
    override fun permission(): String =
        if (Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            "granted"
        } else {
            "prompt"
        }

    override suspend fun request(): String {
        if (permission() == "granted") return "granted"
        val ok = platform.launch(ActivityResultContracts.RequestPermission(), android.Manifest.permission.POST_NOTIFICATIONS)
        return if (ok) "granted" else "denied"
    }

    override fun plan(notes: List<Note>) = Notes.plan(context, notes)

    override fun feed(
        reminders: List<FeedNote>,
        dismiss: List<Int>,
        server: String,
        code: String,
    ) {
        val list =
            org.json.JSONArray(
                reminders.map {
                    org.json
                        .JSONObject()
                        .put("id", it.id)
                        .put("key", it.key)
                        .put("at", it.at)
                        .put("since", it.since)
                        .put("title", it.title)
                        .put("body", it.body)
                        .put("sure", it.sure)
                },
            )
        FeedReceiver.store(
            context,
            org.json
                .JSONObject()
                .put("reminders", list)
                .put("server", server)
                .put("code", code),
        )
        FeedReceiver.arm(context)
        FeedReceiver.dismiss(context, dismiss)
    }
}

class AndroidPlatform(
    private val app: Application,
) : Platform {
    var activity: ComponentActivity? = null
    private val keys = AtomicInteger()

    override val version: String =
        try {
            app.packageManager.getPackageInfo(app.packageName, 0).versionName ?: ""
        } catch (e: Exception) {
            ""
        }
    override val pictures = AndroidPictures()
    override val notifications = AndroidNotifications(app, this)

    init {
        update().delete() // what an earlier update left behind
    }

    /** an activity result, by a launcher made for the one call */
    suspend fun <I, O> launch(
        contract: ActivityResultContract<I, O>,
        input: I,
    ): O =
        withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { c ->
                val act = activity ?: return@suspendCancellableCoroutine c.resumeWithException(IllegalStateException("no screen"))
                var launcher: ActivityResultLauncher<I>? = null
                launcher =
                    act.activityResultRegistry.register("schmeckts-${keys.incrementAndGet()}", contract) { r ->
                        launcher?.unregister()
                        c.resume(r)
                    }
                launcher.launch(input)
            }
        }

    override fun haptic(level: String) {
        val view = activity?.window?.decorView ?: return
        val kind =
            when (level) {
                "success" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
                "strong" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
                else -> HapticFeedbackConstants.CLOCK_TICK
            }
        view.performHapticFeedback(kind) // nothing depends on it, a phone that cannot vibrate is ignored
    }

    override suspend fun shareText(
        title: String,
        text: String,
    ): String {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text).putExtra(Intent.EXTRA_SUBJECT, title)
        share(Intent.createChooser(send, title))
        return "shared"
    }

    // the chooser tells which app was picked; without one it was cancelled
    private suspend fun share(chooser: (IntentSender) -> Intent): Boolean {
        val act = activity ?: throw IllegalStateException("no screen")
        val action = "${app.packageName}.SHARED.${keys.incrementAndGet()}"
        val chosen = CompletableDeferred<Unit>()
        val receiver =
            object : BroadcastReceiver() {
                override fun onReceive(
                    context: Context,
                    intent: Intent,
                ) {
                    chosen.complete(Unit)
                }
            }
        ContextCompat.registerReceiver(act, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
        try {
            val back =
                PendingIntent.getBroadcast(
                    act,
                    0,
                    Intent(action).setPackage(app.packageName),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                )
            launch(ActivityResultContracts.StartActivityForResult(), chooser(back.intentSender))
            return chosen.isCompleted
        } finally {
            act.unregisterReceiver(receiver)
        }
    }

    private suspend fun share(chooser: Intent) = share { _ -> chooser }

    override suspend fun shareFile(
        name: String,
        text: String,
        title: String,
        dialogTitle: String,
    ): Boolean {
        val file = File(app.cacheDir, name)
        withContext(Dispatchers.IO) { file.writeText(text) }
        val uri = FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", file)
        val send =
            Intent(Intent.ACTION_SEND)
                .setType("application/json")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_SUBJECT, title)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return share { sender -> Intent.createChooser(send, dialogTitle, sender) }
    }

    override fun clearExports() {
        try {
            app.cacheDir
                .listFiles()
                ?.filter { it.name.startsWith("schmeckts-") }
                ?.forEach { it.delete() }
        } catch (e: Exception) {
            report("old files in the cache", e)
        }
    }

    override fun hasCamera() = app.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)

    // the manifest declares the camera permission, so Android refuses the camera app while it is denied
    override suspend fun takePhoto(hint: String?): ByteArray? {
        val dir = File(app.cacheDir, "photo")
        if (!dir.isDirectory && !dir.mkdirs()) throw java.io.IOException("cache directory")
        val file = File(dir, "package.jpg")
        try {
            val target = FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", file)
            if (!hint.isNullOrEmpty()) Toast.makeText(app, hint, Toast.LENGTH_LONG).show()
            val ok = launch(ActivityResultContracts.TakePicture(), target)
            if (!ok) return null
            return withContext(Dispatchers.IO) { file.readBytes() } // the app turns and shrinks it
        } finally {
            file.delete()
        }
    }

    private val reader by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private val reads = AtomicInteger()

    // read from a file, as the plugin did, so its rotation and decoding are the same
    override suspend fun readPhoto(b64: String): Reading {
        if (b64.isEmpty()) return UNREAD
        return try {
            val bytes = b64.decodeBase64()?.toByteArray() ?: return UNREAD
            val file = File(app.cacheDir, "schmeckts-ocr-${reads.incrementAndGet()}.jpg") // readings may overlap
            withContext(Dispatchers.IO) { file.writeBytes(bytes) }
            try {
                val start = System.nanoTime()
                val text = reader.process(InputImage.fromFilePath(app, Uri.fromFile(file))).await()
                val ms = (System.nanoTime() - start) / 1_000_000
                val (width, height) = jpegSize(b64)
                readingOf(textJson(text), width, height, ms)
            } finally {
                if (!file.delete() && file.exists()) report("deleting the photo from the cache", file.name)
            }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            report("text on the photo", e)
            UNREAD
        }
    }

    // Play services drive the camera, so no camera permission is needed; their module is installed first if missing
    override suspend fun scanBarcode(onInstall: () -> Unit): String? {
        val options =
            GmsBarcodeScannerOptions
                .Builder()
                .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A)
                .build()
        val act = activity ?: throw IllegalStateException("no screen")
        val scanner = GmsBarcodeScanning.getClient(act, options)
        val modules = ModuleInstall.getClient(act)
        if (!modules.areModulesAvailable(scanner).await().areModulesAvailable()) {
            onInstall()
            install(modules, scanner)
        }
        return try {
            scanner.startScan().await()?.rawValue
        } catch (e: kotlinx.coroutines.CancellationException) {
            null
        }
    }

    private suspend fun install(
        modules: com.google.android.gms.common.moduleinstall.ModuleInstallClient,
        scanner: com.google.android.gms.common.api.OptionalModuleApi,
    ) {
        val done = CompletableDeferred<Unit>()
        val listener =
            InstallStatusListener { update: ModuleInstallStatusUpdate ->
                when (update.installState) {
                    ModuleInstallStatusUpdate.InstallState.STATE_COMPLETED -> done.complete(Unit)
                    ModuleInstallStatusUpdate.InstallState.STATE_CANCELED, ModuleInstallStatusUpdate.InstallState.STATE_FAILED ->
                        done.completeExceptionally(java.io.IOException("Das Scanner-Modul ließ sich nicht installieren."))
                }
            }
        try {
            val r =
                modules
                    .installModules(
                        ModuleInstallRequest
                            .newBuilder()
                            .addApi(scanner)
                            .setListener(listener)
                            .build(),
                    ).await()
            if (r.areModulesAlreadyInstalled()) done.complete(Unit)
            withTimeout(120_000) { done.await() }
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            throw java.io.IOException("Die Installation des Scanners dauert zu lange.")
        } finally {
            modules.unregisterListener(listener)
        }
    }

    override suspend fun pickFile(): String? {
        val uri =
            launch(ActivityResultContracts.OpenDocument(), arrayOf("application/json", "text/plain", "application/octet-stream"))
                ?: return null
        return readUri(uri.toString())
    }

    override suspend fun pickImage(): ByteArray? {
        val uri =
            launch(ActivityResultContracts.PickVisualMedia(), PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                ?: return null
        return withContext(Dispatchers.IO) { app.contentResolver.openInputStream(uri)?.use { it.readBytes() } }
    }

    override suspend fun readUri(uri: String): String =
        withContext(Dispatchers.IO) {
            val u = Uri.parse(uri)
            app.contentResolver.openInputStream(u)?.use { it.readBytes().toString(Charsets.UTF_8) }
                ?: throw java.io.FileNotFoundException(uri)
        }

    override suspend fun pickDateTime(
        t: Long,
        max: Long,
    ): Long? =
        withContext(Dispatchers.Main) {
            val act: Activity = activity ?: return@withContext null
            val c = Calendar.getInstance().apply { timeInMillis = t }
            val day =
                suspendCancellableCoroutine<Triple<Int, Int, Int>?> { k ->
                    val d =
                        DatePickerDialog(
                            act,
                            { _, y, m, dd -> k.resume(Triple(y, m, dd)) },
                            c.get(Calendar.YEAR),
                            c.get(Calendar.MONTH),
                            c.get(Calendar.DAY_OF_MONTH),
                        )
                    d.datePicker.maxDate = max
                    d.setOnCancelListener { if (k.isActive) k.resume(null) }
                    d.show()
                } ?: return@withContext null
            val time =
                suspendCancellableCoroutine<Pair<Int, Int>?> { k ->
                    val d =
                        TimePickerDialog(act, { _, h, m -> k.resume(h to m) }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), true)
                    d.setOnCancelListener { if (k.isActive) k.resume(null) }
                    d.show()
                } ?: return@withContext null
            Calendar.getInstance().apply { set(day.first, day.second, day.third, time.first, time.second, 0) }.timeInMillis.let {
                it -
                    it % 1000
            }
        }

    override fun canUpdate() = true

    private fun update() = File(File(app.cacheDir, "update"), "schmeckts.apk")

    // GitHub answers with a redirect to its file host, which HttpURLConnection follows
    override suspend fun install(
        url: String,
        share: (Double) -> Unit,
    ) {
        if (!url.startsWith("https://")) throw IllegalArgumentException("no address")
        val file = update()
        try {
            withContext(Dispatchers.IO) {
                val dir = file.parentFile!!
                if (!dir.isDirectory && !dir.mkdirs()) throw java.io.IOException("cache directory")
                val con = URL(url).openConnection() as HttpURLConnection
                con.connectTimeout = 15_000
                con.readTimeout = 30_000
                try {
                    if (con.responseCode != HttpURLConnection.HTTP_OK) throw java.io.IOException("HTTP ${con.responseCode}")
                    val total = con.contentLengthLong
                    var done = 0L
                    var told = 0L
                    con.inputStream.use { inp ->
                        file.outputStream().use { out ->
                            val buffer = ByteArray(65536)
                            while (true) {
                                val n = inp.read(buffer)
                                if (n <= 0) break
                                out.write(buffer, 0, n)
                                done += n
                                if (total > 0 && (done - told) * 50 >= total) {
                                    told = done
                                    val s = done.toDouble() / total
                                    withContext(Dispatchers.Main) { share(s) }
                                }
                            }
                        }
                    }
                } finally {
                    con.disconnect()
                }
            }
            val uri = FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", file)
            val intent =
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            (activity ?: throw IllegalStateException("no installer")).startActivity(intent)
        } catch (e: Exception) {
            file.delete()
            throw e
        }
    }
}

private typealias IntentSender = android.content.IntentSender

/** ML Kit's answer as the Capacitor plugin handed it over, so readings and fixtures keep their form */
fun textJson(t: Text): JsonObject {
    fun box(
        o: MutableMap<String, JsonElement>,
        r: android.graphics.Rect?,
        corners: Array<android.graphics.Point>?,
        lang: String?,
    ) {
        if (r != null) {
            o["boundingBox"] =
                JsonObject(
                    mapOf(
                        "left" to JsonPrimitive(r.left),
                        "top" to JsonPrimitive(r.top),
                        "right" to JsonPrimitive(r.right),
                        "bottom" to JsonPrimitive(r.bottom),
                    ),
                )
        }
        if (corners !=
            null
        ) {
            o["cornerPoints"] = JsonArray(corners.map { JsonObject(mapOf("x" to JsonPrimitive(it.x), "y" to JsonPrimitive(it.y))) })
        }
        if (!lang.isNullOrEmpty()) o["recognizedLanguage"] = JsonPrimitive(lang)
    }
    val blocks =
        t.textBlocks.map { b ->
            val o = LinkedHashMap<String, JsonElement>()
            o["text"] = JsonPrimitive(b.text)
            box(o, b.boundingBox, b.cornerPoints, b.recognizedLanguage)
            o["lines"] =
                JsonArray(
                    b.lines.map { l ->
                        val lo = LinkedHashMap<String, JsonElement>()
                        lo["text"] = JsonPrimitive(l.text)
                        box(lo, l.boundingBox, l.cornerPoints, l.recognizedLanguage)
                        lo["elements"] =
                            JsonArray(
                                l.elements.map { e ->
                                    val eo = LinkedHashMap<String, JsonElement>()
                                    eo["text"] = JsonPrimitive(e.text)
                                    box(eo, e.boundingBox, e.cornerPoints, e.recognizedLanguage)
                                    JsonObject(eo)
                                },
                            )
                        JsonObject(lo)
                    },
                )
            JsonObject(o)
        }
    return JsonObject(mapOf("text" to JsonPrimitive(t.text), "blocks" to JsonArray(blocks)))
}
