package de.schmeckts.app.views

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import de.schmeckts.app.PROVIDERS
import de.schmeckts.app.Phone
import de.schmeckts.app.REMIND
import de.schmeckts.app.REMIND_MAX_H
import de.schmeckts.app.Time
import de.schmeckts.app.andList
import de.schmeckts.app.esc
import de.schmeckts.app.feedSlots
import de.schmeckts.app.quarterStr
import de.schmeckts.app.ui.Banner
import de.schmeckts.app.ui.Btn
import de.schmeckts.app.ui.BtnKind
import de.schmeckts.app.ui.Chevron
import de.schmeckts.app.ui.Divider
import de.schmeckts.app.ui.FieldKind
import de.schmeckts.app.ui.Group
import de.schmeckts.app.ui.Hint
import de.schmeckts.app.ui.Icon
import de.schmeckts.app.ui.Ink
import de.schmeckts.app.ui.Label
import de.schmeckts.app.ui.Lead
import de.schmeckts.app.ui.Link
import de.schmeckts.app.ui.ListRow
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.M
import de.schmeckts.app.ui.SheetBody
import de.schmeckts.app.ui.Sign
import de.schmeckts.app.ui.Size
import de.schmeckts.app.ui.Space
import de.schmeckts.app.ui.Switch
import de.schmeckts.app.ui.T
import de.schmeckts.app.ui.TMain
import de.schmeckts.app.ui.Type
import de.schmeckts.app.ui.Wait
import de.schmeckts.app.ui.colors
import de.schmeckts.app.ui.watch

private val THEMES = listOf(Opt("system", "System"), Opt("light", "Hell"), Opt("dark", "Dunkel"))

// no 0 step, the switch turns it off. The own option opens a field, so it has an action of its own
private const val OWN_REMIND = "own"
private val REMIND_OPTIONS =
    REMIND.filter { it > 0 }.map { Opt(it.toString(), "${it / 60} Std.") } + Opt(OWN_REMIND, "Eigene", action = "remind-own")
private const val DENIED = "Benachrichtigungen sind nicht erlaubt"
private const val LOOKUP = "Sucht nur mit der Nummer des Barcodes"
private const val SERVER_PHOTO = "Der Server erkennt Marke und Sorte, sonst das Handy selbst."
private const val SERVER_AFTER = "Wenn die eigene KI nichts erkennt"

private fun houseSub(n: SyncInfo) = if (n.detail.isNotEmpty() && !n.title.endsWith("…")) "${n.title}, ${lower(n.detail)}" else n.title

private fun Phone.feedSub(denied: Boolean): String {
    if (denied) return DENIED
    val slots = feedSlots(db, Time.now())
    return if (slots.isNotEmpty()) {
        "Meist gegen ${andList(
            slots.map { quarterStr(it.at) },
        )} Uhr"
    } else {
        "Lernt die üblichen Zeiten aus dem Verlauf"
    }
}

private fun Phone.aiSub() =
    when {
        !ai.on -> "Direkt vom Handy, mit eigenem Schlüssel"
        !ai.ready() -> "Schlüssel fehlt noch"
        else -> esc("${ai.name} von ${PROVIDERS[ai.provider]?.name}")
    }

/** a group of settings rows: the lead column for icons, dividers from the text on */
@Composable
fun SetGroup(
    label: String,
    top: androidx.compose.ui.unit.Dp = Space.s5,
    content: @Composable ColumnScope.() -> Unit,
) {
    watch()
    Label(label, top = top)
    Group(content = content)
}

private val TEXT_AT = Size.picS + Space.s3

@Composable
private fun SetRow(
    onClick: (() -> Unit)?,
    first: Boolean = false,
    role: Role? = null,
    state: String? = null,
    content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit,
) {
    watch()
    if (!first) Divider(TEXT_AT)
    ListRow(
        Modifier.semantics {
            if (role != null) this.role = role
            if (state != null) stateDescription = state
        },
        onClick = onClick,
        minHeight = Size.controlL,
        content = content,
    )
}

@Composable
private fun PageRow(
    page: String,
    icon: String,
    title: String,
    sub: String = "",
    subColor: Color = colors.muted,
    first: Boolean = false,
) {
    watch()
    val ui = LocalUi.current
    SetRow(ui.on("settings-page", "v" to page), first) {
        Lead(icon)
        TMain(title, sub, subColor, subLines = 2)
        Chevron()
    }
}

