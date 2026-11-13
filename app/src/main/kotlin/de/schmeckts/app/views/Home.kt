package de.schmeckts.app.views

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import de.schmeckts.app.DEMO
import de.schmeckts.app.Model
import de.schmeckts.app.NEWS
import de.schmeckts.app.R
import de.schmeckts.app.RATINGS
import de.schmeckts.app.REMIND_ASKED
import de.schmeckts.app.REMIND_DEFAULT
import de.schmeckts.app.Rec
import de.schmeckts.app.Time
import de.schmeckts.app.addDays
import de.schmeckts.app.andList
import de.schmeckts.app.at
import de.schmeckts.app.cap
import de.schmeckts.app.dayKey
import de.schmeckts.app.dayStart
import de.schmeckts.app.diary
import de.schmeckts.app.esc
import de.schmeckts.app.hintKey
import de.schmeckts.app.observationOf
import de.schmeckts.app.pets
import de.schmeckts.app.pname
import de.schmeckts.app.servedAt
import de.schmeckts.app.truthy
import de.schmeckts.app.ui.Alpha
import de.schmeckts.app.ui.Banner
import de.schmeckts.app.ui.Btn
import de.schmeckts.app.ui.BtnKind
import de.schmeckts.app.ui.Card
import de.schmeckts.app.ui.CardHead
import de.schmeckts.app.ui.Divider
import de.schmeckts.app.ui.Gap
import de.schmeckts.app.ui.Icon
import de.schmeckts.app.ui.IconBtn
import de.schmeckts.app.ui.Ink
import de.schmeckts.app.ui.ListRow
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.M
import de.schmeckts.app.ui.Motion
import de.schmeckts.app.ui.Radius
import de.schmeckts.app.ui.Size
import de.schmeckts.app.ui.Sketch
import de.schmeckts.app.ui.Space
import de.schmeckts.app.ui.T
import de.schmeckts.app.ui.TMain
import de.schmeckts.app.ui.Type
import de.schmeckts.app.ui.Ui
import de.schmeckts.app.ui.colors
import de.schmeckts.app.ui.layoutWide
import de.schmeckts.app.ui.page
import de.schmeckts.app.ui.press
import de.schmeckts.app.ui.reduceMotion
import de.schmeckts.app.ui.shadowHigh
import de.schmeckts.app.ui.shadowLow
import androidx.compose.ui.geometry.Size as Area

// The home page: the header, the pets, the cards and the feeding button

@Composable
fun HomeScreen() {
    val ui = LocalUi.current
    val ph = ui.phone
    // what the page draws from: the data, the redraws asked for, the sync state
    ui.tick
    ph.store.revision
    val p = colors
    val scroll = rememberScrollState()
    val scrolled by remember { derivedStateOf { scroll.value > 0 } }
    val still = reduceMotion
    LaunchedEffect(ui.home.top) { if (ui.home.top > 0) if (still) scroll.scrollTo(0) else scroll.animateScrollTo(0) }
    Box(Modifier.fillMaxSize().background(p.bg)) {
        Mood()
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(scroll),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                Modifier
                    .page()
                    .fillMaxWidth()
                    .padding(horizontal = Space.gutter),
            ) {
                Top()
                PetsBar()
                HomeContent()
                // room for the feeding button
                Gap(Space.s5 + Size.controlL + Space.gutter * 2)
                Box(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
            }
        }
        // what scrolls under the status bar fades into the ground, and the page fades out towards the feeding button
        Edge(scrolled, top = true)
        Edge(true, top = false, Modifier.align(Alignment.BottomCenter))
        Fab(Modifier.align(Alignment.BottomEnd))
    }
}

@Composable
private fun Edge(
    on: Boolean,
    top: Boolean,
    modifier: Modifier = Modifier,
) {
    val bg = colors.bg
    val a by androidx.compose.animation.core.animateFloatAsState(
        if (on) 1f else 0f,
        if (reduceMotion) {
            androidx.compose.animation.core
                .snap()
        } else {
            tween(Motion.FADE, easing = Motion.easeOut)
        },
        label = "edge",
    )
    Column(modifier.fillMaxWidth().alpha(a)) {
        val fade =
            Brush.verticalGradient(
                listOf(bg, bg.copy(alpha = 0.78f), bg.copy(alpha = 0.42f), bg.copy(alpha = 0.14f), bg.copy(alpha = 0f)).let {
                    if (top) it else it.reversed()
                },
            )
        if (top) {
            Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(bg))
            Box(Modifier.fillMaxWidth().height(Space.s7).background(fade))
        } else {
            Box(Modifier.fillMaxWidth().height(Size.controlL + Space.s5 * 2).background(fade))
            Box(Modifier.fillMaxWidth().windowInsetsBottomHeight(WindowInsets.navigationBars).background(bg))
        }
    }
}

