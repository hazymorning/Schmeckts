/* Hybride Uhr für das Sync-Protokoll: „<ms, 13 Ziffern>-<Zähler, 4 Ziffern>-<Gerät>“, als Text sortierbar.
   ms ist die eigene Zeit plus die Abweichung zur Serverzeit. Jede neue Uhr ist größer als jede zuvor
   ausgegebene und jede gesehene, auch über Neustarts hinweg (der Stand liegt in sync.json). */

const PATTERN = /^(\d{13})-(\d{4})-([a-z0-9]{4,16})$/;
const FUTURE = 10 * 60e3; // so weit darf eine Uhr vorgehen, mehr lehnt der Server ab

export const clockState = {device:'', offset:0, ms:0, n:0};

export function randomId(len = 16){
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), b => abc[b % 36]).join('');
}

const serverNow = () => Date.now() + clockState.offset;

export function stamp(){
  const t = serverNow();
  if (t > clockState.ms) { clockState.ms = t; clockState.n = 0; }
  else if (++clockState.n > 9999) { clockState.ms++; clockState.n = 0; }
  return `${String(clockState.ms).padStart(13, '0')}-${String(clockState.n).padStart(4, '0')}-${clockState.device}`;
}

/* Eine fremde Uhr gesehen: Was danach hier geändert wird, bekommt eine größere Uhr. */
export function observe(t){
  const m = PATTERN.exec(t);
  if (!m) return;
  const ms = +m[1], n = +m[2];
  if (ms > serverNow() + FUTURE) return;
  if (ms > clockState.ms || (ms === clockState.ms && n > clockState.n)) { clockState.ms = ms; clockState.n = n; }
}

/* Abweichung zur Serverzeit aus einer Antwort, gemessen zur Mitte der Anfrage */
export function measure(server, sentAt, receivedAt){
  if (typeof server !== 'number' || receivedAt - sentAt > 10e3) return;
  clockState.offset = Math.round(server - (sentAt + receivedAt) / 2);
}

/* Nach einer Ablehnung wegen der Uhrzeit: nicht in der Zukunft weiterzählen */
export function rebase(){
  const t = serverNow();
  if (clockState.ms > t) { clockState.ms = t; clockState.n = 0; }
}
