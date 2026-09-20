/* Erkennung einer Futterpackung über den Haushalts-Server: per Foto (KI) oder per Barcode (Produktdatenbanken).
   Der Server hält Schlüssel, Modell und Prompt, die App ruft Anthropic nie direkt auf.
   Fehler der Foto-Erkennung tragen retry: true, wenn sich ein neuer Versuch lohnt. */
import {ServerError, request} from './api.js';
import {status} from './sync.js';
import {prefs} from './store.js';

const RETRY = new Set(['offline', 'busy', 'unavailable', 'server', 'auth', 'locked']);

export async function recognize(b64){
  if (!prefs.code) throw Object.assign(new ServerError('none', 'Kein Server verbunden.'), {retry:false});
  if (status.recognition === false) {
    throw Object.assign(new ServerError('unavailable', 'Auf dem Server ist die Foto-Erkennung noch nicht eingerichtet.'), {retry:true});
  }
  try { return await request('POST', '/api/recognize', {body:{image:b64}, timeout:70e3}); }
  catch (e) { e.retry = RETRY.has(e.kind); throw e; }
}

/* Unbekannten Barcode nachschlagen (Server ab 1.1.0, Open Pet Food Facts und Open Food Facts).
   Antwort {found, brand, variety, type, animal}. Der Server fragt je Datenbank höchstens 5 Sekunden. */
export const lookupBarcode = code => request('GET', '/api/barcode/' + encodeURIComponent(code), {timeout:15e3});
