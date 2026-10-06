/* Sheets and pages share one dialog: a page is a sheet that fills the screen and moves sideways. A sheet opened from
   a page rises over it in a second dialog (#popup), so the page keeps its state and scroll. `sheet` is the state of
   the top layer, which every action works on. */
import {$, reduceMotion} from '../dom.js';
import {settled} from '../motion.js';
import {dropViewer} from './viewer.js';

// depth: this layer's history entries; pageKeys: what openPage() added to the state, removed on the way back
const layer = (dlg, body) => ({dlg, body, state: null, key: '', depth: 0, pageKeys: [], closing: null});
const base = layer($('#sheet'), $('#sheetBody')),
  over = layer($('#popup'), $('#popupBody'));
export const sheetBody = base.body;
export let sheet = null; // state of the top layer
const PAGES = new Set(['settings', 'report', 'evaluation']);
export const isPage = state => PAGES.has(state?.kind);
const top = () => (over.state ? over : base);
const sync = () => {
  sheet = top().state;
};
export const anyOpen = () => base.dlg.open;
export const topDialog = () => (over.dlg.open ? over.dlg : base.dlg.open ? base.dlg : null);
export const topBody = () => (over.dlg.open ? over.body : base.body);
let expected = 0; // our own history steps, which the popstate listener skips

// classes go on the dialog, since the grip is outside the scroll box. Reads first, then writes
const markEdge = L => {
  const y = L.body.scrollTop,
    bar = isPage(L.state) ? L.body.querySelector(':scope > .page-bar') : null,
    title = bar?.nextElementSibling,
    titled = !!title && y > 0 && y + bar.offsetHeight >= title.offsetTop + title.offsetHeight;
  L.dlg.classList.toggle('scrolled', y > 0);
  L.dlg.classList.toggle('titled', titled);
};
for (const L of [base, over]) L.body.addEventListener('scroll', () => markEdge(L), {passive: true});

/* the toast must sit in the top dialog, or that dialog's dimming covers it. A sheet opening drops one with nothing
   to undo, which would lie over its last button. */
function hostToast(opening = false) {
  const t = $('#toast'),
    host = topDialog() || document.body;
  if (opening && t.classList.contains('plain')) t.classList.remove('show');
  if (t.parentNode !== host) host.appendChild(t);
  t.classList.toggle('in-sheet', host !== document.body);
}

// a sheet over a page rises on top; anything else replaces what is open
export function openSheet(state) {
  if (!isPage(state) && isPage(base.state) && !base.closing) return openOn(over, state);
  if (over.state) dropLayer(over);
  openOn(base, state);
}
function openOn(L, state) {
  L.state = state;
  L.pageKeys = [];
  sync();
  L.dlg.dataset.kind = state.kind;
  L.dlg.classList.toggle('page', isPage(state));
  renderSheet();
  if (!L.dlg.open) {
    dropViewer(); // opened from a link or notification over the photo viewer
    L.dlg.classList.remove('closing', 'dragging');
    L.dlg.style.transform = '';
    L.dlg.showModal();
    document.body.classList.add('locked');
    L.body.scrollTop = 0; // the browser would otherwise keep the last sheet's scroll
    markEdge(L);
    L.depth = 0;
    push(L);
    if (state.page) push(L); // opened on a sub-page, so back goes to the overview first
    hostToast(true);
  }
}
function push(L) {
  try {
    history.pushState({sheet: L.depth + 1}, '');
    L.depth++;
  } catch {
    /* without an entry the sheet ignores the back gesture */
  }
}
/* Each level gets a history entry, so the arrow, the back button and the back gesture take the same path. extra:
   keys the level needs, removed again on the way back. */
export function openPage(page, extra = null) {
  if (!sheet || sheet.page === page || over.state) return;
  base.pageKeys = extra ? Object.keys(extra) : [];
  Object.assign(sheet, extra, {page, slide: 'fwd'});
  push(base);
  renderSheet();
}
export function backPage() {
  if (base.depth > 1) history.back();
  else stepBack();
}
// Android back button
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
let drawView = () => {};
export function setSheetView(fn) {
  drawView = fn;
}
export function renderSheet() {
  const L = top();
  if (!L.state) return;
  const state = L.state,
    key = `${state.kind}:${state.page || ''}:${state.step || ''}:${state.id || ''}`;
  const how = state.slide;
  state.slide = null;
  if (key === L.key) {
    drawView(state, L.body);
    return markEdge(L);
  }
  const swap = () => {
    L.dlg.classList.remove('scrolled', 'titled'); // the new level starts at rest, not with the old one's edge
    drawView(state, L.body);
    L.key = key;
    L.body.scrollTop = 0;
    markEdge(L);
    L.body.classList.remove('swap-in');
  };
  // while it opens, its own entrance covers the change
  if (!L.dlg.open) return swap();
  if (isPage(state)) return slidePage(how, swap);
  swap();
  void L.body.offsetWidth;
  L.body.classList.add('swap-in');
}
// the view transition snapshots the old level itself, so no copy of a long page is built
function slidePage(how, swap) {
  if (!how || reduceMotion.matches || !document.startViewTransition) return swap();
  const root = document.documentElement,
    done = () => root.classList.remove('step-fwd', 'step-back');
  root.classList.add(how === 'back' ? 'step-back' : 'step-fwd');
  try {
    document.startViewTransition(swap).finished.then(done, done);
  } catch {
    // step without the movement
    done();
    swap();
  }
}
export const isClosing = () => !!(base.closing || over.closing);
export const leaving = el => [base, over].some(L => L.closing && L.dlg.contains(el));

export function closeSheet(fromPop = false) {
  const L = top();
  if (L.closing) return L.closing;
  if (!L.dlg.open) return Promise.resolve();
  return closeLayers([L], fromPop);
}
// for what ends on the home page, such as serving
export function closeAll() {
  const open = [over, base].filter(L => L.dlg.open && !L.closing);
  return Promise.all([open.length ? closeLayers(open, false) : null, over.closing, base.closing]).then(() => {});
}
// waits for the history entries to go too, or a late popstate would close the next sheet
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
// redraws the page underneath, so the sheet's changes show there
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
// at once, without stepping back through the history
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
    sheetBack();
  });
  L.dlg.addEventListener('click', e => {
    if (e.target === L.dlg) closeSheet();
  });
}

// swiping down closes a sheet; a page leaves only by the arrow or back
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
      /* pointer already gone; the next pointerup ends the swipe */
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
    else d.style.transform = '';
  };
  d.addEventListener('pointerup', end);
  d.addEventListener('pointercancel', end);
}
