/* Manual exchange, without a server. „Änderungen teilen“ writes a file holding every change since the last exchange
   with the other device, together with our own field clocks, and hands it to the share menu. „Austausch empfangen“
   merges such a file strictly by the protocol: per field the larger clock wins, and a deletion stays a deletion.
   The report afterwards says what was taken over and what the other device is missing; „Antwort senden“ sends exactly
   that back, after which both are level. The file holds data and clocks only: no settings, no household code, no
   key. */
import {Native, fileUrl, haptic} from '../native.js';
import {report} from '../report.js';
import {allClocks, changesSince, merge, prefs, savePrefs, state, topClock} from '../store.js';
import {toast} from '../ui/toast.js';
import {openPage, openSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';

const KIND = 'exchange',
  PROTOCOL = 1;
const fileName = () => `schmeckts-${KIND}-${new Date().toISOString().slice(0, 10)}.json`;

/* The mark for a device: what had it already seen at the last exchange? Without a known counterpart the oldest mark
   across all devices applies, so nobody misses anything; with no exchange at all the file holds everything. */
function markFor(device) {
  const marks = Object.entries(prefs.exchange || {});
  if (device) return prefs.exchange?.[device]?.mark || null;
  return marks.length ? marks.map(([, x]) => x.mark || '').sort()[0] : null;
}
function remember(device) {
  if (!device) return;
  (prefs.exchange ||= {})[device] = {at: Date.now(), mark: topClock()};
  savePrefs();
}

/* Build the file and pass it on. peer: {device, clocks} after receiving („Antwort senden“), otherwise the stored state. */
export async function shareChanges(peer = null) {
  const records = changesSince(peer ? peer.clocks : markFor(null));
  const data = JSON.stringify({
    app: 'schmeckts',
    kind: KIND,
    protocol: PROTOCOL,
    device: state.device,
    at: Date.now(),
    clocks: allClocks(),
    records,
  });
  const name = fileName();
  const many = `${records.length} ${records.length === 1 ? 'Änderung' : 'Änderungen'}`;
  try {
    if (Native?.Filesystem && Native?.Share) {
      const {uri} = await Native.Filesystem.writeFile({path: name, data, directory: 'CACHE', encoding: 'utf8'});
      await Native.Share.share({
        title: 'Schmeckt’s-Austausch',
        files: [uri],
        dialogTitle: 'Änderungen an das andere Handy',
      });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], {type: 'application/json'}));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  } catch (e) {
    if (/cancel/i.test(String(e?.message))) return;
    toast('Die Datei konnte nicht geteilt werden.');
    return;
  }
  haptic('success');
  remember(peer?.device);
  if (peer && sheet?.kind === 'settings') {
    delete sheet.exchange;
    renderSheet();
  } // the gap is closed
  toast(`${many} weitergegeben`);
}

/* Take a file in: from the file picker or from another app (intent, see actions.js) */
export const receiveFile = async file => {
  if (file) apply(await file.text().catch(() => ''));
};
export async function receiveUri(uri) {
  let text;
  try {
    text = await fetch(fileUrl(uri)).then(r => r.text());
  } catch (e) {
    report('exchange file', e);
    toast('Die Datei ließ sich nicht öffnen.');
    return;
  }
  apply(text);
}

function apply(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    file = null; // check() below turns that into a sentence a person can act on
  }
  const bad = check(file);
  if (bad) {
    haptic('strong');
    toast(bad);
    return;
  }
  const took = merge(file.records);
  const back = changesSince(file.clocks);
  remember(file.device);
  // The report sits on the „Austausch von Hand“ page, with „Antwort senden“ when the other device is missing something
  const info = {
    text: message(took, back.length),
    peer: back.length ? {device: file.device, clocks: file.clocks} : null,
  };
  haptic(took ? 'success' : 'select');
  update();
  if (sheet?.kind === 'settings') {
    sheet.exchange = info;
    if (sheet.page === 'exchange') renderSheet();
    else openPage('exchange'); // a file from another app, with the settings already open elsewhere
  } else openSheet({kind: 'settings', page: 'exchange', exchange: info});
  toast(info.text);
}

const message = (took, back) =>
  `${took ? `${took} ${took === 1 ? 'Änderung' : 'Änderungen'} übernommen.` : 'Nichts Neues dabei.'}` +
  (back
    ? ` ${back} ${back === 1 ? 'Änderung fehlt' : 'Änderungen fehlen'} auf dem anderen Gerät.`
    : ' Beide Geräte sind gleich.');

/* Reject foreign or corrupted files, with a message people can understand */
function check(file) {
  if (!file || typeof file !== 'object') return 'Diese Datei ist kein Schmeckt’s-Austausch.';
  if (file.app !== 'schmeckts' || file.kind !== KIND) {
    return Array.isArray(file.servings)
      ? 'Das ist ein Backup. Es gehört unter „Daten“ zu „Backup importieren“.'
      : 'Diese Datei ist kein Schmeckt’s-Austausch.';
  }
  if (file.protocol > PROTOCOL) return 'Die Datei kommt von einer neueren App. Bitte diese App aktualisieren.';
  if (!Array.isArray(file.records) || !file.clocks || typeof file.clocks !== 'object')
    return 'Diese Austausch-Datei ist beschädigt.';
  if (file.device === state.device) return 'Diese Datei kommt von diesem Handy.';
  return '';
}
