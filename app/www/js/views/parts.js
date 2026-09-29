/* Recurring building blocks of the views: avatars, thumbnails, the rating slider, the strip of rating dots, the rows of
   „Einkaufen“ and „Vorlieben“, lines told in a card, sync status. */
import {andList, cap, esc} from '../text.js';
import {ago, dayKey, dayLabel, timeStr} from '../dates.js';
import {icon} from '../icons.js';
import {RATINGS, scaleOf, speciesIcon, TEXTURES, TYPES, typeOf} from '../config.js';
import {db, queue} from '../store.js';
import {status} from '../sync.js';
import {getPet, getProduct, petNames, pname, servingPets} from '../derive.js';
import {GOOD, NO, rateCls, ratingsIn, rOf, scoreCls, VERDICTS} from '../smart.js';
import {hasPhoto} from '../photos.js';
import {isPage, sheet} from '../ui/sheet.js';
import {saidHTML, sliderCls, thumbHTML} from '../ui/slider.js';

export function avatar(pet, cls = '') {
  if (!pet) return '';
  if (pet.photo) return `<span class="av ${cls}"><img src="${esc(pet.photo)}" alt="" decoding="async"></span>`;
  return `<span class="av ${cls}">${icon(speciesIcon(pet.species))}</span>`;
}
export function thumbOf(s, p, cls = '') {
  const src = p?.thumb || s?.thumb;
  if (src) return `<img class="thumb ${cls}" src="${esc(src)}" alt="" decoding="async">`;
  if (!p) return `<span class="thumb unknown ${cls}">${icon('camera')}</span>`;
  const letter = (p.brand || p.variety || '?').trim().charAt(0).toUpperCase();
  return `<span class="thumb ${cls}">${esc(letter)}</span>`;
}
/* A thumbnail that opens the packaging photo large (ui/viewer.js) where this phone holds it; otherwise the plain one */
export const photoThumb = (s, p, cls = '') =>
  hasPhoto(s, p)
    ? `<button class="photo-btn" data-action="view-photo" data-s="${s?.id || ''}" data-p="${p?.id || ''}" aria-label="Foto vergrößern">${thumbOf(s, p, cls)}</button>`
    : thumbOf(s, p, cls);
export function nameBlock(s, p, inSheet = false) {
  if (s.status === 'recognizing' || s.status === 'reading')
    // the server is recognising, or the phone is reading the text
    return `<b><span class="skel" style="width:68%"></span></b><small>${s.status === 'reading' ? 'Packung wird gelesen …' : 'Sorte wird erkannt …'}</small>`;
  if (!p) {
    const sub =
      {waiting: 'Wird erkannt, sobald der Server erreichbar ist', failed: 'Nicht erkannt, tippen zum Benennen'}[
        s.status
      ] || 'Tippen zum Benennen';
    return `<b>Unbekanntes Futter</b><small class="${s.status === 'waiting' || s.status === 'noserver' ? '' : 'warn'}">${sub}</small>`; // noserver (mode `lokal`): without the error tone
  }
  // In the sheet the exact time is in the „Serviert“ field right below, so the food type goes here instead
  const meta = [p.variety ? p.brand : '', inSheet ? typeOf(p) : ago(s.servedAt)].filter(Boolean).join(', ');
  return `<b>${esc(pname(p))}</b><small>${esc(meta)}</small>`;
}
const rateBadge = r => `<span class="badge ${rateCls(r)}">${icon('r_' + r)}${RATINGS[r].label}</span>`;
/* The rating slider: the variety's scale as one track from the best level to the worst, a button for each with its
   icon in its colour, and under each the level in one word. Once the meal holds a level, the thumb stands on it,
   ringed in its colour, and under the words stand its name and what the bowl looks like. While a finger is on the
   slider, the thumb lifts onto the level under it and the words under the track say that one (ui/slider.js). A level
   stored from another scale (the type has changed) stands above the slider as a badge until one of its own replaces
   it. The buttons are for the keyboard and a screen reader. */
