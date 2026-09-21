/* Startseite: Tiere-Leiste und Karten in fester Reihenfolge, ohne Tiere die Willkommensseite. Was auswertet, kommt aus
   model() in derive.js. */
import {$, reduceMotion} from '../dom.js';
import {andList, esc} from '../text.js';
import {addDays, ago, dayKey, dayLabel, weekStart} from '../dates.js';
import {icon, sketch} from '../icons.js';
import {RATINGS, TEXTURES, TYPES, typeOf} from '../config.js';
import {db, loadError, prefs, storageOK} from '../store.js';
import {isConnected} from '../sync.js';
import {getPet, getProduct, lastWeek, model, openPets, pendingServings, petNames, pname, servingPets} from '../derive.js';
import {hintKey, rOf, scoreCls, shopGroups} from '../smart.js';
import {dlg} from '../ui/sheet.js';
import {avatar, dayBlocks, dayGroups, fedLabel, nameBlock, rateRow, reasonOf, servingNode, syncChip, thumbOf} from './parts.js';
import {renderMood} from './mood.js';

/* Startseite neu zeichnen – mit weicher View Transition, wo möglich */
export function update(){
  let done = false;
  const run = () => { if (done) return; done = true; renderHome(); };
  if (!document.startViewTransition || reduceMotion.matches || dlg.open) return run();
  document.body.classList.remove('intro'); // laufende Einblend-Animation beenden, sonst kann die Transition hängen
  try {
    const t = document.startViewTransition(run);
    setTimeout(() => { if (!done) { try { t.skipTransition(); } catch (e) {} run(); } }, 400); // Sicherheitsnetz
  } catch (e) { run(); }
}
export function scrollTop(){ window.scrollTo({top:0, behavior: reduceMotion.matches ? 'auto' : 'smooth'}); }

// fresh: Kennung der gerade servierten Mahlzeit, gleitet beim nächsten Zeichnen herein
// shown: Mahlzeiten im Verlauf, open: aufgeklappte Karten; beides gilt bis zum Neustart der App
const HIST = {step:5, max:20};
export const homeView = {fresh:null, shown:HIST.step, open:{}};

/* Tiere-Leiste: der Filter, erst ab zwei Tieren. Mit einem Tier gibt es nichts zu filtern, verwaltet werden Tiere in den Einstellungen. */
function renderPets(){
  const el = $('#pets');
  if (db.pets.length < 2) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML =
    `<button class="pet" data-action="filter" data-id="all" aria-pressed="${prefs.activePet === 'all'}" style="view-transition-name:av-all"><span class="av all">${icon('paw')}</span><span>Alle</span></button>` +
    db.pets.map(p => `<button class="pet" data-action="filter" data-id="${p.id}" aria-pressed="${prefs.activePet === p.id}" style="view-transition-name:av-${p.id}">${avatar(p)}<span>${esc(p.name)}</span></button>`).join('') +
    `<button class="pet" data-action="add-pet" aria-label="Tier hinzufügen"><span class="av add">${icon('plus')}</span><span>Neu</span></button>`;
}

function renderFab(){
  const fab = $('#fab');
  fab.hidden = !db.pets.length;
  if (!fab.innerHTML) fab.innerHTML = icon('bowl') + 'Füttern';
}
/* Beim Servieren: der Napf im Button füllt sich kurz */
export function fabFill(){
  const fab = $('#fab');
  fab.classList.remove('filled'); void fab.offsetWidth; fab.classList.add('filled');
  setTimeout(() => fab.classList.remove('filled'), 1400);
}

/* Hinweis oben: nur, wenn Änderungen warten oder der Abgleich hakt */
export function renderSyncChip(){
  const el = $('#syncChip'), c = syncChip();
  el.hidden = !c;
  if (!c) return;
  el.classList.toggle('bad', c.bad);
  el.innerHTML = `<span class="pill">${icon(c.ic)}<span>${esc(c.label)}</span></span>`;
  el.setAttribute('aria-label', `${c.label}, Haushalt in den Einstellungen öffnen`);
}

