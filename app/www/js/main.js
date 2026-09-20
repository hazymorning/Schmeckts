/* Start der App: Oberfläche aufbauen, Speicher- und Sync-Haken verbinden, Abgleich starten, Android-Zurück-Taste.
   Importiert die Sheet-Ansichten und Aktionen, die sich beim Laden selbst anmelden.
   store.js lädt die gespeicherten Daten, bevor dieses Modul läuft (await auf oberster Ebene). */
import {appInfo, Native} from './native.js';
import {icon} from './icons.js';
import {diskHooks} from './disk.js';
import {hooks} from './store.js';
import {startSync, syncHooks, syncSoon} from './sync.js';
import {applyTheme} from './ui/theme.js';
import {toast} from './ui/toast.js';
import {closeSheet, dlg, renderSheet, sheet, sheetBody} from './ui/sheet.js';
import {closeCamera} from './ui/camera.js';
import {renderHome, renderSyncChip, update} from './views/home.js';
import {paintServerBox} from './views/sheets.js'; // meldet außerdem die Sheet-Inhalte an
import {retryWaiting} from './logic/feeding.js';
import {startReminders, syncReminders} from './logic/reminders.js';
import {clearExports} from './logic/data.js';
import {openLink} from './actions.js';         // meldet außerdem Klicks und Eingaben an

document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const typingIn = box => document.activeElement?.tagName === 'INPUT' && box?.contains(document.activeElement);
hooks.changed = () => { // Änderungen von anderen Geräten
  update();
  if (sheet && !typingIn(sheetBody)) renderSheet();
  syncReminders(); // anderswo bewertet oder gelöscht: Erinnerung absagen
};
hooks.saved = () => { syncSoon(400); syncReminders(); }; // kurz nach dem eigenen Speichern abgleichen, Erinnerungen nachführen
syncHooks.status = () => { renderSyncChip(); paintServerBox(); }; // der Kasten in den Einstellungen ändert sich nur bei neuem Inhalt
syncHooks.reachable = () => retryWaiting(); // wartende Fotos erkennen, sobald der Server erreichbar ist
diskHooks.failed = () => toast('Der Speicher ist voll. Bitte ein Backup exportieren.');
startSync();
applyTheme();
renderHome();
startReminders();
clearExports();
if (Native?.App) {
  // Zurück: offene Kamera oder offenes Sheet schließen, sonst App in den Hintergrund (wie bei nativen Apps)
  Native.App.addListener('backButton', ({canGoBack}) => {
    if (closeCamera()) return; // offene Kamera zuerst
    if (dlg.open) closeSheet();
    else if (canGoBack) history.back();
    else Native.App.minimizeApp();
  });
  Native.App.getInfo().then(i => { appInfo.version = i.version; }).catch(() => {});
  // Kurzbefehle und Deep Links, beim Kaltstart (Capacitor hält das Ereignis zurück) und bei laufender App
  Native.App.addListener('appUrlOpen', ({url}) => { openLink(url); });
}
setTimeout(() => document.body.classList.remove('intro'), 1800);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !dlg.open) renderHome(); });
setInterval(() => { if (!dlg.open && !document.hidden) renderHome(); }, 60000);
