/* The rating slider (rateSlider() in views/parts.js) under a finger, the way a slider in a scrolling list behaves on
   Android. A tap rates the level under it. Moved sideways first, the finger slides: every level it passes shows above
   the track with a light tick, and letting go rates the one it stands on. Moved up or down first, it is the page
   scrolling and nothing happens, and a touch that only stops the page scrolling is no tap. A mouse slides as soon as
   it is pressed. The levels' buttons lie on the track and take no touches: they are how the keyboard and a screen
   reader rate, and every rating runs through them (data-action="rate").
   Registers itself as it loads. */
import {haptic} from '../native.js';
import {icon} from '../icons.js';
import {RATINGS, SCALES} from '../config.js';
import {rateCls} from '../smart.js';

const SLOP = 8; // px a finger moves before it slides or scrolls, as on Android
const SETTLE = 150; // ms after the page last scrolled in which a touch only stops it
const QUESTION = {bowl: 'Wie sieht der Napf aus?', bite: 'Wie kam es an?'};
let press = null, // {slider, id, x, y, at: the level's button while it slides}
  scrolled = -Infinity;

/* What stands above the track: the level, large, with what the bowl looks like; before a rating the question */
export function levelHTML(r, scale) {
  if (r) return `${icon('r_' + r)}<p><b>${RATINGS[r].label}</b><small>${RATINGS[r].note}</small></p>`;
  const ask = scale.includes(SCALES.bite[0]) ? QUESTION.bite : QUESTION.bowl;
  return `${icon('ask')}<p class="ask"><b>${ask}</b><small>Tippen oder schieben</small></p>`;
}
/* The slider's class: the level's colour, and without a thumb unless the level is on this scale */
export const sliderCls = (r, scale) => `slider${r ? ' ' + rateCls(r) : ''}${scale.includes(r) ? '' : ' unset'}`;

const stops = slider => [...slider.querySelectorAll('.slider-bar button')];
/* Shows level r on the slider, or with null what the meal holds; returns the part that shows it */
export function showLevel(slider, r) {
  const scale = stops(slider).map(b => b.dataset.r),
    now = slider.querySelector('.rate-now');
  r ??= slider.dataset.r || null;
  slider.className = sliderCls(r, scale);
  if (scale.includes(r)) slider.style.setProperty('--at', scale.indexOf(r));
  now.innerHTML = levelHTML(r, scale);
  return now;
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
  const at = press.at || nearest(press.slider, e.clientX);
  press = null;
  // Redrawn in the meantime (a change from another phone), or the level the meal already holds: nothing to rate
  if (at.isConnected && at.getAttribute('aria-pressed') !== 'true') at.click();
});
addEventListener('pointercancel', e => {
  if (press?.id !== e.pointerId) return;
  if (press.at) showLevel(press.slider, null);
  press = null;
});
