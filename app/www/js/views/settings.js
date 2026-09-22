/* The settings: an overview of grouped rows, each leading to a sub-page in the same sheet, and the sub-pages
   themselves. Everything about the household server lives here too, because that is one of those sub-pages. */
import {$} from '../dom.js';
import {andList, esc} from '../text.js';
import {appInfo} from '../native.js';
import {icon} from '../icons.js';
import {REMIND, REMIND_MAX_H} from '../config.js';
import {db, loadError, prefs, queue, storageOK} from '../store.js';
import {isConnected, status} from '../sync.js';
import {feedSlots} from '../smart.js';
import {armBtn, avatar, closeBtn, onOff, segmented, syncInfo} from './parts.js';
import {sheet} from '../ui/sheet.js';

/* The choices on the sub-pages. „Eigene“ under the rating reminder opens a field instead of setting a value,
   so it carries an action of its own. */
const THEMES = [
  ['system', 'System', 'auto'],
  ['light', 'Hell', 'sun'],
  ['dark', 'Dunkel', 'moon'],
];
const OWN_REMIND = 'own';
const REMIND_OPTIONS = [
  ...REMIND.map(m => [String(m), m ? m / 60 + ' Std.' : 'Aus']),
  [OWN_REMIND, 'Eigene', '', 'remind-own'],
];

/* The notes under the reminders: they say what the chosen setting currently means.
   logic/reminders.js rewrites the rating one in place, because the permission may be refused after the tap. */
export const remindHint = () =>
  !prefs.remind
    ? 'Dieses Handy erinnert nicht ans Bewerten.'
    : `Dieses Handy erinnert ${prefs.remind === 60 ? '1 Stunde' : prefs.remind / 60 + ' Stunden'} nach dem Füttern ans Bewerten.`;
function feedHint() {
  const slots = feedSlots(db, Date.now()),
    hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
    on = prefs.feedRemind;
  if (!slots.length)
    return (
      'Die üblichen Zeiten lernt die App aus dem Verlauf, sobald an vier Tagen etwa zur selben Zeit gefüttert wurde.' +
      (on ? ' Bis dahin kommt keine Erinnerung.' : '')
    );
  return (
    `Futter gibt es meist um ${andList(slots.map(x => hhmm(x.at)))} Uhr. ` +
    (!on
      ? 'Dieses Handy erinnert nicht daran.'
      : `Ist ${slots[0].remind - slots[0].at} Minuten später nichts serviert, erinnert dieses Handy.` +
        (isConnected() ? ' Was andere inzwischen serviert haben, erfährt es erst, wenn die App offen war.' : ''))
  );
}

/* What the rows say on the right: the current setting in a few words, so the overview answers most questions
   without opening anything. */
const themeValue = () => (THEMES.find(([v]) => v === prefs.theme) || THEMES[0])[1];
const remindValue = () => {
  if (!prefs.remind && !prefs.feedRemind) return 'Aus';
  const rate = prefs.remind ? `Bewerten ${prefs.remind / 60} Std.` : 'Bewerten aus';
  return `${rate}, Füttern ${prefs.feedRemind ? 'an' : 'aus'}`;
};

/* A row of the overview. `pageRow` leads to a sub-page and shows the current value, `doRow` simply does something
   and therefore carries neither value nor chevron. `id` on a value lets it be rewritten without a redraw. */
const rowIc = ic => `<span class="row-ic">${icon(ic)}</span>`;
const pageRow = (page, ic, title, value = '', tone = '', id = '') =>
  `<button class="list-row" data-action="settings-page" data-v="${page}">${rowIc(ic)}
    <span class="t-main"><b>${title}</b></span>
    ${value ? `<span class="val ${tone}"${id && ` id="${id}"`}>${esc(value)}</span>` : ''}
    ${icon('chevron', 'chev')}</button>`;
const doRow = (action, ic, title) =>
  `<button class="list-row" data-action="${action}">${rowIc(ic)}<span class="t-main"><b>${title}</b></span></button>`;