export function rateSlider(s, pid) {
  const scale = scaleOf(getProduct(s.productId)),
    cur = rOf(s.pets[pid]),
    at = scale.indexOf(cur),
    pet = db.pets.length > 1 ? getPet(pid) : null;
  const stops = scale
      .map(
        r =>
          `<button class="${rateCls(r)}" data-action="rate" data-s="${s.id}" data-p="${pid}" data-r="${r}" aria-pressed="${r === cur}" aria-label="${RATINGS[r].label}. ${RATINGS[r].note}">${icon('r_' + r)}</button>`,
      )
      .join(''),
    words = scale
      .map((r, i) => `<span class="${rateCls(r)}${i === at ? ' on' : ''}">${RATINGS[r].short}</span>`)
      .join('');
  return `${cur && at < 0 ? rateBadge(cur) : ''}<div class="${sliderCls(cur, scale)}" style="--n:${scale.length}${at < 0 ? '' : ';--at:' + at}" role="group" aria-label="${esc(pet ? 'Bewertung für ' + pet.name : 'Bewertung')}" data-r="${cur || ''}">
    <div class="slider-bar"><div class="slider-track">${stops}<span class="slider-thumb"><i>${thumbHTML(cur)}</i></span></div><p class="slider-names" aria-hidden="true">${words}</p></div><div class="slider-say">${saidHTML(cur, scale)}</div></div>`;
}
/* The two ends of a scale, under the counters of the food sheet */
export const scaleEnds = levels =>
  `<p class="ends"><span>${RATINGS[levels[0]].label}</span><span>${RATINGS[levels.at(-1)].label}</span></p>`;
export function resultBadges(s, compact = false) {
  const ids = servingPets(s);
  if (ids.length === 1) {
    const r = rOf(s.pets[ids[0]]);
    if (!r) return `<span class="badge open">offen</span>`;
    return compact
      ? `<span class="badge ic-only ${rateCls(r)}" title="${RATINGS[r].label}">${icon('r_' + r)}</span>`
      : rateBadge(r);
  }
  return `<span class="minis">${ids
    .map(pid => {
      const r = rOf(s.pets[pid]);
      return `<span class="mini ${r ? rateCls(r) : ''}">${avatar(getPet(pid), 'xs')}</span>`;
    })
    .join('')}</span>`;
}
export const closeBtn = `<button class="icon-btn" data-action="close" aria-label="Schließen">${icon('close')}</button>`;
/* The head of what is open. A sheet carries its title and the X; a page carries the back arrow on a bar that stays
   at the top, with the title under it in the style of the header. Once that title has gone under the bar, the bar
   shows it small beside the arrow (ui/sheet.js); the h2 stays the heading, so that copy is hidden from a screen
   reader. Which of the two it is comes from the state, not from the view, so the pet editor reads as a sheet from
   the home page and as a page in the settings. `back` is for a step that is not a level of its own, such as
   cropping. */
export const head = (title, back = 'settings-back') =>
  isPage(sheet)
    ? `<div class="head page-bar"><button class="icon-btn" data-action="${back}" aria-label="Zurück">${icon('back')}</button><span class="bar-title" aria-hidden="true">${title}</span></div>
    <h2 class="page-title">${title}</h2>`
    : `<div class="sh-head"><h2>${title}</h2>${closeBtn}</div>`;
/* A segmented control: one equally wide button per option, the current one pressed. An option is
   [value, label] and may carry an icon and an action of its own. „Eigene“ in the rating reminder is one such,
   because it opens a field instead of setting a value. */
export const segmented = (action, options, current) =>
  `<div class="seg">${options
    .map(
      ([value, label, ic = '', own = action]) =>
        `<button aria-pressed="${value === current}" data-action="${own}" data-v="${esc(value)}">${ic ? icon(ic) : ''}${esc(label)}</button>`,
    )
    .join('')}</div>`;
export function armBtn(key, label, armedLabel, {ic = 'trash', cls = 'danger'} = {}) {
  const on = sheet && sheet.armed === key;
  return `<button class="btn ${on ? 'armed' : cls}" data-action="arm" data-then="${key}">${icon(ic)}${on ? armedLabel : label}</button>`;
}

