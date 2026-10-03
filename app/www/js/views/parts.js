// Building blocks shared by the views
import {andList, cap, esc} from '../text.js';
import {DAY, addDays, ago, clockStr, dayKey, dayLabel, dayStart} from '../dates.js';
import {icon} from '../icons.js';
import {observationOf, RATINGS, scaleOf, speciesIcon, TEXTURES, TYPES, typeOf} from '../config.js';
import {db} from '../store.js';
import {held, pending, status} from '../sync.js';
import {getPet, getProduct, isObservation, observedPets, petNames, pname, servingPets, timeOf} from '../derive.js';
import {GOOD, NO, rateCls, rateTone, ratingsIn, rOf, scoreCls, VERDICTS} from '../smart.js';
import {hasPhoto} from '../photos.js';
import {isPage, sheet} from '../ui/sheet.js';
import {sliderCls, thumbHTML} from '../ui/slider.js';

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
export const photoThumb = (s, p, cls = '') =>
  hasPhoto(s, p)
    ? `<button class="photo-btn" data-action="view-photo" data-s="${s?.id || ''}" data-p="${p?.id || ''}" aria-label="Foto vergrößern">${thumbOf(s, p, cls)}</button>`
    : thumbOf(s, p, cls);
export function nameBlock(s, p, inSheet = false) {
  if (s.status === 'recognizing' || s.status === 'reading')
    return `<b><span class="skel" style="width:68%"></span></b><small>${s.status === 'reading' ? 'Packung wird gelesen …' : 'Sorte wird erkannt …'}</small>`;
  if (!p) {
    const read = s.guess?.variety || s.guess?.brand,
      sub = read
        ? `Vermutlich <b>${esc(read)}</b>, tippen zum Bestätigen`
        : {waiting: 'Wird erkannt, sobald der Server erreichbar ist', failed: 'Nicht erkannt, tippen zum Benennen'}[
            s.status
          ] || 'Tippen zum Benennen';
    return `<b>Unbekanntes Futter</b><small class="${s.status === 'waiting' || s.status === 'noserver' ? '' : 'warn'}">${sub}</small>`; // noserver is local mode, not an error
  }
  // in the sheet the time field sits right below, so show the type instead
  const meta = [p.variety ? p.brand : '', inSheet ? typeOf(p) : since(s.servedAt, Date.now())]
    .filter(Boolean)
    .join(', ');
  return `<b>${esc(pname(p))}</b><small>${esc(meta)}</small>`;
}
const rateBadge = r => `<span class="badge ${rateCls(r)}">${icon('r_' + r)}${RATINGS[r].label}</span>`;
// A level from another scale (the type changed) shows as a badge above the slider
export function rateSlider(s, pid) {
  const scale = scaleOf(getProduct(s.productId)),
    cur = rOf(s.pets[pid]),
    at = scale.indexOf(cur),
    pet = db.pets.length > 1 ? getPet(pid) : null;
  const stops = scale
      .map(
        r =>
          `<button class="${rateCls(r)}" data-action="rate" data-s="${s.id}" data-p="${pid}" data-r="${r}" aria-pressed="${r === cur}" aria-label="${RATINGS[r].label}">${icon('r_' + r)}</button>`,
      )
      .join(''),
    wash = scale
      .map((r, i) => `var(--${rateTone(r)}-soft) ${(((i + 0.5) / scale.length) * 100).toFixed(1)}%`)
      .join(', '),
    words = scale
      .map((r, i) => {
        const [first, ...rest] = RATINGS[r].short.split(' ');
        return `<span class="${rateCls(r)}${i === at ? ' on' : ''}"><b>${first}</b><small>${rest.join(' ')}</small></span>`;
      })
      .join('');
  return `${cur && at < 0 ? rateBadge(cur) : ''}<div class="${sliderCls(cur, scale)}" style="--n:${scale.length};--wash:${wash}${at < 0 ? '' : ';--at:' + at}" role="group" aria-label="${esc(pet ? 'Bewertung für ' + pet.name : 'Bewertung')}" data-r="${cur || ''}">
    <div class="slider-bar"><div class="slider-track">${stops}<span class="slider-thumb"><i>${thumbHTML(cur)}</i></span></div><p class="slider-names" aria-hidden="true">${words}</p></div></div>`;
}
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
// no arming: it can be undone from the toast
export const deleteMealBtn = id =>
  `<button class="btn quiet" data-action="delete-serving" data-id="${id}">${icon('trash')}Eintrag löschen</button>`;
