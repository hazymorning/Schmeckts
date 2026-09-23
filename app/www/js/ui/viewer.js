/* The packaging photo, large (PROJECT.md, „Building blocks“, photo viewer): full screen and always dark like the
   camera, the photo whole and as large as it fits. It grows out of the thumbnail that was tapped and goes back into
   it, a view transition in which only the photo moves and the ground fades; under reduced motion it simply
   appears. A tap anywhere, back and Escape close it. No history entry, the same as the camera. */
import {$, reduceMotion} from '../dom.js';
import {report} from '../report.js';
import {darkBars} from './theme.js';

const dlg = $('#viewer'),
  img = $('img', dlg);
let busy = false, // opening or closing: taps and back wait for it
  closeLater = false, // back arrived while it was opening
  from = null; // the meal and variety of the thumbnail it grew out of, to find that again when it closes

export const viewerOpen = () => busy || dlg.open;

/* load() resolves to the photo as a data URL, or null; btn is the thumbnail's button.
   true: open, false: nothing to show, null: already open or opening. */
export async function openViewer(load, btn) {
  if (viewerOpen()) return null;
  busy = true;
  let src;
  try {
    src = await load();
    if (src) {
      img.src = src;
      await img.decode();
    }
  } catch (e) {
    report('opening the photo', e);
    src = null;
  }
  if (!src) {
    img.removeAttribute('src');
    busy = false;
    return false;
  }
  img.style.setProperty('--ar', img.naturalWidth / img.naturalHeight);
  from = {s: btn.dataset.s || '', p: btn.dataset.p || ''};
  await zoom($('img', btn), img, () => {
    dlg.showModal();
    darkBars(true);
  });
  busy = false;
  if (closeLater) {
    closeLater = false;
    closeViewer();
  }
  return true;
}

/* true when it took the back button */
export function closeViewer() {
  if (busy) {
    closeLater = true;
    return true;
  }
  if (!dlg.open) return false;
  busy = true;
  // The thumbnail may have been drawn anew meanwhile (a change from the server): look it up again
  const box = $('#sheet').open ? $('#sheetBody') : $('#home'),
    thumb = from && $(`[data-action=view-photo][data-s="${from.s}"][data-p="${from.p}"] img`, box),
    r = thumb?.getBoundingClientRect(),
    seen = r && r.bottom > 0 && r.top < innerHeight ? thumb : null;
  zoom(img, seen, () => {
    dlg.close();
    darkBars(false);
  }).then(() => {
    img.removeAttribute('src'); // the decoded photo is let go
    busy = false;
  });
  return true;
}

/* One step between the thumbnail and the photo: the two share the name `photo` for the length of the step, the
   dialog's ground is `viewer` and only fades. Every name is taken off again afterwards, so no later redraw of the
   home page captures anything of it. */
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
