package de.schmeckts.app.views

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import de.schmeckts.app.OBSERVATIONS
import de.schmeckts.app.RATINGS
import de.schmeckts.app.READ_PATIENCE
import de.schmeckts.app.Rec
import de.schmeckts.app.SEXES
import de.schmeckts.app.Sort
import de.schmeckts.app.TEXTURES
import de.schmeckts.app.TYPES
import de.schmeckts.app.Time
import de.schmeckts.app.VERDICTS
import de.schmeckts.app.addDays
import de.schmeckts.app.andList
import de.schmeckts.app.asString
import de.schmeckts.app.at
import de.schmeckts.app.cap
import de.schmeckts.app.diary
import de.schmeckts.app.esc
import de.schmeckts.app.hasLine
import de.schmeckts.app.imageOf
import de.schmeckts.app.mealsBefore
import de.schmeckts.app.norm
import de.schmeckts.app.observationOf
import de.schmeckts.app.observedAfter
import de.schmeckts.app.pets
import de.schmeckts.app.pname
import de.schmeckts.app.rateTone
import de.schmeckts.app.ratingsIn
import de.schmeckts.app.scaleOf
import de.schmeckts.app.servedAt
import de.schmeckts.app.shopGroups
import de.schmeckts.app.typeOf
import de.schmeckts.app.ui.BoxBtn
import de.schmeckts.app.ui.Btn
import de.schmeckts.app.ui.BtnKind
import de.schmeckts.app.ui.Card
import de.schmeckts.app.ui.CardBtn
import de.schmeckts.app.ui.CardTitle
import de.schmeckts.app.ui.Chevron
import de.schmeckts.app.ui.Chip
import de.schmeckts.app.ui.Chips
import de.schmeckts.app.ui.Crop
import de.schmeckts.app.ui.CropStage
import de.schmeckts.app.ui.Divider
import de.schmeckts.app.ui.FadeEdge
import de.schmeckts.app.ui.FieldKind
import de.schmeckts.app.ui.Gap
import de.schmeckts.app.ui.Group
import de.schmeckts.app.ui.Hint
import de.schmeckts.app.ui.Icon
import de.schmeckts.app.ui.IconBtn
import de.schmeckts.app.ui.Ink
import de.schmeckts.app.ui.Label
import de.schmeckts.app.ui.Lead
import de.schmeckts.app.ui.Link
import de.schmeckts.app.ui.ListRow
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.M
import de.schmeckts.app.ui.Motion
import de.schmeckts.app.ui.PageList
import de.schmeckts.app.ui.Radius
import de.schmeckts.app.ui.SheetBody
import de.schmeckts.app.ui.SheetState
import de.schmeckts.app.ui.Sign
import de.schmeckts.app.ui.Size
import de.schmeckts.app.ui.Skel
import de.schmeckts.app.ui.Space
import de.schmeckts.app.ui.T
import de.schmeckts.app.ui.TMain
import de.schmeckts.app.ui.Type
import de.schmeckts.app.ui.Wait
import de.schmeckts.app.ui.colors
import de.schmeckts.app.ui.photoSource
import de.schmeckts.app.ui.press
import de.schmeckts.app.ui.reduceMotion
import de.schmeckts.app.ui.shimmer
import de.schmeckts.app.ui.shimmerPhase
import de.schmeckts.app.ui.tone
import de.schmeckts.app.ui.watch
import de.schmeckts.app.weekStart
import de.schmeckts.app.whenStr

// Sheet and page contents; the settings page is in Settings.kt

/** the view of a sheet or page by its kind, as the old VIEWS */
@Composable
fun SheetView(state: SheetState) {
    watch()
    val ui = LocalUi.current
    // what the views draw from: the data and the redraws asked for
    ui.sheets.tick
    ui.phone.store.revision
    when (state.kind) {
        "serving" -> ServingView(state)
        "observation" -> ObservationView(state)
        "feed" -> FeedView(state)
        "new" -> NameView(state)
        "product" -> ProductView(state)
        "pet" -> PetView(state)
        "settings" -> if (state.page == "pet") PetView(state) else SettingsView()
        "report" -> ReportView(state)
        // insights and shopping list are levels of the evaluation, so back returns there
        "evaluation" ->
            when (state.page) {
                "insights" -> InsightsPage()
                "shop" -> ShopView()
                else -> EvaluationPage()
            }
    }
}

@Composable
private fun Gone(
    title: String,
    text: String,
) {
    watch()
    val ui = LocalUi.current
    SheetBody(title, ui.sheets) { Hint(text, Modifier.padding(top = Space.hair)) }
}

// the variety on top of a sheet; with the full photo on this phone, the thumbnail opens it
@Composable
private fun ProdRow(
    s: Rec?,
    p: Rec?,
    action: String,
    label: String,
    first: Boolean = true,
    inner: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit,
) {
    watch()
    val ui = LocalUi.current
    if (!first) Divider(Size.picS + Space.s3)
    if (ui.phone.photos.hasPhoto(s, p)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = Size.controlL).padding(vertical = Space.s3),
            horizontalArrangement = Arrangement.spacedBy(Space.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PhotoThumb(s, p, Th.XL)
            Row(
                Modifier.weight(1f).press(ui.on(action), Motion.PRESS_WIDE, label = label).heightIn(min = Size.tap),
                horizontalArrangement = Arrangement.spacedBy(Space.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                inner()
                Icon("pencil", size = Size.iconS, color = colors.faint)
            }
        }
    } else {
        ListRow(onClick = ui.on(action), label = label, minHeight = Size.controlL) {
            Thumb(s, p, Th.XL)
            inner()
            Icon("pencil", size = Size.iconS, color = colors.faint)
        }
    }
}