@Composable
private fun SwitchRow(
    action: String,
    icon: String,
    title: String,
    sub: String,
    on: Boolean,
    first: Boolean = false,
) {
    watch()
    val ui = LocalUi.current
    SetRow(ui.on(action), first, Role.Switch, if (on) "an" else "aus") {
        Lead(icon)
        TMain(title, sub, subLines = 2)
        Switch(on)
    }
}

@Composable
private fun DoRow(
    action: String,
    icon: String,
    title: String,
    sub: String = "",
    enabled: Boolean = true,
    first: Boolean = false,
) {
    watch()
    val ui = LocalUi.current
    SetRow(if (enabled) ui.on(action) else null, first) {
        Lead(icon, color = colors.accentInk)
        Ink(colors.accentInk) { TMain(title, sub, subLines = 2) }
    }
}

/** under a row, in line with its text */
@Composable
private fun Under(content: @Composable ColumnScope.() -> Unit) {
    watch()
    Column(Modifier.padding(start = TEXT_AT, bottom = Space.s3), content = content)
}

@Composable
private fun Overview() {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val s = ui.sheet!!
    val house = ph.sync.isConnected()
    val notice = ph.syncInfo()
    val own = ph.prefs.remind > 0 && (s.bool("ownRemind") || ph.prefs.remind !in REMIND)
    if (ph.store.loadError != null) Banner("Die gespeicherten Daten konnten nicht gelesen werden. Bitte die App neu starten.")
    // the label's margin and the title's collapse, as in CSS
    SetGroup("Katzen", top = Space.s5 - Space.s2) {
        ph.db.pets.forEachIndexed { i, p ->
            SetRow(ui.on("edit-pet", "id" to p.id), i == 0) {
                Avatar(p, Av.S)
                TMain(esc(p.str("name")))
                Chevron()
            }
        }
        DoRow("add-pet", "plus", "Katze hinzufügen", first = ph.db.pets.isEmpty())
    }
    SetGroup("Darstellung") {
        SetRow(null, true) {
            Lead("auto")
            TMain("Farbschema")
        }
        Under { Segmented("theme", THEMES, ph.prefs.theme) }
        SwitchRow("calendar", "calendar", "Katzenkalender", "Ein Kalenderblatt am Tag auf der Startseite", ph.prefs.calendar)
    }
    SetGroup("Erinnerungen") {
        // after a refused permission the switch flips back by itself, so the line says why
        SwitchRow(
            "remind-on",
            "clock",
            "Ans Bewerten erinnern",
            if (s["denied"] == "remind") DENIED else "Nach dem Füttern, auf diesem Handy",
            ph.prefs.remind > 0,
            first = true,
        )
        if (ph.prefs.remind > 0) {
            Under {
                Segmented("remind", REMIND_OPTIONS, if (own) OWN_REMIND else ph.prefs.remind.toString())
                if (own) {
                    Label("Stunden, 1 bis $REMIND_MAX_H", top = Space.s3)
                    SheetField(
                        "f-remind",
                        "remind",
                        keyboard = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                        initial = (ph.prefs.remind / 60.0).let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() },
                        channel = "remind",
                    )
                }
            }
        }
        SwitchRow("feed-remind", "feed", "Ans Füttern erinnern", ph.feedSub(s["denied"] == "feed"), ph.prefs.feedRemind)
    }
    SetGroup("Teilen") {
        SetRow(null, true) {
            Lead("person")
            T("Dein Name", Type.bodyStrong, Modifier.weight(1f))
            SheetField(
                "f-me",
                "name",
                kind = FieldKind.IN_ROW,
                placeholder = "z. B. Anna",
                keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                label = "Dein Name",
                initial = ph.prefs.name,
                channel = "setting",
            )
        }
        PageRow("house", "house", "Haushalt", esc(houseSub(notice)), if (notice.tone == "bad") colors.bad else colors.muted)
        PageRow("exchange", "phone", "Austausch von Hand", "Änderungen als Datei weitergeben")
    }
    SetGroup("Scannen") {
        SwitchRow("lookup", "search", "Sortensuche im Internet", LOOKUP, ph.prefs.lookup, first = true)
        SwitchRow("ai-photo", "sparkle", "Fotos mit eigener KI erkennen", ph.aiSub(), ph.ai.on)
        if (ph.ai.on) Under { AiBox() }
        if (house) {
            SwitchRow(
                "server-photo",
                "camera",
                "Fotos über den Server erkennen",
                if (ph.ai.ready()) SERVER_AFTER else SERVER_PHOTO,
                ph.prefs.serverPhoto,
            )
        }
    }
    SetGroup("Daten") {
        PageRow("backup", "download", "Backup", "Sichern und wieder einlesen", first = true)
        if (!house) DoRow("demo", "sparkle", "Beispieldaten laden")
        PageRow("privacy", "shield", "Datenschutz")
    }
    UpdateGroup()
    Column(Modifier.padding(top = Space.s6)) {
        if (house) {
            ArmBtn("wipe", "Alle Daten im Haushalt löschen", "Nochmal tippen: für alle im Haushalt löschen")
        } else {
            ArmBtn("wipe", "Alle Daten löschen", "Nochmal tippen: wirklich alles löschen")
        }
    }
    Foot(house)
}

