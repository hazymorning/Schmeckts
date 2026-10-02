import {$} from '../dom.js';
import {esc} from '../text.js';
import {icon} from '../icons.js';
import {topDialog} from './sheet.js';

export let toastUndo = null;
let toastTimer = null;
const READ = 60; // ms per character, so a longer text stays until it is read
const LONG = 80; // characters from which the undo button goes under the text
/* ic: an icon that leads a confirmation, in the colours of tone (a class that sets --c and --cs). html: msg is
   markup, escaped by the caller. */
export function toast(msg, undo, {ic = '', tone = '', html = false} = {}) {
  const el = $('#toast');
  const host = topDialog() || document.body; // or the dialog's dimming covers it
  if (el.parentNode !== host) host.appendChild(el);
  el.classList.toggle('in-sheet', host !== document.body);
  el.classList.toggle('plain', !undo);
  el.classList.toggle('has-ic', !!ic);
  toastUndo = undo || null;
  el.innerHTML =
    (ic ? `<i class="toast-ic ${tone}">${icon(ic)}</i>` : '') +
    `<span>${html ? msg : esc(msg)}</span>${undo ? `<button data-action="undo">${icon('undo')}Rückgängig</button>` : ''}`;
  const chars = el.querySelector(':scope > span').textContent.length;
  el.classList.toggle('long', !!undo && chars > LONG);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, Math.max(undo ? 5200 : 2600, READ * chars));
}
export function hideToast() {
  $('#toast').classList.remove('show');
  toastUndo = null;
}
