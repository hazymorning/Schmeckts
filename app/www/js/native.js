/* Brücke zu Android. In der App stehen die Capacitor-Plugins bereit, im Browser ist Native null. */

// In der Android-App stehen die Capacitor-Plugins bereit, im Browser ist Native null
export const Native = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins : null;
export const appInfo = {version:''};
const plugin = name => Native ? (Native[name] || window.Capacitor.registerPlugin?.(name)) : null;

/* Vibration in drei Stufen: Auswahl leicht, Erfolg mittel, Löschen und Fehler deutlich */
const LEVELS = {select:['LIGHT', 8], success:['MEDIUM', 16], strong:['HEAVY', 32]};
export const haptic = (level = 'select') => {
  const [style, ms] = LEVELS[level] || LEVELS.select;
  try { Native?.Haptics ? Native.Haptics.impact({style}).catch(() => {}) : navigator.vibrate?.(ms); } catch (e) {}
};

/* Text weitergeben: in der App über das Teilen-Menü (Share-Plugin), im Browser navigator.share, sonst die Zwischenablage.
   Liefert 'copied', wenn der Text nur kopiert wurde, sonst 'shared'. Abbrechen ist kein Fehler. */
export async function shareText(title, text){
  try {
    if (Native?.Share) await Native.Share.share({title, text, dialogTitle:title});
    else if (navigator.share) await navigator.share({title, text});
    else { await navigator.clipboard.writeText(text); return 'copied'; }
  } catch (e) { if (!/cancel|abort/i.test(`${e?.name} ${e?.message}`)) throw e; }
  return 'shared';
}

/* Lokale Benachrichtigungen für die Erinnerung zum Bewerten (Plugin @capacitor/local-notifications). Im Browser simuliert mit
   den Benachrichtigungen der Seite: gleiche Schnittstelle, geplant wird aber nur, solange die Seite offen ist. */
function browserNotifications(){
  const N = window.Notification, pending = new Map(), taps = [];
  const state = () => ({display:!N ? 'denied' : N.permission === 'default' ? 'prompt' : N.permission});
  const drop = id => { clearTimeout(pending.get(id)?.timer); pending.delete(id); };
  const show = n => { drop(n.id); new N(n.title, {body:n.body}).onclick = () => { window.focus(); taps.forEach(fn => fn({actionId:'tap', notification:n})); }; };
  return {
    checkPermissions: async () => state(),
    requestPermissions: async () => { if (N?.permission === 'default') await N.requestPermission(); return state(); },
    schedule: async ({notifications}) => {
      for (const n of notifications) { drop(n.id); pending.set(n.id, {n, timer:setTimeout(() => show(n), Math.max(0, new Date(n.schedule.at) - Date.now()))}); }
      return {notifications:notifications.map(({id}) => ({id}))};
    },
    cancel: async ({notifications}) => notifications.forEach(({id}) => drop(id)),
    getPending: async () => ({notifications:[...pending.values()].map(x => x.n)}),
    addListener: async (event, fn) => { if (event === 'localNotificationActionPerformed') taps.push(fn); }
  };
}
export const Notifications = plugin('LocalNotifications') || browserNotifications();

/* Eigenes Plugin (app/native/java): startet die Kamera-App, wenn die eigene Kamera (ui/camera.js) nicht geht.
   hint erscheint kurz über der Kamera. */
const Foto = plugin('Foto');
export const canTakePhoto = () => !!Foto;
export async function takePhoto(hint){ // Blob des Fotos, null bei Abbruch
  if (!Foto) return null;
  const r = await Foto.aufnehmen(hint ? {hinweis:hint} : undefined);
  if (!r?.base64) return null;
  return fetch('data:image/jpeg;base64,' + r.base64).then(x => x.blob());
}

/* Barcode lesen mit Googles fertiger Scan-Oberfläche (Plugin @capacitor-mlkit/barcode-scanning, nur scan()).
   Die Kamera steuern dabei die Google-Play-Dienste, ohne das Kamerarecht der App. Fehlt deren Scanner-Modul,
   wird es zuerst installiert, onInstall zeigt solange einen Hinweis. Liefert den gelesenen Code, null bei Abbruch,
   und wirft, wenn Scannen auf diesem Handy nicht geht. Im Browser simuliert: der Code wird eingetippt. */
const Scanner = plugin('BarcodeScanner');
const FORMATS = ['EAN_13', 'EAN_8', 'UPC_A'];
const INSTALL = {completed:4, canceled:3, failed:5}; // GoogleBarcodeScannerModuleInstallState
export async function scanBarcode(onInstall){
  if (!Native) return prompt('Barcode eintippen (Vorschau ohne Kamera)')?.trim() || null;
  if (!Scanner) throw new Error('Kein Scanner in dieser App.');
  const {available} = await Scanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) { onInstall?.(); await installScanner(); }
  try {
    const {barcodes} = await Scanner.scan({formats:FORMATS});
    return barcodes?.[0]?.rawValue || null;
  } catch (e) {
    if (/cancel/i.test(String(e?.message))) return null;
    throw e;
  }
}
async function installScanner(){
  let settle;
  const done = new Promise((resolve, reject) => { settle = {resolve, reject}; });
  const listener = await Scanner.addListener('googleBarcodeScannerModuleInstallProgress', ({state}) => {
    if (state === INSTALL.completed) settle.resolve();
    else if (state === INSTALL.canceled || state === INSTALL.failed) settle.reject(new Error('Das Scanner-Modul ließ sich nicht installieren.'));
  });
  const timer = setTimeout(() => settle.reject(new Error('Die Installation des Scanners dauert zu lange.')), 120e3);
  try {
    await Scanner.installGoogleBarcodeScannerModule()
      .catch(e => { if (/already installed/i.test(String(e?.message))) settle.resolve(); else throw e; });
    await done;
  } finally { clearTimeout(timer); listener?.remove?.(); }
}
