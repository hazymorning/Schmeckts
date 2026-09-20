/* Datenbank (db), Einstellungen (prefs), Sync-Stand mit Feld-Uhren (state) und unbestätigte Änderungen (queue).
   Absturzsicher durch die Schreibfolge queue → db → sync: Eine eigene Änderung steht zuerst in der Warteschlange, der
   Start spielt sie nach; eine Änderung vom Server steht zuerst in db, fehlt sync, holt die App sie noch einmal. */
import {clockState, observe, randomId, rebase, stamp} from './clock.js';
import {flush, read, schedule, storageOK} from './disk.js';
import {tidyRemind} from './config.js';
import {milestones} from './smart.js';
import {COLLECTIONS, complete, fieldsOf, fromFields, sameValue, setField, validId, valueOf} from './fields.js';

export {flush, storageOK};
export const defaults = () => ({version:3, pets:[], products:[], servings:[]});
const defaultPrefs = () => ({theme:'system', hiddenHints:[], closedWeek:'', milestones:null, remind:0, feedRemind:false, backdrop:true,
  mode:'', server:'', code:'', name:'', activePet:'all', lastPets:[], lookup:false, aiKey:'', codes:{}, exchange:{}});
export const hooks = {changed(){}, saved(){}}; // Oberfläche und Abgleich hängen sich hier an

export function tidy(d){
  const out = defaults();
  for (const c of COLLECTIONS) {
    const seen = new Set();
    out[c] = (Array.isArray(d?.[c]) ? d[c] : []).filter(r => r && typeof r === 'object' && r.id && !seen.has(r.id) && seen.add(r.id));
  }
  out.servings = out.servings.filter(s => s.pets && typeof s.pets === 'object' && s.servedAt);
  for (const s of out.servings) {
    if (s.status === 'recognizing') s.status = s.photo ? 'waiting' : 'failed';  // Erkennung wurde unterbrochen
    if (s.status === 'reading') s.status = s.photo ? 'noserver' : 'failed';     // Lesen wurde unterbrochen: eintippen
  }
  out.servings.sort((a, b) => b.servedAt - a.servedAt);
  return out;
}
function tidyPrefs(p){
  const out = {...defaultPrefs(), ...(p && typeof p === 'object' ? p : {})};
  out.hiddenHints = Array.isArray(out.hiddenHints) ? [...new Set(out.hiddenHints.filter(k => typeof k === 'string'))].slice(-300) : [];
  out.remind = tidyRemind(out.remind);
  out.feedRemind = out.feedRemind === true; // Erinnerung ans Füttern zu den üblichen Zeiten
  out.backdrop = out.backdrop !== false && out.backdrop !== 'off'; // Tierfotos hinter der Kopfzeile, Standard an ('off': Wert aus 1.1.0)
  out.closedWeek = typeof out.closedWeek === 'string' ? out.closedWeek : '';
  out.milestones = Array.isArray(out.milestones) ? out.milestones.filter(k => typeof k === 'string') : null; // null: noch nie gesetzt, siehe load()
  out.lookup = out.lookup === true;                                    // Produktsuche im Internet, Standard aus
  out.aiKey = typeof out.aiKey === 'string' ? out.aiKey.trim() : '';   // eigener KI-Schlüssel, nur auf diesem Handy
  out.codes = out.codes && typeof out.codes === 'object' ? out.codes : {};       // gemerkte Barcode-Antworten
  out.exchange = out.exchange && typeof out.exchange === 'object' ? out.exchange : {}; // Stand je Gerät, mit dem getauscht wurde
  return out;
}
function tidyState(s){
  const o = s && typeof s === 'object' ? s : {}, num = v => Number.isFinite(v) ? v : 0;
  return {
    device: typeof o.device === 'string' && /^[a-z0-9]{4,16}$/.test(o.device) ? o.device : randomId(8),
    epoch: typeof o.epoch === 'string' ? o.epoch : '', seq: num(o.seq),
    offset: num(o.offset), ms: num(o.ms), n: num(o.n),
    clocks: Object.fromEntries(COLLECTIONS.map(c => [c, o.clocks?.[c] && typeof o.clocks[c] === 'object' ? o.clocks[c] : {}])),
    log: Array.isArray(o.log) ? o.log.slice(-30) : []
  };
}
const validChange = x => x && typeof x.id === 'string' && COLLECTIONS.includes(x.c) && typeof x.r === 'string' &&
  typeof x.t === 'string' && x.f && typeof x.f === 'object';

