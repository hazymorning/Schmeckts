package de.schmeckts.app

import de.schmeckts.app.logic.Logic
import de.schmeckts.app.ui.Ui
import kotlinx.coroutines.launch

/** One phone's app: its screen, the logic and the actions, wired as main.js wired them, and its start. */
class Main(
    val phone: Phone,
) {
    val ui = Ui(phone)
    val logic = Logic(ui)
    val actions = Actions(ui, logic)

    init {
        val store = phone.store
        ui.actions = actions::act
        ui.input = actions::input
        ui.enter = actions::enter
        // changes from other devices
        store.onChanged = {
            logic.feeding.settleNamed(false)
            logic.products.followPhotos()
            ui.update()
            if (ui.sheet != null) ui.renderSheet()
            logic.reminders.syncReminders()
        }
        store.onSaved = {
            phone.sync.syncSoon(400)
            logic.reminders.syncReminders()
            logic.products.followPhotos()
        }
        phone.sync.onReachable = {
            phone.scope.launch { logic.feeding.retryWaiting() }
            phone.scope.launch { logic.products.sharePhotos() }
        }
        phone.disk.failed = { ui.toast("Der Speicher ist voll. Bitte ein Backup exportieren.") }
        phone.release.onChanged = {
            ui.update()
            if (ui.sheet?.kind == "settings" && ui.sheet?.page == null) ui.renderSheet()
        }
    }

    fun start() {
        try {
            phone.sync.start()
            logic.feeding.settleNamed(false) // named on another phone meanwhile
            logic.products.followPhotos()
            logic.reminders.syncReminders()
            phone.platform.clearExports()
            logic.products.tidyPhotos()
            if (phone.prefs.updates) phone.scope.launch { phone.release.check() }
        } catch (e: Exception) {
            report("start", e)
        }
    }
}
