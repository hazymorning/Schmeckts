// Settings and their pages; the pet editor view is in views/sheets.js, since it is also a sheet
import {$} from '../dom.js';
import {andList, esc} from '../text.js';
import {appInfo} from '../native.js';
import {icon} from '../icons.js';
import {REMIND, REMIND_MAX_H} from '../config.js';
import {db, loadError, prefs, queue, storageOK} from '../store.js';
import {isConnected, status} from '../sync.js';
import {feedSlots} from '../smart.js';
import {petNames} from '../derive.js';
import {armBtn, avatar, group, head, lead, main, segmented, syncInfo, under} from './parts.js';
import {sheet} from '../ui/sheet.js';

const THEMES = [
  ['system', 'System', 'auto'],
  ['light', 'Hell', 'sun'],
  ['dark', 'Dunkel', 'moon'],
];
// no 0 step, the switch turns it off. The own option opens a field, so it has an action of its own
const OWN_REMIND = 'own';
const REMIND_OPTIONS = [
  ...REMIND.filter(Boolean).map(m => [String(m), m / 60 + ' Std.']),
  [OWN_REMIND, 'Eigene', '', 'remind-own'],
];
const DENIED = 'Benachrichtigungen sind nicht erlaubt';

// after a refused permission the switch flips back by itself, so the line says why
const remindSub = () => (sheet.denied === 'remind' ? DENIED : 'Nach dem Füttern, auf diesem Handy');
const hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
function feedSub() {
  if (sheet.denied === 'feed') return DENIED;
  const slots = feedSlots(db, Date.now());
  return slots.length
    ? `Meist um ${andList(slots.map(x => hhmm(x.at)))} Uhr`
    : 'Lernt die üblichen Zeiten aus dem Verlauf';
}
const houseSub = n => (n.detail ? `${n.title}, ${n.detail.charAt(0).toLowerCase()}${n.detail.slice(1)}` : n.title);

const chev = icon('chevron', 'chev');
const pageRow = (page, ic, title, sub = '', id = '') =>
  `<button class="row set-row" data-action="settings-page" data-v="${page}">${lead(ic)}${main(title, sub, id)}${chev}</button>`;
const switchRow = (action, ic, title, sub, on, id = '') =>
  `<button class="row set-row" role="switch" aria-checked="${on}" data-action="${action}">${lead(ic)}${main(title, sub, id)}
    <span class="sw" aria-hidden="true"></span></button>`;
const doRow = (action, ic, title) =>
  `<button class="row set-row act" data-action="${action}">${lead(ic)}${main(title)}</button>`;
const petRow = p =>
  `<button class="row set-row" data-action="edit-pet" data-id="${p.id}">${avatar(p, 's')}${main(esc(p.name), esc(p.species))}${chev}</button>`;
const labelRow = (ic, title) => `<div class="row set-row">${lead(ic)}${main(title)}</div>`;

const LOOKUP = 'Fragt bei unbekannten Barcodes nach, nur mit der Nummer';
const SERVER_PHOTO = 'Erkennt Marke und Sorte auf dem Packungsfoto. Sonst liest das Handy den Text selbst.';

