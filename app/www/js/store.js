/* Database (db), settings (prefs), sync state with field clocks (state) and unconfirmed changes (queue).
   Crash-safe through the write order queue → db → sync: one of our own changes lands in the queue first and the next
   start replays it; a change from the server lands in db first, and if sync is missing the app fetches it again. */
import {clockState, observe, randomId, rebase, stamp} from './clock.js';
import {flush, read, schedule, storageOK} from './disk.js';
import {tidyFeedStart, tidyRemind} from './config.js';
import {milestones} from './smart.js';
import {COLLECTIONS, complete, fieldsOf, fromFields, sameValue, setField, validId, valueOf} from './fields.js';

export {flush, storageOK};
export const defaults = () => ({version:3, pets:[], products:[], servings:[]});
const defaultPrefs = () => ({theme:'system', hiddenHints:[], closedWeek:'', milestones:null, remind:0, feedRemind:false, backdrop:true,
  feedStart:'beides', mode:'', server:'', code:'', name:'', activePet:'all', lastPets:[], lookup:false, codes:{}, exchange:{}});
export const hooks = {changed(){}, saved(){}}; // the interface and the sync hook in here

export function tidy(d){
  const out = defaults();
  for (const c of COLLECTIONS) {
    const seen = new Set();
    out[c] = (Array.isArray(d?.[c]) ? d[c] : []).filter(r => r && typeof r === 'object' && r.id && !seen.has(r.id) && seen.add(r.id));
  }
  for (const p of out.pets) delete p.photos; // the album is gone; whatever a household still holds stays untouched there
  out.servings = out.servings.filter(s => s.pets && typeof s.pets === 'object' && s.servedAt);
  for (const s of out.servings) {
    if (s.status === 'recognizing') s.status = s.photo ? 'waiting' : 'failed';  // recognition was interrupted
    if (s.status === 'reading') s.status = s.photo ? 'noserver' : 'failed';     // reading was interrupted: type it in
  }
  out.servings.sort((a, b) => b.servedAt - a.servedAt);
  return out;
}
function tidyPrefs(p){
  const out = {...defaultPrefs(), ...(p && typeof p === 'object' ? p : {})};
  out.hiddenHints = Array.isArray(out.hiddenHints) ? [...new Set(out.hiddenHints.filter(k => typeof k === 'string'))].slice(-300) : [];
  out.remind = tidyRemind(out.remind);
  out.feedRemind = out.feedRemind === true; // reminder to feed at the usual times
  out.feedStart = tidyFeedStart(out.feedStart);                        // which button the feeding sheet shows
  out.backdrop = out.backdrop !== false && out.backdrop !== 'off'; // pet photos behind the header, on by default ('off': a value from 1.1.0)
  out.closedWeek = typeof out.closedWeek === 'string' ? out.closedWeek : '';
  out.milestones = Array.isArray(out.milestones) ? out.milestones.filter(k => typeof k === 'string') : null; // null: never set, see load()
  out.lookup = out.lookup === true;                                    // product lookup on the internet, off by default
  delete out.aiKey;                                                    // dropped: the key for photo recognition lives on the server
  out.codes = out.codes && typeof out.codes === 'object' ? out.codes : {};       // remembered barcode answers
  out.exchange = out.exchange && typeof out.exchange === 'object' ? out.exchange : {}; // state per device we have exchanged with
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
export let revision = 0; // counts every change to the data; derive.js then recomputes the evaluation
export let loadError = null; // stored data present but unreadable: nothing is written then
let snap = Object.fromEntries(COLLECTIONS.map(c => [c, new Map()]));

/* For the evaluation (derive.js): varieties whose meals have changed (null: all), and the earliest serving time
   affected. meals: the meal before and after the change */
const allStale = () => ({sorts:null, since:-Infinity});
let stale = allStale();
export function takeStale(){ const taken = stale; stale = {sorts:new Set(), since:Infinity}; return taken; }
function markStale(c, ...meals){
  if (c === 'pets') stale = allStale();
  if (c === 'products') stale.since = -Infinity;
  if (c !== 'servings' || !stale.sorts) return;
  for (const m of meals) if (m) { stale.sorts.add(m.productId); stale.since = Math.min(stale.since, m.servedAt); }
}

/* Saving to disk */
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
  console.warn('sync:', text);
  state.log.push({at:Date.now(), text});
  state.log.splice(0, state.log.length - 30);
  persist('sync');
}