private fun photoLabel(
    ph: de.schmeckts.app.Phone,
    p: Rec,
) = if (ph.photos.hasPhoto(null, p) || !p.str("thumb").isNullOrEmpty()) "Foto ändern" else "Foto hinzufügen"

@Composable
private fun PhotoRow(p: Rec) {
    watch()
    val ui = LocalUi.current
    Divider(Size.picS + Space.s3)
    ListRow(onClick = ui.on("product-photo", "id" to p.id), minHeight = Size.controlL) {
        Lead("camera", color = colors.accentInk)
        Ink(colors.accentInk) { TMain(photoLabel(ui.phone, p)) }
    }
}

@Composable
private fun PetChips(
    action: String,
    on: Set<String>,
) {
    watch()
    val ui = LocalUi.current
    Chips {
        for (pet in ui.phone.db.pets) {
            Chip(
                pet.str("name") ?: "",
                pressed = pet.id in on,
                lead = { Avatar(pet, Av.XS, Modifier.offset(x = -Space.s2)) },
                onClick = ui.on(action, "id" to pet.id),
            )
        }
    }
}

// the row opens the system's date and time pickers and shows the value as we say it
@Composable
private fun TimeRow(
    title: String,
    by: String?,
    t: Long,
    field: String,
    id: String,
) {
    watch()
    val ui = LocalUi.current
    ListRow(onClick = ui.on("pick", "field" to field, "id" to id), label = title, minHeight = Size.controlL) {
        Lead("clock")
        // the title keeps its width; a long value such as a date wraps instead
        Column {
            T(title, Type.bodyStrong, maxLines = 2)
            if (!by.isNullOrEmpty()) T("von $by", Type.small, Modifier.padding(top = Space.hair), colors.muted)
        }
        T(cap(whenStr(t)), Type.body, Modifier.weight(1f), colors.muted, align = androidx.compose.ui.text.style.TextAlign.End)
        Chevron()
    }
}

/** a labelled group as the sheets have them: rows, or pad for chips and sliders */
@Composable
private fun LGroup(
    label: String,
    pad: Boolean = true,
    first: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    watch()
    if (label.isNotEmpty()) {
        Label(label)
    } else if (!first) {
        Gap(Space.s3)
    }
    Group(pad = pad, content = content)
}

@Composable
private fun ServingView(state: SheetState) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val s = d.getServing(state.id) ?: return Gone("Eintrag", "Diesen Eintrag gibt es nicht mehr.")
    if (state.step == "name") return NameView(state)
    val p = d.getProduct(s.str("productId"))
    val ids = s.pets.keys.filter { d.getPet(it) != null }
    val multi = ph.db.pets.size > 1
    SheetBody("Wie war’s?", ui.sheets) {
        Group {
            ProdRow(s, p, "edit-name", "Sorte ändern") { NameBlock(s, p, inSheet = true) }
            if (p != null) PhotoRow(p)
        }
        for (pid in ids) LGroup(if (multi) esc(d.getPet(pid)?.str("name")) else "") { RateSliderFor(s, pid) }
        if (multi) LGroup("Wer wurde gefüttert?") { PetChips("toggle-serving-pet", s.pets.keys) }
        Gap(Space.s3)
        Group {
            TimeRow("Gefüttert", s.str("by"), s.servedAt, "time", s.id)
            Divider(Size.picS + Space.s3)
            Row(
                Modifier.fillMaxWidth().heightIn(min = Size.controlL).padding(vertical = Space.s3),
                horizontalArrangement = Arrangement.spacedBy(Space.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Lead("note")
                SheetField(
                    "f-note",
                    s.id,
                    Modifier.weight(1f),
                    placeholder = "Notiz, z. B. neue Packung",
                    kind = FieldKind.BARE,
                    label = "Notiz",
                    initial = s.str("note") ?: "",
                    channel = "note",
                )
            }
        }
        Column(Modifier.padding(top = Space.s6)) { DeleteMealBtn(s.id) }
    }
}

@Composable
private fun ObservationView(state: SheetState) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val o = d.getObservation(state.id) ?: return Gone("Beobachtung", "Diesen Eintrag gibt es nicht mehr.")
    val kind = observationOf(o.str("kind"))
    val ids = o.pets.keys.filter { d.getPet(it) != null }
    val names = mealsBefore(ph.db, o).mapNotNull { d.getProduct(it.str("productId")) }.map { esc(pname(it)) }.distinct()
    SheetBody(esc(kind.label), ui.sheets) {
        Group(pad = true) {
            Chips {
                for ((k, x) in OBSERVATIONS) {
                    val t = colors.tone(k)
                    // chosen: a ring in the tone, quieter than the accent fill
                    Chip(
                        x.label,
                        pressed = o.str("kind") == k,
                        icon = x.icon,
                        iconColor = t?.c,
                        toned = t,
                        onClick = ui.on("set-observation-kind", "v" to k),
                    )
                }
            }
            if (kind.about == "meal") {
                Hint(
                    if (names.isNotEmpty()) {
                        "${cap(
                            kind.window,
                        )} davor gab es <b>${andList(names)}</b>."
                    } else {
                        "${cap(kind.window)} davor ist keine Mahlzeit eingetragen."
                    },
                    Modifier.padding(top = Space.s2),
                    bottom = 0.dp,
                )
            }
        }
        if (ph.db.pets.size > 1) {
            LGroup("Bemerkt bei") {
                PetChips("toggle-observation-pet", o.pets.keys)
                if (ids.size > 1) Hint("Ob es ${esc(ph.whoObserved(ids))} war, ist offen.", Modifier.padding(top = Space.s2), bottom = 0.dp)
            }
        }
        Gap(Space.s3)
        Group { TimeRow("Notiert", o.str("by"), o.at, "obs-time", o.id) }
        Column(Modifier.padding(top = Space.s6)) {
            Btn("Eintrag löschen", BtnKind.QUIET, icon = "trash", onClick = ui.on("delete-observation", "id" to o.id))
        }
    }
}