export function renderHome(){
  renderPets(); renderFab(); renderSyncChip(); renderMood();
  $('#home').innerHTML = homeHTML();
  homeView.fresh = null;
}
function homeHTML(){
  const banner = loadError ? `<p class="banner">Die gespeicherten Daten konnten nicht gelesen werden. Bitte starte die App neu. Bis dahin wird nichts gespeichert.</p>`
    : storageOK ? '' : `<p class="banner">In dieser Vorschau wird nichts dauerhaft gespeichert. Öffne die Datei lokal im Browser, dann bleiben deine Daten erhalten.</p>`;
  if (!db.pets.length) return banner + welcomeHTML();
  const pend = pendingServings(), m = db.servings.length ? model() : null;
  let html = banner + (m ? overviewHTML(m) : '');
  if (pend.length) html += pendingHTML(pend);
  if (!m) html += stepsHTML();
  else {
    const ins = insightCard(m);
    html += hintHTML(m) + weekHTML(lastWeek()) +
      `<section class="card" data-sec="hist" style="view-transition-name:sec-hist"><h2>Verlauf</h2><div id="sec-hist">${historyHTML()}</div></section>` +
      card('shop', 'Einkaufen', shopCard(m)) + (ins ? card('ins', 'Erkenntnisse', ins) : '');
  }
  return html;
}

/* Übersicht: das Tier im Filter, bei „Alle“ der Haushalt, mit Bild, Namen und dem Wichtigsten aus dem Modell. Ein Tipp auf
   das Bild öffnet das Tier. Zugeklappt zwei Zeilen mit „…“, ein Tipp auf die Karte zeigt den ganzen Text und zurück
   (der Zustand gilt wie bei den anderen Karten bis zum Neustart). */
function overviewHTML(m){
  const pets = m.overview.pets.map(x => getPet(x.id)), one = pets.length === 1 ? pets[0] : null;
  const pic = one ? `<button class="ov-pic" data-action="open-pet" data-id="${one.id}" aria-label="${esc(one.name)} bearbeiten">${avatar(one, 'lg')}</button>`
                  : `<span class="ov-pic">${pets.slice(0, 2).map(p => avatar(p, 'pair')).join('')}</span>`;
  const tap = m.overview.last ? ` data-action="toggle-overview" aria-expanded="${!!homeView.open.overview}"` : ''; // „Noch nichts serviert.“ ist kurz
  return `<section class="card overview${homeView.open.overview ? ' open' : ''}" data-sec="overview"${tap} style="view-transition-name:sec-overview">${pic}<div class="ov-text"><h2>${esc(petNames(pets.map(p => p.id)))}</h2><p>${overviewText(m.overview)}</p></div></section>`;
}
/* Sätze der Übersicht, das Wichtigste fett. Ein Tier: „Bekam zuletzt vor 2 Std. einen Snack: Käse (Sofort verputzt). Am liebsten
   Lachs, Rind kommt nicht an.“ Mehrere: wer zuletzt was bekam, dann je Tier die liebste Sorte und was nicht ankommt. */
function overviewText({last, pets}){
  if (!last) return 'Noch nichts serviert.';
  const many = pets.length > 1, sort = e => `<b>${esc(pname(e.product))}</b>`, pet = x => esc(getPet(x.id).name);
  const p = getProduct(last.productId), ids = servingPets(last), since = ago(last.servedAt), r = ids.length === 1 && rOf(last.pets[ids[0]]);
  const who = many ? `${esc(petNames(ids))} ${ids.length > 1 ? 'bekamen' : 'bekam'}` : 'Bekam';
  const what = p ? (typeOf(p) === 'Snack' ? 'einen Snack: ' : '') + sort({product:p}) : 'Futter, das noch keinen Namen hat';
  const fed = `${who}${since === 'gerade eben' ? '' : ' zuletzt'} <b>${/^\d/.test(since) ? 'am ' : ''}${esc(since)}</b> ${what}${ids.length > 1 ? '' : ` (${r ? RATINGS[r].label : 'noch offen'})`}.`;
  const favs = pets.filter(x => x.favorite), flops = pets.filter(x => x.flop);
  const taste = !favs.length && !flops.length ? ['Für einen Liebling fehlen noch Bewertungen.']
    : !many ? [favs.length && flops.length ? `Am liebsten ${sort(favs[0].favorite)}, ${sort(flops[0].flop)} kommt nicht an.` : favs.length ? `Am liebsten ${sort(favs[0].favorite)}.` : `${sort(flops[0].flop)} kommt nicht an.`]
    : [favs.length && favs.map((x, i) => `${pet(x)}${i ? '' : ' mag am liebsten'} ${sort(x.favorite)}`).join(', ') + '.',
       flops.length && 'Nicht an kommt ' + flops.map(x => `bei ${pet(x)} ${sort(x.flop)}`).join(', ') + '.'];
  return [fed, ...taste].filter(Boolean).join(' ');
}
/* Auf- oder zuklappen ohne Neuzeichnen: nur die Klasse wechselt, der Text wächst oder schrumpft weich wie bei den anderen Karten */
export function toggleOverview(){
  const sec = $('#home .overview'), p = sec && $('p', sec); if (!p) return;
  const open = homeView.open.overview = !homeView.open.overview, h0 = p.offsetHeight;
  sec.classList.toggle('open', open); sec.setAttribute('aria-expanded', String(open));
  slideHeight(p, h0);
}

