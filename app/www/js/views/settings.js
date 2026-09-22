/* The settings: a page of grouped rows, and behind some of them a page of its own. Everything about the household
   server lives here too, because that is one of those pages. The pet editor is another; its view sits in
   views/sheets.js, because the same one is a sheet when it is reached from the home page. */
import {$} from '../dom.js';
import {andList, esc} from '../text.js';
import {appInfo} from '../native.js';
import {icon} from '../icons.js';
import {REMIND, REMIND_MAX_H} from '../config.js';
import {db, loadError, prefs, queue, storageOK} from '../store.js';
import {isConnected, status} from '../sync.js';
import {feedSlots} from '../smart.js';
import {armBtn, avatar, head, segmented, syncInfo} from './parts.js';
import {sheet} from '../ui/sheet.js';

const THEMES = [
  ['system', 'System', 'auto'],
  ['light', 'Hell', 'sun'],
  ['dark', 'Dunkel', 'moon'],
];
/* The steps of the rating reminder without the 0: „Aus“ is the switch now. „Eigene“ opens a field instead of
   setting a value, so it carries an action of its own. */
const OWN_REMIND = 'own';
const REMIND_OPTIONS = [
  ...REMIND.filter(Boolean).map(m => [String(m), m / 60 + ' Std.']),
  [OWN_REMIND, 'Eigene', '', 'remind-own'],
];
const DENIED = 'Benachrichtigungen sind nicht erlaubt';

/* The lines under the two reminders say what the setting does. The rating one says why instead when the phone
   refused notifications, because then the switch has jumped back on its own (logic/reminders.js). */
const remindSub = () => (sheet.denied === 'remind' ? DENIED : 'Nach dem Füttern, auf diesem Handy');
const hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
function feedSub() {
  if (sheet.denied === 'feed') return DENIED;
  const slots = feedSlots(db, Date.now());
  return slots.length
    ? `Meist um ${andList(slots.map(x => hhmm(x.at)))} Uhr`
    : 'Lernt die üblichen Zeiten aus dem Verlauf';
}
/* „Haushalt“: the state of the sync in a line, as syncInfo() puts it */
const houseSub = n => (n.detail ? `${n.title}, ${n.detail.charAt(0).toLowerCase()}${n.detail.slice(1)}` : n.title);

/* A row of a group. Leading 32px: a plain icon in --muted, or the pet's picture. Then the title and under it at
   most two lines saying what the setting does. Trailing: a switch, a chevron for a page, or nothing. The whole
   row is the tap target (PROJECT.md, „Settings“). A segment or a field belonging to a row stands under it in the
   text column, which the group's grid takes care of. */
const lead = ic => `<span class="set-ic">${icon(ic)}</span>`;
const main = (title, sub = '', id = '') =>
  `<span class="t-main"><b>${title}</b>${sub ? `<small${id ? ` id="${id}"` : ''}>${sub}</small>` : ''}</span>`;
const chev = icon('chevron', 'chev');
const pageRow = (page, ic, title, sub = '', id = '') =>
  `<button class="set-row" data-action="settings-page" data-v="${page}">${lead(ic)}${main(title, sub, id)}${chev}</button>`;
const switchRow = (action, ic, title, sub, on, id = '') =>
  `<button class="set-row" role="switch" aria-checked="${on}" data-action="${action}">${lead(ic)}${main(title, sub, id)}
    <span class="sw" aria-hidden="true"></span></button>`;
const doRow = (action, ic, title) =>
  `<button class="set-row act" data-action="${action}">${lead(ic)}${main(title)}</button>`;
const petRow = p =>
  `<button class="set-row" data-action="edit-pet" data-id="${p.id}">${avatar(p)}${main(esc(p.name), esc(p.species))}${chev}</button>`;
const labelRow = (ic, title) => `<div class="set-row">${lead(ic)}${main(title)}</div>`;
const under = html => `<div class="set-under">${html}</div>`;
const group = (label, rows) => `<span class="label">${label}</span><div class="set-group">${rows}</div>`;

const LOOKUP = 'Fragt bei unbekannten Barcodes nach, nur mit der Nummer';
const SERVER_PHOTO = 'Erkennt Marke und Sorte auf dem Packungsfoto. Sonst liest das Handy den Text selbst.';

