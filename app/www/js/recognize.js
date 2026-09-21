/* Erkennung einer Futterpackung. Die Kette steht an einer Stelle (identify) und geht von billig nach teuer:
   bekannter Barcode im Haushalt → Produktsuche im Internet (wenn erlaubt) → Server (wenn verbunden und er es anbietet)
   → eigener KI-Schlüssel (wenn gesetzt) → Texterkennung auf dem Gerät → leeres Formular.
   Jede Stufe darf übersprungen werden, ein Fehler führt zur nächsten; note() sagt der Oberfläche, was gerade läuft.
   Fehler der Foto-Erkennung über den Server tragen retry: true, wenn sich ein neuer Versuch lohnt. */
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

/* Eine Stufe: Name, wann sie dran ist, was sie zeigt und was sie tut. Ergebnis {products}, {details} oder null. */
const STEPS = [
  {name:'codes', when:o => !!o.code, run:o => { const found = productsByCode(o.code); return found.length ? {products:found} : null; }},
  {name:'online', hint:LOOKING, when:o => !!o.code && !!prefs.lookup, run:o => lookupOnline(o.code).then(asDetails)},
  {name:'server', hint:o => o.code ? LOOKING : READING, when:() => isConnected(), run:fromServer},
  {name:'key', hint:READING, when:o => !!o.photo && !!prefs.aiKey, run:o => askKey(o.photo).then(asDetails)},
  {name:'text', when:o => !!o.photo, run:o => readPhotoText(o.photo).then(text => asDetails(readPack(text, db.products)))}
];

/* code: gescannter Barcode, photo: Foto als Base64, note: kurzer Hinweis für die Oberfläche.
   Liefert {source, products|details} oder {source:'', error} – dann bleibt das Formular leer. */
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
      console.warn(`Erkennung (${step.name}):`, e?.message || e);
    }
  }
  note('');
  return {source:'', error};
}

/* Antwort in die Form des Servers bringen: ohne Marke und Sorte zählt sie nicht */
function asDetails(hit){
  const brand = String(hit?.brand || '').trim(), variety = String(hit?.variety || '').trim();
  if (!brand && !variety) return null;
  return {details:{brand, variety, type:TYPES.includes(hit.type) ? hit.type : undefined,
    animal:SPECIES.some(s => s.k === hit.animal) ? hit.animal : undefined, texture:hit.texture}};
}

/* Server: für einen Barcode die Suche (ab Server 1.1.0), für ein Foto die KI-Erkennung */
async function fromServer({code, photo}){
  if (code && await serverCan('barcode')) {
    const hit = await lookupBarcode(code).catch(e => { console.warn('Barcode-Suche:', e.message); return null; });
    const found = hit?.found ? asDetails(hit) : null;
    if (found) return found;
  }
  return photo ? asDetails(await recognize(photo)) : null;
}

/* Foto-Erkennung über den Haushalts-Server: Schlüssel, Modell und Prompt liegen dort. */
export async function recognize(b64){
  if (!prefs.code) throw Object.assign(new ServerError('none', 'Kein Server verbunden.'), {retry:false});
  if (status.recognition === false) {
    throw Object.assign(new ServerError('unavailable', 'Auf dem Server ist die Foto-Erkennung noch nicht eingerichtet.'), {retry:true});
  }
  try { return await request('POST', '/api/recognize', {body:{image:b64}, timeout:70e3}); }
  catch (e) { e.retry = RETRY.has(e.kind); throw e; }
}

/* Unbekannten Barcode über den Server nachschlagen (Open Pet Food Facts und Open Food Facts).
   Antwort {found, brand, variety, type, animal}. Der Server fragt je Datenbank höchstens 5 Sekunden. */
export const lookupBarcode = code => request('GET', '/api/barcode/' + encodeURIComponent(code), {timeout:15e3});

/* Eigener KI-Schlüssel: Die App ruft Anthropic selbst auf, mit der Kopfzeile für den direkten Aufruf aus einer App.
   Modell und Prompt wie auf dem Server (shared/recognize-prompt.txt). Der Schlüssel bleibt auf diesem Handy. */
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
/* Die 60 neuesten eigenen Sorten hängen am Prompt, damit die Schreibweise gleich bleibt – wie auf dem Server */
function aiPrompt(){
  const known = [...db.products].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 60)
    .map(p => `${(p.brand || '').trim()} | ${(p.variety || '').trim()}`).filter(n => n !== ' | ');
  return known.length ? `${PROMPT}\nBereits bekannte Produkte. Wenn es eines davon ist, übernimm exakt diese Schreibweise:\n${known.join('\n')}` : PROMPT;
}
