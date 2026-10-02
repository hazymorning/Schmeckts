/* Sheets and pages: opening, closing, swiping, the back gesture.
   A sheet rises from below for one task on top of where you are. A page comes in from the side for a place you
   go into, fills the screen and takes a level of the history with it (PROJECT.md, „Principles“ 3). Both are the
   same dialog, because a page is a sheet that fills the screen and moves sideways.
   A sheet opened from a page rises over it in a second dialog (#popup), so the page stays where it was, scrolled
   as it was, and closing the sheet or going back leads exactly there. The two are layers: the page below, the sheet
   on top; `sheet` is the state of the top one, which is what every action works on.
   What either of them contains is registered by the views through setSheetView(). */
import {$, reduceMotion} from '../dom.js';
import {settled} from '../motion.js';
import {dropViewer} from './viewer.js';

/* A layer: its dialog and body, the state of what it shows, the key of the level drawn, its own history entries
   (one per level) and what openPage() put on the state, taken off again on the way back */
const layer = (dlg, body) => ({dlg, body, state: null, key: '', depth: 0, pageKeys: [], closing: null});
const base = layer($('#sheet'), $('#sheetBody')),
  over = layer($('#popup'), $('#popupBody'));
export const dlg = base.dlg,
  sheetBody = base.body; // the page's body: only a page needs it by name (the history, the folds)
export let sheet = null; // the state of what is open on top, null when nothing is
/* The settings with everything below them, the history, „Vorlieben“ with the level below it and the shopping list are
   a page; everything else is a sheet. */
const PAGES = new Set(['settings', 'report', 'evaluation', 'shop']);
export const isPage = state => PAGES.has(state?.kind);
const top = () => (over.state ? over : base);
const sync = () => {
  sheet = top().state;
};
export const anyOpen = () => base.dlg.open;
/* The dialog and the body on top, where a toast, the focus and a photo's thumbnail are looked for */
export const topDialog = () => (over.dlg.open ? over.dlg : base.dlg.open ? base.dlg : null);
export const topBody = () => (over.dlg.open ? over.body : base.body);
let expected = 0; // our own steps back through the history, which the popstate listener leaves alone

/* The top edge of what is open (PROJECT.md, „Building blocks“, scroll edge): .scrolled while anything lies under
   the grip or the bar; on a page .titled once its title has gone under the bar, which then shows it. On the dialog,
   because the grip is outside the scroll box. Reads first, then writes. */
const markEdge = L => {
  const y = L.body.scrollTop,
    bar = isPage(L.state) ? L.body.querySelector(':scope > .page-bar') : null,
    title = bar?.nextElementSibling,
    titled = !!title && y > 0 && y + bar.offsetHeight >= title.offsetTop + title.offsetHeight;
  L.dlg.classList.toggle('scrolled', y > 0);
  L.dlg.classList.toggle('titled', titled);
};
for (const L of [base, over]) L.body.addEventListener('scroll', () => markEdge(L), {passive: true});

/* The toast belongs to the top dialog, or it would lie under that dialog's dimming */
function hostToast() {
  const t = $('#toast'),
    host = topDialog() || document.body;
  if (t.parentNode !== host) host.appendChild(t);
  t.classList.toggle('in-sheet', host !== document.body);
}

/* Opens what is asked for. A sheet asked for while a page is open rises over it; a page asked for while a sheet lies
   over a page takes that sheet away first; anything else takes the place of what is open, as it always did. */