@Composable
private fun Top() {
    val ui = LocalUi.current
    val chip = ui.phone.syncChip()
    Row(
        Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(vertical = Space.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        T("Schmeckt’s?", Type.title, Modifier.weight(1f), colors.ink)
        Row(
            Modifier.offset(x = Space.s2),
            horizontalArrangement = Arrangement.spacedBy(Space.hair),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (chip != null) {
                Box(
                    Modifier
                        .press(ui.on("open-server"), label = "${chip.label}, Haushalt in den Einstellungen öffnen")
                        .heightIn(min = Size.tap)
                        .padding(horizontal = Space.s1),
                    contentAlignment = Alignment.Center,
                ) {
                    de.schmeckts.app.ui.Badge(
                        chip.label,
                        icon = chip.icon,
                        bg = if (chip.bad) colors.badSoft else colors.surface2,
                        fg = if (chip.bad) colors.bad else colors.muted,
                        tone =
                            if (chip.bad) {
                                de.schmeckts.app.ui.Tone(
                                    colors.bad,
                                    colors.badSoft,
                                )
                            } else {
                                de.schmeckts.app.ui
                                    .Tone(colors.muted, colors.surface2)
                            },
                    )
                }
            }
            IconBtn("sliders", "Einstellungen", onClick = ui.on("open-settings"))
        }
    }
}

@Composable
private fun PetsBar() {
    val ui = LocalUi.current
    val ph = ui.phone
    if (ph.db.pets.size < 2) return
    val active = ph.prefs.activePet
    Row(
        Modifier
            .wide()
            .horizontalScroll(rememberScrollState())
            .semantics { contentDescription = "Katze auswählen" }
            .padding(horizontal = Space.gutter, vertical = Space.s3),
        horizontalArrangement = Arrangement.spacedBy(Space.s2),
    ) {
        PetChoice("Alle", active == "all", ui.on("filter", "id" to "all")) {
            Box(Modifier.size(Size.picXl).clip(CircleShape).background(colors.surface2), contentAlignment = Alignment.Center) {
                Icon("paw", size = Size.picXl * 0.58f, color = colors.ink)
            }
        }
        for (pet in ph.db.pets) {
            PetChoice(pet.str("name") ?: "", active == pet.id, ui.on("filter", "id" to pet.id)) { Avatar(pet, Av.XL) }
        }
        PetChoice("Neu", false, ui.on("add-pet"), label = "Katze hinzufügen") {
            val faint = colors.faint
            Box(
                Modifier
                    .size(Size.picXl)
                    .drawBehind {
                        val w = Size.stroke.toPx()
                        drawCircle(
                            faint,
                            size.minDimension / 2 - w / 2,
                            style = Stroke(w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 4f))),
                        )
                    },
                contentAlignment = Alignment.Center,
            ) { Icon("plus", size = Size.picXl * 0.42f, color = colors.muted) }
        }
    }
}

private fun Modifier.wide() = layoutWide(Space.gutter)

@Composable
private fun PetChoice(
    name: String,
    on: Boolean,
    onClick: () -> Unit,
    label: String? = null,
    pic: @Composable () -> Unit,
) {
    val p = colors
    Column(
        Modifier
            .width(Size.picXl + Space.s2)
            .press(onClick, label = label)
            .semantics { if (label == null) contentDescription = name },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Space.s1),
    ) {
        Box(
            if (on) {
                Modifier.drawBehind {
                    val w = Size.stroke.toPx()
                    drawCircle(p.accent, size.minDimension / 2 + 2 * w)
                    drawCircle(p.bg, size.minDimension / 2 + w)
                }
            } else {
                Modifier
            },
        ) { pic() }
        T(name, if (on) Type.captionStrong else Type.caption, color = if (on) p.ink else p.muted, maxLines = 1)
    }
}

private fun Modifier.width(w: Dp) = this.then(Modifier.widthIn(min = w, max = w))