const group = (label, rows) => `<span class="label">${label}</span><div class="set-group">${rows}</div>`;

/* „Produktsuche im Internet“ is the one setting that sits in the overview itself: the whole row is the switch, so
   the tap target is the row, and the line under the title says what currently goes out. */
const LOOKUP_ON =
  'Bei unbekannten Barcodes fragt dieses Handy zwei freie Produktdatenbanken. Übertragen wird nur die Nummer.';
const LOOKUP_OFF = 'Unbekannte Barcodes führen gleich zum Foto. Es geht keine Nummer hinaus.';
const lookupRow = () =>
  `<button class="list-row wrap" role="switch" aria-checked="${prefs.lookup}" data-action="lookup">${rowIc('search')}
    <span class="t-main"><b>Produktsuche im Internet</b><small>${prefs.lookup ? LOOKUP_ON : LOOKUP_OFF}</small></span>
    <span class="sw" aria-hidden="true"></span></button>`;

const petRow = p =>
  `<button class="list-row" data-action="edit-pet" data-id="${p.id}">${avatar(p)}
    <span class="t-main"><b>${esc(p.name)}</b><small>${esc(p.species)}</small></span>${icon('chevron', 'chev')}</button>`;

function overview() {
  const house = isConnected(),
    notice = syncInfo();
  return `${
    loadError
      ? `<p class="banner">Die gespeicherten Daten konnten nicht gelesen werden. Bitte die App neu starten.</p>`
      : storageOK
        ? ''
        : `<p class="banner">In dieser Vorschau wird nichts dauerhaft gespeichert.</p>`
  }
    ${group('Tiere', db.pets.map(petRow).join('') + doRow('add-pet', 'plus', 'Tier hinzufügen'))}
    ${group('App', pageRow('look', prefs.theme === 'system' ? 'auto' : prefs.theme === 'dark' ? 'moon' : 'sun', 'Darstellung', themeValue()) + pageRow('remind', 'clock', 'Erinnerungen', remindValue()))}
    ${group(
      'Teilen',
      pageRow('name', 'person', 'Dein Name', prefs.name || 'Fehlt noch') +
        pageRow('house', 'house', 'Haushalt', notice.title, notice.tone, 'houseVal') +
        pageRow('exchange', 'phone', 'Austausch von Hand') +
        lookupRow(),
    )}
    ${group(
      'Daten',
      pageRow('backup', 'download', 'Backup') +
        (house ? '' : doRow('demo', 'sparkle', 'Beispieldaten laden')) +
        pageRow('privacy', 'shield', 'Datenschutz'),
    )}
    <div class="mt btn-col">${
      house
        ? armBtn('wipe', 'Alle Daten im Haushalt löschen', 'Nochmal tippen: für alle im Haushalt löschen')
        : armBtn('wipe', 'Alle Daten löschen', 'Nochmal tippen: wirklich alles löschen')
    }</div>
    <p class="foot">${house ? 'Die Daten werden im Haushalt geteilt.' : 'Alle Daten bleiben auf diesem Gerät.'}${appInfo.version ? `<br>Version ${esc(appInfo.version)}` : ''}</p>`;
}

const lookPage = () => `<span class="label">Farben</span>
  ${segmented('theme', THEMES, prefs.theme)}
  <span class="label">Profilbild im Hintergrund</span>
  <p class="hint">Das Bild des Tieres liegt blass hinter dem Kopf der Startseite.</p>
  ${onOff('backdrop', prefs.backdrop)}`;

function remindPage() {
  // „Eigene“: chosen, or a stored value that is not one of the steps
  const own = prefs.remind > 0 && (!!sheet.ownRemind || !REMIND.includes(prefs.remind));
  return `<span class="label">Ans Bewerten erinnern</span>
    <p class="hint" id="remind-hint">${remindHint()}</p>
    ${segmented('remind', REMIND_OPTIONS, own ? OWN_REMIND : String(prefs.remind))}
    ${
      own
        ? `<label class="label" for="f-remind">Stunden nach dem Füttern</label>
      <input id="f-remind" class="field" type="number" inputmode="numeric" min="1" max="${REMIND_MAX_H}" step="1" value="${prefs.remind / 60}" data-remind enterkeyhint="done">`
        : ''
    }
    <span class="label">Ans Füttern erinnern</span>
    <p class="hint">${feedHint()}</p>
    ${onOff('feed-remind', prefs.feedRemind)}`;
}