// as tall as the label and field it stands in for
@Composable
private fun FieldSkeleton() {
    watch()
    val phase = shimmerPhase()
    // as tall as a line of the label
    val line = with(androidx.compose.ui.platform.LocalDensity.current) { Type.smallStrong.let { it.fontSize * it.lineHeight.value }.toDp() }
    Skel(0.28f, Modifier.padding(top = Space.s5, bottom = Space.s2).testTag("skel-label"), height = line - Space.s1 * 2)
    Box(
        Modifier
            .testTag("skel-field")
            .fillMaxWidth()
            .height(Size.control)
            .clip(RoundedCornerShape(Radius.m))
            .shimmer(colors.surface2, colors.line, phase),
    )
}

/** a sheen runs over the packaging while it is read */
private fun Modifier.sheen(
    on: Boolean,
    color: androidx.compose.ui.graphics.Color,
    phase: () -> Float,
) = if (!on) {
    this
} else {
    drawWithContent {
        drawContent()
        val w = size.width * 2.2f
        val x = (1.2f - phase() * 2.2f) * size.width
        drawRect(
            Brush.linearGradient(
                0.3f to androidx.compose.ui.graphics.Color.Transparent,
                0.5f to color,
                0.7f to androidx.compose.ui.graphics.Color.Transparent,
                start =
                    androidx.compose.ui.geometry
                        .Offset(x, 0f),
                end =
                    androidx.compose.ui.geometry
                        .Offset(x + w, w * 0.36f),
            ),
        )
    }
}

@Composable
private fun NameView(s: SheetState) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val serving = if (s.kind == "serving") d.getServing(s.id) else null
    val product = if (s.kind == "product") d.getProduct(s.id) else d.getProduct(serving?.str("productId"))
    val title =
        when {
            s.kind == "new" -> "Neue Sorte"
            s.kind == "product" -> "Sorte umbenennen"
            product != null -> "Sorte ändern"
            else -> "Sorte benennen"
        }
    val photo =
        product?.str("thumb")?.ifEmpty { null } ?: serving?.str("photo")?.ifEmpty { null } ?: serving?.str("thumb")?.ifEmpty { null }
    val large = ph.photos.hasPhoto(serving, product)
    val status = serving?.str("status")
    val reading = status == "reading"
    val began = serving?.let { ph.recognize.readingSince[it.id] }
    // skeleton fields while reading, until READ_PATIENCE runs out
    val patient = reading && Time.now() - (began ?: 0L) < READ_PATIENCE
    if (patient) {
        LaunchedEffect(began) {
            kotlinx.coroutines.delay(READ_PATIENCE - (Time.now() - (began ?: 0L)))
            ui.renderSheet()
        }
    }
    SheetBody(title, ui.sheets) {
        if (photo != null) {
            val img = imageOf(photo)
            val sheenPhase = shimmerPhase()
            val pic =
                Modifier
                    .testTag("name-photo")
                    .fillMaxWidth()
                    .height(150.dp)
                    .clip(RoundedCornerShape(Radius.l))
                    .sheen(reading && !reduceMotion, colors.sheen, sheenPhase)
            if (img != null) {
                if (large) {
                    val key = photoKey(serving, product)
                    Box(
                        Modifier
                            .press(
                                ui.on("view-photo", "s" to (serving?.id ?: ""), "p" to (product?.id ?: "")),
                                Motion.PRESS,
                                label = "Foto vergrößern",
                            ).alpha(if (ui.photoBusy == key) de.schmeckts.app.ui.Alpha.BUSY else 1f)
                            .photoSource(ui.viewer, key),
                    ) { Image(img, "Foto der Packung", pic, contentScale = ContentScale.Crop) }
                } else {
                    Image(img, "Foto der Packung", pic, contentScale = ContentScale.Crop)
                }
            }
        }
        val retry = { label: String ->
            if (!serving?.str("photo").isNullOrEmpty() && ph.recognize.photoByAI()) label else null
        }
        val error = serving?.str("error") ?: ""
        when {
            reading ->
                Note {
                    Wait(Modifier.testTag("wait"))
                    T("Packung wird ${if (patient) "" else "noch "}gelesen …", Type.small, color = colors.muted)
                }
            status == "recognizing" ->
                Note {
                    Wait()
                    T("Sorte wird erkannt …", Type.small, color = colors.muted)
                }
            status == "waiting" ->
                RetryNote(
                    error.ifEmpty { "Wird erkannt, sobald der Server erreichbar ist." },
                    retry("Jetzt versuchen"),
                    false,
                )
            status == "failed" -> RetryNote(error.ifEmpty { "Nicht erkannt." }, retry("Nochmal versuchen"), true)
            status == "noserver" && error.isNotEmpty() -> RetryNote(error, retry("Nochmal versuchen"), false)
        }
        if (patient) {
            // same height as the fields, so nothing jumps
            FieldSkeleton()
            FieldSkeleton()
            return@SheetBody
        }
        val guess = serving?.obj("guess")
        val read = listOfNotNull(guess?.get("brand").asString?.ifEmpty { null }, guess?.get("variety").asString?.ifEmpty { null })
        // read right, it takes one tap right under the reading; the fields below are for putting it right
        if (read.isNotEmpty()) {
            M("Gelesen: <b>${esc(read.joinToString(", "))}</b>. Passt das?", Type.body, Modifier.padding(top = Space.s3), colors.ink)
            Btn("Passt so", BtnKind.PRIMARY, Modifier.padding(top = Space.s6), icon = "check", onClick = ui.on("save-name"))
        } else if (status == "noserver" && product == null) {
            Hint("Auf dem Foto war nichts zu lesen. Tipp Marke und Sorte ein oder mach ein neues Foto.", Modifier.padding(top = Space.s3))
        }
        if (serving != null && product == null && photo != null) {
            Link("Neues Foto", Modifier.padding(top = Space.s2), icon = "camera", onClick = ui.on("rephoto"))
        } else if (product != null) {
            Link(
                photoLabel(ph, product),
                Modifier.padding(top = Space.s2),
                icon = "camera",
                onClick =
                    ui.on(
                        "product-photo",
                        "id" to product.id,
                    ),
            )
        }
        val hits = suggestions(s, serving)
        Suggestions(s, hits)
        // with nothing above it, the label's margin and the head's collapse, as in CSS
        val bare = photo == null && status.isNullOrEmpty() && read.isEmpty() && product == null && hits.second.isEmpty()
        Label("Marke", top = if (bare) Space.s5 - Space.s3 else Space.s5)
        SheetField(
            "f-brand",
            "brand",
            placeholder = "z. B. Sheba",
            keyboard =
                KeyboardOptions(
                    capitalization = KeyboardCapitalization.Words,
                    autoCorrectEnabled = false,
                    imeAction = ImeAction.Next,
                ),
            label = "Marke",
        )
        FieldError(s)
        val lines = serving?.let { ph.recognize.memLines[it.id] }
        if (!lines?.brands.isNullOrEmpty()) PackChips("brand", lines!!.brands, s.str("brand"), Modifier.padding(top = Space.s3))
        Label("Sorte")
        SheetField(
            "f-variety",
            "variety",
            placeholder = "z. B. Lachs in Soße",
            keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            label = "Sorte",
        )
        if (!lines?.lines.isNullOrEmpty()) {
            Label("Auf der Packung gelesen", top = Space.s4)
            PackChips("variety", lines!!.lines, s.str("variety"))
        }
        Label("Art")
        Chips {
            for (t in TYPES) Chip(t, pressed = s.str("type") == t, onClick = ui.on("set-type", "v" to t))
        }
        TextureChips(s.str("type"), s.str("texture"), labelled = true)
        Column(Modifier.padding(top = Space.s6)) {
            if ((s["armed"] as? String)?.startsWith("merge:") == true) {
                Btn("Nochmal tippen: zusammenführen", BtnKind.ARMED, icon = "check", onClick = ui.on("save-name"))
            } else {
                Btn(
                    if (s.kind == "new") "Füttern" else "Speichern",
                    if (read.isNotEmpty()) BtnKind.SOFT else BtnKind.PRIMARY,
                    icon = "check",
                    onClick = ui.on("save-name"),
                )
            }
        }
        // removing sits well below the main button, so neither is taken for the other
        if (serving != null && product == null) Column(Modifier.padding(top = Space.s7)) { DeleteMealBtn(serving.id) }
    }
}