function overview() {
  const house = isConnected(),
    notice = syncInfo();
  const own = prefs.remind > 0 && (!!sheet.ownRemind || !REMIND.includes(prefs.remind));
  return `${
    loadError
      ? `<p class="banner">Die gespeicherten Daten konnten nicht gelesen werden. Bitte die App neu starten.</p>`
      : storageOK
        ? ''
        : `<p class="banner">In dieser Vorschau wird nichts dauerhaft gespeichert.</p>`
  }
    ${group('Tiere', db.pets.map(petRow).join('') + doRow('add-pet', 'plus', 'Tier hinzufügen'), 'set-group')}
    ${group(
      'Darstellung',
      labelRow('auto', 'Farbschema') +
        under(segmented('theme', THEMES, prefs.theme)) +
        switchRow('backdrop', 'paw', 'Profilbild im Hintergrund', 'Blass oben auf der Startseite', prefs.backdrop),
      'set-group',
    )}
    ${group(
      'Erinnerungen',
      switchRow('remind-on', 'clock', 'Ans Bewerten erinnern', remindSub(), !!prefs.remind, 'remindSub') +
        (prefs.remind
          ? under(
              segmented('remind', REMIND_OPTIONS, own ? OWN_REMIND : String(prefs.remind)) +
                (own
                  ? `<label class="label" for="f-remind">Stunden nach dem Füttern</label>
              <input id="f-remind" class="field" type="number" inputmode="numeric" min="1" max="${REMIND_MAX_H}" step="1" value="${prefs.remind / 60}" data-remind enterkeyhint="done">`
                  : ''),
            )
          : '') +
        switchRow('feed-remind', 'clock', 'Ans Füttern erinnern', feedSub(), prefs.feedRemind, 'feedSub'),
      'set-group',
    )}
    ${group(
      'Teilen',
      `<div class="row set-row">${lead('person')}<label class="t-main" for="f-me"><b>Dein Name</b></label>
        <input id="f-me" class="field in-row" data-setting="name" value="${esc(prefs.name)}" placeholder="z. B. Anna" autocomplete="off" autocapitalize="words"></div>` +
        pageRow('house', 'house', 'Haushalt', esc(houseSub(notice)), 'houseSub') +
        pageRow('exchange', 'phone', 'Austausch von Hand', 'Änderungen als Datei weitergeben'),
      'set-group',
    )}
    ${group(
      'Scannen',
      switchRow('lookup', 'search', 'Produktsuche im Internet', LOOKUP, prefs.lookup) +
        (house
          ? switchRow('server-photo', 'camera', 'Fotos über den Server erkennen', SERVER_PHOTO, prefs.serverPhoto)
          : ''),
      'set-group',
    )}
    ${group(
      'Daten',
      pageRow('backup', 'download', 'Backup', 'Sichern und wieder einlesen') +
        (house ? '' : doRow('demo', 'sparkle', 'Beispieldaten laden')) +
        pageRow('privacy', 'shield', 'Datenschutz'),
      'set-group',
    )}
    <div class="mt btn-col">${
      house
        ? armBtn('wipe', 'Alle Daten im Haushalt löschen', 'Nochmal tippen: für alle im Haushalt löschen')
        : armBtn('wipe', 'Alle Daten löschen', 'Nochmal tippen: wirklich alles löschen')
    }</div>
    <p class="hint foot">${house ? 'Alle Daten liegen auf diesem Handy und werden im Haushalt abgeglichen.' : 'Alle Daten bleiben auf diesem Handy.'}${appInfo.version ? `<br>Version ${esc(appInfo.version)}` : ''}${db.pets.length ? `<br>Mit Liebe für ${esc(petNames(db.pets.map(p => p.id)))}${icon('heart', 'love')}` : ''}</p>`;
}

const backupPage = () => `<p class="hint">Eine Datei mit allem, was die App gespeichert hat. Ein Import ersetzt die
  Daten auf diesem Handy.</p>
  <div class="btn-col">
    <button class="btn soft" data-action="export">${icon('download')}Exportieren</button>
    <label class="btn soft" for="importInput">${icon('upload')}Importieren</label>
  </div>`;

function exchangePage() {
  const ex = sheet?.exchange;
  return `<p class="hint">Änderungen als Datei an ein anderes Handy geben und von dort empfangen. Die Datei enthält
    nur Einträge, keine Einstellungen.</p>
    <div class="btn-col">
      <button class="btn soft" data-action="share-changes">${icon('phone')}Teilen</button>
      <label class="btn soft" for="exchangeInput">${icon('upload')}Empfangen</label>
    </div>
    ${ex ? `<p class="hint note" role="status">${esc(ex.text)}</p>${ex.peer ? `<div class="btn-col mt-s"><button class="btn soft" data-action="send-answer">${icon('phone')}Antwort senden</button></div>` : ''}` : ''}`;
}

// the last paragraph is the attribution the ODbL requires, see NOTICE
const PRIVACY = [
  'Tiere, Futter und Mahlzeiten speichert die App auf deinem Handy, nicht in der Galerie und nicht in Googles Cloud-Sicherung.',
  'Nutzt du die App nur auf diesem Handy, bleiben die Daten dort. Ausnahme ist der Barcode-Scanner: Er kommt von Google und meldet allgemeine Nutzungsdaten wie das Gerätemodell, aber keine Bilder.',
  'Den Text auf einer Packung liest das Handy selbst, ohne Netz. Mehr kann die Produktsuche im Internet unter „Scannen“, sie ist aus: Sie fragt bei unbekannten Barcodes zwei freie Produktdatenbanken, übertragen wird nur die Nummer.',
  'Bist du mit einem Haushalt verbunden, gleicht die App mit eurem Server ab. Dort liegen auch die Packungsfotos, damit jedes Handy sie groß zeigen kann. Zur Erkennung schickt der Server sie an Anthropic, das lässt sich unter „Scannen“ abschalten.',
  'Ein Backup und das Löschen aller Daten findest du unter „Daten“. „Austausch von Hand“ unter „Teilen“ gibt deine Einträge als Datei an ein anderes Handy weiter, ohne Server.',
  'Beim Lesen einer Packung berichtigt das Handy falsch gelesene Wörter mit einer Wortliste. Sie enthält Informationen aus Open Pet Food Facts, die hier unter der Open Database License (ODbL) verfügbar gemacht werden.',
];
const privacyPage = () => `<div class="privacy">${PRIVACY.map(t => `<p>${t}</p>`).join('')}</div>`;

