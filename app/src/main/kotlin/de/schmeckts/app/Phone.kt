package de.schmeckts.app

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import java.io.File

/** Everything one phone holds, from its files up. The app has one; a test may hold several side by side. */
class Phone(
    val dir: File,
    val main: CoroutineDispatcher,
    val io: CoroutineDispatcher,
    val http: Http = OkHttp(),
    now: () -> Long = { Time.now() },
) {
    val scope = CoroutineScope(SupervisorJob() + main)
    var visible = true

    val disk = Disk(dir, scope, io, ::report)
    val clock = Clock(now)
    val store = Store(disk, clock, scope, ::report).apply { load() }
    val api = Api(store, http)
    val sync = Sync(store, api, http, scope, ::report) { visible }
    val ai = Ai(disk, http) { store.db.products }.apply { load() }

    init {
        store.onSaved = { sync.syncSoon(400) }
    }

    val db get() = store.db
    val prefs get() = store.prefs

    fun close() = scope.cancel()
}