@Composable
private fun RetryNote(
    text: String,
    retry: String?,
    warn: Boolean,
) {
    watch()
    val ui = LocalUi.current
    androidx.compose.foundation.layout.FlowRow(
        Modifier.padding(top = Space.s3),
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        T(text, Type.small, color = if (warn) colors.bad else colors.muted)
        if (retry != null) Link(retry, onClick = ui.on("retry"))
    }
}

/** what a form still needs, under its field until that is filled in */
@Composable
private fun FieldError(s: SheetState) {
    watch()
    val e = s.str("error")
    if (e.isNotEmpty()) T(e, Type.small, Modifier.padding(top = Space.s3).semantics { contentDescription = e }, colors.bad)
}

// x: a variety, or the sheet itself while naming
@Composable
private fun TextureChips(
    type: String?,
    texture: String?,
    labelled: Boolean = false,
    note: String = "",
) {
    watch()
    val ui = LocalUi.current
    val t = TEXTURES[de.schmeckts.app.typeOfName(type)] ?: return
    val chips: @Composable () -> Unit = {
        Chips { for (x in t.items) Chip(x.label, pressed = texture == x.key, onClick = ui.on("set-texture", "v" to x.key)) }
        if (note.isNotEmpty()) Note { T(note, Type.small, color = colors.muted) }
    }
    if (labelled) {
        Label(t.title)
        chips()
    } else {
        LGroup(t.title) { chips() }
    }
}

// pack-line chips take no focus, so the field keeps its keyboard
@Composable
private fun PackChips(
    field: String,
    list: List<String>,
    value: String,
    modifier: Modifier = Modifier,
) {
    watch()
    val ui = LocalUi.current
    Chips(modifier) {
        for (l in list) {
            Chip(
                l,
                Modifier.semantics { contentDescription = "${if (field == "brand") "Marke" else "Sorte"}: $l" },
                pressed = hasLine(value, l),
                onClick = ui.on("pack-line", "field" to field, "v" to l),
            )
        }
    }
}

// varieties the typed words fit, or for an unknown meal the usual ones; the title to show them under
@Composable
private fun suggestions(
    s: SheetState,
    serving: Rec?,
): Pair<String, List<Rec>> {
    watch()
    val ph = LocalUi.current.phone
    val skip = if (s.kind == "product") s.id else serving?.str("productId")
    val q = norm("${s.str("brand")} ${s.str("variety")}")
    return if (q.length >= 2) {
        val words = q.split(" ")
        "Meinst du?" to
            ph.db.products
                .filter { p ->
                    p.id != skip &&
                        words.all { norm("${p.str("brand") ?: ""} ${p.str("variety") ?: ""}").contains(it) }
                }.take(4)
    } else if (serving != null && serving.str("productId").isNullOrEmpty()) {
        "Schon mal gehabt?" to ph.derive.quickProducts(4).map { it.product }
    } else {
        "" to emptyList()
    }
}

