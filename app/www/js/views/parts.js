/* Recurring building blocks of the views: avatars, thumbnails, rating buttons, sync status. */
import {esc} from '../text.js';
import {ago, dayKey, dayLabel, timeStr} from '../dates.js';
import {icon} from '../icons.js';
import {RATINGS, scaleOf, speciesIcon, typeOf} from '../config.js';
import {queue} from '../store.js';
import {status} from '../sync.js';
import {getPet, getProduct, petNames, pname, servingPets} from '../derive.js';
import {rateCls, rOf, scoreCls, VERDICTS} from '../smart.js';
import {sheet} from '../ui/sheet.js';

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
export function nameBlock(s, p, sheet = false) {
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
  const meta = [p.variety ? p.brand : '', sheet ? typeOf(p) : ago(s.servedAt)].filter(Boolean).join(', ');
  return `<b>${esc(pname(p))}</b><small>${esc(meta)}</small>`;
}
/* Rating buttons: equally wide in one row, the variety's scale in its own order; an icon and two lines per button.
   A stored level from another scale (the variety's type has changed) sits above them as a badge. */
const rateBadge = r => `<span class="badge ${rateCls(r)}">${icon('r_' + r)}${RATINGS[r].label}</span>`;
export function rateRow(s, pid, big = false) {
  const scale = scaleOf(getProduct(s.productId)),
    cur = rOf(s.pets[pid]);
  return `${cur && !scale.includes(cur) ? rateBadge(cur) : ''}<div class="rate-row${big ? ' big' : ''}">${scale
    .map(
      r =>
        `<button class="rb ${rateCls(r)}" aria-pressed="${cur === r}" aria-label="${RATINGS[r].label}" data-action="rate" data-s="${s.id}" data-p="${pid}" data-r="${r}">${icon('r_' + r)}<span>${RATINGS[r].lines[0]}</span><small>${RATINGS[r].lines[1]}</small></button>`,
    )
    .join('')}</div>`;
}
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
export function armBtn(key, label, armedLabel, {ic = 'trash', cls = 'danger'} = {}) {
  const on = sheet && sheet.armed === key;
  return `<button class="btn ${on ? 'armed' : cls}" data-action="arm" data-then="${key}">${icon(ic)}${on ? armedLabel : label}</button>`;
}

/* History, on the home page as in the evaluation: the meals by calendar day, newest first.
   „2 Mahlzeiten, 1 Snack“: a treat is not a meal; everything else, including what is still unknown, counts as one. */
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
/* anchors: ids for the days, where the home page's calendar jumps to; fresh: the meal just served */
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
        return `<li style="view-transition-name:tl-${s.id};view-transition-class:${fresh === s.id ? 'fresh' : 'item'}"><button class="tl-item" data-action="open-serving" data-id="${s.id}">
        <span class="tl-time">${timeStr(s.servedAt)}</span><span class="tl-node">${servingNode(s)}</span>${thumbOf(s, p)}
        <span class="t-main"><b>${title}</b>${meta ? `<small>${esc(meta)}</small>` : ''}${s.note ? `<small class="tl-note">„${esc(s.note)}“</small>` : ''}</span>
        ${resultBadges(s, true)}</button></li>`;
      })
      .join('')}</ol></div>`,
    )
    .join('');
}

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

/* A short reason for a verdict, e.g. „4× bewertet, zuletzt Gut“ */
export const reasonOf = x => (x.n ? `${x.n}× bewertet, zuletzt ${RATINGS[x.last.r].label}` : 'noch nicht bewertet');
/* A variety's verdict as text; in a household „Gemischt“ with the pets' names, e.g. „Gemischt: Minka ja, Tiger nein“ */
export const verdictLabel = x =>
  x.verdict === 'gemischt' ? `Gemischt: ${petNames(x.yes)} ja, ${petNames(x.no)} nein` : VERDICTS[x.verdict];
