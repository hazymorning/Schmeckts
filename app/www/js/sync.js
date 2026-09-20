/* Abgleich mit dem Server. Ein Durchlauf: Warteschlange senden, Neues nachholen, bei anderer Epoche vollständig
   abgleichen, bei leerer Warteschlange die Prüfsumme vergleichen. Live-Meldungen beschleunigen nur. */
import {PROTOCOL, ServerError, eventsUrl, normCode, normServer, request} from './api.js';
import {ack, checksum, flush, log, merge, prefs, queue, reconcile, resetSync, restamp, savePrefs, setPosition, state} from './store.js';

const MAX_CHANGES = 500, MAX_BYTES = 8e6; // der Server nimmt höchstens 500 Änderungen und 12 MB pro Anfrage
const CHECK_EVERY = 5 * 60e3, INFO_EVERY = 10 * 60e3;

export const isConnected = () => !!prefs.code;

/* Zustand für die Oberfläche. state: off (kein Server), wait (noch kein Kontakt), ok, offline, error.
   recognition und features (etwa „barcode“) meldet der Server in /api/info, null solange unbekannt. */
export const status = {state:isConnected() ? 'wait' : 'off', kind:'', message:'', busy:false, lastOk:0, live:false,
  recognition:null, features:null};
export const syncHooks = {status(){}, reachable(){}}; // Oberfläche: Status zeichnen, wartende Fotos erkennen

let timer = null, running = null, again = false, failures = 0, pauseUntil = 0;
let checkedAt = 0, infoAt = 0, mismatches = 0, es = null;

function setStatus(patch){ Object.assign(status, patch); syncHooks.status(); }

export function syncSoon(ms = 400){
  if (!isConnected()) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

function syncNow(){
  clearTimeout(timer);
  if (!isConnected()) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => { // ein unerwarteter Fehler darf den Abgleich nie dauerhaft blockieren
    try { do { again = false; await cycle(); } while (again && isConnected()); }
    catch (e) { console.error('Abgleich:', e); }
    finally { running = null; }
  })();
  return running;
}

async function cycle(){
  if (Date.now() < pauseUntil || status.kind === 'auth' || status.kind === 'protocol') return;
  try {
    setStatus({busy:true});
    if (Date.now() - infoAt > INFO_EVERY) await checkInfo();
    await push();
    await pull();
    if (queue.length) await push();
    await verify();
    failures = 0;
    setStatus({state:'ok', kind:'', message:'', lastOk:Date.now()});
    openLive();
    syncHooks.reachable();
  } catch (e) { reportFailure(e); }
  finally { setStatus({busy:false}); }
}

function reportFailure(e){
  if (!(e instanceof ServerError)) { console.error(e); e = new ServerError('bad', 'Beim Abgleich ist ein Fehler aufgetreten.'); }
  closeLive();
  failures++;
  if (e.kind === 'offline') {
    setStatus({state:'offline', kind:'', message:e.message});
    syncSoon(Math.min(60e3, 5e3 * 2 ** (failures - 1)));
    return;
  }
  if (e.kind === 'locked') pauseUntil = Date.now() + 10 * 60e3;
  else if (e.kind !== 'auth' && e.kind !== 'protocol' && e.kind !== 'input') syncSoon(Math.min(5 * 60e3, 15e3 * 2 ** failures));
  setStatus({state:'error', kind:e.kind, message:e.message});
}

async function checkInfo(timeout){ // ohne Code, zählt also nicht als Fehlversuch
  const serverInfo = await request('GET', '/api/info', {code:'', timeout});
  const problem = protocolProblem(serverInfo);
  if (problem) throw new ServerError('protocol', problem);
  Object.assign(status, abilities(serverInfo));
  infoAt = Date.now();
}
const abilities = serverInfo => ({recognition:!!serverInfo.recognition, features:Array.isArray(serverInfo.features) ? serverInfo.features : []});

/* Kann der Server das, etwa „barcode“ (ab Server 1.1.0)? Vor dem ersten Kontakt fragt die App kurz nach. */
export async function serverCan(feature){
  if (!isConnected()) return false;
  if (!status.features) await checkInfo(5e3).catch(() => {});
  return !!status.features?.includes(feature);
}
function protocolProblem(serverInfo){
  if (serverInfo.app !== 'schmeckts') return 'Unter dieser Adresse läuft kein Schmeckt’s-Server.';
  if (serverInfo.protocol > PROTOCOL) return 'Der Server ist neuer als diese App. Bitte die App aktualisieren.';
  if (serverInfo.protocol !== PROTOCOL) return 'Der Server ist älter als diese App. Bitte den Server aktualisieren.';
  return '';
}

/* Senden */
function batch(limit){
  const out = [];
  let bytes = 20;
  for (const x of queue) {
    const size = new Blob([JSON.stringify(x)]).size + 1;
    if (out.length && (out.length >= limit || bytes + size > MAX_BYTES)) break;
    out.push(x); bytes += size;
  }
  return out;
}
async function push(){
  let limit = MAX_CHANGES, clockRounds = 0;
  while (queue.length) {
    const changes = batch(limit);
    let res;
    try { res = await request('POST', '/api/changes', {body:{changes}, timeout:60e3}); }
    catch (e) {
      if (e.status !== 413) throw e;
      if (changes.length > 1) { limit = Math.ceil(changes.length / 2); continue; }
      ack([changes[0].id]); log('Änderung zu groß für den Server, verworfen'); continue;
    }
    const done = [...(res.ok || [])];
    let clock = 0;
    for (const r of res.rejected || []) {
      if (r.reason === 'clock') { restamp(r.id); clock++; } // mit korrigierter Zeit neu stempeln, nochmal senden
      else { done.push(r.id); log(`Änderung verworfen: ${r.detail || r.reason}`); }
    }
    ack(done);
    if (clock && ++clockRounds > 3) throw new ServerError('bad', 'Die Uhrzeit dieses Handys weicht zu stark ab.');
    if (!done.length && !clock) throw new ServerError('server', 'Der Server hat die Änderungen nicht angenommen.');
  }
}