/* Loading and replaying the queue */
const ZERO = () => `0000000000000-0000-${clockState.device}`; // unknown origin: loses against every real change
const clocksOf = (c, id) => state.clocks[c][id] ||= {};
const snapshot = () => Object.fromEntries(COLLECTIONS.map(c => [c, new Map(db[c].filter(r => validId(r.id)).map(r => [r.id, fieldsOf(c, r)]))]));
const sortServings = () => db.servings.sort((a, b) => b.servedAt - a.servedAt);

async function load(){
  const [d, p, s, q] = await Promise.all(['db', 'prefs', 'sync', 'queue'].map(read));
  db = tidy(d);
  prefs = tidyPrefs(p);
  Object.assign(state, tidyState(s));
  if (d == null) Object.assign(state, {epoch:'', seq:0, clocks:tidyState(null).clocks}); // clocks without values do not count
  queue = Array.isArray(q) ? q.filter(validChange) : [];
  Object.assign(clockState, {device:state.device, offset:state.offset, ms:state.ms, n:state.n});
  for (const x of queue) observe(x.t);
  let fixed = false; // replay the queue: whatever is in it but missing from db or sync (a crash while writing)
  for (const x of queue) if (applyRecord(x.c, x.r, Object.fromEntries(Object.entries(x.f).map(([k, v]) => [k, {v, t:x.t}])), false)) fixed = true;
  sortServings();
  if (ensureClocks()) fixed = true;
  snap = snapshot();
  if (fixed) persist('db', 'sync');
  if (prefs.activePet !== 'all' && !db.pets.some(x => x.id === prefs.activePet)) prefs.activePet = 'all';
  prefs.milestones ||= milestones(db).reached; // never recorded: what is reached counts as seen
  // connected means `haushalt`; a phone already in use is otherwise `lokal`; on the very first start the welcome page asks
  prefs.mode = connected() ? 'haushalt' : prefs.mode === 'lokal' || p != null || d != null ? 'lokal' : '';
}
function ensureClocks(){ // records without clocks, e.g. carried over from older versions
  let n = 0;
  for (const c of COLLECTIONS) for (const rec of db[c]) {
    if (!validId(rec.id)) continue;
    const had = state.clocks[c][rec.id], clocks = had || {};
    for (const k of Object.keys(fieldsOf(c, rec))) if (!clocks[k]) { clocks[k] = ZERO(); n++; }
    if (!had) { clocks._del = ZERO(); state.clocks[c][rec.id] = clocks; n++; }
  }
  return n > 0;
}

try { await load(); } catch (e) { loadError = e; console.error('stored data unreadable', e); }

export function replaceDb(next){ db = next; revision++; stale = allStale(); } // import, delete and undo swap the whole database

/* Our own changes */
export function save(){
  const changes = diff();
  if (changes.length) { queue.push(...changes); persist('queue', 'db', 'sync'); hooks.saved(); }
  else persist('db'); // local fields such as the photo and the recognition status
}
export function savePrefs(){ persist('prefs'); }