const namePage = () => `<p class="hint">Erscheint im Verlauf, damit im Haushalt alle sehen, wer gefüttert hat.</p>
  <input id="f-me" class="field" data-setting="name" value="${esc(prefs.name)}" placeholder="z. B. Anna" autocomplete="off" autocapitalize="words">`;

const backupPage = () => `<p class="hint">Eine Datei mit allem, was die App gespeichert hat. Ein Import ersetzt die
  Daten auf diesem Handy.</p>
  <div class="btn-col">
    <button class="btn soft" data-action="export">${icon('download')}Backup exportieren</button>
    <label class="btn soft" for="importInput">${icon('upload')}Backup importieren</label>
  </div>`;

/* Sub-page „Austausch von Hand“: changes as a file to another phone and back. The notes say what goes out.
   After receiving, the report sits here and, when the other device is missing something, „Antwort senden“
   (sheet.exchange, see logic/exchange.js). */
function exchangePage() {
  const ex = sheet?.exchange;
  return `<p class="hint">Änderungen als Datei an ein anderes Handy geben und von dort empfangen. Die Datei enthält
    nur Tiere, Futter und Mahlzeiten.</p>
    <div class="btn-col">
      <button class="btn soft" data-action="share-changes">${icon('phone')}Änderungen teilen</button>
      <label class="btn soft" for="exchangeInput">${icon('upload')}Austausch empfangen</label>
    </div>
    ${ex ? `<p class="note" role="status">${esc(ex.text)}</p>${ex.peer ? `<div class="btn-col mt-s"><button class="btn soft" data-action="send-answer">${icon('phone')}Antwort senden</button></div>` : ''}` : ''}`;
}

/* Datenschutz: explains both modes factually, without promises */
const PRIVACY = [
  'Tiere, Futter und Mahlzeiten speichert die App auf deinem Handy, nicht in der Galerie und nicht in Googles Cloud-Sicherung.',
  'Nutzt du die App nur auf diesem Handy, bleiben die Daten dort. Ausnahme ist der Barcode-Scanner: Er kommt von Google und meldet allgemeine Nutzungsdaten wie das Gerätemodell, aber keine Bilder.',
  'Den Text auf einer Packung liest das Handy selbst, ohne Netz. Mehr kann eine Einstellung unter „Teilen“, sie ist aus: Die Produktsuche im Internet fragt bei unbekannten Barcodes zwei freie Produktdatenbanken, übertragen wird nur die Nummer.',
  'Bist du mit einem Haushalt verbunden, gleicht die App mit eurem Server ab. Der schickt Packungsfotos zur Erkennung an Anthropic und unbekannte Barcodes, nur die Nummer, an freie Produktdatenbanken.',
  'Ein Backup und das Löschen aller Daten findest du unter „Daten“. „Austausch von Hand“ unter „Teilen“ gibt eine Datei mit Tieren, Futter und Mahlzeiten an ein anderes Handy weiter, ohne Server.',
];
const privacyPage = () => `<div class="privacy">${PRIVACY.map(t => `<p>${t}</p>`).join('')}</div>`;

/* Sub-page „Haushalt“. Mode `lokal`: the „Mit Haushalt verbinden“ button, which opens the fields for address and
   code. Connected: the state of the sync, „Jetzt abgleichen“ and „Verbindung trennen“. Only the hand-started sync
   shows progress (sheet.syncing, see actions.js); syncs in the background stay invisible. */