export let db = defaults(), prefs = defaultPrefs(), queue = [];
export const state = tidyState(null);
export let revision = 0; // zählt jede Änderung der Daten, derive.js rechnet die Auswertung dann neu
export let loadError = null; // gespeicherte Daten vorhanden, aber nicht lesbar: dann wird nichts geschrieben
let snap = Object.fromEntries(COLLECTIONS.map(c => [c, new Map()]));

/* Für die Auswertung (derive.js): Sorten, deren Mahlzeiten sich geändert haben (null: alle), und die früheste betroffene
   Servierzeit. meals: die Mahlzeit vor und nach der Änderung */
const allStale = () => ({sorts:null, since:-Infinity});
let stale = allStale();
export function takeStale(){ const taken = stale; stale = {sorts:new Set(), since:Infinity}; return taken; }
function markStale(c, ...meals){
  if (c === 'pets') stale = allStale();
  if (c === 'products') stale.since = -Infinity;
  if (c !== 'servings' || !stale.sorts) return;
  for (const m of meals) if (m) { stale.sorts.add(m.productId); stale.since = Math.min(stale.since, m.servedAt); }
}

/* Speichern auf der Platte */
const stateForDisk = () => ({...state, device:clockState.device, offset:clockState.offset, ms:clockState.ms, n:clockState.n});
const connected = () => !!prefs.code;
function persist(...names){
  if (names.includes('db')) revision++;
  if (loadError) return;
  for (const n of names) {
    if (n === 'queue') schedule('queue', () => ({text:JSON.stringify(queue)}));
    if (n === 'db') schedule('db', () => ({text:JSON.stringify(db)}));
    if (n === 'prefs') schedule('prefs', () => ({text:JSON.stringify(prefs)}));
    if (n === 'sync') schedule('sync', () => ({text:JSON.stringify(stateForDisk()), ctx:connected() ? null : queue.map(x => x.id)}), trimJournal);
  }
}
function trimJournal(ids){
  if (!ids?.length || connected()) return;
  const done = new Set(ids);
  queue = queue.filter(x => !done.has(x.id));
  persist('queue');
}
export function log(text){
  console.warn('Abgleich:', text);
  state.log.push({at:Date.now(), text});
  state.log.splice(0, state.log.length - 30);
  persist('sync');
}

/* Laden und Nachspielen der Warteschlange */
const ZERO = () => `0000000000000-0000-${clockState.device}`; // unbekannte Herkunft: verliert gegen jede echte Änderung
const clocksOf = (c, id) => state.clocks[c][id] ||= {};
const snapshot = () => Object.fromEntries(COLLECTIONS.map(c => [c, new Map(db[c].filter(r => validId(r.id)).map(r => [r.id, fieldsOf(c, r)]))]));
const sortServings = () => db.servings.sort((a, b) => b.servedAt - a.servedAt);

