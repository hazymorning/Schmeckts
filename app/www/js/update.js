// A newer release from GitHub, installed over this one by Android's installer. Only in the app: a browser has nothing
// to install.
import {appInfo, Native} from './native.js';

const LATEST = 'https://api.github.com/repos/hazymorning/Schmeckts/releases/latest';
const APK = 'schmeckts.apk';
const Installer = Native ? Native.Update || window.Capacitor.registerPlugin?.('Update') : null;

/* state: '' not asked yet, asking, current, failed (GitHub out of reach), found, loading. later: „Später“ on the
   home card, until the next start. */
export const release = {state: '', version: '', url: '', share: 0, later: false};
export const updateHooks = {changed() {}};
export const canUpdate = () => !!Installer;

const parts = v =>
  String(v)
    .replace(/^v/, '')
    .split('.')
    .map(n => parseInt(n, 10) || 0);
export function newer(a, b) {
  const x = parts(a),
    y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

export async function checkRelease() {
  if (!Installer || !appInfo.version || release.state === 'asking' || release.state === 'loading') return;
  release.state = 'asking';
  updateHooks.changed();
  try {
    const res = await fetch(LATEST, {cache: 'no-store', signal: AbortSignal.timeout(10e3)});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = await res.json();
    // the APK is attached a few minutes after the release is published
    const apk = (r.assets || []).find(a => a.name === APK);
    if (apk && newer(r.tag_name, appInfo.version))
      Object.assign(release, {
        state: 'found',
        version: String(r.tag_name).replace(/^v/, ''),
        url: apk.browser_download_url,
      });
    else release.state = 'current';
  } catch {
    release.state = 'failed'; // offline, or GitHub busy: asked again on the next start
  }
  updateHooks.changed();
}

// resolves once Android's installer is open; that asks before it replaces the app, and cancelling leaves all as it was
export async function installRelease() {
  if (release.state !== 'found') return;
  Object.assign(release, {state: 'loading', share: 0});
  updateHooks.changed();
  const listener = await Installer.addListener('progress', ({share}) => {
    release.share = share;
    updateHooks.changed();
  });
  try {
    await Installer.install({url: release.url});
  } finally {
    listener.remove();
    release.state = 'found';
    updateHooks.changed();
  }
}
