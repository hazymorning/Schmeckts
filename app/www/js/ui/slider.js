/* The rating slider (rateSlider() in views/parts.js) under a finger, the way a slider in a scrolling list behaves on
   Android. A tap rates the level under it. Moved sideways first, the finger slides: the thumb goes from stop to stop
   with a light tick, the level's name standing above the track, and letting go rates that one. Moved up or down
   first, it is the page scrolling and nothing happens, and a touch that only stops the page scrolling is no tap. A
   mouse slides as soon as it is pressed. The levels' buttons lie on the track and take no touches: they are how the
   keyboard and a screen reader rate, and every rating runs through them (data-action="rate").
   Registers itself as it loads. */
import {haptic} from '../native.js';
import {icon} from '../icons.js';
import {RATINGS} from '../config.js';
import {rateCls} from '../smart.js';

const SLOP = 8; // px a finger moves before it slides or scrolls, as on Android
const SETTLE = 150; // ms after the page last scrolled in which a touch only stops it
let press = null, // {slider, id, x, y, at: the level's button while it slides}
  scrolled = -Infinity;

/* The thumb carries the level's icon, the row above the track its name */
export const thumbHTML = r => (r ? icon('r_' + r) : '');
export const nameOf = r => (r ? RATINGS[r].label : '');
/* The slider's class: the level's colour, and neither thumb nor name unless the level is on this scale */
export const sliderCls = (r, scale) => `slider${r ? ' ' + rateCls(r) : ''}${scale.includes(r) ? '' : ' unset'}`;

const stops = slider => [...slider.querySelectorAll('.slider-bar button')];
/* Puts the thumb on level r and names it, or with null on what the meal holds; returns the thumb's disc */
export function showLevel(slider, r) {
  const scale = stops(slider).map(b => b.dataset.r),
    disc = slider.querySelector('.slider-thumb > i');
  r ??= slider.dataset.r || null;
  slider.className = sliderCls(r, scale);
  if (scale.includes(r)) slider.style.setProperty('--at', scale.indexOf(r));
  slider.querySelector('.slider-name').textContent = nameOf(r);
  disc.innerHTML = thumbHTML(r);
  return disc;
}

function nearest(slider, x) {
  const off = b => {
    const box = b.getBoundingClientRect();
    return Math.abs(x - box.left - box.width / 2);
  };
  return stops(slider).reduce((a, b) => (off(b) < off(a) ? b : a));
}
function slide(x) {
  const at = nearest(press.slider, x);
  if (at === press.at) return;
  press.at = at;
  showLevel(press.slider, at.dataset.r);
  haptic('select'); // a detent at every level
}

addEventListener('scroll', e => (scrolled = e.timeStamp), {capture: true, passive: true});
addEventListener('pointerdown', e => {
  if (!e.isPrimary) return;
  const bar = e.target.closest?.('.slider-bar'),
    mouse = e.pointerType === 'mouse';
  press = null;
  if (!bar || e.button !== 0 || (!mouse && e.timeStamp - scrolled < SETTLE)) return;
  press = {slider: bar.closest('.slider'), id: e.pointerId, x: e.clientX, y: e.clientY, at: null};
  if (mouse) slide(e.clientX);
});
addEventListener('pointermove', e => {
  if (press?.id !== e.pointerId) return;
  const dx = Math.abs(e.clientX - press.x),
    dy = Math.abs(e.clientY - press.y);
  if (press.at || (dx > SLOP && dx > dy)) slide(e.clientX);
  else if (dy > SLOP) press = null; // up or down: the page's
});
addEventListener('pointerup', e => {
  if (press?.id !== e.pointerId) return;
  const {slider} = press,
    at = press.at || nearest(slider, e.clientX);
  press = null;
  if (!at.isConnected) return; // drawn anew in the meantime (a change from another phone): nothing to rate
  if (at.getAttribute('aria-pressed') === 'true')
    showLevel(slider, null); // the level the meal already holds
  else at.click();
});
addEventListener('pointercancel', e => {
  if (press?.id !== e.pointerId) return;
  if (press.at) showLevel(press.slider, null);
  press = null;
});