const welcomeHTML = () => `<div class="welcome">
  <div class="hero"><img class="logo hell" src="img/schmeckts-zeichen.svg" alt=""><img class="logo dunkel" src="img/schmeckts-zeichen-dunkel.svg" alt=""></div>
  <h2>Was schmeckt deinem Tier?</h2>
  <p>Fotografier beim Füttern die Packung und sag später mit einem Tipp, wie der Napf aussah. So siehst du bald, was wirklich ankommt.</p>
  <div class="btn-col">${prefs.mode // beim ersten Start genau zwei Knöpfe: der Modus
    ? `<button class="btn primary" data-action="add-pet">${icon('plus')}Erstes Tier anlegen</button>
       ${isConnected() ? '' : `<button class="btn soft" data-action="demo">${icon('sparkle')}Mit Beispieldaten ansehen</button>`}`
    : `<button class="btn primary" data-action="mode-local">${icon('phone')}Nur auf diesem Handy</button>
       <button class="btn soft" data-action="connect-form">${icon('house')}Mit Haushalt verbinden</button>`}
  </div></div>`;

const stepsHTML = () => `<section class="card" style="view-transition-name:sec-steps"><h2>So geht’s</h2>
  <div class="steps-hero">${sketch('camera')}</div><ol class="steps">
  <li><span class="n">1</span><p><b>Beim Füttern</b> auf „Füttern“ tippen und die Packung fotografieren. ${isConnected() ? 'Marke und Sorte werden erkannt.' : 'Dann Marke und Sorte eintragen.'}</p></li>
  <li><span class="n">2</span><p><b>Wenn der Napf leer ist</b>, oder eben nicht, hier mit einem Tipp bewerten.</p></li>
  <li><span class="n">3</span><p><b>Nach ein paar Tagen</b> siehst du unter „Einkaufen“, was ankommt, und erste Erkenntnisse.</p></li></ol></section>`;

/* „Wie war’s?“: nur, solange Bewertungen offen sind */
function pendingHTML(list){
  const multiHouse = db.pets.length > 1;
  return `<section class="card" style="view-transition-name:sec-pend"><h2>Wie war’s?</h2><ul>` +
    list.map(s => {
      const p = getProduct(s.productId), ids = openPets(s), multi = ids.length > 1;
      const head = `<button class="pend-head" data-action="open-serving" data-id="${s.id}">${thumbOf(s, p)}<span class="t-main">${nameBlock(s, p)}</span>${multiHouse && !multi ? avatar(getPet(ids[0]), 'sm') : ''}</button>`;
      const rows = ids.map(pid => `<div class="pet-rate">${multi ? `<div class="pet-label">${avatar(getPet(pid), 'xs')}${esc(getPet(pid).name)}</div>` : ''}${rateRow(s, pid)}</div>`).join('');
      return `<li class="pend" data-id="${s.id}" style="view-transition-name:sv-${s.id};view-transition-class:${homeView.fresh === s.id ? 'fresh' : 'item'}">${head}${rows}</li>`;
    }).join('') + `</ul></section>`;
}

/* Karte mit „Alle anzeigen“: zugeklappt das Wichtigste, aufgeklappt alles */
function card(key, title, {body, more, foot = ''}){
  const open = !!homeView.open[key];
  return `<section class="card" data-sec="${key}" style="view-transition-name:sec-${key}"><h2>${title}</h2>
    <div class="card-body" id="sec-${key}">${body}</div>${more ? `<button class="card-btn" data-action="expand" data-v="${key}"
      aria-expanded="${open}" aria-controls="sec-${key}">${open ? 'Weniger anzeigen' : 'Alle anzeigen'}</button>` : ''}${foot}</section>`;
}
/* Auf- oder zuklappen: Inhalt tauschen, die Karte wächst oder schrumpft weich (220 ms, ease-out), bei reduzierter Bewegung
   sofort. Ohne Neuzeichnen der Seite, der Knopf bleibt stehen (Fokus bei Bedienung per Tastatur). Nichts wird gespeichert. */
