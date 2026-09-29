/* A short message at the bottom, optionally with „Rückgängig“. Replaces confirmation prompts. html: the message is
   markup already, escaped by the caller, for a name in bold. */
import {$} from '../dom.js';
import {esc} from '../text.js';
import {icon} from '../icons.js';
import {dlg} from './sheet.js';

export let toastUndo = null;
let toastTimer = null;
export function toast(msg, undo, html = false) {
  const el = $('#toast');
  const host = dlg.open ? dlg : document.body;
  if (el.parentNode !== host) host.appendChild(el);
  el.classList.toggle('in-sheet', dlg.open);
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