@Composable
private fun Fab(modifier: Modifier) {
    val ui = LocalUi.current
    if (ui.phone.db.pets
            .isEmpty()
    ) {
        return
    }
    val p = colors
    val still = reduceMotion
    val fill = remember { Animatable(0f) }
    val fills = ui.home.fills
    LaunchedEffect(fills) {
        if (fills == 0 || still) return@LaunchedEffect
        fill.snapTo(0f)
        fill.animateTo(1f, tween(Motion.LONG, easing = Motion.easeOut))
        fill.snapTo(0f)
    }
    val pop = remember { Animatable(1f) }
    LaunchedEffect(fills) {
        if (fills > 0 &&
            !still
        ) {
            pop.animateTo(
                1f,
                keyframes {
                    durationMillis = Motion.STEP
                    1.06f at (Motion.STEP * 0.35f).toInt() using Motion.spring
                },
            )
        }
    }
    val ring = rememberInfiniteTransition(label = "due")
    val r by ring.animateFloat(0f, 1f, infiniteRepeatable(tween(2 * Motion.LONG, easing = Motion.easeOut)), label = "ring")
    Box(
        modifier
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(end = Space.gutter, bottom = Space.s5)
            .graphicsLayer {
                scaleX = pop.value
                scaleY = pop.value
            },
    ) {
        // at feeding time a ring breathes out of it
        if (ui.home.due && !still) {
            Box(
                Modifier
                    .matchParentSize()
                    .graphicsLayer {
                        val f = (r / 0.7f).coerceAtMost(1f)
                        alpha = 0.7f * (1f - f)
                        scaleX = 1f + 0.18f * f
                        scaleY = 1f + 0.35f * f
                    }.border(Size.stroke, p.accent, RoundedCornerShape(Radius.m)),
            )
        }
        Row(
            Modifier
                .press(ui.on("feed"), Motion.PRESS)
                .shadowHigh(RoundedCornerShape(Radius.m))
                .clip(RoundedCornerShape(Radius.m))
                .background(p.accent)
                .heightIn(min = Size.controlL)
                .padding(horizontal = Space.s4, vertical = Space.s3),
            horizontalArrangement = Arrangement.spacedBy(Space.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Ink(p.onAccent) {
                Icon("bowl", fill = {
                    de.schmeckts.app.ui.bowlFill(fill.value).let { (h, a) ->
                        if (fill.value ==
                            0f
                        ) {
                            0f to 0f
                        } else {
                            h to a / Alpha.BUSY
                        }
                    }
                })
                T("Füttern", Type.bodyStrong)
            }
        }
    }
}

/** one question at a time, then the history and „Vorlieben“ */
@Composable
private fun ColumnScope.HomeContent() {
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val home = ui.home
    var n = 0
    if (ph.store.loadError != null) {
        Banner("Die gespeicherten Daten konnten nicht gelesen werden. Bitte starte die App neu. Bis dahin wird nichts gespeichert.")
    }
    if (ph.db.pets.isEmpty()) return Welcome()
    val open = d.pendingServings().toSet()
    val pend = ph.db.servings.filter { it in open || (home.held.containsKey(it.id) && rateRows(ui, it).isNotEmpty()) }
    val m = if (ph.db.servings.isNotEmpty()) d.model() else null
    var prev = ""
    val gap = { kind: String ->
        val g =
            when {
                prev == "" -> 0.dp
                prev == "overview" -> Space.s2
                prev == "calpad" -> Space.s3 + Space.s4
                kind == "calpad" -> Space.s4
                else -> Space.s4
            }
        prev = kind
        g
    }
    if (m != null) {
        Arrive(n++) { Overview(m, home.fresh) }
        gap("overview")
    }
    if (pend.isNotEmpty()) {
        Gap(gap("card"))
        Arrive(n++) { Pending(pend) }
    }
    if (m == null) {
        Gap(gap("card"))
        Arrive(n++) { Steps() }
        return
    }
    if (ph.prefs.calendar) {
        Gap(gap("calpad"))
        Arrive(n++) { CalPad() }
    }
    val question: (@Composable () -> Unit)? =
        when {
            updateShown(ui) -> {
                { UpdateCard() }
            }
            remindShown(ui) -> {
                { RemindCard() }
            }
            newsShown(ui) -> {
                { NewsCard() }
            }
            m.hints.isNotEmpty() -> {
                { HintCard(m) }
            }
            else -> null
        }
    if (question != null) {
        Gap(gap("card"))
        Arrive(n++) { question() }
    }
    Gap(gap("card"))
    Arrive(n++) {
        Card {
            CardHead("Verlauf", label = "Alle Einträge", onMore = ui.on("open-report"))
            History()
        }
    }
    if (hasEvaluationCard(m)) {
        Gap(gap("card"))
        Arrive(n) { EvaluationCard(m) }
    }
}

// the cards rise in turn as the splash fades
@Composable
private fun Arrive(
    i: Int,
    content: @Composable () -> Unit,
) {
    val ui = LocalUi.current
    val still = reduceMotion
    val f = remember { Animatable(if (ui.arrive && !still) 0f else 1f) }
    LaunchedEffect(ui.arrive) {
        if (ui.arrive && !still) {
            f.snapTo(0f)
            f.animateTo(1f, tween(Motion.STEP, Motion.STAGGER * minOf(i, 3), Motion.easeOut))
        } else {
            f.snapTo(1f)
        }
    }
    Box(
        Modifier.graphicsLayer {
            alpha = f.value
            translationY = (1f - f.value) * 10.dp.toPx()
        },
    ) { content() }
}

@Composable
private fun Welcome() {
    val ui = LocalUi.current
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = Space.s6, start = Space.s2, end = Space.s2, bottom = Space.s5),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .padding(bottom = Space.s6)
                .size(148.dp)
                .shadowLow(CircleShape)
                .clip(CircleShape)
                .border(Size.hairline, colors.line, CircleShape),
        ) {
            Image(painterResource(R.drawable.ic_launcher_background), null, Modifier.fillMaxSize())
            Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.fillMaxSize())
        }
        T(
            "Was schmeckt deiner Katze?",
            Type.title,
            Modifier.padding(bottom = Space.s3),
            colors.ink,
            align = TextAlign.Center,
            balance = true,
        )
        T(
            "Fotografier beim Füttern die Packung und sag später mit einem Tipp, wie viel deine Katze gefressen hat. So siehst du bald, was wirklich ankommt.",
            Type.body,
            Modifier.widthIn(max = 280.dp).padding(bottom = Space.s6),
            colors.muted,
            align = TextAlign.Center,
        )
        Column(verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            Btn("Katze anlegen", BtnKind.PRIMARY, icon = "plus", onClick = ui.on("add-pet"))
            if (!ui.phone.sync.isConnected()) Btn("Beispieldaten ansehen", BtnKind.SOFT, icon = "sparkle", onClick = ui.on("demo"))
        }
    }
}

