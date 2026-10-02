import {$} from '../dom.js';
import {esc} from '../text.js';
import {icon} from '../icons.js';
import {topDialog} from './sheet.js';

export let toastUndo = null;
let toastTimer = null;
// html: msg is markup, escaped by the caller
export function toast(msg, undo, html = false) {
  const el = $('#toast');
  const host = topDialog() || document.body; // or the dialog's dimming covers it
  if (el.parentNode !== host) host.appendChild(el);
  el.classList.toggle('in-sheet', host !== document.body);
  el.classList.toggle('plain', !undo);
  toastUndo = undo || null;
  el.innerHTML = `<span>${html ? msg : esc(msg)}</span>${undo ? `<button data-action="undo">${icon('undo')}Rückgängig</button>` : ''}`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 5200 : 2600);
}
export function hideToast() {
  $('#toast').classList.remove('show');
  toastUndo = null;
}
