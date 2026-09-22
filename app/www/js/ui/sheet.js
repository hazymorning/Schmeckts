/* Sheets and pages: opening, closing, swiping, the back gesture.
   A sheet rises from below for one task on top of where you are. A page comes in from the side for a place you
   go into, fills the screen and takes a level of the history with it (PROJECT.md, „Principles“ 3). Both are the
   same dialog, because a page is a sheet that fills the screen and moves sideways.
   What either of them contains is registered by the views through setSheetView(). */
import {$, reduceMotion} from '../dom.js';

export const dlg = $('#sheet'),
  sheetBody = $('#sheetBody');
export let sheet = null; // the state of what is open, null when closed
/* The settings and everything below them are a page; everything else is a sheet. */
export const isPage = state => state?.kind === 'settings';
const PAGE_OUT = 300,
  SHEET_OUT = 240;
let viewKey = '',
  depth = 0, // history entries of our own: one per level
  pageKeys = [], // what openPage() put on the state, taken off again on the way back
  closing = null;

/* The upper edge of a sheet: while its contents are scrolled, the top few pixels fade out, so a line does not
   end abruptly under the grip. A page has no grip and its bar stays at the top instead, so nothing fades there. */
const markSheetScrolled = () => sheetBody.classList.toggle('scrolled', !isPage(sheet) && sheetBody.scrollTop > 0);
sheetBody.addEventListener('scroll', markSheetScrolled, {passive: true});

export function openSheet(state) {
  sheet = state;
  pageKeys = [];
  dlg.classList.toggle('page', isPage(state));
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
    if (state.page) push(); // opened straight on a page below, so back leads to the overview first
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
/* One level deeper: „Haushalt“, „Backup“, the pet editor. It gets a history entry of its own, so the arrow in
   the head, the Android back button and the back gesture all take the same path, one level at a time.
   `extra` is what that level needs (the pet being edited); the way back takes exactly those keys off again. */
export function openPage(page, extra = null) {
  if (!sheet || sheet.page === page) return;
  pageKeys = extra ? Object.keys(extra) : [];
  Object.assign(sheet, extra, {page, slide: 'fwd'});
  push();
  renderSheet();
}
/* One level back. Through the history wherever there is an entry to drop, so the arrow in the head and the
   hardware button take exactly the same path. */
export function backPage() {
  if (depth > 1) history.back();
  else stepBack();
}
/* Android's back button: out of a level below first, and only on the overview does the sheet close */
export function sheetBack() {
  if (sheet?.page) backPage();
  else closeSheet();
}
function stepBack() {
  if (!sheet?.page) return;
  for (const k of pageKeys) delete sheet[k];
  pageKeys = [];
  Object.assign(sheet, {page: null, slide: 'back'});
  renderSheet();
}
let drawView = () => {}; // set by the sheet views: draws the contents of what is open
export function setSheetView(fn) {
  drawView = fn;
}
export function renderSheet() {
  if (!sheet) return;
  // The level being left, for the page's movement: taken before it is drawn over
  const leaving =
    dlg.open && isPage(sheet) && sheet.slide ? {html: sheetBody.innerHTML, top: sheetBody.scrollTop} : null;
  drawView(sheet);
  const key = `${sheet.kind}:${sheet.page || ''}:${sheet.step || ''}:${sheet.id || ''}`;
  if (key !== viewKey) {
    viewKey = key;
    sheetBody.scrollTop = 0;
    markSheetScrolled();
    const how = sheet.slide;
    sheet.slide = null;
    sheetBody.classList.remove('swap-in', 'step-fwd', 'step-back');
    // Only for a change inside something already open; while it opens, its own entrance covers this
    if (!dlg.open) return;
    void sheetBody.offsetWidth;
    if (!isPage(sheet)) sheetBody.classList.add('swap-in');
    else if (how) slidePage(how, leaving);
  }
}
/* A page moves as a whole: the level you go to comes in from the side while the one you leave goes out the other
   way. What you leave is a still picture in a layer of its own, inert and gone with the animation, so the views
   only ever write to the one live body. Under reduced motion nothing moves and no picture is taken. */
let ghost = null;
function dropGhost() {
  ghost?.remove();
  ghost = null;
}
function slidePage(how, leaving) {
  dropGhost();
  if (reduceMotion.matches || !leaving) return;
  const old = document.createElement('div');
  old.className = `sheet-body page-ghost out-${how}`;
  old.setAttribute('aria-hidden', 'true');
  old.inert = true;
  old.innerHTML = leaving.html;
  dlg.appendChild(old);
  old.scrollTop = leaving.top;
  ghost = old;
  old.addEventListener('animationend', () => old === ghost && dropGhost(), {once: true});
  sheetBody.classList.add(how === 'fwd' ? 'step-fwd' : 'step-back');
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
  const out = isPage(sheet) ? PAGE_OUT : SHEET_OUT;
  const hidden = reduceMotion.matches
    ? Promise.resolve()
    : new Promise(resolve => {
        dlg.classList.add('closing');
        setTimeout(resolve, out);
      });
  closing = Promise.all([
    popped,
    hidden.then(() => {
      dropGhost();
      dlg.classList.remove('closing', 'page');
      dlg.style.transform = '';
      dlg.style.transition = '';
      sheetBody.scrollTop = 0;
      markSheetScrolled();
      dlg.close();
      sheet = null;
      viewKey = '';
      pageKeys = [];
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
  sheetBack(); // on a page that is one level; a sheet has none and closes
});
dlg.addEventListener('click', e => {
  if (e.target === dlg) closeSheet();
});

/* Swiping down closes a sheet. A page leaves the way it came, by the arrow or by back, so it does not swipe. */
(() => {
  let startY = 0,
    dy = 0,
    t0 = 0,
    dragging = false;
  dlg.addEventListener('pointerdown', e => {
    if (isPage(sheet)) return;
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