/* Nachholen */
async function pull(){
  const known = state.epoch;
  const query = known ? `since=${state.seq}&epoch=${encodeURIComponent(known)}` : 'since=0';
  const res = await request('GET', '/api/changes?' + query, {timeout:60e3});
  const records = Array.isArray(res.records) ? res.records : [];
  if (res.epoch !== known) { // erstes Verbinden oder Server aus Backup wiederhergestellt
    if (known) log('Der Server wurde wiederhergestellt, gleiche vollständig ab');
    reconcile(records);
    checkedAt = 0;
  } else if (records.length) merge(records);
  setPosition(res.epoch, res.seq);
}

/* Selbstprüfung */
async function verify(){
  if (queue.length || Date.now() - checkedAt < CHECK_EVERY) return;
  const res = await request('GET', '/api/checksum');
  checkedAt = Date.now();
  if (res.epoch !== state.epoch || res.seq !== state.seq) { again = true; return; } // inzwischen Neues: erst nachholen
  const mine = await checksum();
  if (queue.length) return;
  if (mine.sum === res.sum) { mismatches = 0; return; }
  if (mismatches++) {
    if (mismatches === 2) log(`Prüfsumme weicht auch nach vollständigem Abgleich ab (${mine.fields} zu ${res.fields} Feldern)`);
    return;
  }
  log(`Prüfsumme weicht ab (${mine.fields} zu ${res.fields} Feldern), gleiche vollständig ab`);
  const all = await request('GET', '/api/changes?since=0', {timeout:60e3});
  reconcile(Array.isArray(all.records) ? all.records : []);
  setPosition(all.epoch, all.seq);
  await push();
  checkedAt = 0;
  await verify();
}

/* Live-Meldungen */
function openLive(){
  if (es || !isConnected() || document.hidden || typeof EventSource !== 'function') return;
  es = new EventSource(eventsUrl());
  es.addEventListener('seq', e => {
    let x;
    try { x = JSON.parse(e.data); } catch (err) { return; }
    if (!status.live) setStatus({live:true});
    if (x.epoch !== state.epoch || x.seq > state.seq) syncSoon(50);
  });
  es.onerror = () => { closeLive(); syncSoon(5e3); }; // kein Dauerversuch, der nächste Durchlauf verbindet neu
}
function closeLive(){
  if (es) { es.close(); es = null; }
  if (status.live) setStatus({live:false});
}

/* Verbinden und Trennen */
/* Prüft Adresse, Protokoll und Code, bevor irgendetwas übernommen wird. Wirft ServerError mit Meldung. */
export async function checkServer(codeInput, serverInput){
  const code = normCode(codeInput), base = normServer(serverInput);
  if (!base) throw new ServerError('input', 'Bitte die Adresse des Servers eintragen.');
  if (code.length !== 9) throw new ServerError('input', 'Der Haushaltscode hat acht Zeichen, zum Beispiel K7PM-3QXD.');
  let serverInfo;
  try { serverInfo = await request('GET', '/api/info', {code, base, timeout:10e3}); }
  catch (e) {
    if (e.kind === 'offline') e.message = 'Der Server ist nicht erreichbar. Bist du im WLAN zu Hause oder ist WireGuard an?';
    throw e;
  }
  const problem = protocolProblem(serverInfo);
  if (problem) throw new ServerError('protocol', problem);
  if (!serverInfo.auth) throw new ServerError('auth', serverInfo.error || 'Der Haushaltscode stimmt nicht.');
  return {code, base, serverInfo};
}

export function startSession({code, base, serverInfo}){
  if (prefs.server && prefs.server !== base) resetSync(); // anderer Server: vollständig abgleichen
  prefs.server = base; prefs.code = code; prefs.mode = 'haushalt';
  savePrefs();
  failures = 0; pauseUntil = 0; mismatches = 0; checkedAt = 0; infoAt = Date.now();
  setStatus({state:'wait', kind:'', message:'', ...abilities(serverInfo)});
  return syncNow();
}

/* „Jetzt abgleichen“: prüft auch Protokoll und Prüfsumme sofort */
export function retrySync(){
  if (status.kind === 'protocol' || status.kind === 'locked') { status.kind = ''; pauseUntil = 0; }
  infoAt = 0; checkedAt = 0;
  return syncNow();
}

export function disconnect(){
  closeLive(); clearTimeout(timer);
  prefs.code = ''; prefs.mode = 'lokal';
  savePrefs(); resetSync(); // die Daten bleiben auf dem Gerät, beim nächsten Verbinden wird vollständig abgeglichen
  setStatus({state:'off', kind:'', message:'', lastOk:0, recognition:null, features:null});
}

export function startSync(){
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { closeLive(); flush(); } else syncSoon(50);
  });
  addEventListener('online', () => syncSoon(50));
  setInterval(() => { if (!document.hidden) syncSoon(0); }, 60e3);
  syncSoon(0);
}