/* History, on the home page as in the evaluation: the meals by calendar day, newest first.
   „2 Mahlzeiten, 1 Snack“: a treat is not a meal; everything else, including what is still unknown, counts
   as one. */
export function fedLabel(items) {
  const snacks = items.filter(s => s.productId && typeOf(getProduct(s.productId)) === 'Snack').length,
    meals = items.length - snacks;
  return [
    meals && (meals === 1 ? '1 Mahlzeit' : meals + ' Mahlzeiten'),
    snacks && (snacks === 1 ? '1 Snack' : snacks + ' Snacks'),
  ]
    .filter(Boolean)
    .join(', ');
}
export function servingNode(s) {
  // a dot in the rating's colour, hollow = still open
  const rs = servingPets(s)
    .map(pid => rOf(s.pets[pid]))
    .filter(Boolean);
  if (!rs.length) return '<i class="open"></i>';
  const cls = rs.every(r => r === rs[0])
    ? rateCls(rs[0])
    : scoreCls(rs.reduce((a, r) => a + RATINGS[r].score, 0) / rs.length);
  return `<i class="${cls}"></i>`;
}
/* Verlauf: a two-week calendar of the meals handed in, on the home page as on the history page. A day with
   meals leads to them, the days to come are faint, and today carries the accent. */