@Composable
private fun Steps() {
    Card {
        T("So geht’s", Type.heading, Modifier.padding(bottom = Space.s1), colors.ink)
        Box(Modifier.fillMaxWidth().padding(top = Space.s3, bottom = Space.s1), contentAlignment = Alignment.Center) {
            Sketch("camera", size = Size.picXxl, color = colors.faint)
        }
        val steps =
            listOf(
                "<b>Zur Futterzeit</b> auf „Füttern“ tippen und die Packung fotografieren. Marke und Sorte liest die App von der Packung.",
                "<b>Wenn der Napf leer ist</b>, oder eben nicht, hier mit einem Tipp bewerten.",
                "<b>Nach ein paar Tagen</b> siehst du unter „Vorlieben“, was deine Katze mag und was stehen bleibt.",
            )
        steps.forEachIndexed { i, text ->
            if (i > 0) Divider(Size.picS + Space.s3)
            ListRow(top = true) {
                Box(
                    Modifier.size(Size.picS).clip(CircleShape).background(colors.accentSoft),
                    contentAlignment = Alignment.Center,
                ) { T("${i + 1}", Type.bodyStrong.copy(fontFeatureSettings = "tnum"), color = colors.accentInk) }
                M(
                    text,
                    Type.small,
                    Modifier.weight(1f).padding(bottom = Space.s3),
                    colors.muted,
                    strong = colors.ink,
                )
            }
        }
    }
}

// a pet rated here keeps its row while the meal stays in the card
private fun rateRows(
    ui: Ui,
    s: Rec,
) = ui.phone.derive
    .servingPets(s)
    .filter { pid -> rOfPet(s, pid) == null || ui.home.held[s.id]?.contains(pid) == true }

private fun rOfPet(
    s: Rec,
    pid: String,
) = de.schmeckts.app.rOf(s.pets[pid])

// every open meal keeps its scale here, however many are waiting
@Composable
private fun Pending(list: List<Rec>) {
    Card {
        T("Wie war’s?", Type.heading, Modifier.padding(bottom = Space.s1), colors.ink)
        list.forEachIndexed { i, s ->
            Leaving(s.id) {
                Column {
                    if (i > 0) Divider(Size.picL + Space.s3)
                    PendItem(s)
                }
            }
        }
    }
}

// a meal rated in full leaves its card with a short movement
@Composable
private fun Leaving(
    id: String,
    content: @Composable () -> Unit,
) {
    val ui = LocalUi.current
    val gone = ui.home.leaving[id]
    val state = remember(id) { MutableTransitionState(true) }
    if (gone != null) state.targetState = false
    LaunchedEffect(state.isIdle, state.currentState) {
        if (!state.currentState && state.isIdle) {
            ui.home.leaving
                .remove(id)
                ?.invoke()
        }
    }
    if (reduceMotion && gone != null) {
        LaunchedEffect(id) {
            ui.home.leaving
                .remove(id)
                ?.invoke()
        }
    }
    AnimatedVisibility(
        state,
        exit =
            fadeOut(tween(Motion.STEP, easing = Motion.easeIn)) +
                slideOutVertically(tween(Motion.STEP, easing = Motion.easeIn)) { -it / 20 } +
                shrinkVertically(tween(Motion.STEP, easing = Motion.easeIn)),
    ) { content() }
}

