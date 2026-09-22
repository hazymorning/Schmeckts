/* Bridge to Android. In the app the Capacitor plugins are available; in the browser Native is null. */
import {report} from './report.js';

export const Native = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins : null;
export const appInfo = {version: ''};
const plugin = name => (Native ? Native[name] || window.Capacitor.registerPlugin?.(name) : null);

/* Haptics in three strengths: selection light, success medium, deletion and errors pronounced */
const LEVELS = {select: ['LIGHT', 8], success: ['MEDIUM', 16], strong: ['HEAVY', 32]};
export const haptic = (level = 'select') => {
  const [style, ms] = LEVELS[level] || LEVELS.select;
  try {
    // Feedback and nothing else: a phone without a vibration motor, or one that refuses, changes nothing
    // that a person could act on, so a failure here is deliberately passed over.
    Native?.Haptics ? Native.Haptics.impact({style}).catch(() => {}) : navigator.vibrate?.(ms);
  } catch {
    /* see above: haptics are a nicety */
  }
};

/* Make a file from another app (content:// or file://) readable through Capacitor's own server */
export const fileUrl = uri => window.Capacitor?.convertFileSrc?.(uri) || uri;

/* Pass text on: through the share menu in the app (Share plugin), navigator.share in the browser, the clipboard
   otherwise. Returns 'copied' when the text was only copied, 'shared' otherwise. Cancelling is not an error. */
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

/* Local notifications for the rating reminder (plugin @capacitor/local-notifications). Simulated in the browser with
   the page's own notifications: same interface, but scheduling only lasts while the page is open. */
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
    addListener: async (event, fn) => {
      if (event === 'localNotificationActionPerformed') taps.push(fn);
    },
  };
}
export const Notifications = plugin('LocalNotifications') || browserNotifications();

/* Our own plugin (app/native/java): starts the camera app when the app's own camera (ui/camera.js) will not run.
   hint appears briefly above the camera. */
const Photo = plugin('Photo');
export const canTakePhoto = () => !!Photo;
export async function takePhoto(hint) {
  // the photo as a blob, null on cancel
  if (!Photo) return null;
  const r = await Photo.capture(hint ? {hint} : undefined);
  if (!r?.base64) return null;
  return fetch('data:image/jpeg;base64,' + r.base64).then(x => x.blob());
}

/* Read text off a photo (plugin @capacitor-mlkit/text-recognition, processImage only, Latin script).
   This runs on the device, without network and without a key; it needs no camera permission, as the photo comes
   from the existing flow. It sits briefly in the private cache for that and is deleted right after. Returns '' if
   nothing works. */
const TextReader = plugin('TextRecognition');
const TEXT_FILE = 'schmeckts-ocr.jpg';
export async function readPhotoText(b64) {
  if (!TextReader || !Native?.Filesystem || !b64) return '';
  try {
    const {uri} = await Native.Filesystem.writeFile({path: TEXT_FILE, data: b64, directory: 'CACHE'});
    try {
      return String((await TextReader.processImage({path: uri}))?.text || '');
    } finally {
      await Native.Filesystem.deleteFile({path: TEXT_FILE, directory: 'CACHE'}).catch(e =>
        report('deleting the photo from the cache', e),
      );
    }
  } catch (e) {
    report('text on the photo', e);
    return '';
  }
}

/* Read a barcode with Google's ready-made scan interface (plugin @capacitor-mlkit/barcode-scanning, scan() only).
   Google Play services drive the camera for it, without the app's camera permission. If their scanner module is
   missing, it is installed first and onInstall shows a notice meanwhile. Returns the code read, null on cancel, and
   throws when scanning does not work on this phone. Simulated in the browser: the code is typed in. */
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
