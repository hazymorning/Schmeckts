/* Recognising a food packaging. The chain sits in one place (identify) and runs cheapest first:
   known barcode in the household → product lookup on the internet (if allowed) → server (when connected and it offers
   it) → own AI key (if set) → on-device text recognition → empty form.
   Every stage may be skipped, an error moves on to the next; note() tells the interface what is running.
   Errors from photo recognition through the server carry retry: true when another attempt is worth it. */
import {ServerError, request} from './api.js';
import {SPECIES, TYPES} from './config.js';
import {PROMPT} from './prompt.js';
import {readPhotoText} from './native.js';
import {readPack} from './ocr.js';
import {lookupOnline} from './online.js';
import {db, prefs} from './store.js';
import {isConnected, serverCan, status} from './sync.js';
import {productsByCode} from './derive.js';

const RETRY = new Set(['offline', 'busy', 'unavailable', 'server', 'auth', 'locked']);
const LOOKING = 'Barcode wird nachgeschlagen …', READING = 'Sorte wird erkannt …';

/* One stage: name, when its turn comes, what it shows and what it does. Result {products}, {details} or null. */
const STEPS = [
  {name:'codes', when:o => !!o.code, run:o => { const found = productsByCode(o.code); return found.length ? {products:found} : null; }},
  {name:'online', hint:LOOKING, when:o => !!o.code && !!prefs.lookup, run:o => lookupOnline(o.code).then(asDetails)},
  {name:'server', hint:o => o.code ? LOOKING : READING, when:() => isConnected(), run:fromServer},
  {name:'key', hint:READING, when:o => !!o.photo && !!prefs.aiKey, run:o => askKey(o.photo).then(asDetails)},
  {name:'text', when:o => !!o.photo, run:o => readPhotoText(o.photo).then(text => asDetails(readPack(text, db.products)))}
];

/* code: the scanned barcode, photo: the photo as base64, note: a short notice for the interface.
   Returns {source, products|details} or {source:'', error} — the form then stays empty. */
export async function identify({code = '', photo = '', note = () => {}} = {}){
  const o = {code, photo};
  let error = null;
  for (const step of STEPS) {
    if (!step.when(o)) continue;
    try {
      note(typeof step.hint === 'function' ? step.hint(o) : step.hint || '');
      const hit = await step.run(o);
      if (hit) { note(''); return {source:step.name, ...hit}; }
    } catch (e) {
      error = e;
      console.warn(`recognition (${step.name}):`, e?.message || e);
    }
  }
  note('');
  return {source:'', error};
}

/* Bring an answer into the server's shape: without a brand and a variety it does not count */
function asDetails(hit){
  const brand = String(hit?.brand || '').trim(), variety = String(hit?.variety || '').trim();
  if (!brand && !variety) return null;
  return {details:{brand, variety, type:TYPES.includes(hit.type) ? hit.type : undefined,
    animal:SPECIES.some(s => s.k === hit.animal) ? hit.animal : undefined, texture:hit.texture}};
}

/* Server: the lookup for a barcode (from server 1.1.0), AI recognition for a photo */
async function fromServer({code, photo}){
  if (code && await serverCan('barcode')) {
    const hit = await lookupBarcode(code).catch(e => { console.warn('barcode lookup:', e.message); return null; });
    const found = hit?.found ? asDetails(hit) : null;
    if (found) return found;
  }
  return photo ? asDetails(await recognize(photo)) : null;
}

/* Photo recognition through the household server: key, model and prompt live there. */
export async function recognize(b64){
  if (!prefs.code) throw Object.assign(new ServerError('none', 'Kein Server verbunden.'), {retry:false});
  if (status.recognition === false) {
    throw Object.assign(new ServerError('unavailable', 'Auf dem Server ist die Foto-Erkennung noch nicht eingerichtet.'), {retry:true});
  }
  try { return await request('POST', '/api/recognize', {body:{image:b64}, timeout:70e3}); }
  catch (e) { e.retry = RETRY.has(e.kind); throw e; }
}

/* Look up an unknown barcode through the server (Open Pet Food Facts and Open Food Facts).
   Response {found, brand, variety, type, animal}. The server waits at most 5 seconds per database. */
export const lookupBarcode = code => request('GET', '/api/barcode/' + encodeURIComponent(code), {timeout:15e3});

/* Own AI key: the app calls Anthropic itself, with the header for direct calls from an app.
   Model and prompt as on the server (shared/recognize-prompt.txt). The key stays on this phone. */
const AI_URL = 'https://api.anthropic.com/v1/messages';
const AI_MODEL = 'claude-sonnet-5';
async function askKey(b64, key = prefs.aiKey){
  const res = await fetch(AI_URL, {
    method:'POST', cache:'no-store', signal:AbortSignal.timeout(70e3),
    headers:{'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:AI_MODEL, max_tokens:400, messages:[{role:'user', content:[
      {type:'image', source:{type:'base64', media_type:'image/jpeg', data:b64}},
      {type:'text', text:aiPrompt()}]}]})
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Anthropic hat den Schlüssel abgelehnt.' : `Anthropic meldet HTTP ${res.status}.`);
  const data = await res.json();
  const text = (data?.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const found = /\{[\s\S]*\}/.exec(text.replace(/```json|```/g, ''));
  if (!found) return null;
  try { return JSON.parse(found[0]); } catch (e) { return null; }
}
/* The 60 newest of our own varieties ride along on the prompt so the spelling stays consistent — as on the server */
function aiPrompt(){
  const known = [...db.products].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 60)
    .map(p => `${(p.brand || '').trim()} | ${(p.variety || '').trim()}`).filter(n => n !== ' | ');
  return known.length ? `${PROMPT}\nProducts already known. If it is one of these, use exactly this spelling:\n${known.join('\n')}` : PROMPT;
}
