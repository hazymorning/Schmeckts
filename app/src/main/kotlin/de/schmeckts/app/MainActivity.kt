package de.schmeckts.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.schmeckts.app.ui.CameraHost
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.SchmecktsTheme
import de.schmeckts.app.ui.SheetHost
import de.schmeckts.app.ui.ToastHost
import de.schmeckts.app.ui.ViewerHost
import de.schmeckts.app.ui.isDark
import de.schmeckts.app.ui.reduceMotion
import de.schmeckts.app.views.HomeScreen
import de.schmeckts.app.views.SheetView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val LATEST = 2500L // ms the splash stays at most

/** The whole screen: the home page, the two layers over it, the photo viewer, the camera and the toast on top. */
@Composable
fun AppScreen(main: Main) {
    val ui = main.ui
    val phone = main.phone
    SchmecktsTheme(phone.prefs.also { ui.tick }.theme) {
        CompositionLocalProvider(LocalUi provides ui) {
            val still = reduceMotion
            DisposableEffect(ui) {
                ui.hosted = true
                onDispose { ui.hosted = false }
            }
            LaunchedEffect(still) { ui.reduced = still }
            val focus = LocalFocusManager.current
            LaunchedEffect(ui.blur) { if (ui.blur > 0) focus.clearFocus() }
            // the clock on the home page moves on; a page out of sight is redrawn when it shows again
            val owner = LocalLifecycleOwner.current
            DisposableEffect(owner) {
                val watch =
                    LifecycleEventObserver { _, e ->
                        when (e) {
                            Lifecycle.Event.ON_START -> {
                                phone.visible = true
                                phone.sync.shown(true)
                                if (!ui.sheets.anyOpen()) ui.update()
                            }
                            Lifecycle.Event.ON_STOP -> {
                                phone.visible = false
                                phone.sync.shown(false)
                            }
                            else -> {}
                        }
                    }
                owner.lifecycle.addObserver(watch)
                onDispose { owner.lifecycle.removeObserver(watch) }
            }
            LaunchedEffect(Unit) {
                while (true) {
                    delay(60_000)
                    if (!ui.sheets.anyOpen() && phone.visible) ui.update()
                }
            }
            Box(Modifier.fillMaxSize()) {
                HomeScreen()
                SheetHost(ui.sheets, ui.sheets.base) { SheetView(it) }
                SheetHost(ui.sheets, ui.sheets.over) { SheetView(it) }
                ToastHost(ui.toasts, ui.sheets.anyOpen()) { ui.haptic("select") }
                ViewerHost(ui.viewer)
                CameraHost(ui.camera)
            }
        }
    }
}

class MainActivity : ComponentActivity() {
    private val main get() = (application as App).main

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        val app = application as App
        app.platform.activity = this
        app.start()
        val since = System.currentTimeMillis()
        // until the home page is drawn, or LATEST at most, so the app cannot hang on it
        splash.setKeepOnScreenCondition { !main.ui.splashGone && System.currentTimeMillis() - since < LATEST }
        splash.setOnExitAnimationListener { view ->
            main.ui.arrive = true
            view.view
                .animate()
                .alpha(0f)
                .setDuration(
                    de.schmeckts.app.ui.Motion.FADE
                        .toLong(),
                ).withEndAction { view.remove() }
                .start()
        }
        super.onCreate(savedInstanceState)
        setContent {
            val dark =
                isDark(
                    main.phone.prefs
                        .also { main.ui.tick }
                        .theme,
                ) ||
                    main.ui.dark > 0
            LaunchedEffect(dark) { bars(dark) }
            LaunchedEffect(Unit) {
                delay(32) // two frames after the first drawing
                main.ui.splashGone = true
            }
            AppScreen(main)
            // with nothing left to close, back sends the app to the background as other apps do
            if (Build.VERSION.SDK_INT < 31) BackHandler { moveTaskToBack(true) }
        }
        if (savedInstanceState == null) handle(intent)
    }

    private fun bars(dark: Boolean) {
        val style =
            if (dark) {
                SystemBarStyle.dark(
                    android.graphics.Color.TRANSPARENT,
                )
            } else {
                SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
            }
        enableEdgeToEdge(style, style)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    override fun onDestroy() {
        val app = application as App
        if (app.platform.activity === this) app.platform.activity = null
        super.onDestroy()
    }

    // a link, a file from another app (VIEW, or SEND as the share menu hands it), or a tap on a reminder
    private fun handle(intent: Intent?) {
        if (intent == null) return
        val m = main
        Notes.fromIntent(this, intent)?.let { (action, serving, pet) ->
            m.phone.scope.launch { m.logic.reminders.onAction(action, serving, pet) }
            return
        }
        val uri: Uri? =
            when (intent.action) {
                Intent.ACTION_SEND ->
                    @Suppress("DEPRECATION")
                    (intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)
                Intent.ACTION_VIEW -> intent.data
                else -> null
            }
        if (uri != null) m.phone.scope.launch { m.actions.openLink(uri.toString()) }
    }
}
