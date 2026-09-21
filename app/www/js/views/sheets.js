/* Inhalte der Bottom Sheets: Mahlzeit, Benennen, Füttern (mit Auswahl nach dem Scannen), Futter, Tier (mit Zuschnitt des
   Profilbilds und Album), Einstellungen und Auswertung. */
import {$} from '../dom.js';
import {andList, cap, esc, norm} from '../text.js';
import {toLocalInput, when} from '../dates.js';
import {appInfo} from '../native.js';
import {icon} from '../icons.js';
import {ALBUM_MAX, FEED_START, RATINGS, REMIND, REMIND_MAX_H, scaleOf, SPECIES, TEXTURES, TYPES, typeOf} from '../config.js';
import {db, loadError, prefs, queue, storageOK} from '../store.js';
import {isConnected, status} from '../sync.js';
import {getPet, getProduct, getServing, petNames, pname, productsByCode, quickProducts, reportModel, sortOf} from '../derive.js';
import {feedSlots, MIN_RATED, rateCls, scoreCls, SPANS, VERDICTS} from '../smart.js';
import {renderSheet, setSheetView, sheet, sheetBody} from '../ui/sheet.js';
import {ZOOM_MAX, mountCrop} from '../ui/crop.js';
import {armBtn, avatar, closeBtn, dayBlocks, dayGroups, nameBlock, rateRow, reasonOf, resultBadges, syncInfo, thumbOf, verdictLabel} from './parts.js';