async function load(){
  const [d, p, s, q] = await Promise.all(['db', 'prefs', 'sync', 'queue'].map(read));
  db = tidy(d);
  prefs = tidyPrefs(p);
  Object.assign(state, tidyState(s));
  if (d == null) Object.assign(state, {epoch:'', seq:0, clocks:tidyState(null).clocks}); // Uhren ohne Werte gelten nicht
  queue = Array.isArray(q) ? q.filter(validChange) : [];
  Object.assign(clockState, {device:state.device, offset:state.offset, ms:state.ms, n:state.n});
  for (const x of queue) observe(x.t);
  let fixed = false; // Warteschlange nachspielen: was dort steht, aber in db oder sync fehlt (Absturz beim Schreiben)
  for (const x of queue) if (applyRecord(x.c, x.r, Object.fromEntries(Object.entries(x.f).map(([k, v]) => [k, {v, t:x.t}])), false)) fixed = true;
  sortServings();
  if (ensureClocks()) fixed = true;
  snap = snapshot();
  if (fixed) persist('db', 'sync');
  if (prefs.activePet !== 'all' && !db.pets.some(x => x.id === prefs.activePet)) prefs.activePet = 'all';
  prefs.milestones ||= milestones(db).reached; // noch nie gemerkt: Erreichtes gilt als gesehen
  // verbunden heißt „haushalt“, ein benutztes Handy ist sonst „lokal“; beim allerersten Start fragt die Willkommensseite
  prefs.mode = connected() ? 'haushalt' : prefs.mode === 'lokal' || p != null || d != null ? 'lokal' : '';
}
function ensureClocks(){ // Datensätze ohne Uhren, z. B. übernommen aus älteren Versionen
  let n = 0;
  for (const c of COLLECTIONS) for (const rec of db[c]) {
    if (!validId(rec.id)) continue;
    const had = state.clocks[c][rec.id], clocks = had || {};
    for (const k of Object.keys(fieldsOf(c, rec))) if (!clocks[k]) { clocks[k] = ZERO(); n++; }
    if (!had) { clocks._del = ZERO(); state.clocks[c][rec.id] = clocks; n++; }
  }
  return n > 0;
}

try { await load(); } catch (e) { loadError = e; console.error('Gespeicherte Daten nicht lesbar', e); }

export function replaceDb(next){ db = next; revision++; stale = allStale(); } // Import, Löschen und Rückgängig tauschen die ganze Datenbank

/* Eigene Änderungen */
export function save(){
  const changes = diff();
  if (changes.length) { queue.push(...changes); persist('queue', 'db', 'sync'); hooks.saved(); }
  else persist('db'); // lokale Felder wie Foto und Erkennungsstatus
}
export function savePrefs(){ persist('prefs'); }

const mealOf = fields => ({productId:JSON.parse(fields.productId ?? 'null'), servedAt:JSON.parse(fields.servedAt ?? '0')});
function diff(){
  const out = [];
  for (const c of COLLECTIONS) {
    const prev = snap[c], cur = new Map();
    for (const rec of db[c]) {
      if (!validId(rec.id)) continue; // wird nicht abgeglichen, der Server würde ihn ablehnen
      const f = fieldsOf(c, rec), p = prev.get(rec.id), ch = {};
      cur.set(rec.id, f);
      if (!p) Object.assign(ch, f, {_del:'false'}); // neu oder wiederhergestellt: alle Felder
      else {
        for (const k in f) if (p[k] !== f[k]) ch[k] = f[k];
        for (const k in p) if (!(k in f)) ch[k] = 'null';
      }
      if (Object.keys(ch).length) { out.push(change(c, rec.id, ch)); markStale(c, rec, p && mealOf(p)); }
    }
    for (const id of prev.keys()) if (!cur.has(id)) { out.push(change(c, id, {_del:'true'})); markStale(c, mealOf(prev.get(id))); }
    snap[c] = cur;
  }
  return out;
}
function change(c, r, json){
  const t = stamp(), clocks = clocksOf(c, r), f = {};
  for (const [k, j] of Object.entries(json)) { f[k] = JSON.parse(j); clocks[k] = t; }
  return {id:randomId(16), c, r, t, f};
}

/* Änderungen anderer Geräte */
let changedTimer = null;
function notify(){ clearTimeout(changedTimer); changedTimer = setTimeout(() => hooks.changed(), 120); } // gebündelt

/* records: [{c, r, f: {feld: {v, t}}}], jeweils komplett, so wie der Server sie liefert. Liefert die Zahl der
   geänderten Datensätze (0 = nichts Neues). */
export function merge(records){
  save(); // eigene, noch nicht erfasste Änderungen zuerst festhalten
  let changed = 0;
  for (const x of records) if (applyRecord(x.c, x.r, x.f || {}, true)) changed++;
  if (changed) { sortServings(); notify(); }
  persist('db', 'sync');
  return changed;
}

