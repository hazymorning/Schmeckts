/* Bottom sheet: opening, closing, swiping, the back gesture.
   What the sheet contains is registered by the views through setSheetView(). */
import {$, reduceMotion} from '../dom.js';

export const dlg = $('#sheet'),
  sheetBody = $('#sheetBody');
export let sheet = null; // the state of the open sheet, null when closed
let viewKey = '',
  histPushed = false,
  closing = null;

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
    try {
      history.pushState({sheet: 1}, '');
      histPushed = true;
    } catch {
      histPushed = false; // without an entry of its own the sheet simply does not answer the back gesture
    }
  }
}
let drawView = () => {}; // set by the sheet views: draws the contents of the open sheet
export function setSheetView(fn) {
  drawView = fn;
}
export function renderSheet() {
  if (!sheet) return;
  drawView(sheet);
  const key = `${sheet.kind}:${sheet.step || ''}:${sheet.id || ''}`;
  if (key !== viewKey) {
    viewKey = key;
    sheetBody.scrollTop = 0;
    sheetBody.classList.remove('swap-in');
    // Only for a swap inside an open sheet; while it opens, the sheet's own entrance is animation enough
    if (dlg.open) {
      void sheetBody.offsetWidth;
      sheetBody.classList.add('swap-in');
    }
  }
}
export function closeSheet(fromPop = false) {
  if (closing) return closing;
  if (!dlg.open) return Promise.resolve();
  /* Closing is only done once the sheet's history entry is gone as well: were popstate to arrive after the next
     sheet has opened, it would close that one */
  const popped =
    histPushed && !fromPop ? new Promise(resolve => addEventListener('popstate', resolve, {once: true})) : null;
  if (popped) history.back();
  histPushed = false;
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
  if (histPushed) {
    histPushed = false;
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
      /* the pointer is already gone: the swipe then ends with the next pointerup, which is all it has to do */
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