function serverSection(notice = syncInfo()) {
  const s = sheet || {};
  const codeRow = `<div class="connect mt-s">
      <input id="f-code" class="field code" data-field="code" value="${esc(s.code || '')}" placeholder="Haushaltscode" aria-label="Haushaltscode"
        autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="12">
      <button class="btn primary" data-action="connect"${s.connecting ? ' disabled' : ''}>${s.connecting ? '<span class="spin"></span>Verbinde …' : 'Verbinden'}</button></div>
      ${s.connectError ? `<p class="note warn" role="alert">${esc(s.connectError)}</p>` : ''}`;
  const addrField = `<label class="label" for="f-server">Adresse des Servers</label>
      <input id="f-server" class="field" data-field="server" value="${esc(s.server ?? prefs.server)}" placeholder="http://192.168.… oder https://…"
        autocomplete="off" inputmode="url" spellcheck="false" enterkeyhint="next">`;
  if (!isConnected())
    return s.connectForm
      ? `<p class="hint">Verbunden sehen alle im Haushalt dieselben Tiere, Mahlzeiten und Bewertungen. Adresse und Code zeigt „Schmeckt’s-Server einrichten“ auf dem Mini-PC.</p>${addrField}${codeRow}`
      : `<p class="hint">Alle Daten bleiben auf diesem Handy. Verbunden sehen alle im Haushalt dieselben Tiere, Mahlzeiten und Bewertungen.</p>
        <button class="btn soft" data-action="connect-form">${icon('house')}Mit Haushalt verbinden</button>`;
  const needCode = status.kind === 'auth';
  return `<div class="srv ${notice.tone}" role="status"><span class="srv-ic">${icon(notice.tone === 'bad' ? 'alert' : 'house')}</span>
    <span class="t-main"><b>${esc(notice.title)}</b><small>${esc(notice.detail)}</small></span></div>
    ${
      !needCode
        ? `<p class="addr"><span>Server ${esc(prefs.server)}</span></p>`
        : codeRow +
          (s.editServer
            ? addrField
            : `<p class="addr"><span>Server ${esc(prefs.server)}</span><button class="link" data-action="edit-server">Ändern</button></p>`)
    }
    <div class="btn-col mt-s">
      ${
        needCode
          ? ''
          : s.syncing === 'shown'
            ? `<button class="btn soft" disabled><span class="spin"></span>Abgleich läuft …</button>`
            : status.state === 'ok' && !queue.length
              ? '' // all synced: nothing to do
              : `<button class="btn soft" data-action="sync-now">${icon('refresh')}Jetzt abgleichen</button>`
      }
      ${armBtn('disconnect', 'Verbindung trennen', 'Nochmal tippen: trennen, die Daten bleiben hier', {ic: 'unplug', cls: 'plain'})}</div>`;
}
const housePage = () => `<div id="serverBox"></div>`;

const PAGES = {
  look: ['Darstellung', lookPage],
  remind: ['Erinnerungen', remindPage],
  name: ['Dein Name', namePage],
  house: ['Haushalt', housePage],
  exchange: ['Austausch von Hand', exchangePage],
  backup: ['Backup', backupPage],
  privacy: ['Datenschutz', privacyPage],
};
const backBtn = `<button class="icon-btn lead" data-action="settings-back" aria-label="Zurück">${icon('back')}</button>`;
export function viewSettings() {
  const page = PAGES[sheet.page];
  if (!page) return `<div class="sh-head"><h2>Einstellungen</h2>${closeBtn}</div>${overview()}`;
  return `<div class="sh-head">${backBtn}<h2>${page[0]}</h2>${closeBtn}</div>${page[1]()}`;
}

/* The household, live: on the overview only the value in its row, on the sub-page the whole box. The box is only
   rewritten when its visible content changes: status changes with no visible consequence (busy on every short sync)
   do nothing, and when only the line under the title changes, such as the „zuletzt abgeglichen“ timestamp, only its
   text is swapped. fresh: right after the sheet was drawn, when the box is still empty. */
let boxFrame = ''; // the box as last written, without the line under the title
export function paintHouse(fresh = false) {
  const notice = syncInfo(),
    val = $('#houseVal');
  if (val) {
    val.textContent = notice.title;
    val.className = 'val ' + notice.tone;
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