export function openSheet(state) {
  if (!isPage(state) && isPage(base.state) && !base.closing) return openOn(over, state);
  if (over.state) dropLayer(over);
  openOn(base, state);
}
function openOn(L, state) {
  L.state = state;
  L.pageKeys = [];
  sync();
  L.dlg.dataset.kind = state.kind; // a page says which one it is, for what only it needs
  L.dlg.classList.toggle('page', isPage(state));
  renderSheet();
  if (!L.dlg.open) {
    dropViewer(); // a link or a notification: the sheet takes the screen, not a photo under it
    L.dlg.classList.remove('closing', 'dragging');
    L.dlg.style.transform = '';
    L.dlg.showModal();
    document.body.classList.add('locked');
    L.body.scrollTop = 0; // the browser would otherwise remember the last sheet's scroll position
    markEdge(L);
    L.depth = 0;
    push(L);
    if (state.page) push(L); // opened straight on a page below, so back leads to the overview first
    hostToast();
  }
}
function push(L) {
  try {
    history.pushState({sheet: L.depth + 1}, '');
    L.depth++;
  } catch {
    /* without an entry of its own the sheet does not answer the back gesture */
  }
}
/* One level deeper: „Haushalt“, „Backup“, the pet editor. It gets a history entry of its own, so the arrow in
   the head, the Android back button and the back gesture all take the same path, one level at a time.
   `extra` is what that level needs (the pet being edited); the way back takes exactly those keys off again.
   Only a page has levels, and only the layer below holds a page. */
export function openPage(page, extra = null) {
  if (!sheet || sheet.page === page || over.state) return;
  base.pageKeys = extra ? Object.keys(extra) : [];
  Object.assign(sheet, extra, {page, slide: 'fwd'});
  push(base);
  renderSheet();
}
/* One level back. Through the history wherever there is an entry to drop, so the arrow in the head and the
   hardware button take exactly the same path. */
export function backPage() {
  if (base.depth > 1) history.back();
  else stepBack();
}
/* Android's back button: out of a level below first, and only on the overview does the sheet close; a sheet over a
   page closes and leaves the page as it was */
export function sheetBack() {
  if (!over.state && sheet?.page) backPage();
  else closeSheet();
}
function stepBack() {
  if (!base.state?.page) return;
  for (const k of base.pageKeys) delete base.state[k];
  base.pageKeys = [];
  Object.assign(base.state, {page: null, slide: 'back'});
  renderSheet();
}
let drawView = () => {}; // set by the sheet views: draws the state into the body given
export function setSheetView(fn) {
  drawView = fn;
}
/* Draws what is on top; the page under a sheet is drawn again once that sheet has gone */
export function renderSheet() {
  const L = top();
  if (!L.state) return;
  const state = L.state,
    key = `${state.kind}:${state.page || ''}:${state.step || ''}:${state.id || ''}`;
  const how = state.slide;
  state.slide = null;
  if (key === L.key) {
    drawView(state, L.body); // a change inside the level that is open
    return markEdge(L);
  }
  const swap = () => {
    L.dlg.classList.remove('scrolled', 'titled'); // the new level arrives at rest, not fading out of the old one's edge
    drawView(state, L.body);
    L.key = key;
    L.body.scrollTop = 0;
    markEdge(L);
    L.body.classList.remove('swap-in');
  };
  // While it opens, its own entrance covers the change
  if (!L.dlg.open) return swap();
  if (isPage(state)) return slidePage(how, swap);
  swap();
  void L.body.offsetWidth;
  L.body.classList.add('swap-in');
}
/* A page moves as a whole: the level you go to comes in from the side while the one you leave goes out the other
   way. The browser takes the picture of the level being left itself (a view transition on .sheet-body), so no
   copy of a long page has to be built first, which used to cost the first frame. Where that is not available,
   and under reduced motion, the page is simply swapped. */
function slidePage(how, swap) {
  if (!how || reduceMotion.matches || !document.startViewTransition) return swap();
  const root = document.documentElement,
    done = () => root.classList.remove('step-fwd', 'step-back');
  root.classList.add(how === 'back' ? 'step-back' : 'step-fwd');
  try {
    document.startViewTransition(swap).finished.then(done, done);
  } catch {
    // the transition did not start: the same step without the movement
    done();
    swap();
  }
}
export const isClosing = () => !!(base.closing || over.closing);

/* Closes what is on top: a sheet over a page goes and the page is there again as it was, otherwise the dialog closes
   and the home page is there. */
