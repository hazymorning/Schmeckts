/* Bottom sheet: opening, closing, swiping, the back gesture.
   What the sheet contains is registered by the views through setSheetView(). */
import {$, reduceMotion} from '../dom.js';

export const dlg = $('#sheet'),
  sheetBody = $('#sheetBody');
export let sheet = null; // the state of the open sheet, null when closed
let viewKey = '',
  depth = 0, // history entries of our own: one for the sheet, one more for an open sub-page
  closing = null;

/* The upper edge of a sheet: while its contents are scrolled, the top few pixels fade out, so a line does not
   end abruptly under the grip. Nothing fades while the sheet sits at the top. */
const markSheetScrolled = () => sheetBody.classList.toggle('scrolled', sheetBody.scrollTop > 0);
sheetBody.addEventListener('scroll', markSheetScrolled, {passive: true});

export function openSheet(state) {
  sheet = state;
  renderSheet();
  if (!dlg.open) {
    dlg.classList.remove('closing');
    dlg.style.transform = '';
    dlg.style.transition = '';
    dlg.showModal();
    document.body.classList.add('locked');
    sheetBody.scrollTop = 0; // the browser would otherwise remember the last sheet's scroll position
    markSheetScrolled();
    depth = 0;
    push();
    if (state.page) push(); // opened straight on a sub-page, so the back gesture leads to the overview first
  }
}
function push() {
  try {
    history.pushState({sheet: depth + 1}, '');
    depth++;
  } catch {
    /* without an entry of its own the sheet does not answer the back gesture */
  }
}
/* A sub-page inside the open sheet (the settings). It gets a history entry of its own, so the Android back button
   and the back gesture go one level back before they close the sheet. */
export function openPage(page) {
  if (!sheet || sheet.page === page) return;
  sheet.page = page;
  sheet.slide = 'fwd';
  push();
  renderSheet();
}
/* One level back. Through the history wherever there is an entry to drop, so the arrow in the head and the hardware
   button take exactly the same path. */
export function backPage() {
  if (depth > 1) history.back();
  else stepBack();
}
/* Android's back button: out of a sub-page first, and only on the overview does the sheet close */
export function sheetBack() {
  if (sheet?.page) backPage();
  else closeSheet();
}
function stepBack() {
  if (!sheet?.page) return;
  sheet.page = null;
  sheet.slide = 'back';
  renderSheet();
}
let drawView = () => {}; // set by the sheet views: draws the contents of the open sheet
export function setSheetView(fn) {
  drawView = fn;
}
export function renderSheet() {
  if (!sheet) return;
  drawView(sheet);
  const key = `${sheet.kind}:${sheet.page || ''}:${sheet.step || ''}:${sheet.id || ''}`;
  if (key !== viewKey) {
    viewKey = key;
    sheetBody.scrollTop = 0;
    markSheetScrolled();
    // A sub-page comes in from below and a step back from above, everything else fades up from below
    const how = sheet.slide ? 'swap-' + sheet.slide : 'swap-in';
    sheet.slide = null;
    sheetBody.classList.remove('swap-in', 'swap-fwd', 'swap-back');
    // Only for a swap inside an open sheet; while it opens, the sheet's own entrance animation covers it
    if (dlg.open) {
      void sheetBody.offsetWidth;
      sheetBody.classList.add(how);
    }
  }
}
export function closeSheet(fromPop = false) {
  if (closing) return closing;
  if (!dlg.open) return Promise.resolve();
  /* Close only once the sheet's history entry is gone as well: a popstate that arrives after the next sheet has
     opened would close that one */
  const levels = fromPop ? 0 : depth;
  depth = 0;
  const popped = levels ? new Promise(resolve => addEventListener('popstate', resolve, {once: true})) : null;
  if (popped) history.go(-levels);
  const hidden = reduceMotion.matches
    ? Promise.resolve()
    : new Promise(resolve => {
        dlg.classList.add('closing');
        setTimeout(resolve, 240);
      });
  closing = Promise.all([
    popped,
    hidden.then(() => {
      dlg.classList.remove('closing');
      dlg.style.transform = '';
      dlg.style.transition = '';
      sheetBody.scrollTop = 0;
      markSheetScrolled();
      dlg.close();
      sheet = null;
      viewKey = '';
      sheetBody.innerHTML = '';
      document.body.classList.remove('locked');
      const t = $('#toast');
      if (t.parentNode === dlg) {
        t.classList.remove('in-sheet');
        document.body.appendChild(t);
      }
    }),
  ]).then(() => {
    closing = null;
  });
  return closing;
}
window.addEventListener('popstate', () => {
  if (depth > 1) {
    depth--;
    stepBack();
  } else if (depth) {
    depth = 0;
    closeSheet(true);
  }
});
dlg.addEventListener('cancel', e => {
  e.preventDefault();
  closeSheet();
});
dlg.addEventListener('click', e => {
  if (e.target === dlg) closeSheet();
});

/* Swiping down closes the sheet */
(() => {
  let startY = 0,
    dy = 0,
    t0 = 0,
    dragging = false;
  dlg.addEventListener('pointerdown', e => {
    if (!e.target.closest('.grip-zone, .sh-head') || e.target.closest('button, input, label')) return;
    dragging = true;
    startY = e.clientY;
    dy = 0;
    t0 = performance.now();
    dlg.style.transition = 'none';
    try {
      dlg.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone: the swipe ends with the next pointerup */
    }
  });
  dlg.addEventListener('pointermove', e => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    dlg.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const v = dy / Math.max(1, performance.now() - t0);
    if (dy > 110 || (v > 0.5 && dy > 24)) closeSheet();
    else {
      dlg.style.transition = 'transform .4s cubic-bezier(.22,1,.36,1)';
      dlg.style.transform = '';
    }
  };
  dlg.addEventListener('pointerup', end);
  dlg.addEventListener('pointercancel', end);
})();
