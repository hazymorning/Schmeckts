/* Light, dark or system. Sets data-theme to the scheme in force (the system's under „System“); the colours
   live in tokens.css. */
import {$} from '../dom.js';
import {Native} from '../native.js';
import {report} from '../report.js';
import {prefs} from '../store.js';

const darkMQ = matchMedia('(prefers-color-scheme: dark)');

export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme === 'system' ? (darkMQ.matches ? 'dark' : 'light') : prefs.theme;
  $('meta[name="theme-color"]').content = getComputedStyle(root).backgroundColor;
  Native?.SystemBars?.setStyle({
    style: {system: 'DEFAULT', light: 'LIGHT', dark: 'DARK'}[prefs.theme] || 'DEFAULT',
  }).catch(e => report('status bar style', e));
}
darkMQ.addEventListener('change', applyTheme);

/* The camera and the photo viewer are always dark: light status bar icons while one of them is open */
export function darkBars(on) {
  if (!on) return applyTheme();
  Native?.SystemBars?.setStyle({style: 'DARK'}).catch(e => report('status bar style', e));
}