@Composable
private fun Suggestions(
    s: SheetState,
    found: Pair<String, List<Rec>>,
) {
    watch()
    val ui = LocalUi.current
    val (title, hits) = found
    if (hits.isEmpty()) return
    // renaming a variety into another one merges the two, so that takes a second tap
    val merge = s.kind == "product"
    Column(Modifier.padding(top = Space.s3), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
        Label(title, top = Space.s4 - Space.s3)
        for (p in hits) {
            val armed = merge && s["armed"] == "merge:" + p.id
            BoxBtn(onClick = if (merge) ui.on("arm", "then" to "merge", "id" to p.id) else ui.on("use-product", "id" to p.id)) {
                Thumb(null, p, Th.M)
                TMain(
                    esc(pname(p)),
                    if (armed) "Nochmal tippen: zusammenführen" else esc(p.str("brand")),
                    if (armed) colors.bad else colors.muted,
                )
                Icon("chevron", size = Size.iconS, color = colors.faint)
            }
        }
    }
}

// few suggestions, more would only distract from the two buttons
private const val SUGGEST = 3
private const val HITS = 8

@Composable
private fun ServeRows(
    entries: List<de.schmeckts.app.Listed>,
    code: String = "",
) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val m = ph.derive.model()
    entries.forEachIndexed { i, x ->
        val p = x.product
        if (i > 0) Divider(Size.picL + Space.s3)
        val meta =
            listOf(
                if (!p.str("variety").isNullOrEmpty()) p.str("brand") ?: "" else "",
                if (x.at >
                    0
                ) {
                    whenStr(x.at)
                } else {
                    "noch nie gehabt"
                },
            ).filter { it.isNotEmpty() }.joinToString(", ")
        val past = ph.record(m.byId[p.id])
        ListRow(Modifier.testTag("serve-${p.id}"), onClick = ui.on("serve", "id" to p.id, "code" to code.ifEmpty { null })) {
            Thumb(null, p)
            TMain(esc(pname(p)), esc(meta)) {
                if (past.isNotEmpty()) T(past, Type.small, Modifier.padding(top = Space.hair), colors.muted)
            }
            Strip(ratingsIn(m, listOf(p.id)))
        }
    }
}

@Composable
private fun FeedView(s: SheetState) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val pick = if (s.step == "pick") d.productsByCode(s.str("code")) else emptyList()
    if (pick.isNotEmpty()) {
        SheetBody("Welche Sorte?", ui.sheets) {
            Hint("Dieser Barcode gehört zu mehreren Sorten.")
            Group { ServeRows(d.withLast(pick), s.str("code")) }
        }
        return
    }
    val prods = d.quickProducts()
    SheetBody("Was gibt’s heute?", ui.sheets) {
        Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
            Cta("barcode", "Barcode", "scannen", true, Modifier.weight(1f), ui.on("scan"))
            Cta("camera", "Foto", "aufnehmen", false, Modifier.weight(1f), ui.on("photo"))
        }
        if (s.str("busy").isNotEmpty()) {
            Note {
                Wait()
                T(s.str("busy"), Type.small, color = colors.muted)
            }
        }
        // margins sit on these always-present boxes; on one hidden while typing, the field would jump
        Column(Modifier.padding(top = Space.s5, bottom = Space.s3)) {
            if (prods.size > SUGGEST) {
                SheetField(
                    "f-search",
                    "search",
                    placeholder = "Marke oder Sorte suchen",
                    label = "Marke oder Sorte suchen",
                    keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Search),
                    channel = "search",
                    initial = s.str("search"),
                    search = true,
                )
            }
            Column(Modifier.padding(top = if (prods.size > SUGGEST) Space.s3 else 0.dp)) {
                val text = s.str("search").trim()
                val words = norm(text).split(" ").filter { it.isNotEmpty() }
                if (words.isEmpty()) {
                    if (prods.isNotEmpty()) {
                        Label("Schon mal gehabt", top = 0.dp)
                        Group { ServeRows(prods.take(SUGGEST)) }
                    }
                } else {
                    val hits =
                        d
                            .quickProducts(Int.MAX_VALUE, true)
                            .filter { x ->
                                words.all { norm("${x.product.str("brand") ?: ""} ${x.product.str("variety") ?: ""}").contains(it) }
                            }.take(HITS)
                    if (hits.isNotEmpty()) {
                        Group { ServeRows(hits) }
                    } else {
                        Hint("Keine Sorte passt zu „$text“.", Modifier.padding(top = Space.hair))
                        Btn("„$text“ als neue Sorte eintippen", BtnKind.PLAIN, onClick = ui.on("new-product", "v" to text))
                    }
                }
            }
        }
        Btn("Eintippen", BtnKind.PLAIN, onClick = ui.on("new-product"))
    }
}

@Composable
private fun Cta(
    icon: String,
    title: String,
    sub: String,
    primary: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    watch()
    BoxBtn(modifier, primary, onClick) {
        Icon(icon, size = Size.iconL, stroke = Size.STROKE_L)
        Column(Modifier.weight(1f)) {
            T(title, Type.bodyStrong)
            T(sub, Type.small)
        }
    }
}

private val KAUFEN = listOf(Opt("auto", "Automatisch"), Opt("immer", "Nachkaufen"), Opt("nicht", "Nicht mehr kaufen"))

// the counts and the verdict only see the last 180 days
private const val OLD = "Die letzten Bewertungen sind über ein halbes Jahr alt."