export function expandCard(key){
  if (!CARDS[key]) return;
  homeView.open[key] = !homeView.open[key];
  const sec = $(`[data-sec="${key}"]`), content = CARDS[key](model());
  if (!sec || !content) return update();
  const body = $('.card-body', sec), btn = $('[data-action=expand]', sec), h0 = body.offsetHeight;
  body.innerHTML = content.body;
  btn.textContent = homeView.open[key] ? 'Weniger anzeigen' : 'Alle anzeigen';
  btn.setAttribute('aria-expanded', String(homeView.open[key]));
  slideHeight(body, h0);
}
/* el wächst oder schrumpft weich von h0 auf seine neue Höhe (220 ms, ease-out) und trägt dabei „animating“; bei
   reduzierter Bewegung sofort */
function slideHeight(el, h0){
  const h1 = el.offsetHeight;
  if (reduceMotion.matches || h1 === h0) return;
  el.classList.add('animating');
  el.style.height = h0 + 'px'; void el.offsetHeight;
  el.style.transition = 'height .22s ease-out'; el.style.height = h1 + 'px';
  let ended = false;
  const end = e => {
    if (ended || (e && e.target !== el)) return;
    ended = true; el.style.height = ''; el.style.transition = ''; el.classList.remove('animating');
    el.removeEventListener('transitionend', end);
  };
  el.addEventListener('transitionend', end); setTimeout(end, 300);
}

/* Hinweis: der mit dem höchsten Vorrang, ein Satz, eine Begründung, die Knöpfe */
const HINT_TITLES = {appetit:'Appetit', stop:'Nicht mehr kaufen?', sosse:'Frisst meist nur die Soße', liebling:'Neuer Liebling'};
const sortName = p => p.variety && p.brand ? `${p.variety} von ${p.brand}` : pname(p);
function hintHTML(m){
  const h = m.hints[0]; if (!h) return '';
  const e = m.byId.get(h.id), name = e && esc(sortName(e.product)), pet = h.pet && getPet(h.pet);
  const hide = `<button class="btn soft" data-action="hide-hint" data-v="${esc(hintKey(h))}">Ausblenden</button>`;
  const set = (v, label) => `<button class="btn primary" data-action="hint-kaufen" data-id="${e.id}" data-v="${v}">${label}</button>`;
  let say, why, btns;
  if (h.kind === 'appetit') {
    [say, why, btns] = [`${esc(pet.name)} frisst seit ein paar Tagen schlechter als sonst.`, `Die letzten ${h.n} Bewertungen im Schnitt ${h.recent} %, sonst ${h.usual} %.`, hide];
  } else if (h.kind === 'sosse') {
    const x = e.pets[h.pet];
    [say, why, btns] = [`${esc(pet.name)} frisst bei ${name} meist nur die Soße.`, `${x.counts.sosse} von ${x.n} Bewertungen „${RATINGS.sosse.label}“`, hide];
  } else {
    why = (pet ? pet.name + ': ' : '') + `${reasonOf(e)}, Wertung ${e.pct} %`;
    [say, btns] = h.kind === 'stop' ? [`${name} kommt nicht gut an.`, set('nicht', 'Nicht mehr kaufen') + hide]
                                    : [`${name} kommt richtig gut an.`, set('immer', 'Immer kaufen') + hide];
  }
  return `<section class="card" data-sec="hint" style="view-transition-name:sec-hint"><h2>${HINT_TITLES[h.kind]}</h2>
    <p class="say">${say}</p><p class="why">${esc(why)}</p><div class="btn-row">${btns}</div></section>`;
}

/* Letzte Woche: Rückblick auf die Vorwoche (review() in smart.js), nur Fakten; „Schließen“ merkt sich das Gerät */
function duelText(feeders){ // die meisten zuerst; führen mehrere gleichauf, heißt es „Gleichstand“
  const times = x => `${esc(x.name)} ${x.n}×`, lead = feeders.filter(x => x.n === feeders[0].n);
  if (lead.length < 2) return `Gefüttert: ${feeders.map(times).join(', ')}`;
  return [`Gleichstand: ${esc(andList(lead.map(x => x.name)))} je ${lead[0].n}×`, ...feeders.slice(lead.length).map(times)].join(', ');
}
function weekHTML(w){
  if (!w) return '';
  const sort = id => esc(pname(getProduct(id)));
  const lines = [`${w.meals}× gefüttert, ${w.rated} bewertet`,
    ...w.best.slice(0, 3).map(x => `${esc(getPet(x.pet).name)} mochte am liebsten ${sort(x.id)}`),
    ...w.favorites.slice(0, 2).map(id => `Neuer Liebling: ${sort(id)}`)].map(t => `<p class="say">${t}</p>`);
  if (w.feeders.length > 1) lines.push(`<p class="say duel">${icon('trophy')}<span>${duelText(w.feeders)}</span></p>`);
  return `<section class="card" data-sec="week" style="view-transition-name:sec-week"><h2>Letzte Woche</h2>
    <div class="week">${lines.join('')}</div><button class="card-btn" data-action="close-week" data-v="${dayKey(w.start)}">Schließen</button></section>`;
}