/* Austausch von Hand (logic/exchange.js): alle eigenen Feld-Uhren, und die Datensätze, die dieses Gerät neuer hat als
   die Gegenseite. peer: deren Uhren (aus ihrer Datei), sonst eine Marke (höchste Uhr beim letzten Austausch), null: alles. */
export const allClocks = () => Object.fromEntries(COLLECTIONS.map(c => [c, state.clocks[c]]));
export const topClock = () => {
  let top = '';
  for (const c of COLLECTIONS) for (const clocks of Object.values(state.clocks[c])) for (const t of Object.values(clocks)) if (t > top) top = t;
  return top;
};
export function changesSince(peer){
  const out = [];
  for (const c of COLLECTIONS) {
    const visible = new Map(db[c].map(r => [r.id, r]));
    for (const [id, clocks] of Object.entries(state.clocks[c])) {
      const theirs = peer && typeof peer === 'object' ? peer[c]?.[id] || {} : null;
      const newer = ([k, t]) => theirs ? !theirs[k] || t > theirs[k] : !peer || t > peer;
      if (!Object.entries(clocks).some(newer)) continue;
      const rec = visible.get(id), f = {};
      if (rec) for (const [k, t] of Object.entries(clocks)) f[k] = k === '_del' ? {v:false, t} : {v:valueOf(c, rec, k), t};
      else if (clocks._del) f._del = {v:true, t:clocks._del};  // gelöscht: die übrigen Werte kennt dieses Gerät nicht mehr
      else continue;
      out.push({c, r:id, f});
    }
  }
  return out;
}

/* Führt Felder eines Datensatzes zusammen. full: fields enthält alle Felder, die der Server kennt. */
function applyRecord(c, id, fields, full){
  if (!state.clocks[c] || !validId(id)) return false;
  const list = db[c], idx = list.findIndex(r => r.id === id), rec = idx >= 0 ? list[idx] : null;
  const known = !!state.clocks[c][id], clocks = clocksOf(c, id), win = {}, before = rec && {...rec};
  for (const [k, x] of Object.entries(fields)) {
    if (!x || typeof x.t !== 'string') continue;
    observe(x.t);
    const lt = clocks[k];
    if (lt && lt > x.t) continue;
    if (lt === x.t && rec && sameValue(k === '_del' ? false : valueOf(c, rec, k), x.v)) continue;
    clocks[k] = x.t;
    win[k] = x.v ?? null;
  }
  if (!Object.keys(clocks).length) delete state.clocks[c][id];
  if (!Object.keys(win).length) return false;
  const deleted = '_del' in win ? win._del === true : rec ? false : known;
  if (rec) {
    if (deleted) {
      list.splice(idx, 1); snap[c].delete(id); markStale(c, before);
      if (c === 'pets' && prefs.activePet === id) { prefs.activePet = 'all'; persist('prefs'); }
      return true;
    }
    const s = snap[c].get(id) || {};
    for (const [k, v] of Object.entries(win)) {
      if (k === '_del') continue;
      // gemerkt wird nur, was dieses Gerät auch hält: Sonst sähe das nächste Speichern ein fehlendes Feld und löschte es im ganzen Haushalt
      if (setField(c, rec, k, v) && v != null) s[k] = JSON.stringify(v); else delete s[k];
    }
    snap[c].set(id, s); markStale(c, before, rec);
    return true;
  }
  if (deleted) return false; // bleibt gelöscht, nur die Uhren sind neu
  // (wieder) sichtbar: Werte vom Server, wo die eigene Uhr neuer ist, aus der Warteschlange
  const values = {}, mine = queuedValues(c, id);
  for (const [k, x] of Object.entries(fields)) if (k !== '_del') values[k] = x.v;
  for (const k of Object.keys(clocks)) {
    if (k === '_del') continue;
    if (mine[k] && mine[k].t === clocks[k]) values[k] = mine[k].v;
    else if (full) { if (fields[k]) clocks[k] = fields[k].t; else delete clocks[k]; } // Wert unbekannt
  }
  const made = fromFields(c, id, values);
  if (!complete(c, made)) return false;
  list.push(made); markStale(c, made);
  snap[c].set(id, fieldsOf(c, made));
  return true;
}
function queuedValues(c, r){
  const out = {};
  for (const x of queue) if (x.c === c && x.r === r) for (const [k, v] of Object.entries(x.f)) out[k] = {v, t:x.t};
  return out;
}

