package de.schmeckts.app

import android.app.Application
import kotlinx.coroutines.Dispatchers

/** The app's one phone: its files, its screen and its logic, made on first use; started once the screen opens. */
class App : Application() {
    val platform by lazy { AndroidPlatform(this) }
    val main by lazy { Main(Phone(filesDir, Dispatchers.Main.immediate, Dispatchers.IO, platform)) }
    private var started = false

    fun start() {
        if (started) return
        started = true
        main.start()
    }
}