function overview() {
  const house = isConnected(),
    notice = syncInfo();
  // „Eigene“: chosen, or a stored value that is not one of the steps
  const own = prefs.remind > 0 && (!!sheet.ownRemind || !REMIND.includes(prefs.remind));
  return `${
    loadError
      ? `<p class="banner">Die gespeicherten Daten konnten nicht gelesen werden. Bitte die App neu starten.</p>`
      : storageOK
        ? ''
        : `<p class="banner">In dieser Vorschau wird nichts dauerhaft gespeichert.</p>`
  }
    ${group('Tiere', db.pets.map(petRow).join('') + doRow('add-pet', 'plus', 'Tier hinzufügen'))}
    ${group(
      'Darstellung',
      labelRow('auto', 'Farbschema') +
        under(segmented('theme', THEMES, prefs.theme)) +
        switchRow(
          'backdrop',
          'paw',
          'Profilbild im Hintergrund',
          'Blass hinter dem Kopf der Startseite',
          prefs.backdrop,
        ),
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
    )}
    ${group(
      'Teilen',
      `<div class="set-row">${lead('person')}<label class="t-main" for="f-me"><b>Dein Name</b></label>
        <input id="f-me" class="field in-row" data-setting="name" value="${esc(prefs.name)}" placeholder="z. B. Anna" autocomplete="off" autocapitalize="words"></div>` +
        pageRow('house', 'house', 'Haushalt', esc(houseSub(notice)), 'houseSub') +
        pageRow('exchange', 'phone', 'Austausch von Hand', 'Änderungen als Datei weitergeben'),
    )}
    ${group(
      'Scannen',
      switchRow('lookup', 'search', 'Produktsuche im Internet', LOOKUP, prefs.lookup) +
        (house
          ? switchRow('server-photo', 'camera', 'Fotos über den Server erkennen', SERVER_PHOTO, prefs.serverPhoto)
          : ''),
    )}
    ${group(
      'Daten',
      pageRow('backup', 'download', 'Backup', 'Sichern und wieder einlesen') +
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

const backupPage = () => `<p class="hint">Eine Datei mit allem, was die App gespeichert hat. Ein Import ersetzt die
  Daten auf diesem Handy.</p>
  <div class="btn-col">
    <button class="btn soft" data-action="export">${icon('download')}Backup exportieren</button>
    <label class="btn soft" for="importInput">${icon('upload')}Backup importieren</label>
  </div>`;

/* Page „Austausch von Hand“: changes as a file to another phone and back. The notes say what goes out.
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

/* Datenschutz: what happens to the data in each of the two modes */
const PRIVACY = [
  'Tiere, Futter und Mahlzeiten speichert die App auf deinem Handy, nicht in der Galerie und nicht in Googles Cloud-Sicherung.',
  'Nutzt du die App nur auf diesem Handy, bleiben die Daten dort. Ausnahme ist der Barcode-Scanner: Er kommt von Google und meldet allgemeine Nutzungsdaten wie das Gerätemodell, aber keine Bilder.',
  'Den Text auf einer Packung liest das Handy selbst, ohne Netz. Mehr kann die Produktsuche im Internet unter „Scannen“, sie ist aus: Sie fragt bei unbekannten Barcodes zwei freie Produktdatenbanken, übertragen wird nur die Nummer.',
  'Bist du mit einem Haushalt verbunden, gleicht die App mit eurem Server ab. Der schickt Packungsfotos zur Erkennung an Anthropic und unbekannte Barcodes, nur die Nummer, an freie Produktdatenbanken. Die Foto-Erkennung lässt sich unter „Scannen“ abschalten.',
  'Ein Backup und das Löschen aller Daten findest du unter „Daten“. „Austausch von Hand“ unter „Teilen“ gibt eine Datei mit Tieren, Futter und Mahlzeiten an ein anderes Handy weiter, ohne Server.',
];
const privacyPage = () => `<div class="privacy">${PRIVACY.map(t => `<p>${t}</p>`).join('')}</div>`;

/* Page „Haushalt“. Mode `lokal`: the „Mit Haushalt verbinden“ button, which opens the fields for address
   and code. Connected: the state of the sync, „Jetzt abgleichen“ and „Verbindung trennen“. Only the hand-started
   sync shows progress (sheet.syncing, see actions.js); syncs in the background stay invisible. */
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

/* The household, live: on the overview only the line under its title, on its page the whole box. The box is only
   rewritten when its visible content changes: status changes with no visible consequence (busy on every short sync)
   do nothing, and when only the line under the title changes, such as the „zuletzt abgeglichen“ timestamp, only its
   text is swapped. fresh: right after the page was drawn, when the box is still empty. */
let boxFrame = ''; // the box as last written, without the line under the title
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
