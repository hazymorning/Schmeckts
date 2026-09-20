/* Austausch von Hand, ohne Server. „Änderungen teilen“ schreibt eine Datei mit allen Änderungen seit dem letzten
   Austausch mit dem anderen Gerät, samt den eigenen Feld-Uhren, und gibt sie ans Teilen-Menü. „Austausch empfangen“
   führt eine solche Datei zusammen, genau nach dem Protokoll: pro Feld gewinnt die größere Uhr, Löschen bleibt Löschen.
   Danach steht in der Meldung, was übernommen wurde und was dem anderen Gerät fehlt; „Antwort senden“ schickt genau das
   zurück, dann sind beide gleich. Die Datei enthält nur Daten und Uhren: keine Einstellungen, keinen Haushaltscode,
   keinen Schlüssel. */
import {Native, fileUrl, haptic} from '../native.js';
import {allClocks, changesSince, merge, prefs, savePrefs, state, topClock} from '../store.js';
import {toast} from '../ui/toast.js';
import {openSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';

export const KIND = 'austausch', PROTOKOLL = 1;
const fileName = () => `schmeckts-${KIND}-${new Date().toISOString().slice(0, 10)}.json`;

/* Marke für ein Gerät: Was hat es beim letzten Austausch schon gesehen? Ohne bekanntes Gegenüber gilt die älteste
   Marke aller Geräte, damit niemand etwas verpasst; ohne jeden Austausch enthält die Datei alles. */
function markFor(device){
  const marks = Object.entries(prefs.exchange || {});
  if (device) return prefs.exchange?.[device]?.mark || null;
  return marks.length ? marks.map(([, x]) => x.mark || '').sort()[0] : null;
}
function remember(device){
  if (!device) return;
  (prefs.exchange ||= {})[device] = {at:Date.now(), mark:topClock()};
  savePrefs();
}

/* Datei bauen und weitergeben. peer: {device, clocks} nach einem Empfang („Antwort senden“), sonst der gemerkte Stand. */
export async function shareChanges(peer = null){
  const records = changesSince(peer ? peer.clocks : markFor(null));
  const data = JSON.stringify({app:'schmeckts', kind:KIND, protokoll:PROTOKOLL, device:state.device, at:Date.now(),
    clocks:allClocks(), records});
  const name = fileName();
  const many = `${records.length} ${records.length === 1 ? 'Änderung' : 'Änderungen'}`;
  try {
    if (Native?.Filesystem && Native?.Share) {
      const {uri} = await Native.Filesystem.writeFile({path:name, data, directory:'CACHE', encoding:'utf8'});
      await Native.Share.share({title:'Schmeckt’s-Austausch', files:[uri], dialogTitle:'Änderungen an das andere Handy'});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], {type:'application/json'}));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  } catch (e) {
    if (/cancel/i.test(String(e?.message))) return;
    toast('Die Datei konnte nicht geteilt werden.'); return;
  }
  haptic('success');
  remember(peer?.device);
  if (peer && sheet?.kind === 'settings') { delete sheet.exchange; renderSheet(); } // die Lücke ist geschlossen
  toast(`${many} weitergegeben`);
}

/* Datei entgegennehmen: aus der Dateiauswahl oder von einer anderen App (Intent, siehe actions.js) */
export const receiveFile = async file => { if (file) apply(await file.text().catch(() => '')); };
export async function receiveUri(uri){
  let text = '';
  try { text = await fetch(fileUrl(uri)).then(r => r.text()); }
  catch (e) { console.warn('Austausch-Datei:', e?.message || e); toast('Die Datei ließ sich nicht öffnen.'); return; }
  apply(text);
}

function apply(text){
  let file = null;
  try { file = JSON.parse(text); } catch (e) { file = null; }
  const bad = check(file);
  if (bad) { haptic('strong'); toast(bad); return; }
  const took = merge(file.records);
  const back = changesSince(file.clocks);
  remember(file.device);
  // Die Meldung steht im Abschnitt „Haushalt“, mit dem Knopf „Antwort senden“, wenn dem anderen Gerät etwas fehlt
  const info = {text:message(took, back.length), peer:back.length ? {device:file.device, clocks:file.clocks} : null};
  haptic(took ? 'success' : 'select');
  update();
  if (sheet?.kind === 'settings') { sheet.exchange = info; renderSheet(); }
  else openSheet({kind:'settings', exchange:info});
  toast(info.text);
}

const message = (took, back) => `${took ? `${took} ${took === 1 ? 'Änderung' : 'Änderungen'} übernommen.` : 'Nichts Neues dabei.'}`
  + (back ? ` ${back} ${back === 1 ? 'Änderung fehlt' : 'Änderungen fehlen'} auf dem anderen Gerät.` : ' Beide Geräte sind gleich.');

/* Fremde oder beschädigte Dateien abweisen, mit verständlicher Meldung */
function check(file){
  if (!file || typeof file !== 'object') return 'Diese Datei ist kein Schmeckt’s-Austausch.';
  if (file.app !== 'schmeckts' || file.kind !== KIND) {
    return Array.isArray(file.servings) ? 'Das ist ein Backup. Es gehört unter „Daten“ zu „Backup importieren“.'
      : 'Diese Datei ist kein Schmeckt’s-Austausch.';
  }
  if (file.protokoll > PROTOKOLL) return 'Die Datei kommt von einer neueren App. Bitte diese App aktualisieren.';
  if (!Array.isArray(file.records) || !file.clocks || typeof file.clocks !== 'object') return 'Diese Austausch-Datei ist beschädigt.';
  if (file.device === state.device) return 'Diese Datei kommt von diesem Handy.';
  return '';
}
