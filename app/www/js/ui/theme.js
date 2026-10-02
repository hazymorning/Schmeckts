import {$} from '../dom.js';
import {Native} from '../native.js';
import {report} from '../report.js';
import {prefs} from '../store.js';

const darkMQ = matchMedia('(prefers-color-scheme: dark)');
let dark = 0; // open always-dark screens (camera, photo viewer)

export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme === 'system' ? (darkMQ.matches ? 'dark' : 'light') : prefs.theme;
  $('meta[name="theme-color"]').content = getComputedStyle(root).backgroundColor;
  Native?.SystemBars?.setStyle({
    style: dark ? 'DARK' : {system: 'DEFAULT', light: 'LIGHT', dark: 'DARK'}[prefs.theme] || 'DEFAULT',
  }).catch(e => report('status bar style', e));
}
darkMQ.addEventListener('change', applyTheme);

// light bar icons while an always-dark screen is open, even if the system theme changes meanwhile
export function darkBars(on) {
  dark = Math.max(0, dark + (on ? 1 : -1));
  applyTheme();
}