// only a sync started by hand shows progress; background syncs stay invisible
function serverSection(notice = syncInfo()) {
  const s = sheet || {};
  const codeRow = `<div class="connect mt-s">
      <input id="f-code" class="field code" data-field="code" value="${esc(s.code || '')}" placeholder="Haushaltscode" aria-label="Haushaltscode"
        autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="12">
      <button class="btn primary" data-action="connect"${s.connecting ? ' disabled' : ''}>${s.connecting ? '<span class="spin"></span>Verbinde …' : 'Verbinden'}</button></div>
      ${s.connectError ? `<p class="hint note warn" role="alert">${esc(s.connectError)}</p>` : ''}`;
  const addrField = `<label class="label" for="f-server">Adresse des Servers</label>
      <input id="f-server" class="field" data-field="server" value="${esc(s.server ?? prefs.server)}" placeholder="http://192.168.… oder https://…"
        autocomplete="off" inputmode="url" spellcheck="false" enterkeyhint="next">`;
  if (!isConnected())
    return s.connectForm
      ? `<p class="hint">Verbunden sehen alle im Haushalt dieselben Tiere, Mahlzeiten und Bewertungen. Adresse und Code zeigt „Schmeckt’s-Server einrichten“ auf dem Mini-PC.</p>${addrField}${codeRow}`
      : `<p class="hint">Alle Daten bleiben auf diesem Handy. Verbunden sehen alle im Haushalt dieselben Tiere, Mahlzeiten und Bewertungen.</p>
        <button class="btn soft" data-action="connect-form">${icon('house')}Mit Haushalt verbinden</button>`;
  const needCode = status.kind === 'auth';
  return `<div class="group srv ${notice.tone}" role="status"><div class="row"><span class="thumb m srv-ic">${icon(notice.tone === 'bad' ? 'alert' : 'house')}</span>
    <span class="t-main"><b>${esc(notice.title)}</b><small>${esc(notice.detail)}</small></span></div></div>
    ${
      !needCode
        ? `<p class="hint addr"><span>Server ${esc(prefs.server)}</span></p>`
        : codeRow +
          (s.editServer
            ? addrField
            : `<p class="hint addr"><span>Server ${esc(prefs.server)}</span><button class="link" data-action="edit-server">Ändern</button></p>`)
    }
    <div class="btn-col mt-s">
      ${
        needCode
          ? ''
          : s.syncing === 'shown'
            ? `<button class="btn soft" disabled><span class="spin"></span>Abgleich läuft …</button>`
            : status.state === 'ok' && !queue.length
              ? ''
              : `<button class="btn soft" data-action="sync-now">${icon('refresh')}Abgleichen</button>`
      }
      ${armBtn('disconnect', 'Verbindung trennen', 'Nochmal tippen: trennen, die Daten bleiben hier', {ic: 'unplug', cls: 'plain'})}</div>`;
}
const housePage = () => `<div id="serverBox"></div>`;

const PAGES = {
  house: ['Haushalt', housePage],
  exchange: ['Austausch von Hand', exchangePage],
  backup: ['Backup', backupPage],
  privacy: ['Datenschutz', privacyPage],
};
export function viewSettings() {
  const page = PAGES[sheet.page];
  if (!page) return head('Einstellungen') + overview();
  return head(page[0]) + page[1]();
}

/* The box is rewritten only when its visible content changes; when only the detail line changes, only its text is
   swapped. fresh: the page was just drawn and the box is empty. */
let boxFrame = ''; // last written box, without the detail line
export function paintHouse(fresh = false) {
  const notice = syncInfo(),
    row = $('#houseSub');
  if (row) {
    row.textContent = houseSub(notice);
    row.className = notice.tone === 'bad' ? 'warn' : '';
    return;
  }
  const box = $('#serverBox');
  if (!box) return;
  const frame = serverSection({...notice, detail: ''});
  if (fresh || frame !== boxFrame) {
    if (!fresh && document.activeElement?.tagName === 'INPUT' && box.contains(document.activeElement)) return; // do not interrupt while typing
    boxFrame = frame;
    box.innerHTML = serverSection(notice);
    return;
  }
  const line = $('.srv small', box);
  if (line && line.textContent !== notice.detail) line.textContent = notice.detail;
}
