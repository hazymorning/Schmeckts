/* Light, dark or system. Sets nothing but data-theme to the scheme currently in force (the system's under
   „System“); the colours live in tokens.css. */
import {$} from '../dom.js';
import {Native} from '../native.js';
import {prefs} from '../store.js';

const darkMQ = matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(){
  const root = document.documentElement;
  root.dataset.theme = prefs.theme === 'system' ? (darkMQ.matches ? 'dark' : 'light') : prefs.theme;
  $('meta[name="theme-color"]').content = getComputedStyle(root).backgroundColor;
  Native?.SystemBars?.setStyle({style: {system:'DEFAULT', light:'LIGHT', dark:'DARK'}[prefs.theme] || 'DEFAULT'}).catch(() => {});
}
darkMQ.addEventListener('change', applyTheme);