/* Vollständiger Abgleich (neue Epoche, erstes Verbinden, abweichende Prüfsumme): alles vom Server
   zusammenführen, dann jedes Feld erneut senden, bei dem die eigene Uhr neuer ist. */
export function reconcile(records){
  merge(records);
  const server = {};
  for (const x of records) (server[x.c] ||= {})[x.r] = x.f || {};
  const queued = new Set(queue.flatMap(x => Object.keys(x.f).map(k => `${x.c}/${x.r}/${k}@${x.t}`)));
  const out = [];
  for (const c of COLLECTIONS) {
    const visible = new Map(db[c].map(r => [r.id, r]));
    for (const [id, clocks] of Object.entries(state.clocks[c])) {
      const remote = server[c]?.[id] || {}, rec = visible.get(id), groups = new Map();
      const add = (t, k, v) => { if (!groups.has(t)) groups.set(t, {}); groups.get(t)[k] = v; };
      for (const [k, t] of Object.entries(clocks)) {
        const rt = remote[k]?.t;
        if ((rt && rt >= t) || queued.has(`${c}/${id}/${k}@${t}`)) continue;
        if (rec) add(t, k, k === '_del' ? false : valueOf(c, rec, k));
        else if (k === '_del') add(t, k, true);
        else if (rt) clocks[k] = rt; else delete clocks[k]; // Wert eines gelöschten Datensatzes: nicht mehr bekannt
      }
      for (const [t, f] of groups) out.push({id:randomId(16), c, r:id, t, f});
    }
  }
  queue.push(...out);
  persist('queue', 'sync');
  return out.length;
}

/* Für den Abgleich */
export function ack(ids){ // vom Server bestätigt oder dauerhaft abgelehnt
  const done = new Set(ids), before = queue.length;
  queue = queue.filter(x => !done.has(x.id));
  if (queue.length !== before) persist('queue');
}
export function restamp(id){ // Server lehnt die Uhrzeit ab: mit korrigierter Zeit neu stempeln
  const x = queue.find(q => q.id === id); if (!x) return;
  rebase();
  const t = stamp(), clocks = state.clocks[x.c]?.[x.r] || {};
  for (const k of Object.keys(x.f)) if (clocks[k] === x.t) clocks[k] = t;
  x.t = t;
  persist('queue', 'sync');
}
export function setPosition(epoch, seq){ state.epoch = epoch; state.seq = seq; persist('sync'); }
export function resetSync(){ queue = []; state.epoch = ''; state.seq = 0; persist('queue', 'sync'); }

/* Datensätze spurlos entfernen, ohne Löschung im Haushalt (Beispieldaten vor dem Verbinden). ids: {sammlung: Set} */
export function purge(ids){
  for (const c of COLLECTIONS) {
    const gone = ids[c]; if (!gone?.size) continue;
    db[c] = db[c].filter(r => !gone.has(r.id));
    for (const id of gone) { delete state.clocks[c][id]; snap[c].delete(id); }
  }
  queue = queue.filter(x => !ids[x.c]?.has(x.r));
  if (prefs.activePet !== 'all' && ids.pets?.has(prefs.activePet)) prefs.activePet = 'all';
  persist('queue', 'db', 'sync', 'prefs');
}

/* Prüfsumme wie auf dem Server: SHA-256 über die sortierten Zeilen „sammlung/id/feld@uhr\n“ */
export async function checksum(){
  const lines = [];
  for (const c of COLLECTIONS) for (const [id, clocks] of Object.entries(state.clocks[c]))
    for (const [k, t] of Object.entries(clocks)) lines.push(`${c}/${id}/${k}@${t}\n`);
  lines.sort();
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lines.join('')));
  return {sum:Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''), fields:lines.length};
}