export function calendarHTML(list) {
  const byDay = new Map();
  for (const s of list) {
    const k = dayKey(s.servedAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); // Monday of the previous week
  const todayKey = dayKey(Date.now());
  let cells = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => `<span class="wd">${w}</span>`).join(''),
    future = false;
  for (let i = 0; i < 14; i++) {
    const k = dayKey(d.getTime()),
      items = byDay.get(k) || [],
      isToday = k === todayKey;
    const dots = items.slice(0, 3).map(servingNode).join('') + (items.length > 3 ? '<b>+</b>' : '');
    const label = dayLabel(d.getTime()) + (items.length ? ', ' + fedLabel(items) : ', nichts eingetragen');
    cells += `<button class="day${items.length ? ' has' : ''}${isToday ? ' today' : ''}${future ? ' future' : ''}" ${items.length ? `data-action="jump-day" data-day="${k}"` : 'disabled'} aria-label="${esc(label)}"><span class="dn">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
    if (isToday) future = true;
    d.setDate(d.getDate() + 1);
  }
  return `<div class="cal">${cells}</div>`;
}
/* Ratings as a strip of the calendar's dots, each in its rating's colour, the oldest on the left and the newest on the
   right: the ratings the verdict rests on, at most STRIP of them, and a „+“ in front where there are more, beyond
   STRIP or older than the window, as the calendar puts it after its dots. What they say in words is its label, so
   nothing rests on colour. {keys, more}: the rating keys oldest first and whether older ones lie beyond (ratingsIn()
   in smart.js). Nothing without a rating. */
const STRIP = 8;
export function strip({keys, more}) {
  if (!keys.length) return '';
  const counts = {};
  for (const r of keys) counts[r] = (counts[r] || 0) + 1;
  const said = evidenceOf({n: keys.length, counts});
  return `<span class="dots strip" role="img" aria-label="${esc(said)}">${more || keys.length > STRIP ? '<b>+</b>' : ''}${keys
    .slice(-STRIP)
    .map(r => `<i class="${rateCls(r)}"></i>`)
    .join('')}</span>`;
}
export function dayGroups(list) {
  const groups = [];
  for (const s of list) {
    const k = dayKey(s.servedAt),
      g = groups.at(-1);
    if (g && g.key === k) g.items.push(s);
    else groups.push({key: k, t: s.servedAt, items: [s]});
  }
  return groups;
}
/* anchors: ids for the days of the history page, where a calendar jumps to; fresh: the meal just served */
export function dayBlocks(groups, {multiHouse = false, fresh = null, anchors = false} = {}) {
  return groups
    .map(
      g => `<div class="tl-day"${anchors ? ` id="d-${g.key}"` : ''}>
    <div class="tl-date"><b>${esc(dayLabel(g.t))}</b><span>${fedLabel(g.items)}</span></div>
    <ol class="tl">${g.items
      .map(s => {
        const p = getProduct(s.productId),
          ids = servingPets(s);
        const meta = [p && p.variety ? p.brand : '', multiHouse ? petNames(ids) : '', s.by ? 'von ' + s.by : '']
          .filter(Boolean)
          .join(', ');
        const title = p
          ? esc(pname(p))
          : s.status === 'recognizing'
            ? 'Wird erkannt …'
            : s.status === 'reading'
              ? 'Wird gelesen …'
              : 'Unbekanntes Futter';
        return `<li style="view-transition-name:tl-${s.id};view-transition-class:${fresh === s.id ? 'fresh' : 'item'}"><button class="row tl-item" data-action="open-serving" data-id="${s.id}">
        <span class="tl-time">${timeStr(s.servedAt)}</span><span class="tl-node">${servingNode(s)}</span>${thumbOf(s, p, 'm')}
        <span class="t-main"><b>${title}</b>${meta ? `<small>${esc(meta)}</small>` : ''}${s.note ? `<small class="tl-note">„${esc(s.note)}“</small>` : ''}</span>
        ${resultBadges(s, true)}</button></li>`;
      })
      .join('')}</ol></div>`,
    )
    .join('');
}

/* A variety to buy, on „Einkaufen“ and in its card on the home page: the thumbnail, the variety and under it the
   brand, for „Gemischt“ the pets it is for, its ratings as a strip and the pin where it was set by hand. A tap opens
   the food sheet, which tells the ratings in words. e: a variety of the model m */
export function shopRow(m, e) {
  const p = e.product,
    mixed = !e.kaufen && e.choice === 'gemischt' ? `nur für ${petNames(e.yes)}` : '',
    sub = cap([p.variety ? p.brand : '', mixed].filter(Boolean).join(', '));
  return `<li><button class="row" data-action="open-product" data-id="${e.id}">${thumbOf(null, p)}
    <span class="t-main"><b>${esc(pname(p))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${strip(ratingsIn(m, [e.id]))}
    ${e.kaufen ? `<span class="pin" title="Von dir festgelegt">${icon('pin')}</span>` : ''}</button></li>`;
}

/* A line of a card, told like the rest of the app: a plain icon, one in a rating's colour or the pet's picture, a
   sentence with what it is about in bold, and under it in words what it rests on, its figures in bold as well. Both
   are HTML: whatever came from a person is escaped by the caller. */
export const lead = (ic, r = '') => `<span class="lead${r ? ' tone ' + rateCls(r) : ''}">${icon(ic)}</span>`;
export const told = (pic, say, why = '') =>
  `<li class="row">${pic}<span>${say}${why ? `<small class="hint why">${why}</small>` : ''}</span></li>`;
export const toldList = rows => (rows.length ? `<ul class="list told">${rows.join('')}</ul>` : '');

/* The name of a comparison of „Vorlieben“, with the food type in brackets except for wet food: „Konsistenz“,
   „Geschmack (Trockenfutter)“, „Marke“, and for treats „Snack-Art“, which names the type already */
const DIMENSION = {konsistenz: 'Konsistenz', geschmack: 'Geschmack', marke: 'Marke'};
const dimName = d =>
  d.kind === 'konsistenz' && d.type !== TYPES[0]
    ? TEXTURES[d.type].title
    : DIMENSION[d.kind] + (d.type === TYPES[0] ? '' : ` (${d.type})`);
/* A habit of „Vorlieben“ as a told line: how varieties are eaten, the varieties in bold and how often under them; or
   whether a pet likes a change, and whether new food goes down well at first or needs a while, each with the pet's
   picture and name where several pets are shown at once */
const upTo = (k, n) => (k < n ? `${k} von ${n}` : `alle ${n}`);
export function habitRow(h, several) {
  const name = id => pname(getProduct(id));
  if (h.kind === 'sosse' || h.kind === 'eager')
    return told(
      lead(h.kind === 'sosse' ? 'drop' : 'r_eager'),
      `Bei ${andList(h.sorts.map(x => `<b>${esc(name(x.id))}</b>`))} ${h.kind === 'sosse' ? 'wird oft nur die Soße geleckt' : 'geht es oft gierig los, dann bleibt der Rest stehen'}.`,
      esc(cap(h.sorts.map(x => `${name(x.id)} ${times(x.k, x.n)}`).join(', '))),
    );
  const pet = several ? getPet(h.pet) : null,
    who = pet ? `<b>${esc(pet.name)}</b> ` : '';
  if (h.kind === 'neugier' || h.kind === 'anlauf')
    return told(
      pet ? avatar(pet, 's') : lead('sparkle'),
      h.kind === 'neugier'
        ? `${who}${pet ? 'ist neugierig' : 'Neugierig'}: Neues kommt erst gut an, dann lässt es nach.`
        : `${who}${pet ? 'braucht' : 'Braucht'} Anlauf: beim ersten Mal bleibt öfter was übrig als später.`,
      `<b>${h.first.good} von ${h.first.n} Sorten</b> beim ersten Mal gut gefressen, danach <b>${h.later.good} von ${h.later.n} Mal</b>.`,
    );
  return told(
    pet ? avatar(pet, 's') : lead('repeat'),
    h.kind === 'abwechslung'
      ? `${who}${pet ? 'mag' : 'Mag'} Abwechslung: nach derselben Sorte hintereinander bleibt öfter was übrig.`
      : `${who}${pet ? 'ist ein Gewohnheitstier' : 'Gewohnheitstier'}: dieselbe Sorte hintereinander kommt besser an.`,
    `Nach derselben Sorte ${times(h.same.good, h.same.n)} gut gefressen, sonst ${upTo(h.other.good, h.other.n)}`,
  );
}
/* A group of „Vorlieben“, on its page and in its card on the home page: the group, how often it went down well in
   words, the strip of its ratings, and „deutlich“ where it is an end of a clear comparison. Not a button: there is
   nothing behind it yet. g: a group of profile() in smart.js within the model m */
const groupRow = (m, g, clear) =>
  `<li class="row"><span class="t-main"><span class="t-top"><b>${esc(g.key)}</b>${clear ? '<span class="badge">deutlich</span>' : ''}</span>
    <small>${cap(`${times(g.good, g.n)} gut gefressen`)}</small></span>${strip(ratingsIn(m, g.ids))}</li>`;

/* A comparison of „Vorlieben“ under its name, its groups ranked, the two ends marked where it is clear */
export const likesList = (m, d) =>
  `<h3 class="label grp">${dimName(d)}</h3><ul class="list likes">${d.groups
    .map((g, i) => groupRow(m, g, d.clear && (i === 0 || i === d.groups.length - 1)))
    .join('')}</ul>`;

/* Sync status in words, for the settings and the notice at the top */
const waitingText = n => (n ? `${n} ${n === 1 ? 'Änderung wartet' : 'Änderungen warten'}` : '');
const ERROR_TITLE = {auth: 'Code stimmt nicht mehr', protocol: 'Update nötig', locked: 'Kurz gesperrt'};
const CHIP_ERROR = {auth: 'Code prüfen', protocol: 'Update nötig', locked: 'Kurz gesperrt'};
export function syncInfo() {
  const st = status,
    wait = waitingText(queue.length);
  if (st.state === 'off')
    return {tone: 'off', title: 'Nicht verbunden', detail: 'Alle Daten bleiben auf diesem Gerät.'};
  if (st.state === 'error') return {tone: 'bad', title: ERROR_TITLE[st.kind] || 'Abgleich gestört', detail: st.message};
  if (st.state === 'offline')
    return {
      tone: 'off',
      title: 'Server nicht erreichbar',
      detail:
        [wait, st.lastOk ? 'zuletzt abgeglichen ' + ago(st.lastOk) : ''].filter(Boolean).join(', ') ||
        'Bist du im WLAN zu Hause oder ist WireGuard an?',
    };
  if (st.state === 'wait') return {tone: 'ok', title: 'Verbinde …', detail: wait || 'Der Abgleich läuft.'};
  return {tone: 'ok', title: 'Verbunden', detail: wait ? wait + ', wird gesendet …' : 'Alles abgeglichen'};
}
/* At the top next to the settings, only when something is waiting or stuck */
export function syncChip() {
  const st = status,
    n = queue.length;
  if (st.state === 'error') return {label: CHIP_ERROR[st.kind] || 'Abgleich gestört', ic: 'alert', bad: true};
  if (st.state === 'offline' && n) return {label: waitingText(n), ic: 'clock', bad: false};
  return null;
}

/* „k von n Mal“ as people say it: „einmal“, „beide Male“, „alle 3 Mal“, „2 von 3 Mal“ */
export const times = (k, n) =>
  n === 1 ? 'einmal' : k < n ? `${k} von ${n} Mal` : n === 2 ? 'beide Male' : `alle ${n} Mal`;
/* What the ratings of a variety say, in words and never as a percentage, so that its verdict explains itself:
   „Alle 3 Mal sofort leer“, „Einmal später leer, einmal halb gegessen“, „4 von 5 Mal gut gefressen“, „2 von 3 Mal
   nur die Soße geleckt“, „Mal so, mal so: 2× gut gefressen, 2× kaum gefressen“. The ratings fall on a side, good
   (from GOOD points), poor (under NO) or in between; the side most of them are on is named, with its level where
   only one level makes it up. x: {n, counts} */
const SIDES = [
  [v => v >= GOOD, 'gut gefressen'],
  [v => v < NO, 'kaum gefressen'],
  [v => v >= NO && v < GOOD, 'nur zum Teil gefressen'],
];
export function evidenceOf(x) {
  if (!x.n) return 'Noch nicht bewertet';
  const levels = Object.keys(x.counts).sort((a, b) => RATINGS[b].score - RATINGS[a].score);
  if (levels.length === 1) return cap(`${times(x.n, x.n)} ${RATINGS[levels[0]].said}`);
  if (x.n === 2) return `Einmal ${RATINGS[levels[0]].said}, einmal ${RATINGS[levels[1]].said}`;
  const sides = SIDES.map(([on, word]) => {
    const l = levels.filter(r => on(RATINGS[r].score));
    return {k: l.reduce((a, r) => a + x.counts[r], 0), said: l.length === 1 ? RATINGS[l[0]].said : word};
  })
    .filter(side => side.k)
    .sort((a, b) => b.k - a.k);
  if (sides[0].k * 2 > x.n) return cap(`${times(sides[0].k, x.n)} ${sides[0].said}`);
  return `Mal so, mal so: ${sides.map(side => `${side.k}× ${side.said}`).join(', ')}`;
}
/* The same after a comma: „Felix, alle 3 Mal gut gefressen“ */
export const lower = t => t.charAt(0).toLowerCase() + t.slice(1);
/* The words under a variety's verdict. In a household whose verdict rests on some of the pets only, it says theirs,
   „Bei Minka alle 3 Mal gut gefressen“, since the others' ratings did not decide it; otherwise what all its ratings
   in the pet filter say. e: a variety of the model */
export function whyOf(e) {
  const by = e.verdict === 'nachkaufen' ? e.yes : e.verdict === 'nicht' ? e.no : [];
  if (!by.length || by.length === Object.keys(e.pets).length) return evidenceOf(e);
  const x = {n: 0, counts: {}};
  for (const id of by) {
    x.n += e.pets[id].n;
    for (const [r, k] of Object.entries(e.pets[id].counts)) x.counts[r] = (x.counts[r] || 0) + k;
  }
  return `Bei ${petNames(by)} ${lower(evidenceOf(x))}`;
}
/* A variety's verdict as text; in a household „Gemischt“ with the pets' names,
   e.g. „Gemischt: Minka ja, Tiger nein“ */
export const verdictLabel = x =>
  x.verdict === 'gemischt' ? `Gemischt: ${petNames(x.yes)} ja, ${petNames(x.no)} nein` : VERDICTS[x.verdict];