@Composable
private fun Kaufen(e: Sort) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val pets = if (ph.db.pets.size > 1) ph.db.pets.filter { e.pets.containsKey(it.id) } else emptyList()
    LGroup("Kaufen") {
        Segmented("buy", KAUFEN, e.kaufen ?: "auto")
        Column(Modifier.padding(top = Space.s3)) {
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                T(ph.verdictLabel(e.house), Type.smallStrong)
                if (pets.isEmpty()) T(if (e.house.n > 0 || e.total == 0) evidenceOf(e.house) else OLD, Type.small, color = colors.muted)
            }
            for (pet in pets) {
                val x = e.pets.getValue(pet.id)
                ListRow {
                    Avatar(pet, Av.XS)
                    TMain(esc("${pet.str("name")}: ${VERDICTS[x.verdict]}"), esc(evidenceOf(x)))
                }
            }
        }
    }
}

@Composable
private fun Counts(
    levels: List<String>,
    counts: Map<String, Int>,
) {
    watch()
    Column(Modifier.padding(top = Space.s3, bottom = Space.s1)) {
        Row(Modifier.fillMaxWidth()) {
            for (r in levels) {
                val t = colors.tone(rateTone(r))
                Column(
                    Modifier.weight(1f).semantics { contentDescription = "${RATINGS.getValue(r).label}: ${counts[r] ?: 0}" },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Space.hair),
                ) {
                    Icon("r_$r", size = Size.iconL, color = t?.c ?: colors.muted, stroke = Size.STROKE_L)
                    T("${counts[r] ?: 0}", Type.heading.copy(fontFeatureSettings = "tnum"), color = colors.ink)
                }
            }
        }
        ScaleEnds(levels)
    }
}

private const val MEALS_SHOWN = 12 // the rest is on the history page

@Composable
private fun ProductView(state: SheetState) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val p = d.getProduct(state.id) ?: return Gone("Sorte", "Diese Sorte gibt es nicht mehr.")
    if (state.step == "name") return NameView(state)
    val ss = ph.db.servings.filter { it.str("productId") == p.id }
    val e = d.sortOf(p.id) ?: return
    val counts = e.house.counts
    val scale = scaleOf(p)
    val levels = scale + counts.keys.filter { it !in scale } // levels from another scale that still occur
    val codes =
        p
            .obj("codes")
            ?.keys
            ?.sorted()
            .orEmpty()
    SheetBody(esc(pname(p)), ui.sheets) {
        PackGroup(p)
        TextureChips(p.str("type"), p.str("texture"), note = if (p.str("texture") == "block") "Vor dem Füttern zerkleinern" else "")
        LGroup("Bewertungen") {
            if (e.house.n >
                0
            ) {
                Counts(levels, counts)
            } else {
                Hint(if (e.total > 0) OLD else "Noch nicht bewertet.", bottom = 0.dp)
            }
        }
        Kaufen(e)
        Noticed(p)
        if (ss.isNotEmpty()) {
            LGroup("Verlauf", pad = false) {
                ss.take(MEALS_SHOWN).forEachIndexed { i, s ->
                    if (i > 0) Divider()
                    ListRow(onClick = ui.on("open-serving", "id" to s.id)) {
                        val meta =
                            listOf(
                                d.petNames(s.pets.keys.filter { d.getPet(it) != null }),
                                s.str("note")?.let { if (it.isNotEmpty()) "„$it“" else "" } ?: "",
                            ).filter { it.isNotEmpty() }
                                .joinToString(", ")
                        TMain(esc(cap(whenStr(s.servedAt))), esc(meta))
                        ResultBadges(s)
                    }
                }
            }
        }
        if (codes.isNotEmpty()) {
            LGroup("Barcodes", pad = false) {
                codes.forEachIndexed { i, c ->
                    if (i > 0) Divider()
                    ListRow {
                        Column(Modifier.weight(1f)) { T(c, Type.bodyStrong.copy(fontFeatureSettings = "tnum")) }
                        IconBtn("close", "Barcode $c entfernen", onClick = ui.on("remove-code", "code" to c))
                    }
                }
            }
        }
        Btn("Füttern", BtnKind.PRIMARY, Modifier.padding(top = Space.s6), icon = "check", onClick = ui.on("serve", "id" to p.id))
        Column(Modifier.padding(top = Space.s7)) {
            ArmBtn("delete-product", "Sorte löschen", "Nochmal tippen: Sorte und Einträge löschen", kind = BtnKind.QUIET)
        }
    }
}

// with a picture the packaging spans the card, without one the variety has the row a meal has
@Composable
private fun PackGroup(p: Rec) {
    watch()
    val ui = LocalUi.current
    val inner: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {
        TMain(esc(p.str("brand")?.ifEmpty { null } ?: p.str("variety")), typeOf(p))
    }
    if (p.str("thumb").isNullOrEmpty()) {
        Group {
            ProdRow(null, p, "rename-product", "Umbenennen", inner = inner)
            PhotoRow(p)
        }
        return
    }
    Group(Modifier.testTag("pack-card")) {
        val img = imageOf(p.str("thumb"))
        val key = photoKey(null, p)
        // the packaging across the card's full width, its edge the line above the first row
        Box(
            Modifier
                .layoutWidePack()
                .then(
                    if (ui.phone.photos.hasPhoto(null, p)) {
                        Modifier
                            .press(ui.on("view-photo", "s" to "", "p" to p.id), Motion.PRESS, label = "Foto vergrößern")
                            .photoSource(ui.viewer, key)
                    } else {
                        Modifier
                    },
                ),
        ) {
            if (img != null) {
                Image(
                    img,
                    null,
                    Modifier
                        .testTag("pack-photo")
                        .fillMaxWidth()
                        .aspectRatio(4f / 3f)
                        .clip(RoundedCornerShape(topStart = Radius.l, topEnd = Radius.l)),
                    contentScale = ContentScale.Crop,
                )
            }
        }
        ListRow(onClick = ui.on("rename-product"), label = "Umbenennen", minHeight = Size.controlL) {
            inner()
            Icon("pencil", size = Size.iconS, color = colors.faint)
        }
        PhotoRow(p)
    }
}