function viewServing(){
  const s = getServing(sheet.id);
  if (!s) return `<div class="sh-head"><h2>Eintrag</h2>${closeBtn}</div><p class="empty">Diesen Eintrag gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const p = getProduct(s.productId);
  const ids = Object.keys(s.pets).filter(id => getPet(id));
  const multi = db.pets.length > 1;
  return `<div class="sh-head"><h2>Wie war’s?</h2>${closeBtn}</div>
    <button class="prod-card" data-action="edit-name" aria-label="Futter ändern">${thumbOf(s, p, 'lg')}<span class="t-main">${nameBlock(s, p, true)}</span><span class="edit">${icon('pencil')}</span></button>
    ${ids.map(pid => { const pet = getPet(pid); return `<div class="pet-rate">${multi ? `<div class="pet-label">${avatar(pet, 'xs')}${esc(pet.name)}</div>` : ''}${rateRow(s, pid, true)}</div>`; }).join('')}
    ${multi ? `<span class="label">Serviert für</span><div class="chips">${db.pets.map(pet => `<button class="chip" aria-pressed="${!!s.pets[pet.id]}" data-action="toggle-serving-pet" data-id="${pet.id}">${avatar(pet, 'xs')}${esc(pet.name)}</button>`).join('')}</div>` : ''}
    <label class="label" for="f-time">Serviert${s.by ? ' von ' + esc(s.by) : ''}</label>
    <span class="pick"><input id="f-time" class="field" type="datetime-local" data-time="${s.id}" value="${toLocalInput(s.servedAt)}" max="${toLocalInput(Date.now())}">${icon('chevron')}</span>
    <label class="label" for="f-note">Notiz</label>
    <input id="f-note" class="field" data-note="${s.id}" value="${esc(s.note || '')}" placeholder="Optional, z. B. neue Packung" autocomplete="off">
    <div class="mt"><button class="btn quiet" data-action="delete-serving">${icon('trash')}Eintrag löschen</button></div>`;
}

function viewName(){
  const s = sheet;
  const serving = s.kind === 'serving' ? getServing(s.id) : null;
  const title = s.kind === 'new' ? 'Neues Futter' : s.kind === 'product' ? 'Futter umbenennen' : (serving?.productId ? 'Futter ändern' : 'Futter benennen');
  const photo = serving && (serving.photo || serving.thumb);
  let note = '';
  const retry = label => serving.photo && isConnected() ? `<button class="link" data-action="retry">${label}</button>` : '';
  if (serving?.status === 'reading') note = `<p class="note"><span class="spin"></span>Packung wird gelesen …</p>`;
  else if (serving?.status === 'recognizing') note = `<p class="note"><span class="spin"></span>Sorte wird erkannt …</p>`;
  else if (serving?.status === 'waiting') note = `<p class="note">${esc(serving.error || 'Wird erkannt, sobald der Server erreichbar ist.')} ${retry('Jetzt versuchen')}</p>`;
  else if (serving?.status === 'failed') note = `<p class="note warn">${esc(serving.error || 'Nicht erkannt.')} ${retry('Nochmal versuchen')}</p>`;
  return `<div class="sh-head"><h2>${title}</h2>${closeBtn}</div>
    ${photo ? `<img class="name-photo" src="${esc(photo)}" alt="Foto der Packung">` : ''}${note}
    <div class="suggest" id="suggest"></div>
    <label class="label" for="f-brand">Marke</label>
    <input id="f-brand" class="field" data-field="brand" value="${esc(s.brand)}" placeholder="z. B. Sheba" autocomplete="off" autocapitalize="words" enterkeyhint="next">
    <label class="label" for="f-variety">Sorte</label>
    <input id="f-variety" class="field" data-field="variety" value="${esc(s.variety)}" placeholder="z. B. Lachs in Soße" autocomplete="off" enterkeyhint="done">
    <span class="label">Art</span>
    <div class="chips">${TYPES.map(t => `<button class="chip" aria-pressed="${s.type === t}" data-action="set-type" data-v="${t}">${t}</button>`).join('')}</div>
    ${textureChips(s)}
    <div class="mt"><button class="btn primary" data-action="save-name">${icon('check')}${s.kind === 'new' ? 'Servieren' : 'Speichern'}</button></div>`;
}
/* Konsistenz oder Snack-Art der Sorte x (beim Benennen das Sheet selbst): Einfachauswahl, nur bei Arten mit Auswahl */
function textureChips(x, note = ''){
  const t = TEXTURES[typeOf(x)];
  return t ? `<div class="tex"><span class="label">${t.title}</span><div class="chips">${t.items.map(([k, label]) => `<button class="chip" aria-pressed="${x.texture === k}" data-action="set-texture" data-v="${k}">${label}</button>`).join('')}</div>${note}</div>` : '';
}
export function renderSuggestions(){
  const box = $('#suggest'); if (!box || !sheet) return;
  const serving = sheet.kind === 'serving' ? getServing(sheet.id) : null;
  const skip = sheet.kind === 'product' ? sheet.id : serving?.productId;
  const q = norm(`${sheet.brand || ''} ${sheet.variety || ''}`);
  let hits = [], title = 'Meinst du?';
  if (q.length >= 2) {
    const words = q.split(' ');
    hits = db.products.filter(p => p.id !== skip && words.every(w => norm(p.brand + ' ' + p.variety).includes(w))).slice(0, 4);
  } else if (serving && !serving.productId) { hits = quickProducts(4); title = 'Schon mal gehabt?'; } // 1-Tipp-Vorschlag
  box.innerHTML = (hits.length ? `<span class="label">${title}</span>` : '') + hits.map(p => `<button class="sugg" data-action="use-product" data-id="${p.id}">${thumbOf(null, p)}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(p.brand)}</small></span>${icon('chevron')}</button>`).join('');
}

/* Füttern: Barcode und Foto als gleich breite Knöpfe; „Füttern beginnt mit“ blendet einen davon aus, der andere nimmt
   die ganze Breite. Darunter die zuletzt gefütterten Sorten, höchstens SUGGEST; ab mehr bekannten Sorten folgt das
   Suchfeld, dessen Treffer (höchstens HITS) an die Stelle der Vorschläge treten.
   sheet.busy: Hinweis während des Scannens,
   sheet.code: gescannter Code, um den es gerade geht (Auswahl, oder der Foto-Knopf übernimmt ihn) */
const SUGGEST = 3, HITS = 8;
const CTA = {
  barcode: `<button class="cta primary" data-action="scan">${icon('barcode')}<span><b>Barcode</b><small>scannen</small></span></button>`,
  foto: `<button class="cta soft" data-action="photo">${icon('camera')}<span><b>Foto</b><small>aufnehmen</small></span></button>`
};
function serveRows(prods, code = ''){
  return prods.map(p => {
    const e = sortOf(p.id);
    const meta = [p.variety ? p.brand : '', e?.n ? `${e.pct} %` : 'noch nicht bewertet'].filter(Boolean).join(', ');
    return `<li><button class="row" data-action="serve" data-id="${p.id}"${code ? ` data-code="${esc(code)}"` : ''}>${thumbOf(null, p)}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(meta)}</small></span><span class="serve-pill">Servieren</span></button></li>`;
  }).join('');
}
function viewFeed(){
  const pick = sheet.step === 'pick' ? productsByCode(sheet.code) : [];
  if (pick.length) return `<div class="sh-head"><h2>Welche Sorte?</h2>${closeBtn}</div>
    <p class="hint">Dieser Barcode gehört zu mehreren Sorten.</p>
    <ul class="plist">${serveRows(pick, sheet.code)}</ul>`;
  const prods = quickProducts();
  return `<div class="sh-head"><h2>Was gibt’s heute?</h2>${closeBtn}</div>
    <div class="cta-row">${prefs.feedStart === 'beides' ? CTA.barcode + CTA.foto : CTA[prefs.feedStart]}</div>
    ${sheet.busy ? `<p class="note" role="status"><span class="spin"></span>${esc(sheet.busy)}</p>` : ''}
    ${prods.length ? `<div id="serveList"><span class="label">Schon mal gehabt</span><ul class="plist">${serveRows(prods.slice(0, SUGGEST))}</ul></div>
      ${prods.length > SUGGEST ? `<div class="search">${icon('search')}<input class="field" type="search" data-search placeholder="Marke oder Sorte suchen" autocomplete="off"></div>
        <ul class="plist" id="serveHits"></ul>` : ''}` : ''}
    <button class="btn plain" data-action="new-product">Ohne Foto eintippen</button>`;
}
/* Suche im Füttern-Sheet: Getipptes zeigt statt der Vorschläge die passenden Sorten, höchstens HITS. */
export function renderServeHits(text){
  const list = $('#serveList'), hits = $('#serveHits');
  if (!list || !hits) return;
  const words = norm(text).split(' ').filter(Boolean);
  list.hidden = !!words.length;
  hits.innerHTML = words.length ? serveRows(quickProducts().filter(p => words.every(w => norm(p.brand + ' ' + p.variety).includes(w))).slice(0, HITS)) : '';
}

/* Hinweise unter den Erinnerungen: Sie sagen, was mit der gewählten Einstellung gerade gilt.
   Ans Füttern: die üblichen Zeiten aus dem Verlauf, gefragt wird nichts */
export const remindHint = () => !prefs.remind ? 'Dieses Handy erinnert nicht ans Bewerten.'
  : `Dieses Handy erinnert ${prefs.remind === 60 ? '1 Stunde' : prefs.remind / 60 + ' Stunden'} nach dem Füttern ans Bewerten.`;
function feedHint(){
  const slots = feedSlots(db, Date.now()), hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, on = prefs.feedRemind;
  if (!slots.length) return 'Die üblichen Zeiten lernt die App aus dem Verlauf, sobald an vier Tagen etwa zur selben Zeit gefüttert wurde.' + (on ? ' Bis dahin kommt keine Erinnerung.' : '');
  return `Futter gibt es meist um ${andList(slots.map(x => hhmm(x.at)))} Uhr. `
    + (!on ? 'Dieses Handy erinnert nicht daran.' : `Ist ${slots[0].remind - slots[0].at} Minuten später nichts serviert, erinnert dieses Handy.`
      + (isConnected() ? ' Was andere inzwischen serviert haben, erfährt es erst, wenn die App offen war.' : ''));
}

/* Futter-Sheet, Abschnitt „Kaufen“: eigene Einstellung (Automatisch, Immer kaufen, Nicht kaufen), darunter das
   berechnete Urteil mit kurzer Begründung, bei mehreren Tieren je Tier eine Zeile */
const KAUFEN = [['auto', 'Automatisch'], ['immer', 'Immer kaufen'], ['nicht', 'Nicht kaufen']];
function kaufenHTML(e){
  const pets = db.pets.length > 1 ? db.pets.filter(pet => e.pets[pet.id]) : [];
  return `<span class="label">Kaufen</span>
    <div class="seg">${KAUFEN.map(([v, l]) => `<button aria-pressed="${(e.kaufen || 'auto') === v}" data-action="kaufen" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="verdict"><p><b>${esc(verdictLabel(e.house))}</b>${pets.length ? '' : `<span>${esc(reasonOf(e.house))}</span>`}</p>
    ${pets.map(pet => `<div class="verdict-pet">${avatar(pet, 'xs')}<span class="t-main"><b>${esc(pet.name)}: ${VERDICTS[e.pets[pet.id].verdict]}</b><small>${esc(reasonOf(e.pets[pet.id]))}</small></span></div>`).join('')}</div>`;
}

function viewProduct(){
  const p = getProduct(sheet.id);
  if (!p) return `<div class="sh-head"><h2>Futter</h2>${closeBtn}</div><p class="empty">Dieses Futter gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const ss = db.servings.filter(s => s.productId === p.id), e = sortOf(p.id), counts = e.house.counts;
  const scale = scaleOf(p), levels = [...scale, ...Object.keys(counts).filter(r => !scale.includes(r))]; // andere vorkommende Stufen dahinter
  const perPet = db.pets.length > 1 ? db.pets.map(pet => {
    const x = e.pets[pet.id]; if (!x) return '';
    return `<div class="pp ${scoreCls(x.score)}">${avatar(pet, 'sm')}<span class="pp-name">${esc(pet.name)}</span><span class="bar"><i style="--w:${Math.max(4, x.pct)}%"></i></span><b>${x.pct} %</b></div>`;
  }).join('') : '';
  const codes = Object.keys(p.codes || {}).sort();
  const hist = ss.slice(0, 12).map(s => `<li><button class="row" data-action="open-serving" data-id="${s.id}"><span class="t-main"><b>${esc(cap(when(s.servedAt)))}</b><small>${esc([petNames(Object.keys(s.pets).filter(getPet)), s.note ? '„' + s.note + '“' : ''].filter(Boolean).join(', '))}</small></span>${resultBadges(s)}</button></li>`).join('');
  return `<div class="sh-head"><h2>${esc(pname(p))}</h2>${closeBtn}</div>
    <div class="prod-card">${thumbOf(null, p, 'lg')}<span class="t-main"><b>${esc(p.brand || p.variety)}</b><small>${esc([p.type, `${ss.length}× serviert`].filter(Boolean).join(', '))}</small></span><button class="icon-btn" data-action="rename-product" aria-label="Umbenennen">${icon('pencil')}</button></div>
    ${textureChips(p, p.texture === 'block' ? '<p class="note">Vor dem Servieren zerkleinern</p>' : '')}
    ${e.house.n ? `<div class="counts">${levels.map(r => `<div class="cnt ${rateCls(r)}">${icon('r_' + r)}<b>${counts[r] || 0}</b><span>${RATINGS[r].lines.join('<br>')}</span></div>`).join('')}</div>` : `<p class="empty">Noch nicht bewertet.</p>`}
    ${kaufenHTML(e)}
    ${perPet ? `<span class="label">Pro Tier</span>${perPet}` : ''}
    ${hist ? `<span class="label">Verlauf</span><ul class="plist">${hist}</ul>` : ''}
    ${codes.length ? `<span class="label">Barcodes</span><ul class="plist">${codes.map(c => `<li class="list-row"><span class="t-main"><b class="num">${esc(c)}</b></span><button class="icon-btn" data-action="remove-code" data-code="${esc(c)}" aria-label="Barcode ${esc(c)} entfernen">${icon('close')}</button></li>`).join('')}</ul>` : ''}
    <div class="mt btn-col"><button class="btn primary" data-action="serve" data-id="${p.id}">${icon('check')}Heute servieren</button>
    ${armBtn('delete-product', 'Futter löschen', 'Nochmal tippen: Futter und Einträge löschen')}</div>`;
}

/* Auswertung: dieselben Bausteine wie die Einstellungen. Oben der Zeitraum, darunter je Abschnitt eine Überschrift, die
   Grafik und ein Satz, der sie in Worten zusammenfasst; Abschnitte ohne genug Daten fehlen. Gerechnet wird in report()
   (smart.js), gezeichnet wird hier: die Linie als eigenes SVG, die Balken aus den Bausteinen der App. Jede Grafik trägt
   ihre Textbeschreibung im aria-label, und keine Aussage steckt allein in der Farbe.
   sheet.span: Tage des Zeitraums, sheet.shown: Mahlzeiten im Verlauf, sheet.at: Abschnitt, bei dem geöffnet wird. */
const REPORT_STEP = 20;   // der Verlauf lädt in Schritten von 20 nach
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const weekdayName = i => new Date(2024, 0, 1 + i).toLocaleDateString('de-DE', {weekday:'long'}); // 1.1.2024 war ein Montag
export const reportState = at => ({kind:'report', span:SPANS[0][0], shown:REPORT_STEP, at});
export function reportSpan(v){ Object.assign(sheet, {span:+v, shown:REPORT_STEP}); renderSheet(); }
export function reportMore(){ sheet.shown += REPORT_STEP; renderSheet(); }

const section = (key, title, chart, say) => `<h3 class="label" id="ab-${key}">${title}</h3>${chart}<p class="why">${say}</p>`;
/* Waagerechter Balken mit Name, Zahl und Nebenzahl; cls trägt die Farbe einer Bewertungsstufe, sonst gilt der Akzent */
const barRow = (name, value, side, w, cls = '') =>
  `<div class="lv ${cls}"><span class="lv-top"><span class="lv-name">${esc(name)}</span><b class="lv-n">${value}</b><span class="lv-s">${side}</span></span>
    <span class="bar"><i style="--w:${Math.max(2, Math.round(w))}%"></i></span></div>`;
const bars = (label, rows) => `<div class="bars" role="img" aria-label="${esc(label)}">${rows}</div>`;
const compare = list => `${esc(list[0].key)} kommt am besten an (${list[0].pct} %), ${esc(list.at(-1).key)} am wenigsten (${list.at(-1).pct} %).`;
const listOf = list => list.map(g => `${g.key} ${g.pct} Prozent aus ${g.n} Bewertungen`).join('; ');

function trendBlock(m){
  const lines = m.trend.pets.filter(p => p.points.length > 1);
  if (!lines.length) return '';
  const width = Math.max(1, m.trend.to - m.trend.from), per = m.trend.step === 'day' ? 'Tag' : 'Woche';
  const name = p => esc(getPet(p.id).name), many = lines.length > 1;
  const points = p => p.points.map(x => `${((x.t - m.trend.from) / width * 100).toFixed(1)},${(100 - x.pct).toFixed(1)}`).join(' ');
  const label = `Linie der Wertung je ${per}, 0 bis 100 Prozent. `
    + lines.map(p => `${many ? getPet(p.id).name + ': ' : ''}von ${p.points[0].pct} auf ${p.points.at(-1).pct} Prozent, im Schnitt ${p.pct}`).join('. ') + '.';
  return section('trend', 'Akzeptanz im Verlauf',
    `<div class="chart" role="img" aria-label="${esc(label)}">
      <span class="chart-y"><span>100 %</span><span>50 %</span><span>0 %</span></span>
      <svg class="plot" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path class="grid" d="M0 0H100M0 50H100M0 100H100"/>
        ${lines.map((p, i) => `<polyline class="s${i % 3}" points="${points(p)}"/>`).join('')}</svg></div>
    ${many ? `<div class="legend">${lines.map((p, i) => `<span class="key s${i % 3}"><svg viewBox="0 0 20 2" aria-hidden="true"><line x1="0" y1="1" x2="20" y2="1"/></svg>${name(p)}</span>`).join('')}</div>` : ''}`,
    many ? `Im Schnitt ${andList(lines.map(p => `${name(p)} ${p.pct} %`))}.` : `Im Schnitt ${lines[0].pct} %, zuletzt ${lines[0].points.at(-1).pct} %.`);
}
function levelBlock(m){
  if (m.levels.length < 2) return '';
  const top = m.levels.reduce((a, x) => x.n > a.n ? x : a);
  return section('levels', 'Verteilung der Bewertungen',
    bars('Bewertungen je Stufe: ' + m.levels.map(x => `${RATINGS[x.r].label} ${x.n}, ${x.share} Prozent`).join('; ') + '.',
      m.levels.map(x => barRow(RATINGS[x.r].label, x.n, `${x.share} %`, x.share, rateCls(x.r))).join('')),
    `Am häufigsten „${esc(RATINGS[top.r].label)}“ mit ${top.n} von ${m.n} Bewertungen (${top.share} %).`);
}
function brandBlock(m){
  if (m.brands.length < 2) return '';
  return section('brands', 'Marken im Vergleich',
    bars('Marken nach Wertung: ' + listOf(m.brands) + '.', m.brands.map(b => barRow(b.key, `${b.pct} %`, `${b.n}×`, b.pct)).join('')),
    compare(m.brands));
}
const textureBlocks = m => m.textures.map(t => section('tex-' + t.type, t.title,
  bars(`${t.title} nach Wertung: ` + listOf(t.groups) + '.', t.groups.map(g => barRow(g.key, `${g.pct} %`, `${g.n}×`, g.pct)).join('')),
  compare(t.groups))).join('');
function feedingBlock(m){
  const days = m.feeding.days, most = Math.max(...days);
  if (!most) return '';
  const meals = n => `${n} ${n === 1 ? 'Mahlzeit' : 'Mahlzeiten'}`;
  const often = days.map((n, i) => [n, i]).filter(([n]) => n === most).map(([, i]) => weekdayName(i).toLowerCase() + 's');
  return section('feeding', 'Fütterungen',
    `<div class="wd" role="img" aria-label="Mahlzeiten je Wochentag: ${days.map((n, i) => `${weekdayName(i)} ${n}`).join(', ')}.">
      ${days.map((n, i) => `<span class="wd-col"><span class="wd-bar"><i style="--h:${n ? Math.max(6, Math.round(n / most * 100)) : 0}%"></i></span><b class="lv-n">${n}</b><span>${WEEKDAYS[i]}</span></span>`).join('')}</div>`,
    often.length > 3 ? `Über die Woche wird gleichmäßig gefüttert, an keinem Tag mehr als ${meals(most)}.`
      : `Am meisten wird ${andList(often)} gefüttert, ${meals(most)}${often.length > 1 ? ' je Tag' : ''}.`)
    + (m.feeding.people.length > 1 ? m.feeding.people.map(x => `<p class="who"><span>${esc(x.name)}</span><b class="lv-n">${x.n}×</b></p>`).join('') : '');
}
function histBlock(m){
  if (!m.meals.length) return '';
  const shown = m.meals.slice(0, sheet.shown);
  return `<h3 class="label" id="ab-hist">Verlauf</h3>
    ${dayBlocks(dayGroups(shown), {multiHouse:db.pets.length > 1 && !m.pet})}
    ${m.meals.length > shown.length ? `<button class="card-btn" data-action="report-more">Weitere anzeigen</button>` : ''}`;
}
function viewReport(){
  const m = reportModel(sheet.span);
  const who = db.pets.length > 1 ? ` für ${m.pet ? esc(getPet(m.pet).name) : 'alle Tiere'}` : '';
  return `<div class="sh-head"><h2>Auswertung${who}</h2>${closeBtn}</div>
    <div class="seg">${SPANS.map(([v, l]) => `<button aria-pressed="${sheet.span === v}" data-action="report-span" data-v="${v}">${l}</button>`).join('')}</div>
    ${m.n < MIN_RATED ? `<p class="hint mt-s">Ab ${MIN_RATED} Bewertungen in diesem Zeitraum zeigt diese Seite, was ankommt.</p>`
      : trendBlock(m) + levelBlock(m) + brandBlock(m) + textureBlocks(m) + feedingBlock(m)}
    ${histBlock(m)}`;
}

/* Zuschnitt des Profilbilds: quadratische Ansicht mit rundem Ausschnitt wie das Profilbild, Regler zum Zoomen.
   Das Bild hängt mountCrop() nach dem Zeichnen ein. */
const viewCrop = () => `<div class="sh-head"><h2>Foto zuschneiden</h2>${closeBtn}</div>
    <div class="crop" id="cropStage" aria-label="Ausschnitt verschieben"></div>
    <label class="label" for="f-zoom">Zoom</label>
    <input id="f-zoom" class="zoom" type="range" min="1" max="${ZOOM_MAX}" step="0.01" value="1">
    <div class="btn-row"><button class="btn soft" data-action="crop-cancel">Abbrechen</button><button class="btn primary" data-action="crop-apply">${icon('check')}Übernehmen</button></div>`;

/* Album im Tier-Sheet: bis zu ALBUM_MAX Fotos, Kreuz zum Entfernen, ein Tipp wählt ein Foto für „Als Profilbild“ */
function albumHTML(p){
  const keys = Object.keys(p.photos || {}).sort(), sel = keys.includes(sheet.albumSel) ? sheet.albumSel : null;
  return `<span class="label">Fotos${keys.length ? ` (${keys.length} von ${ALBUM_MAX})` : ''}</span>
    <div class="album">${keys.map((k, i) => `<div class="ph"><button class="ph-img" data-action="album-select" data-key="${k}" aria-pressed="${sel === k}" aria-label="Foto ${i + 1} auswählen"><img src="${esc(p.photos[k])}" alt=""></button>
      <button class="ph-x" data-action="album-remove" data-key="${k}" aria-label="Foto ${i + 1} entfernen"><span>${icon('close')}</span></button></div>`).join('')}
      ${keys.length < ALBUM_MAX ? `<label class="ph add" for="albumInput" aria-label="Fotos hinzufügen">${icon('plus')}</label>` : ''}</div>
    ${sel ? `<button class="btn soft mt-s" data-action="album-profile">${icon('crop')}Als Profilbild</button>` : ''}`;
}

function viewPet(){
  if (sheet.step === 'crop') return viewCrop();
  const s = sheet, editing = !!s.id;
  const title = editing ? 'Tier bearbeiten' : (db.pets.length ? 'Neues Tier' : 'Wer wird gefüttert?');
  const av = avatar({photo:s.photo, species:s.species}, 'xl');
  return `<div class="sh-head"><h2>${title}</h2>${closeBtn}</div>
    <label class="pet-photo" for="petPhotoInput" aria-label="Foto wählen">${av}<span class="cam-badge">${icon('camera')}</span></label>
    <label class="photo-hint" for="petPhotoInput">${s.photo ? 'Foto ändern' : 'Foto hinzufügen'}</label>
    <label class="label" for="f-name">Name</label>
    <input id="f-name" class="field" data-field="name" value="${esc(s.name)}" placeholder="z. B. Minka" autocomplete="off" autocapitalize="words" enterkeyhint="done">
    <span class="label">Tierart</span>
    <div class="chips">${SPECIES.map(x => `<button class="chip" aria-pressed="${s.species === x.k}" data-action="set-species" data-v="${x.k}">${icon(x.i)}${x.k}</button>`).join('')}</div>
    ${editing ? albumHTML(getPet(s.id)) : ''}
    <div class="mt btn-col"><button class="btn primary" data-action="save-pet">${icon('check')}${editing ? 'Speichern' : 'Tier anlegen'}</button>
    ${editing ? armBtn('delete-pet', 'Tier entfernen', 'Nochmal tippen: Tier und Bewertungen löschen') : ''}</div>`;
}

function viewSettings(){
  const st = prefs, house = isConnected(), own = st.remind > 0 && (!!sheet.ownRemind || !REMIND.includes(st.remind)); // „Eigene“: gewählt oder ein Wert außerhalb der Stufen
  return `<div class="sh-head"><h2>Einstellungen</h2>${closeBtn}</div>
    ${loadError ? `<p class="banner">Die gespeicherten Daten konnten nicht gelesen werden. Bitte die App neu starten.</p>`
      : storageOK ? '' : `<p class="banner">In dieser Vorschau wird nichts dauerhaft gespeichert.</p>`}
    <button class="list-row" data-action="open-report"><span class="t-main"><b>Auswertung</b></span>${icon('chevron', 'chev')}</button>
    <span class="label">Darstellung</span>
    <div class="seg">${[['system', 'auto', 'System'], ['light', 'sun', 'Hell'], ['dark', 'moon', 'Dunkel']].map(([v, ic, l]) => `<button aria-pressed="${st.theme === v}" data-action="theme" data-v="${v}">${icon(ic)}${l}</button>`).join('')}</div>
    <span class="label">Tierfotos im Hintergrund</span>
    <div class="seg">${[['on', 'An'], ['off', 'Aus']].map(([v, l]) => `<button aria-pressed="${st.backdrop === (v === 'on')}" data-action="backdrop" data-v="${v}">${l}</button>`).join('')}</div>
    <span class="label">Füttern beginnt mit</span>
    <div class="seg">${FEED_START.map(([v, l]) => `<button aria-pressed="${st.feedStart === v}" data-action="feed-start" data-v="${v}">${l}</button>`).join('')}</div>
    <span class="label">Ans Bewerten erinnern</span>
    <p class="hint" id="remind-hint">${remindHint()}</p>
    <div class="seg">${REMIND.map(m => `<button aria-pressed="${!own && st.remind === m}" data-action="remind" data-v="${m}">${m ? m / 60 + ' Std.' : 'Aus'}</button>`).join('')
      }<button aria-pressed="${own}" data-action="remind-own">Eigene</button></div>
    ${own ? `<label class="label" for="f-remind">Stunden nach dem Füttern</label>
      <input id="f-remind" class="field" type="number" inputmode="numeric" min="1" max="${REMIND_MAX_H}" step="1" value="${st.remind / 60}" data-remind enterkeyhint="done">` : ''}
    <span class="label">Ans Füttern erinnern</span>
    <p class="hint">${feedHint()}</p>
    <div class="seg">${[['on', 'An'], ['off', 'Aus']].map(([v, l]) => `<button aria-pressed="${st.feedRemind === (v === 'on')}" data-action="feed-remind" data-v="${v}">${l}</button>`).join('')}</div>
    <span class="label">Tiere</span>
    <div>${db.pets.map(p => `<button class="list-row" data-action="edit-pet" data-id="${p.id}">${avatar(p)}<span class="t-main"><b>${esc(p.name)}</b><small>${esc(p.species)}</small></span>${icon('chevron', 'chev')}</button>`).join('')}
      <button class="list-row" data-action="add-pet"><span class="av add">${icon('plus')}</span><span class="t-main"><b>Tier hinzufügen</b></span></button></div>
    <label class="label" for="f-me">Dein Name</label>
    <p class="hint">Erscheint im Verlauf, damit im Haushalt alle sehen, wer gefüttert hat.</p>
    <input id="f-me" class="field" data-setting="name" value="${esc(st.name)}" placeholder="z. B. Anna" autocomplete="off" autocapitalize="words">
    <span class="label" id="server">Haushalt</span>
    <div id="serverBox"></div>
    <span class="label">Daten</span>
    <div class="btn-col">
      <button class="btn soft" data-action="export">${icon('download')}Backup exportieren</button>
      <label class="btn soft" for="importInput">${icon('upload')}Backup importieren</label>
      ${house ? '' : `<button class="btn soft" data-action="demo">${icon('sparkle')}Beispieldaten laden</button>`}
      <button class="btn soft" data-action="open-privacy">${icon('shield')}Datenschutz</button>
      ${house ? armBtn('wipe', 'Alle Daten im Haushalt löschen', 'Nochmal tippen: für alle im Haushalt löschen')
              : armBtn('wipe', 'Alle Daten löschen', 'Nochmal tippen: wirklich alles löschen')}
    </div>
    <p class="foot">${house ? 'Die Daten werden im Haushalt geteilt.' : 'Alle Daten bleiben auf diesem Gerät.'}${appInfo.version ? `<br>Version ${esc(appInfo.version)}` : ''}</p>`;
}

/* Abschnitt „Haushalt“. Modus „lokal“: die Einstellungen dieses Handys und der Knopf „Mit Haushalt verbinden“, der die
   Felder für Adresse und Code öffnet. Verbunden: Zustand des Abgleichs, „Jetzt abgleichen“ und „Verbindung trennen“,
   darunter dieselben Einstellungen. Einen Fortschritt zeigt nur der von Hand gestartete Abgleich (sheet.syncing,
   siehe actions.js), Abgleiche im Hintergrund bleiben unsichtbar. */
function serverSection(notice = syncInfo()){
  const s = sheet || {};
  const codeRow = `<div class="connect mt-s">
      <input id="f-code" class="field code" data-field="code" value="${esc(s.code || '')}" placeholder="Haushaltscode" aria-label="Haushaltscode"
        autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="12">
      <button class="btn primary" data-action="connect"${s.connecting ? ' disabled' : ''}>${s.connecting ? '<span class="spin"></span>Verbinde …' : 'Verbinden'}</button></div>
      ${s.connectError ? `<p class="note warn" role="alert">${esc(s.connectError)}</p>` : ''}`;
  const addrField = `<label class="label" for="f-server">Adresse des Servers</label>
      <input id="f-server" class="field" data-field="server" value="${esc(s.server ?? prefs.server)}" placeholder="http://192.168.… oder https://…"
        autocomplete="off" inputmode="url" spellcheck="false" enterkeyhint="next">`;
  if (!isConnected()) return deviceSection() + (s.connectForm
    ? `<p class="hint">Verbunden sehen alle im Haushalt dieselben Tiere, Mahlzeiten und Bewertungen. Adresse und Code zeigt „Schmeckt’s-Server einrichten“ auf dem Mini-PC.</p>${addrField}${codeRow}`
    : `<button class="btn soft" data-action="connect-form">${icon('house')}Mit Haushalt verbinden</button>`);
  const needCode = status.kind === 'auth';
  return `<div class="srv ${notice.tone}" role="status"><span class="srv-ic">${icon(notice.tone === 'bad' ? 'alert' : 'house')}</span>
    <span class="t-main"><b>${esc(notice.title)}</b><small>${esc(notice.detail)}</small></span></div>
    ${!needCode ? `<p class="addr"><span>Server ${esc(prefs.server)}</span></p>`
      : codeRow + (s.editServer ? addrField : `<p class="addr"><span>Server ${esc(prefs.server)}</span><button class="link" data-action="edit-server">Ändern</button></p>`)}
    <div class="btn-col mt-s">
      ${needCode ? '' : s.syncing === 'shown' ? `<button class="btn soft" disabled><span class="spin"></span>Abgleich läuft …</button>`
        : status.state === 'ok' && !queue.length ? '' // alles abgeglichen: nichts zu tun
        : `<button class="btn soft" data-action="sync-now">${icon('refresh')}Jetzt abgleichen</button>`}
      ${armBtn('disconnect', 'Verbindung trennen', 'Nochmal tippen: trennen, die Daten bleiben hier', {ic:'unplug', cls:'plain'})}</div>
    ${deviceSection()}`;
}

/* Einstellungen und Wege dieses Handys: Produktsuche im Internet, eigener KI-Schlüssel und der Austausch von Hand.
   Die Hinweise sagen, was dabei hinausgeht. Nach einem Empfang steht hier die Meldung und, wenn dem anderen Gerät
   etwas fehlt, „Antwort senden“ (sheet.exchange, siehe logic/exchange.js). */
function deviceSection(){
  const ex = sheet?.exchange;
  return `<span class="label">Produktsuche im Internet</span>
    <p class="hint">${prefs.lookup ? 'Bei unbekannten Barcodes fragt dieses Handy zwei freie Produktdatenbanken. Übertragen wird nur die Nummer.'
      : 'Unbekannte Barcodes führen gleich zum Foto. Es geht keine Nummer hinaus.'}</p>
    <div class="seg">${[['on', 'An'], ['off', 'Aus']].map(([v, l]) => `<button aria-pressed="${prefs.lookup === (v === 'on')}" data-action="lookup" data-v="${v}">${l}</button>`).join('')}</div>
    <label class="label" for="f-aikey">Eigener KI-Schlüssel</label>
    <p class="hint">Mit einem eigenen Schlüssel von Anthropic liest Claude die Packung vom Foto, etwa ein halber Cent je Foto. Der Schlüssel liegt nur auf diesem Handy.</p>
    <input id="f-aikey" class="field" type="password" data-setting="aiKey" value="${esc(prefs.aiKey)}" placeholder="sk-ant-…"
      autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
    <span class="label">Austausch von Hand</span>
    <p class="hint">Änderungen als Datei an ein anderes Handy geben und von dort empfangen. Die Datei enthält nur Tiere, Futter und Mahlzeiten.</p>
    <div class="btn-col">
      <button class="btn soft" data-action="share-changes">${icon('phone')}Änderungen teilen</button>
      <label class="btn soft" for="exchangeInput">${icon('upload')}Austausch empfangen</label>
    </div>
    ${ex ? `<p class="note" role="status">${esc(ex.text)}</p>${ex.peer ? `<div class="btn-col"><button class="btn soft" data-action="send-answer">${icon('phone')}Antwort senden</button></div>` : ''}` : ''}`;
}
/* Server-Kasten zeichnen. Neu geschrieben wird er nur, wenn sich sein sichtbarer Inhalt ändert: Statuswechsel ohne sichtbare
   Folge (busy bei jedem kurzen Abgleich) tun nichts, und ändert sich nur die Zeile unter dem Titel, etwa die Zeitangabe
   „zuletzt abgeglichen“, wechselt nur ihr Text. fresh: nach dem Zeichnen des Sheets, der Kasten ist dann leer. */
let boxFrame = ''; // der zuletzt geschriebene Kasten ohne die Zeile unter dem Titel
export function paintServerBox(fresh = false){
  const box = $('#serverBox'); if (!box) return;
  const notice = syncInfo(), frame = serverSection({...notice, detail:''});
  if (fresh || frame !== boxFrame) {
    if (!fresh && document.activeElement?.tagName === 'INPUT' && box.contains(document.activeElement)) return; // beim Tippen nicht stören
    boxFrame = frame; box.innerHTML = serverSection(notice);
    return;
  }
  const line = $('.srv small', box);
  if (line && line.textContent !== notice.detail) line.textContent = notice.detail;
}

/* Datenschutz: erklärt beide Modi sachlich, ohne Versprechen; geöffnet aus den Einstellungen, Abschnitt „Daten“ */
const PRIVACY = ['Tiere, Futter und Mahlzeiten speichert die App auf deinem Handy, nicht in der Galerie und nicht in Googles Cloud-Sicherung.',
  'Nutzt du die App nur auf diesem Handy, bleiben die Daten dort. Ausnahme ist der Barcode-Scanner: Er kommt von Google und meldet allgemeine Nutzungsdaten wie das Gerätemodell, aber keine Bilder.',
  'Den Text auf einer Packung liest das Handy selbst, ohne Netz. Zwei Einstellungen unter „Haushalt“ können mehr, beide sind aus: Die Produktsuche im Internet fragt bei unbekannten Barcodes zwei freie Produktdatenbanken, übertragen wird nur die Nummer. Mit einem eigenen KI-Schlüssel geht das Packungsfoto an Anthropic; der Schlüssel liegt nur auf diesem Handy.',
  'Bist du mit einem Haushalt verbunden, gleicht die App mit eurem Server ab. Der schickt Packungsfotos zur Erkennung an Anthropic und unbekannte Barcodes, nur die Nummer, an freie Produktdatenbanken.',
  'Ein Backup und das Löschen aller Daten findest du in den Einstellungen unter „Daten“. „Änderungen teilen“ unter „Haushalt“ gibt eine Datei mit Tieren, Futter und Mahlzeiten an ein anderes Handy weiter, ohne Server.'];
const viewPrivacy = () => `<div class="sh-head"><h2>Datenschutz</h2>${closeBtn}</div><div class="privacy">${PRIVACY.map(t => `<p>${t}</p>`).join('')}</div>`;

const VIEWS = {serving:viewServing, feed:viewFeed, new:viewName, product:viewProduct, pet:viewPet, settings:viewSettings, report:viewReport, privacy:viewPrivacy};
setSheetView(state => {
  sheetBody.innerHTML = VIEWS[state.kind]();
  if (state.kind === 'settings') paintServerBox(true);
  if (state.step === 'crop') mountCrop($('#cropStage'), state.cropImg, state.crop, $('#f-zoom'));
  if (state.step === 'name' || state.kind === 'new') renderSuggestions();
  if (state.at) { const at = state.at; state.at = null; requestAnimationFrame(() => $('#ab-' + at)?.scrollIntoView({block:'start'})); } // mit einem Abschnitt geöffnet
});