@Composable
private fun Foot(house: Boolean) {
    watch()
    val ph = LocalUi.current.phone
    Column(Modifier.fillMaxWidth().padding(top = Space.s6), horizontalAlignment = Alignment.CenterHorizontally) {
        val muted = colors.muted
        T(
            if (house) "Alle Daten liegen auf diesem Handy und werden im Haushalt abgeglichen." else "Alle Daten bleiben auf diesem Handy.",
            Type.small,
            color = muted,
            align = TextAlign.Center,
        )
        if (ph.platform.version.isNotEmpty()) T("Version ${ph.platform.version}", Type.small, color = muted, align = TextAlign.Center)
        if (ph.db.pets.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                T(
                    "Mit Liebe für ${ph.derive.petNames(ph.db.pets.map { it.id })}",
                    Type.small,
                    Modifier.weight(1f, fill = false),
                    muted,
                    align = TextAlign.Center,
                )
                Icon("heart", Modifier.padding(start = Space.s1), Size.iconS, muted)
            }
        }
    }
}

// pasted, the key is checked at once; once it works only its end is shown
@Composable
private fun AiBox() {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val s = ui.sheet!!
    val ai = ph.ai
    if (ai.ready()) {
        FlowRow(
            Modifier.padding(top = Space.s3),
            verticalArrangement = Arrangement.Center,
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            M(
                "Fotos gehen mit deinem Schlüssel …${esc(ai.key.takeLast(4))} direkt an ${PROVIDERS[ai.provider]?.name}.",
                Type.small,
                Modifier.padding(end = Space.s2),
                colors.muted,
            )
            Link("Löschen", onClick = ui.on("ai-forget"))
        }
        if (ai.trouble.isNotEmpty()) T("Zuletzt: ${ai.trouble}", Type.small, Modifier.padding(top = Space.s3), colors.bad)
        return
    }
    Label("KI-Schlüssel", top = Space.s3)
    SheetField(
        "f-ai",
        "aiKey",
        placeholder = "Einfügen",
        keyboard =
            KeyboardOptions(
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
            ),
        enabled = !s.bool("aiChecking"),
        password = true,
        label = "KI-Schlüssel",
    )
    when {
        s.bool("aiChecking") ->
            Note {
                Wait()
                T("Schlüssel wird geprüft …", Type.small, color = colors.muted)
            }
        s.str("aiError").isNotEmpty() -> Note { T(s.str("aiError"), Type.small, color = colors.bad) }
        else ->
            Note {
                T(
                    "Von Anthropic, OpenAI oder Google. Er bleibt auf diesem Handy und geht nur an seinen Anbieter.",
                    Type.small,
                    color = colors.muted,
                )
            }
    }
}

