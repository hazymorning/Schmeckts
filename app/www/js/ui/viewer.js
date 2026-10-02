// Full-screen packaging photo. No history entry, like the camera
import {$, reduceMotion} from '../dom.js';
import {report} from '../report.js';
import {darkBars} from './theme.js';

const dlg = $('#viewer'),
  img = $('img', dlg);
let opening = false, // taps and back wait while it opens
  closing = false,
  closeLater = false, // back arrived while it was opening
  run = 0, // so an opening cut short by dropViewer() does not go on
  from = null; // to find the thumbnail again on close

export const viewerOpen = () => opening || closing || dlg.open;

// load(): a data URL or null. Returns true: open, false: nothing to show, null: busy or cut short
export async function openViewer(load, btn) {
  if (viewerOpen()) return null;
  const mine = ++run;
  opening = true;
  closeLater = false;
  let src;
  try {
    src = await load();
    if (src && mine === run) {
      img.src = src;
      await img.decode();
    }
  } catch (e) {
    report('opening the photo', e);
    src = null;
  }
  if (mine !== run) return null;
  if (!src) {
    img.removeAttribute('src');
    opening = closeLater = false;
    return false;
  }
  img.style.setProperty('--ar', img.naturalWidth / img.naturalHeight);
  from = {s: btn.dataset.s || '', p: btn.dataset.p || ''};
  await zoom($('img', btn), img, () => {
    if (mine !== run) return;
    dlg.showModal();
    darkBars(true);
  });
  if (mine !== run) return null;
  opening = false;
  if (closeLater) {
    closeLater = false;
    closeViewer();
  }
  return true;
}

// true when it took the back button
export function closeViewer() {
  if (opening) {
    closeLater = true;
    return true;
  }
  if (closing) return true;
  if (!dlg.open) return false;
  closing = true;
  const mine = run;
  // the thumbnail may have been redrawn by a sync, so look it up again
  const box = $('#popup').open ? $('#popupBody') : $('#sheet').open ? $('#sheetBody') : $('#home'),
    btn = from && $(`[data-action=view-photo][data-s="${from.s}"][data-p="${from.p}"]`, box),
    thumb = btn && $('img', btn),
    r = thumb?.getBoundingClientRect(),
    seen = r && r.bottom > 0 && r.top < innerHeight ? thumb : null;
  zoom(img, seen, () => {
    if (mine !== run) return;
    shut();
    const at = document.activeElement;
    if (btn && (!at || at === document.body || !at.isConnected || dlg.contains(at))) btn.focus({preventScroll: true});
  }).then(() => {
    if (mine !== run) return;
    img.removeAttribute('src'); // frees the decoded photo
    closing = false;
  });
  return true;
}

function shut() {
  dlg.close();
  darkBars(false);
}

// something else takes the screen, and the viewer must not open beneath it
export function dropViewer() {
  if (!viewerOpen()) return;
  run++;
  if (dlg.open) shut();
  img.removeAttribute('src');
  opening = closing = closeLater = false;
}

// names are cleared afterwards, so a later home page transition captures none of it
function zoom(a, b, change) {
  if (reduceMotion.matches || !document.startViewTransition) return Promise.resolve(change());
  const root = document.documentElement,
    done = () => {
      root.classList.remove('zoom');
      for (const el of [a, b, dlg]) if (el) el.style.viewTransitionName = '';
    };
  root.classList.add('zoom');
  if (a) a.style.viewTransitionName = 'photo';
  dlg.style.viewTransitionName = 'viewer';
  try {
    return document
      .startViewTransition(() => {
        if (a) a.style.viewTransitionName = '';
        change();
        if (b) b.style.viewTransitionName = 'photo';
      })
      .finished.then(done, done);
  } catch (e) {
    report('photo transition', e);
    done();
    return Promise.resolve(change());
  }
}

dlg.addEventListener('click', () => closeViewer());
dlg.addEventListener('cancel', e => {
  e.preventDefault();
  closeViewer();
});
