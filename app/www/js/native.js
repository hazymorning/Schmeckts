// Capacitor plugins in the app; Native is null in the browser
import {jpegSize, readingOf} from './reading.js';
import {report} from './report.js';

export const Native = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins : null;
export const appInfo = {version: ''};
const plugin = name => (Native ? Native[name] || window.Capacitor.registerPlugin?.(name) : null);

const LEVELS = {select: ['LIGHT', 8], success: ['MEDIUM', 16], strong: ['HEAVY', 32]};
export const haptic = (level = 'select') => {
  const [style, ms] = LEVELS[level] || LEVELS.select;
  try {
    Native?.Haptics ? Native.Haptics.impact({style}).catch(() => {}) : navigator.vibrate?.(ms);
  } catch {
    // nothing depends on haptics, a phone that cannot vibrate is ignored
  }
};

// a content:// or file:// uri from another app, served through Capacitor
export const fileUrl = uri => window.Capacitor?.convertFileSrc?.(uri) || uri;

// 'copied' when it only reached the clipboard; cancelling is not an error
export async function shareText(title, text) {
  try {
    if (Native?.Share) await Native.Share.share({title, text, dialogTitle: title});
    else if (navigator.share) await navigator.share({title, text});
    else {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch (e) {
    if (!/cancel|abort/i.test(`${e?.name} ${e?.message}`)) throw e;
  }
  return 'shared';
}

// a JSON file through the share menu, or a download in the browser; false when cancelled
export const sharesFiles = () => !!(Native?.Filesystem && Native?.Share);
export async function shareFile(name, text, title, dialogTitle) {
  if (!sharesFiles()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  }
  try {
    const {uri} = await Native.Filesystem.writeFile({path: name, data: text, directory: 'CACHE', encoding: 'utf8'});
    await Native.Share.share({title, files: [uri], dialogTitle});
  } catch (e) {
    if (/cancel/i.test(String(e?.message))) return false;
    throw e;
  }
  return true;
}

// browser stand-in: schedules only last while the page is open
function browserNotifications() {
  const N = window.Notification,
    pending = new Map(),
    taps = [];
  const state = () => ({display: !N ? 'denied' : N.permission === 'default' ? 'prompt' : N.permission});
  const drop = id => {
    clearTimeout(pending.get(id)?.timer);
    pending.delete(id);
  };
  const show = n => {
    drop(n.id);
    new N(n.title, {body: n.body}).onclick = () => {
      window.focus();
      taps.forEach(fn => fn({actionId: 'tap', notification: n}));
    };
  };
  return {
    checkPermissions: async () => state(),
    requestPermissions: async () => {
      if (N?.permission === 'default') await N.requestPermission();
      return state();
    },
    schedule: async ({notifications}) => {
      for (const n of notifications) {
        drop(n.id);
        pending.set(n.id, {n, timer: setTimeout(() => show(n), Math.max(0, new Date(n.schedule.at) - Date.now()))});
      }
      return {notifications: notifications.map(({id}) => ({id}))};
    },
    cancel: async ({notifications}) => notifications.forEach(({id}) => drop(id)),
    getPending: async () => ({notifications: [...pending.values()].map(x => x.n)}),
    registerActionTypes: async () => {}, // a page's notifications carry no buttons
    addListener: async (event, fn) => {
      if (event === 'localNotificationActionPerformed') taps.push(fn);
    },
  };
}
export const Notifications = plugin('LocalNotifications') || browserNotifications();

// browser stand-in for our own plugin, only while the page is open
function browserFeedReminder() {
  const N = window.Notification,
    timers = [],
    taps = [];
  const show = r => {
    if (N?.permission !== 'granted') return;
    new N(r.title, {body: r.body}).onclick = () => {
      window.focus();
      taps.forEach(fn => fn());
    };
  };
  return {
    set: async ({reminders}) => {
      timers.splice(0).forEach(clearTimeout);
      for (const r of reminders) timers.push(setTimeout(() => show(r), Math.max(0, r.at - Date.now())));
    },
    addListener: async (event, fn) => {
      if (event === 'tap') taps.push(fn);
    },
  };
}
export const FeedReminder = plugin('FeedReminder') || browserFeedReminder();

// our own plugin: the system camera app, for when ui/camera.js will not run
const Photo = plugin('Photo');
export const canTakePhoto = () => !!Photo;
export async function takePhoto(hint) {
  if (!Photo) return null;
  const r = await Photo.capture(hint ? {hint} : undefined);
  if (!r?.base64) return null;
  return fetch('data:image/jpeg;base64,' + r.base64).then(x => x.blob());
}

// on-device text recognition; the plugin reads from a path, so the photo passes through the private cache
const TextReader = plugin('TextRecognition');
let reads = 0;
const UNREAD = {text: '', width: 0, height: 0, lines: [], ms: 0, raw: null};
export async function readPhoto(b64) {
  if (!TextReader || !Native?.Filesystem || !b64) return {...UNREAD};
  try {
    const path = `schmeckts-ocr-${++reads}.jpg`; // readings may overlap
    const {uri} = await Native.Filesystem.writeFile({path, data: b64, directory: 'CACHE'});
    try {
      const start = performance.now();
      const raw = (await TextReader.processImage({path: uri})) || {};
      const ms = Math.round(performance.now() - start),
        {width, height} = jpegSize(b64);
      return {...readingOf(raw, width, height), ms, raw};
    } finally {
      await Native.Filesystem.deleteFile({path, directory: 'CACHE'}).catch(e =>
        report('deleting the photo from the cache', e),
      );
    }
  } catch (e) {
    report('text on the photo', e);
    return {...UNREAD};
  }
}

// Play services drive the camera, so no camera permission is needed; their module is installed first if missing
const Scanner = plugin('BarcodeScanner');
const FORMATS = ['EAN_13', 'EAN_8', 'UPC_A'];
const INSTALL = {completed: 4, canceled: 3, failed: 5}; // GoogleBarcodeScannerModuleInstallState
export async function scanBarcode(onInstall) {
  if (!Native) return prompt('Barcode eintippen (Vorschau ohne Kamera)')?.trim() || null;
  if (!Scanner) throw new Error('Kein Scanner in dieser App.');
  const {available} = await Scanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    onInstall?.();
    await installScanner();
  }
  try {
    const {barcodes} = await Scanner.scan({formats: FORMATS});
    return barcodes?.[0]?.rawValue || null;
  } catch (e) {
    if (/cancel/i.test(String(e?.message))) return null;
    throw e;
  }
}
async function installScanner() {
  let settle;
  const done = new Promise((resolve, reject) => {
    settle = {resolve, reject};
  });
  const listener = await Scanner.addListener('googleBarcodeScannerModuleInstallProgress', ({state}) => {
    if (state === INSTALL.completed) settle.resolve();
    else if (state === INSTALL.canceled || state === INSTALL.failed)
      settle.reject(new Error('Das Scanner-Modul ließ sich nicht installieren.'));
  });
  const timer = setTimeout(() => settle.reject(new Error('Die Installation des Scanners dauert zu lange.')), 120e3);
  try {
    await Scanner.installGoogleBarcodeScannerModule().catch(e => {
      if (/already installed/i.test(String(e?.message))) settle.resolve();
      else throw e;
    });
    await done;
  } finally {
    clearTimeout(timer);
    listener?.remove?.();
  }
}
