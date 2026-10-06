import {$} from '../dom.js';
import {esc} from '../text.js';
import {icon} from '../icons.js';
import {topDialog} from './sheet.js';

export let toastUndo = null;
let toastTimer = null,
  ends = 0;
const READ = 60; // ms per character, so a longer text stays until it is read
const AFTER = 1500; // ms it stays once the finger lets go
const wait = ms => {
  clearTimeout(toastTimer);
  ends = Date.now() + ms;
  toastTimer = setTimeout(hideToast, ms);
};
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
  const text = el.querySelector(':scope > span'),
    chars = text.textContent.length;
  // the button goes under a text that beside it would take more than its two lines
  el.classList.remove('long');
  el.classList.toggle('long', !!undo && text.offsetHeight > 2.5 * parseFloat(getComputedStyle(text).lineHeight));
  // swiped away last time: back in place at once, then in as usual
  if (el.style.getPropertyValue('--swipe')) {
    el.classList.add('dragging');
    el.style.removeProperty('--swipe');
    void el.offsetWidth;
    el.classList.remove('dragging');
  }
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  wait(Math.max(undo ? 5200 : 2600, READ * chars));
}
export function hideToast() {
  clearTimeout(toastTimer);
  $('#toast').classList.remove('show');
  toastUndo = null;
}

/* Swiped sideways it goes without undoing anything; while the finger is on it, it stays. Only a move past SLOP is a
   swipe, so a tap on its button stays a tap. */
const SLOP = 8;
const el = $('#toast');
let x0 = 0,
  dx = 0,
  t0 = 0,
  left = 0,
  down = false,
  swiped = false;
el.addEventListener('pointerdown', e => {
  if (!el.classList.contains('show')) return;
  down = true;
  swiped = false;
  x0 = e.clientX;
  dx = 0;
  t0 = performance.now();
  left = ends - Date.now();
  clearTimeout(toastTimer);
});
el.addEventListener('pointermove', e => {
  if (!down) return;
  dx = e.clientX - x0;
  if (!swiped && Math.abs(dx) > SLOP) {
    swiped = true;
    el.classList.add('dragging');
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone; the next pointerup ends the swipe */
    }
  }
  if (swiped) el.style.setProperty('--swipe', `${dx}px`);
});
const end = () => {
  if (!down) return;
  down = false;
  el.classList.remove('dragging');
  const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
  if (swiped && (Math.abs(dx) > el.offsetWidth / 3 || (v > 0.5 && Math.abs(dx) > 24))) {
    el.style.setProperty('--swipe', `${Math.sign(dx) * window.innerWidth}px`);
    hideToast();
  } else {
    el.style.removeProperty('--swipe');
    if (el.classList.contains('show')) wait(Math.max(left, AFTER));
  }
};
el.addEventListener('pointerup', end);
el.addEventListener('pointercancel', end);
// a swipe that began on the button undoes nothing
el.addEventListener(
  'click',
  e => {
    if (!swiped) return;
    swiped = false;
    e.stopPropagation();
  },
  true,
);