/* Sheet or page head, decided by the state so one view can be both. back: for a step that is not a level of its
   own, such as cropping. end: a button at the end of the bar. */
export const head = (title, back = 'settings-back', end = '') =>
  isPage(sheet)
    ? `<div class="head page-bar"><button class="icon-btn" data-action="${back}" aria-label="Zurück">${icon('back')}</button><span class="bar-title" aria-hidden="true">${title}</span>${end}</div>
    <h2 class="page-title">${title}</h2>`
    : `<div class="sh-head"><h2>${title}</h2>${end}${closeBtn}</div>`;
// a card's heading with the way to its page at its end; label, for screen readers, starts with the visible word
export const cardHead = (title, action, label, more = 'Alle', v = '') =>
  `<div class="card-head"><h2>${title}</h2><button class="more" data-action="${action}"${v ? ` data-v="${v}"` : ''} aria-label="${label}">${more}${icon('chevron')}</button></div>`;
export const forWhom = pet => (db.pets.length > 1 ? ` für ${pet ? esc(getPet(pet).name) : 'alle Tiere'}` : '');
// option: [value, label, icon?, action?]
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

// pets rated in one tone keep it, as Nur Soße and Ein bissl average out below it
const sameTone = rs => rs.every(r => rateTone(r) === rateTone(rs[0]));
// treats are not meals; anything else, unknown food included, counts as one
function fedLabel(items) {
  const fed = items.filter(x => !isObservation(x)),
    seen = items.length - fed.length,
    snacks = fed.filter(s => s.productId && typeOf(getProduct(s.productId)) === 'Snack').length,
    meals = fed.length - snacks;
  return [
    meals && (meals === 1 ? '1\u00a0Mahlzeit' : meals + '\u00a0Mahlzeiten'),
    snacks && (snacks === 1 ? '1\u00a0Snack' : snacks + '\u00a0Snacks'),
    seen && (seen === 1 ? '1\u00a0Beobachtung' : seen + '\u00a0Beobachtungen'),
  ]
    .filter(Boolean)
    .join(', ');
}
export const whoObserved = ids => andList(ids.map(id => getPet(id)?.name).filter(Boolean), 'oder');
function servingNode(s) {
  const rs = servingPets(s)
    .map(pid => rOf(s.pets[pid]))
    .filter(Boolean);
  if (!rs.length) return '<i class="open"></i>';
  const cls = sameTone(rs) ? rateCls(rs[0]) : scoreCls(rs.reduce((a, r) => a + RATINGS[r].score, 0) / rs.length);
  return `<i class="${cls}"></i>`;
}
// its height is the points, averaged over the pets on it
function servingBar(s) {
  const rs = servingPets(s)
    .map(pid => rOf(s.pets[pid]))
    .filter(Boolean);
  if (!rs.length) return '<i class="open"></i>';
  const v = rs.reduce((a, r) => a + RATINGS[r].score, 0) / rs.length;
  return `<i class="${sameTone(rs) ? rateCls(rs[0]) : scoreCls(v)}" style="--v:${v / 100}"></i>`;
}
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
// two weeks from last Monday, or with week the seven days up to today in one row
export function calendarHTML(list, week = false) {
  const byDay = new Map();
  for (const s of list) {
    const k = dayKey(s.servedAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (week ? 6 : ((d.getDay() + 6) % 7) + 7));
  const todayKey = dayKey(Date.now());
  let names = '',
    cells = '',
    future = false;
  for (let i = 0; i < (week ? 7 : 14); i++) {
    const k = dayKey(d.getTime()),
      items = byDay.get(k) || [],
      isToday = k === todayKey;
    if (i < 7) names += `<span class="wd">${WEEKDAYS[(d.getDay() + 6) % 7]}</span>`;
    const bars = items.slice(0, 3).map(servingBar).join('') + (items.length > 3 ? '<b>+</b>' : '');
    const label = dayLabel(d.getTime()) + (items.length ? ', ' + fedLabel(items) : ', nichts eingetragen');
    cells += `<button class="day${items.length ? ' has' : ''}${isToday ? ' today' : ''}${future ? ' future' : ''}" ${items.length ? `data-action="jump-day" data-day="${k}"` : 'disabled'} aria-label="${esc(label)}"><span class="dn">${d.getDate()}</span><span class="bars">${bars}</span></button>`;
    if (isToday) future = true;
    d.setDate(d.getDate() + 1);
  }
  return `<div class="cal">${names}${cells}</div>`;
}
/* {keys, more}: from ratingsIn(), oldest first. open: ratings the verdict still lacks, drawn hollow. The label says
   it in words. */
const STRIP = 8;
export function strip({keys, more}, open = 0) {
  if (!keys.length) return '';
  const counts = {};
  for (const r of keys) counts[r] = (counts[r] || 0) + 1;
  const said =
    evidenceOf({n: keys.length, counts}) +
    (open ? `, noch ${open === 1 ? 'eine Bewertung' : 'zwei Bewertungen'} offen` : '');
  return `<span class="bars strip" role="img" aria-label="${esc(said)}">${more || keys.length > STRIP ? '<b>+</b>' : ''}${keys
    .slice(-STRIP)
    .map(r => `<i class="${rateCls(r)}" style="--v:${RATINGS[r].score / 100}"></i>`)
    .join('')}${'<i class="open"></i>'.repeat(open)}</span>`;
}
export function dayGroups(list) {
  const groups = [];
  for (const s of list) {
    const k = dayKey(timeOf(s)),
      g = groups.at(-1);
    if (g && g.key === k) g.items.push(s);
    else groups.push({key: k, t: timeOf(s), items: [s]});
  }
  return groups;
}
function observationItem(o, multiHouse, fresh) {
  const kind = observationOf(o.kind),
    ids = observedPets(o),
    meta = [multiHouse || ids.length > 1 ? whoObserved(ids) : '', o.by ? 'von ' + o.by : ''].filter(Boolean).join(', ');
  return `<li style="view-transition-name:tl-${o.id};view-transition-class:${fresh === o.id ? 'fresh' : 'item'}"><button class="row tl-item" data-action="open-observation" data-id="${o.id}">
        <span class="tl-time">${clockStr(o.at)}</span><span class="tl-node"><i></i></span>${obsThumb(o.kind)}
        <span class="t-main"><b>${esc(kind.label)}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</span></button></li>`;
}
// anchors: day ids the calendar jumps to; fresh: id of the entry just made
export function dayBlocks(groups, {multiHouse = false, fresh = null, anchors = false} = {}) {
  return groups
    .map(
      g => `<div class="tl-day"${anchors ? ` id="d-${g.key}"` : ''}>
    <div class="tl-date"><b>${esc(dayLabel(g.t))}</b><span>${fedLabel(g.items)}</span></div>
    <ol class="tl">${g.items
      .map(s => {
        if (isObservation(s)) return observationItem(s, multiHouse, fresh);
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
        <span class="tl-time">${clockStr(s.servedAt)}</span><span class="tl-node">${servingNode(s)}</span>${thumbOf(s, p, 'm')}
        <span class="t-main"><b>${title}</b>${meta ? `<small>${esc(meta)}</small>` : ''}${s.note ? `<small class="tl-note">„${esc(s.note)}“</small>` : ''}</span>
        ${resultBadges(s, true)}</button></li>`;
      })
      .join('')}</ol></div>`,
    )
    .join('');
}

// e: a variety of the model m
export function shopRow(m, e) {
  const p = e.product,
    mixed = !e.kaufen && e.choice === 'gemischt' ? `nur für ${petNames(e.yes)}` : '',
    sub = cap([p.variety ? p.brand : '', mixed].filter(Boolean).join(', '));
  return `<li><button class="row" data-action="open-product" data-id="${e.id}">${thumbOf(null, p)}
    <span class="t-main"><b>${esc(pname(p))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${strip(ratingsIn(m, [e.id]))}
    ${e.kaufen ? `<span class="pin" title="Von dir festgelegt">${icon('pin')}</span>` : ''}</button></li>`;
}

// the two sides, on „Vorlieben“ and when buying, always with this icon in this tone
export const SIDE = {top: ['champ', 'r-good'], flop: ['flop', 'r-bad']};
export const sideIcon = side => icon(...SIDE[side]);
// say and why are HTML; the caller escapes user text
export const lead = ic => `<span class="lead">${icon(ic)}</span>`;
export const main = (title, sub = '', id = '') =>
  `<span class="t-main"><b>${title}</b>${sub ? `<small${id ? ` id="${id}"` : ''}>${sub}</small>` : ''}</span>`;
export const under = html => `<div class="set-under">${html}</div>`;
// a card under its label, as in the settings: set-group for rows with icons, pad for anything else
export const group = (label, html, cls = 'pad') =>
  `${label ? `<span class="label">${label}</span>` : ''}<div class="group ${cls}">${html}</div>`;
// without the card, where fields stand on the ground beside it
export const labelled = (label, html) => `<span class="label">${label}</span>${html}`;
// the whole row opens the picker; field: the invisible native input, shown: its value as we say it
export const pickRow = (ic, title, sub, shown, field) =>
  `<div class="row set-row pick-row" data-action="pick">${lead(ic)}${main(title, sub)}<span class="pick-val">${shown}</span>${icon('chevron', 'chev')}${field}</div>`;
// an icon in place of a picture, where products have their photo and pets their avatar: always a circle
export const sign = (ic, tone = '') => `<span class="sign ${tone}">${icon(ic)}</span>`;
export const obsThumb = kind => sign(observationOf(kind).icon, `o-${kind}`);
export const told = (pic, say, why = '') =>
  `<li class="row">${pic}<span>${say}${why ? `<small class="hint why">${why}</small>` : ''}</span></li>`;
export const toldList = rows => (rows.length ? `<ul class="list told">${rows.join('')}</ul>` : '');
export const toldBtn = (id, pic, say, why = '', end = '') =>
  `<li><button class="row" data-action="open-product" data-id="${id}">${pic}<span class="said">${say}${why ? `<small class="hint why">${why}</small>` : ''}</span>${end}</button></li>`;

// no bracket for wet food (TYPES[0]); other types' textures have a title of their own
const DIMENSION = {konsistenz: 'Konsistenz', geschmack: 'Geschmack', marke: 'Marke'};
const dimName = d =>
  d.kind === 'konsistenz' && d.type !== TYPES[0]
    ? TEXTURES[d.type].title
    : DIMENSION[d.kind] + (d.type === TYPES[0] ? '' : ` (${d.type})`);
const upTo = (k, n) => (k < n ? `${k} von ${n}` : `alle ${n}`);
export function habitRow(h, several) {
  const name = id => pname(getProduct(id));
  if (h.kind === 'sosse' || h.kind === 'eager')
    return told(
      sign(h.kind === 'sosse' ? 'drop' : 'r_eager'),
      `Bei <b>${esc(andList(h.sorts.map(x => name(x.id))))}</b> ${h.kind === 'sosse' ? 'wird oft nur die Soße geleckt' : 'wird oft nur ein bissl gefressen, dann bleibt der Rest stehen'}.`,
      esc(cap(h.sorts.map(x => `${name(x.id)} ${times(x.k, x.n)}`).join(', '))) + '.',
    );
  const pet = several ? getPet(h.pet) : null,
    who = pet ? `<b>${esc(pet.name)}</b> ` : '';
  if (h.kind === 'neugier' || h.kind === 'anlauf')
    return told(
      pet ? avatar(pet) : sign('sparkle'),
      h.kind === 'neugier'
        ? `${who}${pet ? 'ist neugierig' : 'Neugierig'}: Neues kommt erst gut an, dann lässt es nach.`
        : `${who}${pet ? 'braucht' : 'Braucht'} Anlauf: beim ersten Mal bleibt öfter was übrig als später.`,
      `<b>${h.first.good} von ${h.first.n} Sorten</b> beim ersten Mal gut gefressen, danach ${h.later.good} von ${h.later.n} Mal.`,
    );
  return told(
    pet ? avatar(pet) : sign('repeat'),
    h.kind === 'abwechslung'
      ? `${who}${pet ? 'mag' : 'Mag'} Abwechslung: kurz nach derselben Sorte bleibt öfter was übrig.`
      : `${who}${pet ? 'ist ein Gewohnheitstier' : 'Gewohnheitstier'}: dieselbe Sorte kurz hintereinander kommt besser an.`,
    `Kurz nach derselben Sorte <b>${times(h.same.good, h.same.n)}</b> gut gefressen, sonst ${upTo(h.other.good, h.other.n)}.`,
  );
}
// not a button, nothing opens from it yet. g: a group of profile() in smart.js
const groupRow = (m, g, clear) =>
  `<li class="row"><span class="t-main"><span class="t-top"><b>${esc(g.key)}</b>${clear ? '<span class="badge">deutlich</span>' : ''}</span>
    <small>${cap(`${times(g.good, g.n)} gut gefressen`)}</small></span>${strip(ratingsIn(m, g.ids))}</li>`;

export const likesList = (m, d) =>
  `<h3 class="label grp">${dimName(d)}</h3><ul class="list likes">${d.groups
    .map((g, i) => groupRow(m, g, d.clear && (i === 0 || i === d.groups.length - 1)))
    .join('')}</ul>`;

const waitingText = n => (n ? `${n} ${n === 1 ? 'Änderung wartet' : 'Änderungen warten'}` : '');
const ERROR_TITLE = {auth: 'Code prüfen', protocol: 'Update nötig', locked: 'Kurz gesperrt'};
const CHIP_ERROR = {auth: 'Code prüfen', protocol: 'Update nötig', locked: 'Kurz gesperrt'};
// collections held back until the server is updated
const HELD = {observations: 'Beobachtungen'};
function heldText() {
  const kinds = [...new Set(held().map(x => HELD[x.c] || 'Neue Einträge'))];
  return kinds.length ? `${andList(kinds)} warten auf ein Update des Servers` : '';
}
export function syncInfo() {
  const st = status,
    wait = waitingText(pending().length);
  if (st.state === 'off') return {tone: 'off', title: 'Nicht verbunden', detail: ''}; // the foot says where the data stays
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
  const later = heldText();
  return {
    tone: 'ok',
    title: 'Verbunden',
    detail: wait ? wait + ', wird gesendet …' : later ? `Abgeglichen. ${later}.` : 'Alles abgeglichen',
  };
}
export function syncChip() {
  const st = status,
    n = pending().length;
  if (st.state === 'error') return {label: CHIP_ERROR[st.kind] || 'Abgleich gestört', ic: 'alert', bad: true};
  if (st.state === 'offline' && n) return {label: waitingText(n), ic: 'clock', bad: false};
  return null;
}

export function since(t, now) {
  const day = dayStart(now);
  if (t >= day) return `heute um ${clockStr(t)}`;
  if (t >= addDays(day, -1)) return `gestern um ${clockStr(t)}`;
  const days = Math.round((day - dayStart(t)) / DAY);
  if (days < 7) return days === 2 ? 'vorgestern' : `vor ${days} Tagen`;
  return 'am ' + new Date(t).toLocaleDateString('de-DE', {day: 'numeric', month: 'long'});
}
export const times = (k, n) =>
  n === 1 ? 'einmal' : k < n ? `${k} von ${n} Mal` : n === 2 ? 'beide Male' : `alle ${n} Mal`;
/* Ratings in words, never as a percentage. Each falls on a side (good, poor, between); the majority side is named,
   by its level if it holds only one. x: {n, counts} */
const SIDES = [
  [v => v >= GOOD, 'gut gefressen'],
  [v => v < NO, 'kaum gefressen'],
  [v => v >= NO && v < GOOD, 'nur zum Teil gefressen'],
];
export function evidenceOf(x) {
  if (!x.n) return 'Noch nicht bewertet';
  const levels = Object.keys(x.counts).sort((a, b) => RATINGS[b].score - RATINGS[a].score);
  if (levels.length === 1) return cap(`${times(x.n, x.n)} ${RATINGS[levels[0]].said}`);
  if (x.n === 2) return `Einmal ${once([RATINGS[levels[0]].said, RATINGS[levels[1]].said]).join(', einmal ')}`;
  const sides = SIDES.map(([on, word]) => {
    const l = levels.filter(r => on(RATINGS[r].score));
    return {k: l.reduce((a, r) => a + x.counts[r], 0), said: l.length === 1 ? RATINGS[l[0]].said : word};
  })
    .filter(side => side.k)
    .sort((a, b) => b.k - a.k);
  if (sides[0].k * 2 > x.n) return cap(`${times(sides[0].k, x.n)} ${sides[0].said}`);
  return `Mal so, mal so: ${once(sides.map(side => side.said))
    .map((said, i) => `${sides[i].k}×\u00a0${said}`)
    .join(', ')}`;
}
// a closing word all phrases share is said once, at the end: „einmal fast alles, einmal die Hälfte gefressen“
function once(phrases) {
  const end = ' ' + phrases.at(-1).split(' ').at(-1);
  return phrases.every(p => p.endsWith(end))
    ? phrases.map((p, i) => (i < phrases.length - 1 ? p.slice(0, -end.length) : p))
    : phrases;
}
export const lower = t => t.charAt(0).toLowerCase() + t.slice(1);
// when only some pets decided the verdict, only their ratings are told
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
export const verdictLabel = x =>
  x.verdict === 'gemischt' ? `Gemischt: ${petNames(x.yes)} ja, ${petNames(x.no)} nein` : VERDICTS[x.verdict];
