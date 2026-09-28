/* The rating slider (rateSlider() in views/parts.js) under a finger, the way a slider in a scrolling list behaves on
   Android. A finger that rests on the track for a moment, or moves sideways on it, puts the thumb on the level under
   it, and a label above the thumb names that level and says what the bowl looks like; sliding goes from stop to stop
   with a light tick, and letting go rates the level the thumb stands on. A quick tap rates the level under it. Moved
   up or down first, it is the page scrolling and nothing happens, and a touch that only stops the page scrolling is
   no tap. A mouse slides as soon as it is pressed, and a level the keyboard is on shows the same label. The levels'
   buttons lie on the track and take no touches: they are how the keyboard and a screen reader rate, and every rating
   runs through them (data-action="rate").
   Registers itself as it loads. */
import {haptic} from '../native.js';
import {icon} from '../icons.js';
import {RATINGS} from '../config.js';
import {slideHeight} from '../motion.js';
import {rateCls} from '../smart.js';

const SLOP = 8; // px a finger moves before it slides or scrolls, as on Android
const SETTLE = 150; // ms after the page last scrolled in which a touch only stops it
const REST = 100; // ms a finger rests before the slider answers it, Android's tap timeout
let press = null, // {slider, id, x, y, at: the level's button once the thumb shows it, rest: the timer}
  scrolled = -Infinity;
const lifted = []; // what waits for the finger to leave, untouched()

/* The thumb carries the level's icon */
export const thumbHTML = r => (r ? icon('r_' + r) : '');
/* A level in words: its name and what the bowl looks like */
export const levelHTML = r => `<b class="slider-name">${RATINGS[r].label}</b><small>${RATINGS[r].note}</small>`;
/* Under the track, once the meal holds a level of this scale: that level in words */
export const saidHTML = (r, scale) => (scale.includes(r) ? `<p class="slider-say">${levelHTML(r)}</p>` : '');
/* The slider's class: the level's colour, no thumb unless the level is on this scale, and the label above the thumb
   while a finger or the keyboard is on a level */
export const sliderCls = (r, scale, pointing = false) =>
  `slider${r ? ' ' + rateCls(r) : ''}${scale.includes(r) ? '' : ' unset'}${pointing ? ' pointing' : ''}`;

const stops = slider => [...slider.querySelectorAll('.slider-bar button')];
/* Puts the thumb on level r and names it above the thumb. With null the thumb goes back to what the meal holds and
   the label goes, unless the keyboard is on a level. */
export function showLevel(slider, r) {
  const scale = stops(slider).map(b => b.dataset.r),
    on = r || slider.querySelector('.slider-bar button:focus-visible')?.dataset.r,
    shown = on || slider.dataset.r || null;
  slider.className = sliderCls(shown, scale, !!on);
  if (scale.includes(shown)) slider.style.setProperty('--at', scale.indexOf(shown));
  slider.querySelector('.slider-thumb > i').innerHTML = thumbHTML(shown);
  if (on) slider.querySelector('.slider-tip').innerHTML = levelHTML(on);
}
/* After a rating: the meal holds level r now. The thumb stands on it and pops, and the words under the track say it,
   easing in where the ends of the scale stood. Returns the thumb's disc, whose pop the caller waits for. */
export function setLevel(slider, r) {
  const scale = stops(slider).map(b => b.dataset.r),
    disc = slider.querySelector('.slider-thumb > i'),
    old = slider.querySelector('.slider-say'),
    h0 = old ? old.offsetHeight : 0;
  slider.dataset.r = r;
  for (const b of stops(slider)) b.setAttribute('aria-pressed', String(b.dataset.r === r));
  showLevel(slider, null);
  old?.remove();
  slider.insertAdjacentHTML('beforeend', saidHTML(r, scale));
  const say = slider.querySelector('.slider-say');
  if (say) {
    say.classList.add('picked');
    slideHeight(say, h0);
  }
  disc.classList.remove('picked');
  void disc.offsetWidth; // the pop starts again on a second rating
  disc.classList.add('picked');
  return disc;
}
/* Resolves once no finger or mouse is on a slider: what redraws or removes one waits for this */
export const untouched = () => (press ? new Promise(resolve => lifted.push(resolve)) : Promise.resolve());

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
function end() {
  if (!press) return;
  clearTimeout(press.rest);
  press = null;
  for (const go of lifted.splice(0)) go();
}

addEventListener('scroll', e => (scrolled = e.timeStamp), {capture: true, passive: true});
addEventListener('pointerdown', e => {
  if (!e.isPrimary) return;
  const bar = e.target.closest?.('.slider-bar'),
    mouse = e.pointerType === 'mouse';
  end();
  if (!bar || e.button !== 0 || (!mouse && e.timeStamp - scrolled < SETTLE)) return;
  const p = (press = {slider: bar.closest('.slider'), id: e.pointerId, x: e.clientX, y: e.clientY, at: null});
  if (mouse) slide(e.clientX);
  else p.rest = setTimeout(() => press === p && !p.at && slide(p.x), REST);
});
addEventListener('pointermove', e => {
  if (press?.id !== e.pointerId) return;
  const dx = Math.abs(e.clientX - press.x),
    dy = Math.abs(e.clientY - press.y);
  if (press.at || (dx > SLOP && dx > dy)) slide(e.clientX);
  else if (dy > SLOP) end(); // up or down: the page's
});
addEventListener('pointerup', e => {
  if (press?.id !== e.pointerId) return;
  const {slider} = press,
    at = press.at || nearest(slider, e.clientX);
  end();
  if (!at.isConnected) return; // drawn anew in the meantime (a change from another phone): nothing to rate
  if (at.getAttribute('aria-pressed') !== 'true') at.click(); // not the level the meal already holds
  showLevel(slider, null); // the label goes, the thumb stands on what the meal holds now
});
addEventListener('pointercancel', e => {
  if (press?.id !== e.pointerId) return;
  const {slider, at} = press;
  end();
  if (at) showLevel(slider, null);
});
/* The keyboard: the level it is on shows its label, as under a finger */
addEventListener('focusin', e => {
  const b = e.target.closest?.('.slider-bar button');
  if (b?.matches(':focus-visible')) showLevel(b.closest('.slider'), b.dataset.r);
});
addEventListener('focusout', e => {
  const b = e.target.closest?.('.slider-bar button');
  if (b) showLevel(b.closest('.slider'), null);
});
