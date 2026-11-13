package de.schmeckts.app.logic

import de.schmeckts.app.ui.Ui
import kotlinx.coroutines.launch

/** The logic modules of one phone's screen, each with what it keeps between calls; they reach each other through it. */
class Logic(
    val ui: Ui,
) {
    val products = Products(this)
    val feeding = Feeding(this)
    val rating = Rating(this)
    val editing = Editing(this)
    val pets = Pets(this)
    val observations = Observations(this)
    val reminders = Reminders(this)
    val scan = Scan(this)
    val exchange = Exchange(this)
    val data = Data(this)
}

/** what every module reaches: the screen, the phone, its data */
abstract class Part(
    protected val l: Logic,
) {
    protected val ui get() = l.ui
    protected val ph get() = l.ui.phone
    protected val db get() = ph.store.db
    protected val prefs get() = ph.store.prefs
    protected val d get() = ph.derive
    protected val sheet get() = ui.sheet

    protected fun save() = ph.store.save()

    protected fun savePrefs() = ph.store.savePrefs()

    protected fun haptic(level: String = "select") = ui.haptic(level)

    protected fun toast(
        text: String,
        undo: (() -> Unit)? = null,
        icon: String = "",
        tone: String = "",
        html: Boolean = false,
    ) = ui.toast(text, undo, icon, tone, html)

    protected fun update() = ui.update()

    protected fun renderSheet() = ui.renderSheet()

    /** runs once the top layer has closed, as closeSheet().then() did */
    protected fun afterClose(then: () -> Unit) {
        val gone = ui.sheets.closeSheet()
        ph.scope.launch {
            gone.await()
            then()
        }
    }

    protected fun afterCloseAll(then: suspend () -> Unit) {
        val gone = ui.sheets.closeAll()
        ph.scope.launch {
            gone.await()
            then()
        }
    }

    protected fun launch(block: suspend () -> Unit) = ph.scope.launch { block() }
}