/* Einkaufen: zugeklappt bis zu 3 Sorten zum Nachkaufen (auch „Gemischt“, mit „für …“) und bis zu 2, die nicht
   mehr gekauft werden; aufgeklappt alle Sorten in drei Gruppen mit Wertungsbalken. Eine eigene Einstellung ordnet die
   Sorte ein und zeigt die Stecknadel (Gruppen: shopGroups() in smart.js). Fußzeile „Geschmack bekannt“ ab 3 Sorten,
   aufgeklappt darunter „Als Liste teilen“. */
const SHOP = [['nachkaufen', 'Nachkaufen', 3], ['beobachten', 'Beobachten', 0], ['nicht', 'Nicht mehr kaufen', 2]];
const genitive = name => name + (/[sßxz]$/i.test(name) ? '’' : 's');
function tasteHTML(m){
  const {known, total} = m.taste, pet = getPet(m.pet) || (db.pets.length === 1 ? db.pets[0] : null);
  if (total < 3) return '';
  return `<p class="taste">${pet ? esc(genitive(pet.name)) + ' Geschmack' : 'Geschmack eurer Tiere'}: ${known} von ${total} Sorten bekannt<span class="meter"><i style="--w:${Math.round(known / total * 100)}%"></i></span></p>`;
}
function shopRow(e, bars){
  const p = e.product, cls = scoreCls(e.score);
  const sub = [p.variety ? p.brand : '', !e.kaufen && e.choice === 'gemischt' ? `für ${petNames(e.yes)}` : ''].filter(Boolean).join(', ');
  return `<li><button class="row" data-action="open-product" data-id="${e.id}">${thumbOf(null, p)}
    <span class="t-main"><b>${esc(pname(p))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${bars ? `<span class="bar ${cls}"><i style="--w:${Math.max(4, e.pct)}%"></i></span>` : ''}</span>
    ${e.kaufen ? `<span class="pin" title="Eigene Einstellung">${icon('pin')}</span>` : ''}${e.n ? `<span class="pct">${e.pct}<small>%</small></span>` : ''}</button></li>`;
}
function shopCard(m){
  const g = shopGroups(m), open = !!homeView.open.shop;
  if (!g.nachkaufen.length && !g.nicht.length)
    return {body:'<p class="card-line">Noch zu wenig Bewertungen. Nach ein paar Mahlzeiten siehst du hier, was ankommt.</p>' + tasteHTML(m), more:false};
  const body = SHOP.map(([k, title, max]) => {
    const list = open ? g[k] : g[k].slice(0, max);
    return list.length ? `<h3 class="grp">${title}</h3><ul class="shop">${list.map(e => shopRow(e, open)).join('')}</ul>` : '';
  }).join('') + tasteHTML(m) + (open ? '<button class="card-btn" data-action="share-list">Als Liste teilen</button>' : '');
  return {body, more: g.beobachten.length > 0 || g.nachkaufen.length > 3 || g.nicht.length > 2};
}

/* Erkenntnisse: zugeklappt die wichtigste, aufgeklappt alle; ohne Erkenntnis keine Karte. Unten führt ein Textknopf
   zur Auswertung. */
const INSIGHT = {marke:['award', 'Marke'], konsistenz:['layers', 'Konsistenz'], geschmack:['fish', 'Geschmack'], sosse:['drop']};
function insightHTML(i, m){ // ein Satz, Hervorhebungen in <b>
  if (i.kind === 'sosse') return `Bei <b>${esc(pname(m.byId.get(i.id).product))}</b> wird meist nur die Soße geschleckt.`;
  const label = i.kind === 'konsistenz' ? TEXTURES[i.type].title : INSIGHT[i.kind][1] + (i.type === TYPES[0] ? '' : ` (${i.type})`); // „Snack-Art“ nennt die Art schon
  return `${label}: <b>${esc(i.best.key)}</b> kommt am besten an (${i.best.pct} %), <b>${esc(i.worst.key)}</b> am wenigsten (${i.worst.pct} %).`;
}
function insightCard(m){
  if (!m.insights.length) return null;
  const list = homeView.open.ins ? m.insights : m.insights.slice(0, 1);
  return {body:`<ul class="ins">${list.map(i => `<li><span class="dot">${icon(INSIGHT[i.kind][0])}</span><span>${insightHTML(i, m)}</span></li>`).join('')}</ul>`,
    more: m.insights.length > 1, foot:`<button class="card-btn" data-action="open-report">Zur Auswertung</button>`};
}
const CARDS = {shop:shopCard, ins:insightCard};

