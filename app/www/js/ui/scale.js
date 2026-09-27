/* Sliding along a rating scale (rateRow() in views/parts.js). The finger goes down on the track and the level under
   it lights up, its label floating above it because the finger covers the icon; moving sideways takes both along,
   and letting go rates that level. A tap is the same without the moving. Moving up or down scrolls the page
   instead, which cancels, and so does letting go well above or below the track.
   The rating runs through the level's own button (data-action="rate"), so a click on it from the keyboard or a
   screen reader still rates; the click the browser sends after a finger it already handled is dropped.
   Registers itself as it loads. */
import {haptic} from '../native.js';
import {icon} from '../icons.js';
import {RATINGS} from '../config.js';
import {rateCls} from '../smart.js';

let slide = null, // {track, id, hot, tip}
  swallow = false;

const nearest = (stops, x) =>
  stops.reduce((a, b) => {
    const d = el => Math.abs(x - (el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2));
    return d(b) < d(a) ? b : a;
  });

function move(x) {
  const stops = [...slide.track.children],
    hot = nearest(stops, x);
  if (hot === slide.hot) return;
  if (slide.hot) {
    slide.hot.classList.remove('hot');
    haptic('select'); // a detent on every level the finger passes
  }
  hot.classList.add('hot');
  slide.hot = hot;
  const at = stops.indexOf(hot),
    r = hot.dataset.r;
  slide.tip.className = `badge scale-tip ${rateCls(r)}${at === 0 ? ' first' : at === stops.length - 1 ? ' last' : ''}`;
  slide.tip.style.setProperty('--at', at);
  slide.tip.innerHTML = icon('r_' + r) + RATINGS[r].label;
}

function end(y) {
  const {track, hot, tip} = slide;
  slide = null;
  track.classList.remove('sliding');
  hot?.classList.remove('hot');
  tip.remove();
  if (y === null || !hot || !track.isConnected) return;
  const box = track.getBoundingClientRect();
  if (y < box.top - box.height || y > box.bottom + box.height) return; // let go well away from the track: nothing
  swallow = true;
  hot.click();
}

document.addEventListener('pointerdown', e => {
  const track = e.target.closest?.('.scale');
  swallow = false;
  if (!track || !e.isPrimary || e.button !== 0 || slide) return;
  const tip = document.createElement('span');
  tip.setAttribute('aria-hidden', 'true'); // the buttons carry their labels themselves
  track.after(tip);
  track.classList.add('sliding');
  slide = {track, id: e.pointerId, hot: null, tip};
  move(e.clientX);
});
document.addEventListener('pointermove', e => {
  if (slide?.id === e.pointerId) move(e.clientX);
});
document.addEventListener('pointerup', e => {
  if (slide?.id === e.pointerId) end(e.clientY);
});
document.addEventListener('pointercancel', e => {
  if (slide?.id === e.pointerId) end(null);
});
document.addEventListener(
  'click',
  e => {
    if (!e.detail || !swallow) return; // from the keyboard, a screen reader or end() itself
    swallow = false;
    if (e.target.closest?.('.scale')) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);