@Composable
private fun PendItem(s: Rec) {
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val p = d.getProduct(s.str("productId"))
    val ids = rateRows(ui, s)
    val multi = ph.db.pets.size > 1
    Column(Modifier.padding(vertical = Space.s3)) {
        if (ph.photos.hasPhoto(s, p)) {
            Row(
                Modifier.padding(bottom = Space.s4),
                horizontalArrangement = Arrangement.spacedBy(Space.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PhotoThumb(s, p)
                Row(
                    Modifier
                        .weight(1f)
                        .press(ui.on("open-serving", "id" to s.id), Motion.PRESS_WIDE)
                        .heightIn(min = Size.tap),
                    verticalAlignment = Alignment.CenterVertically,
                ) { NameBlock(s, p) }
            }
        } else {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(bottom = Space.s4)
                    .press(ui.on("open-serving", "id" to s.id), Motion.PRESS_WIDE)
                    .heightIn(min = Size.tap),
                horizontalArrangement = Arrangement.spacedBy(Space.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Thumb(s, p)
                NameBlock(s, p)
            }
        }
        ids.forEachIndexed { i, pid ->
            Column(Modifier.padding(top = if (i > 0) Space.s4 else 0.dp)) {
                if (multi) {
                    Row(
                        Modifier.padding(bottom = Space.s2),
                        horizontalArrangement = Arrangement.spacedBy(Space.s2),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar(d.getPet(pid), Av.XS)
                        T(d.getPet(pid)?.str("name") ?: "", Type.smallStrong, color = colors.muted)
                    }
                }
                RateSliderFor(s, pid)
            }
        }
        if (p == null) DeleteMealBtn(s.id)
    }
}

/** a card asking or telling one thing, its buttons in a row */
@Composable
private fun AskCard(
    title: String,
    body: @Composable ColumnScope.() -> Unit,
    buttons: @Composable () -> Unit,
) {
    Card {
        T(title, Type.heading, Modifier.padding(bottom = Space.s1), colors.ink, balance = true)
        body()
        androidx.compose.foundation.layout.FlowRow(
            Modifier.fillMaxWidth().padding(top = Space.s4, bottom = Space.s3),
            horizontalArrangement = Arrangement.spacedBy(Space.s2),
            verticalArrangement = Arrangement.spacedBy(Space.s2),
            maxItemsInEachRow = 2,
        ) { buttons() }
    }
}

@Composable
private fun Say(html: String) = M(html, Type.body, Modifier.padding(top = Space.hair), colors.ink)

@Composable
private fun Why(html: String) = M(html, Type.small, Modifier.padding(top = Space.hair), colors.muted)

@Composable
private fun RowBtn(
    label: String,
    kind: BtnKind,
    enabled: Boolean = true,
    onClick: () -> Unit,
) = Btn(label, kind, Modifier.widthIn(min = 0.dp), enabled = enabled, onClick = onClick)

private val HINT_TITLES =
    mapOf("appetit" to "Appetit", "stop" to "Nicht mehr kaufen?", "sosse" to "Frisst meist nur die Soße", "liebling" to "Nachkaufen?")

@Composable
private fun HintCard(m: Model) {
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val h = m.hints[0]
    val e = h.id?.let { m.byId[it] }
    val pet = h.pet?.let { d.getPet(it) }
    val hide: @Composable () -> Unit = { RowBtn("Ausblenden", BtnKind.SOFT, onClick = ui.on("hide-hint", "v" to hintKey(h))) }
    if (h.kind == "appetit") {
        AskCard(HINT_TITLES.getValue(h.kind), {
            Say("${esc(d.calledNames(listOf(pet?.id ?: ""), "hint"))} frisst seit ein paar Tagen schlechter als sonst.")
            Why(
                esc(
                    "Zuletzt ${times(h.good, h.n)} gut gefressen, in den 30 Tagen davor ${times(h.goodBefore, h.before)}." +
                        (if (h.seen.isNotEmpty()) " Dazu notiert: ${andList(h.seen.map { "„${observationOf(it).label}“" })}." else ""),
                ),
            )
        }) { hide() }
        return
    }
    if (e == null) return
    // the variety with its packaging, as in the cards around it
    val p = e.product
    val x = if (h.kind == "sosse") e.pets[h.pet] else null
    val why = if (x != null) "${times(x.counts["sosse"] ?: 0, x.n)} ${RATINGS.getValue("sosse").said}" else lower(ph.whyOf(e))
    val sub =
        listOf(
            if (!p.str("variety").isNullOrEmpty()) p.str("brand") ?: "" else "",
            if (pet != null && ph.db.pets.size > 1) "${pet.str("name")}: $why" else why,
        ).filter { it.isNotEmpty() }.joinToString(", ")
    AskCard(HINT_TITLES.getValue(h.kind), {
        ListRow(onClick = ui.on("open-product", "id" to e.id)) {
            Thumb(null, p)
            TMain(esc(pname(p)), esc(cap(sub)))
        }
    }) {
        when (h.kind) {
            "stop" -> RowBtn("Nicht mehr kaufen", BtnKind.PRIMARY, onClick = ui.on("hint-buy", "id" to e.id, "v" to "nicht"))
            "liebling" -> RowBtn("Nachkaufen", BtnKind.PRIMARY, onClick = ui.on("hint-buy", "id" to e.id, "v" to "immer"))
        }
        hide()
    }
}

private fun hasDemo(ui: Ui) =
    ui.phone.db.pets
        .any { it.id.startsWith(DEMO) }

// asked once after the first meal: with the reminder on, a meal is rated right in the notification
private fun remindShown(ui: Ui) = ui.phone.prefs.remind == 0 && REMIND_ASKED !in ui.phone.prefs.hiddenHints && !hasDemo(ui)

@Composable
private fun RemindCard() {
    val ui = LocalUi.current
    AskCard("Ans Bewerten erinnern?", {
        Say("${REMIND_DEFAULT / 60} Stunden nach dem Füttern fragt die App, wie es geschmeckt hat.")
        Why("Bewerten geht dann gleich in der Benachrichtigung.")
    }) {
        RowBtn("Ja, erinnern", BtnKind.PRIMARY, onClick = ui.on("remind-yes"))
        RowBtn("Nein danke", BtnKind.SOFT, onClick = ui.on("hide-hint", "v" to REMIND_ASKED))
    }
}

// a newer version found at start; „Später“ hides it until the next start
private fun updateShown(ui: Ui) = ui.phone.release.let { !it.later && (it.state == "found" || it.state == "loading") }

@Composable
private fun UpdateCard() {
    val ui = LocalUi.current
    val r = ui.phone.release
    val loading = r.state == "loading"
    AskCard("Neue Version", {
        Say("Version ${esc(r.version)} ist da.")
        Why("Das Update kommt direkt von GitHub, deine Einträge bleiben, wo sie sind.")
    }) {
        RowBtn(
            if (loading) "Lädt … ${Math.round(r.share * 100)} %" else "Aktualisieren",
            BtnKind.PRIMARY,
            !loading,
            ui.on("update-install"),
        )
        RowBtn("Später", BtnKind.SOFT, onClick = ui.on("update-later"))
    }
}

// the newest news for this household, never beside sample data
private fun newsShown(ui: Ui): Boolean {
    val n = NEWS.firstOrNull() ?: return false
    return "neu:${n.v}" !in ui.phone.prefs.hiddenHints && !hasDemo(ui)
}

@Composable
private fun NewsCard() {
    val ui = LocalUi.current
    val ph = ui.phone
    val n = NEWS[0]
    val off = n.off?.let { (setting, _) -> !ph.prefs.toJson()[setting].truthy } == true
    AskCard(n.title, {
        Say(n.say)
        Why(if (off) n.off!!.second else n.why)
    }) {
        val go = if (off) "settings" to "Einstellungen öffnen" else n.go
        if (go != null) {
            // with several pets the editor is reached through the settings
            val (where, label) = go
            val click =
                when {
                    where == "pet" && ph.db.pets.size == 1 -> ui.on("open-pet", "id" to ph.db.pets[0].id)
                    where == "evaluation" -> ui.on("open-evaluation")
                    else -> ui.on("open-settings")
                }
            RowBtn(label, BtnKind.PRIMARY, onClick = click)
        }
        RowBtn("Ausblenden", BtnKind.SOFT, onClick = ui.on("hide-hint", "v" to "neu:${n.v}"))
    }
}

// Lists are newest first, so the loops stop at the calendar's first day and old data costs nothing
@Composable
private fun History() {
    val ui = LocalUi.current
    val ph = ui.phone
    val d = ph.derive
    val now = Time.now()
    val since = addDays(dayStart(now), -6) // the calendar's first day, always before yesterday
    val today = dayKey(now)
    val yesterday = dayKey(addDays(now, -1))
    val recent = mutableListOf<Rec>()
    val days = mapOf(today to mutableListOf<Rec>(), yesterday to mutableListOf())
    val seen = mapOf(today to mutableListOf<Rec>(), yesterday to mutableListOf())
    for (s in ph.db.servings) {
        if (s.servedAt < since) break
        if (d.servingPets(s).isEmpty()) continue
        recent.add(s)
        days[dayKey(s.servedAt)]?.add(s)
    }
    for (o in ph.db.observations) {
        if (o.at < since) break
        if (d.observedPets(o).isNotEmpty()) seen[dayKey(o.at)]?.add(o)
    }
    val day = if (days.getValue(today).isNotEmpty() || seen.getValue(today).isNotEmpty()) today else yesterday
    val shown = diary(days.getValue(day), seen.getValue(day))
    val multiHouse = ph.db.pets.size > 1 && ph.prefs.activePet == "all"
    Calendar(recent, week = true)
    if (shown.isNotEmpty()) {
        for (g in dayGroups(shown)) {
            DayLine(g)
            DayItems(g, multiHouse, plain = true)
        }
    } else if (recent.isNotEmpty() || ph.db.servings.any { d.servingPets(it).isNotEmpty() }) {
        de.schmeckts.app.ui
            .Hint("Heute noch nicht gefüttert, der Napf langweilt sich.", Modifier.padding(top = Space.hair))
    } else {
        de.schmeckts.app.ui.Empty(
            "Noch nichts eingetragen, der Napf wartet auf seine Premiere.",
            modifier = Modifier.padding(top = Space.hair),
        )
    }
}

// == The cat calendar: a sheet a day. On a new day the last one seen still hangs over today's until it is torn off. ==

private const val TORN =
    "M0 0H300V7.0L292.9 6.9L287.3 9.8L283.6 9.2L279.5 8.3L273.8 6.9L268.8 6.3L265.6 5.7L261 6.2L255.7 7.9L249.9 10.1L245.9 " +
        "7.8L240.7 6.1L236.8 7.5L231.1 12.3L226.4 6L220.8 8.8L215.4 6.3L211.9 5.8L207.5 8.4L204 6.6L200.2 6L194.7 5.7L191.2 " +
        "11.5L187.9 9.3L184.1 11.3L179.3 5.9L175.1 7.8L169.8 13L164.9 7.3L159.9 8.3L155.7 12L151.8 7.2L148 9.2L144.4 8.3L140.3 " +
        "6.8L134.9 7.9L130.2 9.5L124.8 9.4L121.2 12.7L117.7 6.1L114.5 7.5L110.5 7.9L105.7 12.6L100.7 6.9L95.3 6.9L90.6 7.5L85.1 " +
        "7.2L80.2 5.7L76.6 7.7L73.1 8.3L68 8.1L63.3 6.3L58 6.4L53.3 6.5L48.3 11.6L45 7.1L40.1 9.7L34.8 9.3L31.2 6.4L27.9 8.3L23.2 " +
        "8.3L19.4 5.9L15.1 11.4L10.8 5.7L7.4 6.6L4 9.8L0 7.0Z"

private val tornPath by lazy { PathParser().parsePathString(TORN).toPath() }

private class Face(
    val label: String,
    val date: String,
    val stamp: String,
    val text: String,
    val hanging: Boolean,
)

// A day's sheet: the date as its heading, its format stamped beside it, then the fact. Today's Stimmt’s? turns over on a
// tap, its answer led by the verdict.
private fun face(
    ui: Ui,
    date: Long,
    hanging: Boolean = false,
): Face {
    val on = sheetOn(date)
    val sheet = on.sheet
    val back = !hanging && sheet.back != null && ui.home.turned == sheet.id
    val lead = if (back) "<b>${sheet.verdict}.</b> " else ""
    // the day and its month stay together when the date needs two lines
    val day =
        de.schmeckts.app
            .weekdayDayMonth(date)
            .replaceFirst(". ", ". ")
    return Face(
        if (hanging) {
            "Gestriges Blatt abreißen"
        } else if (sheet.back !=
            null
        ) {
            (if (back) "Behauptung zeigen" else "Auflösung zeigen")
        } else {
            ""
        },
        day,
        on.format,
        lead + sheetText(sheet, catOf(ui.phone.db.pets), back),
        hanging,
    )
}

@Composable
private fun CalPad() {
    val ui = LocalUi.current
    val ph = ui.phone
    val now = Time.now()
    val today = dayKey(now)
    // first seen, or ahead after the clock was put back: nothing hangs today
    val stored = ph.prefs.sheetDay
    if (stored == null || stored > today) {
        LaunchedEffect(today) {
            ph.prefs.sheetDay = today
            ph.store.savePrefs()
        }
    }
    val day = hangingDay(if (stored == null || stored > today) today else stored, now)
    val p = colors
    val shade = p.paperShade
    Box(
        Modifier
            .fillMaxWidth()
            .drawBehind {
                // six sheet edges under the pad
                val edge = Space.s3.toPx()
                val top = size.height
                val r = Radius.paperBottom.toPx()
                val clip =
                    Path().apply {
                        addRoundRect(
                            androidx.compose.ui.geometry.RoundRect(
                                androidx.compose.ui.geometry
                                    .Rect(0f, top - r, size.width, top + edge),
                                bottomLeft =
                                    androidx.compose.ui.geometry
                                        .CornerRadius(r),
                                bottomRight =
                                    androidx.compose.ui.geometry
                                        .CornerRadius(r),
                            ),
                        )
                    }
                drawRoundRect(
                    shade.copy(alpha = shade.alpha * 0.4f),
                    Offset(0f, top - r + 1.dp.toPx()),
                    Area(
                        size.width,
                        edge + r + 2.dp.toPx(),
                    ),
                    androidx.compose.ui.geometry
                        .CornerRadius(r),
                )
                clipPath(clip) {
                    drawRect(p.paperEdge, Offset(0f, top - r), Area(size.width, edge + r))
                    var y = top
                    val line = 2.dp.toPx()
                    while (y < top + edge) {
                        drawRect(p.paperEdgeLine, Offset(0f, y + line * 0.75f), Area(size.width, line * 0.25f))
                        y += line
                    }
                }
                drawRoundRect(
                    p.paperUnder,
                    size = size,
                    cornerRadius =
                        androidx.compose.ui.geometry
                            .CornerRadius(Radius.paperTop.toPx()),
                )
            },
    ) {
        val c = face(ui, now)
        val old = day?.let { face(ui, it, true) }
        CalSheet(c, if (c.label.isNotEmpty() && old == null) ui.on("turn") else null, turnable = true)
        if (old != null) Tearable(old)
        CalTop()
    }
}

// over every sheet, so one torn off falls away under it: the binding and what is left of the sheets torn off
@Composable
private fun CalTop() {
    val p = colors
    Box(
        Modifier
            .fillMaxWidth()
            .height(Space.s2 + Space.s3)
            .drawBehind {
                val torn = Space.s1.toPx()
                val h = size.height - torn
                val k = h / 14f
                val tile = 300f * k
                var x = 0f
                while (x < size.width) {
                    translate(x, torn + 1.dp.toPx()) { drawPath(tornPath.scaled(k), p.paperShade) }
                    translate(x, torn) { drawPath(tornPath.scaled(k), p.paperTorn) }
                    x += tile
                }
                val r = Radius.paperTop.toPx()
                drawRoundRect(
                    p.paperBind,
                    size = Area(size.width, Space.s2.toPx()),
                    cornerRadius =
                        androidx.compose.ui.geometry
                            .CornerRadius(r),
                )
                drawRect(p.paperBind, Offset(0f, r), Area(size.width, Space.s2.toPx() - r))
            },
    )
}

private fun Path.scaled(k: Float): Path {
    val m =
        androidx.compose.ui.graphics
            .Matrix()
    m.scale(k, k)
    return Path().also {
        it.addPath(this)
        it.transform(m)
    }
}

// the sheet left hanging comes off at the perforation and falls over what lies below; today's is already in place
@Composable
private fun Tearable(old: Face) {
    val ui = LocalUi.current
    val fall = remember(old.date) { Animatable(0f) }
    LaunchedEffect(ui.home.tearing) {
        if (ui.home.tearing) {
            fall.animateTo(1f, tween((1.5 * Motion.STEP).toInt(), easing = Motion.easeIn))
            ui.home.tearing = false
            ui.update()
        }
    }
    Box(
        Modifier.graphicsLayer {
            val f = fall.value
            transformOrigin = TransformOrigin(0.85f, 0f)
            if (f < 0.18f) {
                val g = f / 0.18f
                translationY = 3.dp.toPx() * g
                rotationZ = -2.5f * g
            } else {
                val g = (f - 0.18f) / 0.82f
                translationX = -18.dp.toPx() * g
                translationY = 3.dp.toPx() + (size.height * 1.2f - 3.dp.toPx()) * g
                rotationZ = -2.5f - 8.5f * g
                alpha = 1f - g
            }
        },
    ) { CalSheet(old, if (ui.home.tearing) null else ui.on("tear")) }
}

/** as wide as a card and set like one; the corner cut away for the curl */
@Composable
private fun CalSheet(
    c: Face,
    onClick: (() -> Unit)?,
    turnable: Boolean = false,
) {
    val p = colors
    val still = reduceMotion
    val turn = remember { Animatable(0f) }
    val shownText = remember { androidx.compose.runtime.mutableStateOf(c) }
    LaunchedEffect(c.text) {
        if (!turnable || shownText.value.text == c.text) {
            shownText.value = c
            return@LaunchedEffect
        }
        if (still) {
            shownText.value = c
            return@LaunchedEffect
        }
        // edge on, halfway through, the other side takes its place
        turn.animateTo(1f, tween(Motion.STEP / 2, easing = Motion.easeIn))
        shownText.value = c
        turn.snapTo(-1f)
        turn.animateTo(0f, tween(Motion.STEP / 2, easing = Motion.easeOut))
    }
    val f = shownText.value
    val corner = Space.s6
    Column(
        Modifier
            .fillMaxWidth()
            .graphicsLayer {
                rotationY = 90f * turn.value
                cameraDistance = 600.dp.toPx() / density * 8
            }.then(if (onClick != null) Modifier.press(onClick, Motion.PRESS_WIDE, label = c.label) else Modifier)
            .drawWithContent {
                val k = corner.toPx()
                val cut =
                    Path().apply {
                        moveTo(0f, 0f)
                        lineTo(size.width, 0f)
                        lineTo(size.width, size.height - k)
                        lineTo(size.width - k, size.height)
                        lineTo(0f, size.height)
                        close()
                    }
                clipPath(cut) {
                    drawRoundRect(
                        p.paper,
                        size = size,
                        cornerRadius =
                            androidx.compose.ui.geometry
                                .CornerRadius(Radius.paperTop.toPx()),
                    )
                    this@drawWithContent.drawContent()
                }
                // the curled corner: its back, bright along the fold and shaded towards the tip
                val curl =
                    Path().apply {
                        moveTo(size.width - k, size.height)
                        lineTo(size.width, size.height - k)
                        lineTo(size.width - k + Radius.stamp.toPx(), size.height - k)
                        quadraticTo(size.width - k, size.height - k, size.width - k, size.height - k + Radius.stamp.toPx())
                        close()
                    }
                drawPath(curl, p.paperShade.copy(alpha = p.paperShade.alpha * 0.5f), style = Stroke(1.dp.toPx()))
                drawPath(
                    curl,
                    Brush.linearGradient(
                        listOf(p.paperCurl, p.paperUnder),
                        Offset(size.width - k / 2, size.height - k / 2),
                        Offset(size.width - k, size.height - k),
                    ),
                )
            }.padding(start = Space.gutter, end = Space.gutter, top = Space.s2 + Space.s3 + Space.s4, bottom = Space.s6),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(bottom = Space.s3),
            horizontalArrangement = Arrangement.spacedBy(Space.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            T(f.date, Type.heading, Modifier.weight(1f), p.paperInk, balance = true)
            Stamp(f.stamp)
        }
        M(f.text, Type.body, color = p.paperInk)
        if (f.hanging) {
            Row(
                Modifier.padding(top = Space.s3),
                horizontalArrangement = Arrangement.spacedBy(Space.s2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Ink(p.paperMuted) {
                    Icon("down", size = Size.iconS)
                    T("Zum Abreißen tippen", Type.smallStrong)
                }
            }
        }
    }
}

// the rubric, pressed on a little askew in worn ink: a heavy frame and a fine one inside it
@Composable
private fun Stamp(text: String) {
    val p = colors
    T(
        text.uppercase(),
        Type.captionStrong.copy(letterSpacing = Type.TRACK_STAMP.em),
        Modifier
            .graphicsLayer {
                rotationZ = -4f
                scaleX = 0.8f
                scaleY = 0.8f
                transformOrigin = TransformOrigin(1f, 0.5f)
            }.border(Size.stroke, p.paperMuted, RoundedCornerShape(Radius.stamp))
            .padding(Space.hair)
            .border(Size.hairline, p.paperMuted, RoundedCornerShape(Radius.stamp - Space.hair))
            .padding(horizontal = Space.s2 - Space.hair, vertical = Space.s1 - Space.hair),
        p.paperMuted,
        maxLines = 1,
    )
}