private fun Modifier.layoutWidePack() =
    layout { m, c ->
        val extra = Space.s4.roundToPx() * 2
        val p = m.measure(c.copy(minWidth = c.maxWidth + extra, maxWidth = c.maxWidth + extra))
        layout(c.maxWidth, (p.height - Space.s1.roundToPx()).coerceAtLeast(0)) { p.place(-Space.s4.roundToPx(), -Space.s1.roundToPx()) }
    }

// counts only; whether they stand out is for the evaluation
@Composable
private fun Noticed(p: Rec) {
    watch()
    val ph = LocalUi.current.phone
    val after = observedAfter(ph.db, ph.db.pets.map { it.id }, Time.now(), p.id)
    if (after.isEmpty()) return
    LGroup("Danach notiert", pad = false) {
        ToldList(
            after.map { x ->
                @Composable {
                    ToldRow(
                        { Sign(observationOf(x.kind).icon, colors.tone(x.kind)) },
                        "${observationOf(x.kind).label} nach <b>${x.hit} von ${x.n}</b> Mahlzeiten",
                    )
                }
            },
        )
    }
}

/** at: the day to open at, "d-YYYY-MM-DD" */
fun reportState(at: String? = null) = SheetState("report", "at" to at)

@Composable
private fun ReportView(state: SheetState) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val pet = d.model().pet
    val all = d.servingsInFilter()
    val days = dayGroups(diary(all, d.observationsInFilter()))
    val list = rememberLazyListState()
    val multiHouse = ph.db.pets.size > 1 && pet == null
    // the first day line under the bar draws the edge itself
    val stuck by remember { derivedStateOf { list.firstVisibleItemIndex >= 2 } }
    LaunchedEffect(state["at"], days.size) {
        val at = state["at"] as? String ?: return@LaunchedEffect
        state["at"] = null
        val i = days.indexOfFirst { "d-" + it.key == at }
        if (i >= 0) list.scrollToItem(2 + i * 2)
    }
    val still = reduceMotion
    LaunchedEffect(ui.jump) {
        val key = ui.jump ?: return@LaunchedEffect
        ui.jump = null
        val i = days.indexOfFirst { it.key == key }
        if (i >= 0) {
            if (still) list.scrollToItem(2 + i * 2) else list.animateScrollToItem(2 + i * 2)
        }
    }
    PageList("Verlauf" + ph.forWhom(pet), ui.on("settings-back"), list, stuck) {
        item(key = "cal") {
            Calendar(all.filter { it.servedAt >= addDays(weekStart(Time.now()), -7) }, top = 0.dp)
            if (days.isEmpty()) Hint("Noch nichts eingetragen, der Napf wartet auf seine Premiere.", Modifier.padding(top = Space.hair))
        }
        days.forEachIndexed { i, g ->
            stickyHeader(key = "d-" + g.key) {
                // the fade hangs below the stuck line and takes no room of its own
                Box {
                    Column(Modifier.testTag("d-${g.key}").background(colors.bg)) {
                        if (i > 0) {
                            Gap(Space.s1)
                            Divider()
                        }
                        DayLine(g)
                    }
                    FadeEdge(stuck && list.firstVisibleItemIndex == 2 + i * 2, Modifier.align(Alignment.BottomCenter).offset(y = Space.s5))
                }
            }
            item(key = "i-" + g.key) { DayItems(g, multiHouse) }
        }
    }
}

private const val FOLDED = 3 // rows a fold shows before the rest

@Composable
private fun ShopList(
    m: de.schmeckts.app.Model,
    list: List<Sort>,
) {
    watch()
    list.forEachIndexed { i, e ->
        if (i > 0) Divider(Size.picL + Space.s3)
        ShopRow(m, e)
    }
}

@Composable
private fun Fold(
    key: String,
    list: List<Sort>,
    m: de.schmeckts.app.Model,
) {
    watch()
    val ui = LocalUi.current
    if (list.size <= FOLDED) return ShopList(m, list)
    val open = (ui.sheet?.get("open") as? Set<*>)?.contains(key) == true
    ShopList(m, list.take(FOLDED))
    Column(Modifier.animateContentSize(if (reduceMotion) tween(0) else tween(Motion.STEP, easing = Motion.easeOut))) {
        if (open) {
            Divider(Size.picL + Space.s3)
            ShopList(m, list.drop(FOLDED))
        }
    }
    CardBtn(if (open) "Weniger" else "Alle ${list.size} zeigen", onClick = ui.on("fold", "v" to key))
}

@Composable
private fun ShopView() {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    val m = ph.derive.model()
    val g = shopGroups(m)
    val types = TYPES.map { t -> t to g.nachkaufen.filter { typeOf(it.product) == t } }.filter { it.second.isNotEmpty() }
    val unclear = g.geht + g.neu
    SheetBody(
        "Einkaufen" + ph.forWhom(m.pet),
        ui.sheets,
        onBack = ui.on("settings-back"),
        end = if (types.isNotEmpty()) ({ IconBtn("share", "Liste teilen", onClick = ui.on("share-list")) }) else null,
    ) {
        Card {
            CardTitle("Nachkaufen")
            if (types.isEmpty()) {
                Hint("Noch nichts zum Nachkaufen, erst mal probieren.", Modifier.padding(top = Space.hair))
            } else {
                for ((t, l) in types) {
                    Label(t, top = Space.s2)
                    ShopList(m, l)
                }
            }
        }
        if (g.nicht.isNotEmpty()) {
            Gap(Space.s4)
            Card {
                CardTitle("Nicht mehr kaufen")
                Fold("nicht", g.nicht, m)
            }
        }
        if (unclear.isNotEmpty()) {
            Gap(Space.s4)
            Card {
                CardTitle("Noch unklar")
                Fold("unklar", unclear, m)
            }
        }
    }
}