const mealOf = fields => ({productId:JSON.parse(fields.productId ?? 'null'), servedAt:JSON.parse(fields.servedAt ?? '0')});
function diff(){
  const out = [];
  for (const c of COLLECTIONS) {
    const prev = snap[c], cur = new Map();
    for (const rec of db[c]) {
      if (!validId(rec.id)) continue; // not synced, the server would reject it
      const f = fieldsOf(c, rec), p = prev.get(rec.id), ch = {};
      cur.set(rec.id, f);
      if (!p) Object.assign(ch, f, {_del:'false'}); // new or restored: every field
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

/* Changes from other devices */
let changedTimer = null;
function notify(){ clearTimeout(changedTimer); changedTimer = setTimeout(() => hooks.changed(), 120); } // batched

/* records: [{c, r, f: {field: {v, t}}}], each one complete, the way the server delivers them. Returns the number of
   records changed (0 = nothing new). */
export function merge(records){
  save(); // record our own uncaptured changes first
  let changed = 0;
  for (const x of records) if (applyRecord(x.c, x.r, x.f || {}, true)) changed++;
  if (changed) { sortServings(); notify(); }
  persist('db', 'sync');
  return changed;
}

/* Manual exchange (logic/exchange.js): all of our own field clocks, plus the records this device holds newer than the
   other side. peer: their clocks (from their file), otherwise a mark (the highest clock at the last exchange), null: everything. */
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
      else if (clocks._del) f._del = {v:true, t:clocks._del};  // deleted: this device no longer knows the other values
      else continue;
      out.push({c, r:id, f});
    }
  }
  return out;
}

/* Merges the fields of one record. full: fields holds every field the server knows. */
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
      // only what this device actually holds is remembered: otherwise the next save would see a missing field and delete it household-wide
      if (setField(c, rec, k, v) && v != null) s[k] = JSON.stringify(v); else delete s[k];
    }
    snap[c].set(id, s); markStale(c, before, rec);
    return true;
  }
  if (deleted) return false; // stays deleted, only the clocks are new
  // visible (again): values from the server, and from the queue wherever our own clock is newer
  const values = {}, mine = queuedValues(c, id);
  for (const [k, x] of Object.entries(fields)) if (k !== '_del') values[k] = x.v;
  for (const k of Object.keys(clocks)) {
    if (k === '_del') continue;
    if (mine[k] && mine[k].t === clocks[k]) values[k] = mine[k].v;
    else if (full) { if (fields[k]) clocks[k] = fields[k].t; else delete clocks[k]; } // value unknown
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

/* Full sync (new epoch, first connection, differing checksum): merge everything from the server, then resend every
   field whose own clock is newer. */
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
        else if (rt) clocks[k] = rt; else delete clocks[k]; // value of a deleted record: no longer known
      }
      for (const [t, f] of groups) out.push({id:randomId(16), c, r:id, t, f});
    }
  }
  queue.push(...out);
  persist('queue', 'sync');
  return out.length;
}

/* For the sync */
export function ack(ids){ // confirmed by the server, or rejected for good
  const done = new Set(ids), before = queue.length;
  queue = queue.filter(x => !done.has(x.id));
  if (queue.length !== before) persist('queue');
}
export function restamp(id){ // the server rejects the clock: restamp with the corrected time
  const x = queue.find(q => q.id === id); if (!x) return;
  rebase();
  const t = stamp(), clocks = state.clocks[x.c]?.[x.r] || {};
  for (const k of Object.keys(x.f)) if (clocks[k] === x.t) clocks[k] = t;
  x.t = t;
  persist('queue', 'sync');
}
export function setPosition(epoch, seq){ state.epoch = epoch; state.seq = seq; persist('sync'); }
export function resetSync(){ queue = []; state.epoch = ''; state.seq = 0; persist('queue', 'sync'); }

/* Remove records without a trace, without deleting them household-wide (sample data before connecting). ids: {collection: Set} */
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

/* Checksum as on the server: SHA-256 over the sorted lines "collection/id/field@clock\n" */
export async function checksum(){
  const lines = [];
  for (const c of COLLECTIONS) for (const [id, clocks] of Object.entries(state.clocks[c]))
    for (const [k, t] of Object.entries(clocks)) lines.push(`${c}/${id}/${k}@${t}\n`);
  lines.sort();
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lines.join('')));
  return {sum:Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''), fields:lines.length};
}