/* Verlauf: Zwei-Wochen-Kalender und darunter die letzten Mahlzeiten (Bausteine in parts.js) */
function calendarHTML(list){
  const byDay = new Map();
  for (const s of list) { const k = dayKey(s.servedAt); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(s); }
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7 - 7);           // Montag der Vorwoche
  const todayKey = dayKey(Date.now());
  let cells = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => `<span class="wd">${w}</span>`).join(''), future = false;
  for (let i = 0; i < 14; i++) {
    const k = dayKey(d.getTime()), items = byDay.get(k) || [], isToday = k === todayKey;
    const dots = items.slice(0, 3).map(servingNode).join('') + (items.length > 3 ? '<b>+</b>' : '');
    const label = dayLabel(d.getTime()) + (items.length ? ', ' + fedLabel(items) : ', nichts eingetragen');
    cells += `<button class="day${items.length ? ' has' : ''}${isToday ? ' today' : ''}${future ? ' future' : ''}" ${items.length ? `data-action="jump-day" data-day="${k}"` : 'disabled'} aria-label="${esc(label)}"><span class="dn">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
    if (isToday) future = true;
    d.setDate(d.getDate() + 1);
  }
  return `<div class="cal">${cells}</div>`;
}
/* Mahlzeiten im Tier-Filter, neueste zuerst (db.servings ist nach Zeit absteigend sortiert): die ersten n für den
   Zeitstrahl und alle seit since für den Kalender. Beides in einem Durchgang, der abbricht, sobald beides steht. */
const visibleServings = () => db.servings.filter(s => servingPets(s).length);
function someServings(n, since){
  const first = [], recent = [];
  for (const s of db.servings) {
    if (first.length >= n && s.servedAt < since) break;
    if (!servingPets(s).length) continue;
    if (first.length < n) first.push(s);
    if (s.servedAt >= since) recent.push(s);
  }
  return {first, recent};
}
/* Unter dem Kalender die letzten Mahlzeiten, nach Tagen gruppiert; „Weitere anzeigen“ zeigt jeweils HIST.step mehr,
   bis HIST.max, danach führt „Ganzer Verlauf“ zur Auswertung. Der Kalender zeigt immer seine zwei Wochen. */
function historyHTML(){
  const {first, recent} = someServings(homeView.shown + 1, addDays(weekStart(Date.now()), -7)); // eine mehr: gibt es noch welche?
  const multiHouse = db.pets.length > 1 && prefs.activePet === 'all';
  const shown = first.slice(0, homeView.shown);
  return calendarHTML(recent) +
    (shown.length ? dayBlocks(dayGroups(shown), {multiHouse, fresh:homeView.fresh, anchors:true}) : `<p class="empty">${sketch('empty')}<span>Noch nichts serviert.</span></p>`) +
    (homeView.shown >= HIST.max ? `<button class="card-btn" data-action="open-report" data-v="hist">Ganzer Verlauf</button>`
      : first.length > shown.length ? `<button class="card-btn" data-action="more-history">Weitere anzeigen</button>` : '');
}
/* „Weitere anzeigen“: HIST.step Mahlzeiten mehr, höchstens HIST.max; mit day so viele, dass dieser Tag dabei ist
   (Sprung aus dem Kalender). Neu gezeichnet wird nur der Verlauf. Gibt die erste neu gezeigte Mahlzeit zurück. */
export function showMoreHistory(day){
  const all = visibleServings(), was = homeView.shown;
  const upto = day ? all.findLastIndex(s => dayKey(s.servedAt) === day) + 1 : Math.min(was + HIST.step, HIST.max);
  if (upto <= was) return null;
  homeView.shown = upto;
  const box = $('#sec-hist');
  if (box) box.innerHTML = historyHTML(); else renderHome();
  return $(`.tl-item[data-id="${all[was].id}"]`);
}
