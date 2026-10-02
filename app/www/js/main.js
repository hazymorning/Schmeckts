// ui/splash.js comes first: its fallback timer starts as the module loads
import {hideSplash, hideSplashWhenReady} from './ui/splash.js';
import {appInfo, Native} from './native.js';
import {icon} from './icons.js';
import {diskHooks} from './disk.js';
import {hooks} from './store.js';
import {startSync, syncHooks, syncSoon} from './sync.js';
import {applyTheme} from './ui/theme.js';
import {toast} from './ui/toast.js';
import {anyOpen, renderSheet, sheet, sheetBack, topBody} from './ui/sheet.js';
import {closeCamera} from './ui/camera.js';
import {closeViewer} from './ui/viewer.js';
import {renderHome, renderSyncChip, update} from './views/home.js';
import {paintHouse} from './views/settings.js';
import './views/sheets.js';
import './ui/slider.js';
import {retryWaiting, settleNamed} from './logic/feeding.js';
import {startReminders, syncReminders} from './logic/reminders.js';
import {clearExports} from './logic/data.js';
import {followPhotos, sharePhotos, tidyPhotos} from './logic/products.js';
import {openLink} from './actions.js';
import {report} from './report.js';

document.querySelectorAll('[data-icon]').forEach(el => {
  el.innerHTML = icon(el.dataset.icon);
});
const typingIn = box => document.activeElement?.tagName === 'INPUT' && box?.contains(document.activeElement);
hooks.changed = () => {
  // changes from other devices
  settleNamed(false);
  followPhotos();
  update();
  if (sheet && !typingIn(topBody())) renderSheet();
  syncReminders();
};
hooks.saved = () => {
  syncSoon(400);
  syncReminders();
  followPhotos();
};
syncHooks.status = () => {
  renderSyncChip();
  paintHouse();
};
syncHooks.reachable = () => {
  retryWaiting();
  sharePhotos();
};
diskHooks.failed = () => toast('Der Speicher ist voll. Bitte ein Backup exportieren.');
try {
  startSync();
  applyTheme();
  settleNamed(false); // named on another phone meanwhile
  followPhotos();
  renderHome(); // exactly once before the splash goes
  startReminders();
  clearExports();
  tidyPhotos();
} catch (e) {
  report('start', e);
  hideSplash(); // never stay behind the splash
}
hideSplashWhenReady();
if (Native?.App) {
  // with nothing left to close, back sends the app to the background as native apps do
  Native.App.addListener('backButton', ({canGoBack}) => {
    if (closeCamera() || closeViewer()) return;
    if (anyOpen()) sheetBack();
    else if (canGoBack) history.back();
    else Native.App.minimizeApp();
  });
  Native.App.getInfo()
    .then(i => {
      appInfo.version = i.version;
    })
    .catch(e => report('app version', e));
  // on a cold start Capacitor holds the event back until this listener exists
  Native.App.addListener('appUrlOpen', ({url}) => {
    openLink(url);
  });
}
// CSS cannot ask how far the document has scrolled
const markScrolled = () => document.documentElement.classList.toggle('scrolled', window.scrollY > 0);
markScrolled();
window.addEventListener('scroll', markScrolled, {passive: true});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !anyOpen()) renderHome();
});
setInterval(() => {
  if (!anyOpen() && !document.hidden) renderHome();
}, 60000);
