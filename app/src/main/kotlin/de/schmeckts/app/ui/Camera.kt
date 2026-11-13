package de.schmeckts.app.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.compose.CameraXViewfinder
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceRequest
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.CompletableDeferred
import java.io.File

/* Own camera for packaging photos: resolves to the JPEG, or null when cancelled; throws without camera or permission,
   so the caller can fall back to the camera app. */

class CameraFailed(
    message: String,
) : Exception(message)

class Camera(
    private val darkBars: (Boolean) -> Unit,
    private val dropViewer: () -> Unit,
) {
    var hint by mutableStateOf<String?>(null)
        private set
    internal var result: CompletableDeferred<ByteArray?>? = null
    var open by mutableStateOf(false)
        private set
    var hosted = false

    /** for the back button */
    fun closeCamera(): Boolean {
        if (!open) return false
        close(null)
        return true
    }

    suspend fun openCamera(hint: String): ByteArray? {
        if (open) return null
        if (!hosted) throw CameraFailed("Keine Kamera in dieser Umgebung.")
        val r = CompletableDeferred<ByteArray?>()
        result = r
        this.hint = hint
        dropViewer()
        open = true
        darkBars(true)
        return r.await()
    }

    internal fun close(photo: ByteArray?) = finish { complete(photo) }

    internal fun fail(e: Exception) = finish { completeExceptionally(e) }

    private fun finish(how: CompletableDeferred<ByteArray?>.() -> Unit) {
        val r = result ?: return
        result = null
        open = false
        darkBars(false)
        r.how()
    }
}

// ML Kit reads text best from about READ_MAX px on the long side; the sensor gives the size nearest to it
private val SHARP =
    ResolutionSelector
        .Builder()
        .setResolutionStrategy(
            ResolutionStrategy(
                android.util.Size(de.schmeckts.app.READ_MAX, de.schmeckts.app.READ_MAX * 3 / 4),
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
            ),
        ).build()

@Composable
fun CameraHost(camera: Camera) {
    DisposableEffect(camera) {
        camera.hosted = true
        onDispose { camera.hosted = false }
    }
    if (!camera.open) return
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    var allowed by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val ask =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
            if (ok) allowed = true else camera.fail(CameraFailed("Kein Zugriff auf die Kamera."))
        }
    LaunchedEffect(Unit) { if (!allowed) ask.launch(Manifest.permission.CAMERA) }
    BackHandler { camera.close(null) }
    // gone to the background: cancelled, and the camera let go at once
    DisposableEffect(owner) {
        val watch = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) camera.close(null) }
        owner.lifecycle.addObserver(watch)
        onDispose { owner.lifecycle.removeObserver(watch) }
    }
    var request by remember { mutableStateOf<SurfaceRequest?>(null) }
    val capture =
        remember {
            ImageCapture
                .Builder()
                .setResolutionSelector(SHARP)
                .setFlashMode(ImageCapture.FLASH_MODE_OFF)
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                .build()
        }
    if (allowed) {
        DisposableEffect(Unit) {
            val future = ProcessCameraProvider.getInstance(context)
            var provider: ProcessCameraProvider? = null
            future.addListener({
                try {
                    val p = future.get()
                    provider = p
                    val preview = Preview.Builder().build().apply { setSurfaceProvider { request = it } }
                    p.unbindAll()
                    p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
                } catch (e: Exception) {
                    camera.fail(CameraFailed("Keine Kamera in dieser Umgebung."))
                }
            }, ContextCompat.getMainExecutor(context))
            onDispose { provider?.unbindAll() }
        }
    }
    var taking by remember { mutableStateOf(false) }
    SchmecktsTheme("dark") {
        Box(Modifier.fillMaxSize().background(colors.bg)) {
            request?.let { CameraXViewfinder(it, Modifier.fillMaxSize()) }
            camera.hint?.let { hint ->
                M(
                    hint,
                    Type.smallStrong,
                    Modifier
                        .align(Alignment.TopCenter)
                        .windowInsetsPadding(WindowInsets.safeDrawing)
                        .padding(top = Space.s4, start = Space.gutter, end = Space.gutter)
                        .clip(RoundedCornerShape(Radius.m))
                        .background(colors.surface)
                        .padding(horizontal = Space.s4, vertical = Space.s2),
                    colors.ink,
                    align = TextAlign.Center,
                )
            }
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(start = Space.gutter, end = Space.gutter, top = Space.gutter, bottom = Space.s7),
            ) {
                Row(Modifier.align(Alignment.CenterStart)) {
                    Btn("Abbrechen", BtnKind.SOFT, Modifier.widthIn(max = 160.dp), fill = false) { camera.close(null) }
                }
                Box(
                    Modifier
                        .align(Alignment.Center)
                        .size(94.dp) // 78 and the two rings around it
                        .press({
                            if (taking || request == null) return@press
                            taking = true
                            val out = File(context.cacheDir, "camera.jpg")
                            capture.takePicture(
                                ImageCapture.OutputFileOptions.Builder(out).build(),
                                ContextCompat.getMainExecutor(context),
                                object : ImageCapture.OnImageSavedCallback {
                                    override fun onImageSaved(r: ImageCapture.OutputFileResults) {
                                        val bytes = runCatching { out.readBytes() }.getOrNull()
                                        out.delete()
                                        taking = false
                                        camera.close(bytes)
                                    }

                                    override fun onError(e: ImageCaptureException) {
                                        taking = false
                                        de.schmeckts.app.report("the photo from the sensor", e)
                                        camera.fail(CameraFailed("Das Foto ließ sich nicht aufnehmen."))
                                    }
                                },
                            )
                        }, label = "Auslösen")
                        .border(Size.stroke * 2, colors.ink, CircleShape)
                        .padding(Size.stroke * 2)
                        .border(Size.stroke * 2, colors.bg, CircleShape)
                        .padding(Size.stroke * 2)
                        .clip(CircleShape)
                        .background(colors.ink),
                )
            }
        }
    }
}