export function closeSheet(fromPop = false) {
  const L = top();
  if (L.closing) return L.closing;
  if (!L.dlg.open) return Promise.resolve();
  return closeLayers([L], fromPop);
}
/* Closes everything, the sheet and the page under it: for what ends on the home page, such as serving */
export function closeAll() {
  const open = [over, base].filter(L => L.dlg.open && !L.closing);
  return Promise.all([open.length ? closeLayers(open, false) : null, over.closing, base.closing]).then(() => {});
}
/* Close only once the layers' history entries are gone as well: a popstate that arrives after the next sheet has
   opened would close that one */
function closeLayers(layers, fromPop) {
  const levels = fromPop ? 0 : layers.reduce((n, L) => n + L.depth, 0);
  for (const L of layers) L.depth = 0;
  let popped = null;
  if (levels) {
    expected++;
    popped = new Promise(resolve => addEventListener('popstate', resolve, {once: true}));
    history.go(-levels);
  }
  const done = Promise.all([
    popped,
    ...layers.map(L => {
      const hidden = reduceMotion.matches ? Promise.resolve() : (L.dlg.classList.add('closing'), settled(L.dlg));
      return hidden.then(() => shut(L));
    }),
  ]).then(() => {
    for (const L of layers) L.closing = null;
  });
  for (const L of layers) L.closing = done;
  return done;
}
/* The layer is gone: its dialog is empty and closed, and what lies under it, a page, is drawn again as it stands now,
   so what the sheet changed shows there and the rest is left alone */
function shut(L) {
  L.dlg.classList.remove('closing', 'page', 'dragging');
  L.dlg.style.transform = '';
  L.body.scrollTop = 0;
  L.dlg.close();
  L.state = null;
  L.key = '';
  L.pageKeys = [];
  L.body.innerHTML = '';
  markEdge(L);
  sync();
  if (!base.dlg.open) document.body.classList.remove('locked');
  hostToast();
  if (L === over && base.state && !base.closing) renderSheet();
}
/* At once and without a step back through the history: a page asked for while a sheet lies over one */
function dropLayer(L) {
  if (L.depth) {
    expected++;
    history.go(-L.depth);
    L.depth = 0;
  }
  shut(L);
}
window.addEventListener('popstate', () => {
  if (expected) {
    expected--;
    return;
  }
  const L = top();
  if (L.depth > 1) {
    L.depth--;
    stepBack();
  } else if (L.depth) {
    L.depth = 0;
    closeLayers([L], true);
  }
});
for (const L of [base, over]) {
  L.dlg.addEventListener('cancel', e => {
    e.preventDefault();
    sheetBack(); // on a page that is one level; a sheet has none and closes
  });
  L.dlg.addEventListener('click', e => {
    if (e.target === L.dlg) closeSheet();
  });
}

/* Swiping down closes a sheet. A page leaves the way it came, by the arrow or by back, so it does not swipe. */
for (const L of [base, over]) {
  const d = L.dlg;
  let startY = 0,
    dy = 0,
    t0 = 0,
    dragging = false;
  d.addEventListener('pointerdown', e => {
    if (isPage(L.state) || L !== top()) return;
    if (!e.target.closest('.grip-zone, .sh-head') || e.target.closest('button, input, label')) return;
    dragging = true;
    startY = e.clientY;
    dy = 0;
    t0 = performance.now();
    d.classList.add('dragging');
    try {
      d.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone: the swipe ends with the next pointerup */
    }
  });
  d.addEventListener('pointermove', e => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    d.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    d.classList.remove('dragging');
    const v = dy / Math.max(1, performance.now() - t0);
    if (dy > 110 || (v > 0.5 && dy > 24)) closeSheet();
    else d.style.transform = ''; // back into place: dialog.sheet's transition in app.css
  };
  d.addEventListener('pointerup', end);
  d.addEventListener('pointercancel', end);
}
