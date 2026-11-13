package de.schmeckts.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import de.schmeckts.app.Phone
import de.schmeckts.app.imageOf

/** What one phone's screen holds: the layers, the toast, the photo viewer and the camera. The views draw from it, and
 their buttons name an action, which the control layer runs (Actions.kt). */
class Ui(
    val phone: Phone,
) {
    /** light bar icons while an always-dark screen is open */
    var dark by mutableIntStateOf(0)
        private set

    private fun darkBars(on: Boolean) {
        dark = maxOf(0, dark + if (on) 1 else -1)
    }

    val toasts = Toasts(phone.scope)
    val viewer = Viewer(::imageOf, ::darkBars)
    val camera = Camera(::darkBars) { viewer.dropViewer() }
    val sheets =
        Sheets(onOpen = {
            viewer.dropViewer() // opened from a link or notification over the photo viewer
            toasts.hidePlain()
        })

    /** bumped by update(): the home page draws anew */
    var tick by mutableIntStateOf(0)
        private set

    fun update() {
        tick++
    }

    val sheet get() = sheets.sheet

    fun renderSheet() = sheets.renderSheet()

    fun toast(
        text: String,
        undo: (() -> Unit)? = null,
        icon: String = "",
        tone: String = "",
        html: Boolean = false,
    ) = toasts.toast(text, undo, icon, tone, html)

    fun haptic(level: String = "select") = phone.platform.haptic(level)

    /** the control layer: runs the action of that name with the button's data */
    var actions: (String, Map<String, String>) -> Unit = { _, _ -> }

    /** a field typed in: field (the sheet's), note, setting, remind, search; its key and value */
    var input: (String, String, String) -> Unit = { _, _, _ -> }

    /** Enter in a field, by its id */
    var enter: (String) -> Unit = {}

    fun act(
        name: String,
        vararg data: Pair<String, String?>,
    ) = actions(name, data.mapNotNull { (k, v) -> v?.let { k to it } }.toMap())

    /** a button's click; a closing layer takes no taps (SheetHost), so a quick second tap does not feed twice */
    fun on(
        name: String,
        vararg data: Pair<String, String?>,
    ): () -> Unit = { act(name, *data) }

    /** the splash is gone and the cards rise in turn */
    var arrive by mutableStateOf(false)
    var splashGone by mutableStateOf(false)
}

val LocalUi = staticCompositionLocalOf<Ui> { error("no Ui") }

/** A field of a sheet: what is typed goes to the sheet's state under key, as data-field did; a value set from
 elsewhere (a chip, a suggestion) shows at once with the cursor at its end. */
class Typed(
    initial: String,
) {
    var value by mutableStateOf(TextFieldValue(initial, TextRange(initial.length)))
}

@Composable
fun rememberTyped(
    owner: Any,
    key: String,
    stored: String,
): Typed {
    val t = remember(owner, key) { Typed(stored) }
    if (t.value.text != stored) t.value = TextFieldValue(stored, TextRange(stored.length))
    return t
}