@Composable
fun Note(content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    watch()
    Row(
        Modifier.padding(top = Space.s3),
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

private val ASKED =
    mapOf(
        "asking" to "Sucht …",
        "current" to "Du hast die neueste Version",
        "failed" to "GitHub ist gerade nicht erreichbar",
    )

@Composable
private fun UpdateGroup() {
    watch()
    val ph = LocalUi.current.phone
    val r = ph.release
    if (!r.canUpdate()) return
    val loading = r.state == "loading"
    SetGroup("Updates") {
        if (r.state == "found" || loading) {
            DoRow(
                "update-install",
                "download",
                "Version ${esc(r.version)} installieren",
                if (loading) "Lädt … ${Math.round(r.share * 100)} %" else "Kommt direkt von GitHub",
                enabled = !loading,
                first = true,
            )
        } else {
            DoRow("update-check", "refresh", "Nach Updates suchen", ASKED[r.state] ?: "", enabled = r.state != "asking", first = true)
        }
        SwitchRow("update-auto", "clock", "Beim Start suchen", "Fragt dafür kurz bei GitHub nach", ph.prefs.updates)
    }
}

@Composable
private fun BackupPage() {
    watch()
    val ui = LocalUi.current
    Hint("Eine Datei mit allem, was die App gespeichert hat. Ein Import ersetzt die Daten auf diesem Handy.")
    Column(verticalArrangement = Arrangement.spacedBy(Space.s2)) {
        Btn("Exportieren", BtnKind.SOFT, icon = "download", onClick = ui.on("export"))
        Btn("Importieren", BtnKind.SOFT, icon = "upload", onClick = ui.on("import"))
    }
}

@Composable
private fun ExchangePage() {
    watch()
    val ui = LocalUi.current
    val ex = ui.sheet?.get("exchange") as? Exchanged
    Hint("Änderungen als Datei an ein anderes Handy geben und von dort empfangen. Die Datei enthält nur Einträge, keine Einstellungen.")
    Column(verticalArrangement = Arrangement.spacedBy(Space.s2)) {
        Btn("Teilen", BtnKind.SOFT, icon = "phone", onClick = ui.on("share-changes"))
        Btn("Empfangen", BtnKind.SOFT, icon = "upload", onClick = ui.on("receive"))
    }
    if (ex != null) {
        Note { T(ex.text, Type.small, color = colors.muted) }
        if (ex.peer !=
            null
        ) {
            Btn("Antwort senden", BtnKind.SOFT, Modifier.padding(top = Space.s2), icon = "phone", onClick = ui.on("send-answer"))
        }
    }
}

/** what the last exchange file brought, and the phone it came from, to answer */
class Exchanged(
    val text: String,
    val peer: String?,
)

// the last paragraph is the attribution the ODbL requires, see NOTICE
private val PRIVACY =
    listOf(
        "Katzen, Sorten und Mahlzeiten speichert die App auf deinem Handy, nicht in der Galerie und nicht in Googles Cloud-Sicherung.",
        "Nutzt du die App nur auf diesem Handy, bleiben die Daten dort. Ausnahme ist der Barcode-Scanner: Er kommt von Google und meldet allgemeine Nutzungsdaten wie das Gerätemodell, aber keine Bilder.",
        "Beim Start fragt die App bei GitHub, ob es eine neue Version gibt. Dabei geht nur diese Frage raus, keine Einträge. Abschalten lässt sich das unter „Updates“.",
        "Den Text auf einer Packung liest das Handy selbst, ohne Internet. Die Sortensuche unter „Scannen“ ist anfangs aus. Eingeschaltet fragt sie bei unbekannten Barcodes zwei freie Datenbanken im Internet, und zwar nur mit der Nummer.",
        "Mit einem eigenen KI-Schlüssel unter „Scannen“ schickt das Handy Packungsfotos direkt an dessen Anbieter, also Anthropic, OpenAI oder Google. Der Schlüssel bleibt auf diesem Handy.",
        "Bist du mit einem Haushalt verbunden, gleicht die App mit eurem Server ab. Dort liegen auch die Packungsfotos, damit jedes Handy sie groß zeigen kann. Zur Erkennung schickt der Server sie an Anthropic, das lässt sich unter „Scannen“ abschalten.",
        "Ein Backup und das Löschen aller Daten findest du unter „Daten“. „Austausch von Hand“ unter „Teilen“ gibt deine Einträge als Datei an ein anderes Handy weiter, ohne Server.",
        "Beim Lesen einer Packung berichtigt das Handy falsch gelesene Wörter mit einer Wortliste. Sie enthält Informationen aus Open Pet Food Facts, die hier unter der Open Database License (ODbL) verfügbar gemacht werden.",
    )

@Composable
private fun PrivacyPage() {
    watch()
    for (t in PRIVACY) T(t, Type.body, Modifier.padding(bottom = Space.s3), colors.ink)
}

// only a sync started by hand shows progress; background syncs stay invisible
@Composable
private fun ServerSection() {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val s = ui.sheet!!
    val notice = ph.syncInfo()
    val codeRow: @Composable () -> Unit = {
        Row(
            Modifier.padding(top = Space.s2),
            horizontalArrangement = Arrangement.spacedBy(Space.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SheetField(
                "f-code",
                "code",
                Modifier.weight(1f),
                placeholder = "Haushaltscode",
                kind = FieldKind.CODE,
                keyboard =
                    KeyboardOptions(
                        capitalization = KeyboardCapitalization.Characters,
                        autoCorrectEnabled = false,
                        imeAction = ImeAction.Go,
                    ),
                label = "Haushaltscode",
                maxLength = 12,
            )
            Btn(
                if (s.bool("connecting")) "Verbinde …" else "Verbinden",
                BtnKind.PRIMARY,
                fill = false,
                busy = s.bool("connecting"),
                onClick = ui.on("connect"),
            )
        }
        if (s.str("connectError").isNotEmpty()) Note { T(s.str("connectError"), Type.small, color = colors.bad) }
    }
    val addrField: @Composable (Boolean) -> Unit = { afterHint ->
        Label("Adresse des Servers", top = if (afterHint) Space.s5 - Space.s3 else Space.s5)
        SheetField(
            "f-server",
            "server",
            placeholder = "http://192.168.… oder https://…",
            keyboard =
                KeyboardOptions(
                    capitalization = KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Next,
                ),
            initial = ph.prefs.server,
        )
    }
    if (!ph.sync.isConnected()) {
        if (s.bool("connectForm")) {
            Hint(
                "Wenn ihr verbunden seid, sehen alle im Haushalt dieselben Katzen, Mahlzeiten und Bewertungen. Adresse und Code findest du auf dem Mini-PC unter „Schmeckt’s-Server einrichten“.",
            )
            addrField(true)
            codeRow()
        } else {
            Hint("Alle Daten bleiben auf diesem Handy. Mit einem Haushalt verbunden, sehen alle dieselben Katzen und Einträge.")
            Btn("Mit Haushalt verbinden", BtnKind.SOFT, icon = "house", onClick = ui.on("connect-form"))
        }
        return
    }
    val needCode = ph.sync.status.kind == "auth"
    Group {
        ListRow {
            // only the icon carries the colour; the soft fills barely stand out here
            Sign(
                if (notice.tone == "bad") "alert" else "house",
                when (notice.tone) {
                    "ok" ->
                        de.schmeckts.app.ui
                            .Tone(colors.accentInk, colors.surface2)
                    "bad" ->
                        de.schmeckts.app.ui
                            .Tone(colors.bad, colors.surface2)
                    else -> null
                },
            )
            TMain(esc(notice.title), esc(notice.detail))
        }
    }
    if (!needCode) {
        Addr(ph.prefs.server, false)
    } else {
        codeRow()
        if (s.bool("editServer")) addrField(false) else Addr(ph.prefs.server, true)
    }
    Column(Modifier.padding(top = Space.s2), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
        if (!needCode) {
            if (s["syncing"] == "shown") {
                Btn("Abgleich läuft …", BtnKind.SOFT, busy = true) {}
            } else if (!(ph.sync.status.state == "ok" && ph.store.queue.isEmpty())) {
                Btn("Abgleichen", BtnKind.SOFT, icon = "refresh", onClick = ui.on("sync-now"))
            }
        }
        ArmBtn("disconnect", "Verbindung trennen", "Nochmal tippen: trennen, die Daten bleiben hier", icon = "unplug", kind = BtnKind.PLAIN)
    }
}

@Composable
private fun Addr(
    server: String,
    edit: Boolean,
) {
    watch()
    val ui = LocalUi.current
    FlowRow(
        Modifier.padding(top = Space.s3),
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        T("Server $server", Type.small, color = colors.muted)
        if (edit) Link("Ändern", onClick = ui.on("edit-server"))
    }
}

private val PAGES = mapOf("house" to "Haushalt", "exchange" to "Austausch von Hand", "backup" to "Backup", "privacy" to "Datenschutz")

@Composable
fun SettingsView() {
    watch()
    val ui = LocalUi.current
    val s = ui.sheet ?: return
    val title = PAGES[s.page]
    SheetBody(title ?: "Einstellungen", ui.sheets, onBack = ui.on("settings-back")) {
        when (s.page) {
            "house" -> ServerSection()
            "exchange" -> ExchangePage()
            "backup" -> BackupPage()
            "privacy" -> PrivacyPage()
            else -> Overview()
        }
    }
}