@Composable
private fun CropView(s: SheetState) {
    watch()
    val ui = LocalUi.current
    val img = s["cropImg"] as? ImageBitmap
    val c = s["crop"] as? Crop
    SheetBody("Foto zuschneiden", ui.sheets, onBack = ui.on("crop-cancel")) {
        if (img != null && c != null) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(Modifier.semantics { contentDescription = "Ausschnitt verschieben" }) { CropStage(img, c) }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = Space.s4, bottom = Space.s3),
            horizontalArrangement = Arrangement.spacedBy(Space.s2),
        ) {
            Btn("Abbrechen", BtnKind.SOFT, Modifier.weight(1f), onClick = ui.on("crop-cancel"))
            Btn("Übernehmen", BtnKind.PRIMARY, Modifier.weight(1f), icon = "check", onClick = ui.on("crop-apply"))
        }
    }
}

@Composable
private fun PetView(s: SheetState) {
    watch()
    val ui = LocalUi.current
    val ph = ui.phone
    if (s.step == "crop") return CropView(s)
    val editing = s.has("id")
    val title =
        if (editing) {
            "Katze bearbeiten"
        } else if (ph.db.pets.isNotEmpty()) {
            "Neue Katze"
        } else {
            "Wer wird gefüttert?"
        }
    val photo = s.str("photo")
    SheetBody(title, ui.sheets) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .padding(
                        top =
                            if (de.schmeckts.app.ui
                                    .isPage(s)
                            ) {
                                Space.s2
                            } else {
                                Space.s1
                            },
                        bottom = Space.s2,
                    ).press(ui.on("pet-photo"), label = "Foto wählen"),
            ) {
                Avatar(
                    de.schmeckts.app
                        .Rec()
                        .apply { put("photo", photo.ifEmpty { null }) },
                    Av.XXXL,
                )
                val surface = colors.surface
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .offset(y = -Space.hair)
                        .size(Size.picM)
                        .drawBehind { drawCircle(surface, size.minDimension / 2 + Size.stroke.toPx()) }
                        .clip(CircleShape)
                        .background(colors.accent),
                    contentAlignment = Alignment.Center,
                ) { Icon("camera", size = Size.iconS, color = colors.onAccent) }
            }
        }
        Box(Modifier.fillMaxWidth().padding(bottom = Space.s1), contentAlignment = Alignment.Center) {
            Link(if (photo.isNotEmpty()) "Foto ändern" else "Foto hinzufügen", onClick = ui.on("pet-photo"))
        }
        Group {
            Row(
                Modifier.fillMaxWidth().heightIn(min = Size.controlL).padding(vertical = Space.s3),
                horizontalArrangement = Arrangement.spacedBy(Space.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Lead("paw")
                T("Name", Type.bodyStrong, Modifier.weight(1f))
                SheetField(
                    "f-name",
                    "name",
                    kind = FieldKind.IN_ROW,
                    placeholder = "z. B. Minka",
                    keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done),
                    label = "Name",
                )
            }
            if (s.str("error").isNotEmpty()) {
                Column(Modifier.padding(start = Size.picS + Space.s3, bottom = Space.s3)) {
                    T(s.str("error"), Type.small, color = colors.bad)
                }
            }
        }
        LGroup("Spitznamen") {
            @Suppress("UNCHECKED_CAST")
            val nicks = s["nicknames"] as? List<String> ?: emptyList()
            if (nicks.isNotEmpty()) {
                Chips(Modifier.padding(bottom = Space.s3)) {
                    for (n in nicks) {
                        Chip(
                            n,
                            Modifier.semantics { contentDescription = "$n entfernen" },
                            end = { Icon("close", size = Size.iconS, color = colors.muted) },
                            onClick = ui.on("drop-nick", "v" to n),
                        )
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Space.s2), verticalAlignment = Alignment.CenterVertically) {
                SheetField(
                    "f-nick",
                    "nick",
                    Modifier.weight(1f),
                    placeholder = "z. B. Mausi",
                    keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done),
                    label = "Spitzname",
                    maxLength = 24,
                )
                Box(Modifier.semantics { contentDescription = "Spitzname hinzufügen" }) {
                    Btn("", BtnKind.SOFT, fill = false, icon = "plus", onClick = ui.on("add-nick"))
                }
            }
            Hint("Die App nennt deine Katze dann mal so, mal so.", Modifier.padding(top = Space.s2), bottom = 0.dp)
        }
        LGroup("Geschlecht") {
            Chips {
                for ((k, label) in SEXES.map { it.k to it.label } + ("" to "Keine Angabe")) {
                    Chip(label, pressed = s.str("sex") == k, onClick = ui.on("set-sex", "v" to k))
                }
            }
        }
        Btn(
            if (editing) "Speichern" else "Katze anlegen",
            BtnKind.PRIMARY,
            Modifier.padding(top = Space.s6),
            icon = "check",
            onClick = ui.on("save-pet"),
        )
        if (editing) {
            Column(Modifier.padding(top = Space.s7)) {
                ArmBtn("delete-pet", "Katze entfernen", "Nochmal tippen: Katze und Bewertungen löschen", kind = BtnKind.QUIET)
            }
        }
    }
}
