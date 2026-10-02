// exchange by file without a server; the file holds data and clocks only, no settings and no household code
import {fileUrl, haptic, shareFile} from '../native.js';
import {report} from '../report.js';
import {allClocks, changesSince, merge, prefs, savePrefs, state, topClock} from '../store.js';
import {toast} from '../ui/toast.js';
import {openPage, openSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';

const KIND = 'exchange',
  PROTOCOL = 1;
const fileName = () => `schmeckts-${KIND}-${new Date().toISOString().slice(0, 10)}.json`;

// without a known device the oldest mark applies, so nothing is left out
function markFor(device) {
  const marks = Object.entries(prefs.exchange || {});
  if (device) return prefs.exchange?.[device]?.mark || null;
  return marks.length ? marks.map(([, x]) => x.mark || '').sort()[0] : null;
}
// the mark moves on only once the device holds everything this phone has
function remember(device, level = true) {
  if (!device) return;
  const was = prefs.exchange?.[device]?.mark || '';
  (prefs.exchange ||= {})[device] = {at: Date.now(), mark: level ? topClock() : was};
  savePrefs();
}

// peer: {device, clocks} when answering a received file
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
    if (!(await shareFile(name, data, 'Schmeckt’s-Austausch', 'Änderungen an das andere Handy'))) return;
  } catch (e) {
    report('exchange file', e);
    toast('Die Datei konnte nicht geteilt werden.');
    return;
  }
  haptic('success');
  remember(peer?.device);
  if (peer && sheet?.kind === 'settings') {
    delete sheet.exchange; // the other device is level now
    renderSheet();
  }
  toast(`${many} weitergegeben`);
}

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
    file = null;
  }
  const bad = check(file);
  if (bad) {
    haptic('strong');
    toast(bad);
    return;
  }
  const took = merge(file.records);
  const back = changesSince(file.clocks);
  remember(file.device, !back.length);
  const info = {
    text: message(took, back.length),
    peer: back.length ? {device: file.device, clocks: file.clocks} : null,
  };
  haptic(took ? 'success' : 'select');
  update();
  if (sheet?.kind === 'settings') {
    sheet.exchange = info;
    if (sheet.page === 'exchange') renderSheet();
    else openPage('exchange');
  } else openSheet({kind: 'settings', page: 'exchange', exchange: info});
  toast(info.text);
}

const message = (took, back) =>
  `${took ? `${took} ${took === 1 ? 'Änderung' : 'Änderungen'} übernommen.` : 'Nichts Neues dabei.'}` +
  (back
    ? ` ${back} ${back === 1 ? 'Änderung fehlt' : 'Änderungen fehlen'} auf dem anderen Gerät.`
    : ' Beide Geräte sind gleich.');

function check(file) {
  if (!file || typeof file !== 'object') return 'Diese Datei ist kein Schmeckt’s-Austausch.';
  if (file.app !== 'schmeckts' || file.kind !== KIND) {
    return Array.isArray(file.servings)
      ? 'Das ist ein Backup. Es gehört unter „Daten“ zu „Backup“.'
      : 'Diese Datei ist kein Schmeckt’s-Austausch.';
  }
  if (file.protocol > PROTOCOL) return 'Die Datei kommt von einer neueren App. Bitte diese App aktualisieren.';
  if (!Array.isArray(file.records) || !file.clocks || typeof file.clocks !== 'object')
    return 'Diese Austausch-Datei ist beschädigt.';
  if (file.device === state.device) return 'Diese Datei kommt von diesem Handy.';
  return '';
}
