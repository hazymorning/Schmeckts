/* Wiederkehrende Bausteine der Ansichten: Avatare, Vorschaubilder, Bewertungs-Buttons, Sync-Status. */
import {esc} from '../text.js';
import {ago, when} from '../dates.js';
import {icon} from '../icons.js';
import {RATINGS, scaleOf, speciesIcon} from '../config.js';
import {queue} from '../store.js';
import {status} from '../sync.js';
import {getPet, getProduct, petNames, pname, servingPets} from '../derive.js';
import {rateCls, rOf, VERDICTS} from '../smart.js';
import {sheet} from '../ui/sheet.js';

export function avatar(pet, cls = ''){
  if (!pet) return '';
  if (pet.photo) return `<span class="av ${cls}"><img src="${esc(pet.photo)}" alt=""></span>`;
  return `<span class="av ${cls}">${icon(speciesIcon(pet.species))}</span>`;
}
export function thumbOf(s, p, cls = ''){
  const src = p?.thumb || s?.thumb;
  if (src) return `<img class="thumb ${cls}" src="${esc(src)}" alt="">`;
  if (!p) return `<span class="thumb unknown ${cls}">${icon('camera')}</span>`;
  const letter = (p.brand || p.variety || '?').trim().charAt(0).toUpperCase();
  return `<span class="thumb ${cls}">${esc(letter)}</span>`;
}
export function nameBlock(s, p, exact = false){
  if (s.status === 'recognizing') return `<b><span class="skel" style="width:68%"></span></b><small>Sorte wird erkannt …</small>`;
  if (!p) {
    const sub = {waiting:'Wird erkannt, sobald der Server erreichbar ist', failed:'Nicht erkannt, tippen zum Benennen'}[s.status] || 'Tippen zum Benennen';
    return `<b>Unbekanntes Futter</b><small class="${s.status === 'waiting' || s.status === 'noserver' ? '' : 'warn'}">${sub}</small>`; // noserver (Modus „lokal“): ohne Fehlerton
  }
  const meta = [p.variety ? p.brand : '', exact ? when(s.servedAt) : ago(s.servedAt)].filter(Boolean).join(', ');
  return `<b>${esc(pname(p))}</b><small>${esc(meta)}</small>`;
}
/* Bewertungsknöpfe: gleich breite in einer Reihe, die Skala der Sorte in ihrer Reihenfolge; je Knopf Icon und zwei Zeilen.
   Eine gespeicherte Stufe einer anderen Skala (die Art der Sorte hat gewechselt) steht als Badge darüber. */
const rateBadge = r => `<span class="badge ${rateCls(r)}">${icon('r_' + r)}${RATINGS[r].label}</span>`;
export function rateRow(s, pid, big = false){
  const scale = scaleOf(getProduct(s.productId)), cur = rOf(s.pets[pid]);
  return `${cur && !scale.includes(cur) ? rateBadge(cur) : ''}<div class="rate-row${big ? ' big' : ''}">${scale.map(r =>
    `<button class="rb ${rateCls(r)}" aria-pressed="${cur === r}" aria-label="${RATINGS[r].label}" data-action="rate" data-s="${s.id}" data-p="${pid}" data-r="${r}">${icon('r_' + r)}<span>${RATINGS[r].lines[0]}</span><small>${RATINGS[r].lines[1]}</small></button>`).join('')}</div>`;
}
export function resultBadges(s, compact = false){
  const ids = servingPets(s);
  if (ids.length === 1) {
    const r = rOf(s.pets[ids[0]]);
    if (!r) return `<span class="badge open">offen</span>`;
    return compact ? `<span class="badge ic-only ${rateCls(r)}" title="${RATINGS[r].label}">${icon('r_' + r)}</span>` : rateBadge(r);
  }
  return `<span class="minis">${ids.map(pid => { const r = rOf(s.pets[pid]); return `<span class="mini ${r ? rateCls(r) : ''}">${avatar(getPet(pid), 'xs')}</span>`; }).join('')}</span>`;
}
export const closeBtn = `<button class="icon-btn" data-action="close" aria-label="Schließen">${icon('close')}</button>`;
export function armBtn(key, label, armedLabel, {ic = 'trash', cls = 'danger'} = {}){
  const on = sheet && sheet.armed === key;
  return `<button class="btn ${on ? 'armed' : cls}" data-action="arm" data-then="${key}">${icon(ic)}${on ? armedLabel : label}</button>`;
}

/* Sync-Status in Worten, für Einstellungen und den Hinweis oben */
const waitingText = n => n ? `${n} ${n === 1 ? 'Änderung wartet' : 'Änderungen warten'}` : '';
const ERROR_TITLE = {auth:'Code stimmt nicht mehr', protocol:'Update nötig', locked:'Kurz gesperrt'};
const CHIP_ERROR = {auth:'Code prüfen', protocol:'Update nötig', locked:'Kurz gesperrt'};
export function syncInfo(){
  const st = status, wait = waitingText(queue.length);
  if (st.state === 'off') return {tone:'off', title:'Nicht verbunden', detail:'Alle Daten bleiben auf diesem Gerät.'};
  if (st.state === 'error') return {tone:'bad', title:ERROR_TITLE[st.kind] || 'Abgleich gestört', detail:st.message};
  if (st.state === 'offline') return {tone:'off', title:'Server nicht erreichbar',
    detail:[wait, st.lastOk ? 'zuletzt abgeglichen ' + ago(st.lastOk) : ''].filter(Boolean).join(', ') || 'Bist du im WLAN zu Hause oder ist WireGuard an?'};
  if (st.state === 'wait') return {tone:'ok', title:'Verbinde …', detail:wait || 'Der Abgleich läuft.'};
  return {tone:'ok', title:'Verbunden', detail:wait ? wait + ', wird gesendet …' : 'Alles abgeglichen'};
}
/* Oben neben den Einstellungen, nur wenn etwas wartet oder hakt */
export function syncChip(){
  const st = status, n = queue.length;
  if (st.state === 'error') return {label:CHIP_ERROR[st.kind] || 'Abgleich gestört', ic:'alert', bad:true};
  if (st.state === 'offline' && n) return {label:waitingText(n), ic:'clock', bad:false};
  return null;
}

/* Urteil einer Sorte als Text, im Haushalt „Gemischt“ mit Tiernamen, etwa „Gemischt: Minka ja, Tiger nein“ */
/* Kurze Begründung eines Urteils, etwa „4× bewertet, zuletzt Gut“ */
export const reasonOf = x => x.n ? `${x.n}× bewertet, zuletzt ${RATINGS[x.last.r].label}` : 'noch nicht bewertet';
export const verdictLabel = x => x.verdict === 'gemischt' ? `Gemischt: ${petNames(x.yes)} ja, ${petNames(x.no)} nein` : VERDICTS[x.verdict];
