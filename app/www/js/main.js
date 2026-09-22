/* Starting the app: build the interface, wire up the storage and sync hooks, start syncing, handle Android's back
   button. Imports the sheet views and actions, which register themselves as they load.
   store.js loads the stored data before this module runs (top-level await), and the native splash screen stays
   up until the home page is drawn and the typefaces are there (ui/splash.js), so nobody sees the page build up.
   ui/splash.js comes first, because its fallback timer starts as the module loads. */
import {hideSplash, hideSplashWhenReady} from './ui/splash.js';
import {appInfo, Native} from './native.js';
import {icon} from './icons.js';
import {diskHooks} from './disk.js';
import {hooks} from './store.js';
import {startSync, syncHooks, syncSoon} from './sync.js';
import {applyTheme} from './ui/theme.js';
import {toast} from './ui/toast.js';
import {dlg, renderSheet, sheet, sheetBack, sheetBody} from './ui/sheet.js';
import {closeCamera} from './ui/camera.js';
import {renderHome, renderSyncChip, update} from './views/home.js';
import {paintHouse} from './views/settings.js';
import './views/sheets.js'; // registers the contents of the sheets
import {retryWaiting} from './logic/feeding.js';
import {startReminders, syncReminders} from './logic/reminders.js';
import {clearExports} from './logic/data.js';
import {openLink} from './actions.js'; // also registers clicks and input
import {report} from './report.js';

document.querySelectorAll('[data-icon]').forEach(el => {
  el.innerHTML = icon(el.dataset.icon);
});
const typingIn = box => document.activeElement?.tagName === 'INPUT' && box?.contains(document.activeElement);
hooks.changed = () => {
  // changes from other devices
  update();
  if (sheet && !typingIn(sheetBody)) renderSheet();
  syncReminders(); // rated or deleted elsewhere: cancel the reminder
};
hooks.saved = () => {
  syncSoon(400);
  syncReminders();
}; // sync shortly after our own save, keep the reminders current
syncHooks.status = () => {
  renderSyncChip();
  paintHouse();
}; // the box in the settings only changes on new content
syncHooks.reachable = () => retryWaiting(); // recognise waiting photos as soon as the server is reachable
diskHooks.failed = () => toast('Der Speicher ist voll. Bitte ein Backup exportieren.');
try {
  startSync();
  applyTheme();
  renderHome(); // drawn exactly once before the splash goes
  startReminders();
  clearExports();
} catch (e) {
  report('start', e);
  hideSplash(); // whatever happened, the app must not stay behind the splash
}
hideSplashWhenReady();
if (Native?.App) {
  // Back: close an open camera or an open sheet, otherwise send the app to the background (as native apps do)
  Native.App.addListener('backButton', ({canGoBack}) => {
    if (closeCamera()) return;
    if (dlg.open) sheetBack();
    else if (canGoBack) history.back();
    else Native.App.minimizeApp();
  });
  Native.App.getInfo()
    .then(i => {
      appInfo.version = i.version;
    })
    .catch(e => report('app version', e));
  // Shortcuts and deep links, on a cold start (Capacitor holds the event back) and while the app is running
  Native.App.addListener('appUrlOpen', ({url}) => {
    openLink(url);
  });
}
/* The strip behind the status bar is only there once the page has moved (body::before). CSS cannot ask how far
   the document has scrolled, so the class says it. */
const markScrolled = () => document.documentElement.classList.toggle('scrolled', window.scrollY > 0);
markScrolled();
window.addEventListener('scroll', markScrolled, {passive: true});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !dlg.open) renderHome();
});
setInterval(() => {
  if (!dlg.open && !document.hidden) renderHome();
}, 60000);
