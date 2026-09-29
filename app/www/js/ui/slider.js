/* The rating slider (rateSlider() in views/parts.js) under a finger, the way a slider in a scrolling list behaves on
   Android. Under the track stand all the levels in words while none is held, so the one word under each icon is
   understood. A finger that rests on the track for a moment, or moves sideways on it, lifts the thumb onto the level
   under it, and the words under the track name that level and say what the bowl looks like; sliding goes from level
   to level with a light tick, and letting go rates the level the thumb stands on. A quick tap rates the level under it. Moved
   up or down first, it is the page scrolling and nothing happens, and a touch that only stops the page scrolling is
   no tap. A mouse slides as soon as it is pressed, and a level the keyboard is on shows the same. The levels'
   buttons take no touches of their own: they are how the keyboard and a screen reader rate, and every rating runs
   through them (data-action="rate").
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
export const levelHTML = r =>
  `<p data-r="${r}"><b class="slider-name">${RATINGS[r].label}</b><small>${RATINGS[r].note}</small></p>`;
/* All the levels of a scale in words, from the best to the worst, while none is held or pointed at */
export const legendHTML = scale => `<p data-r=""><small>${scale.map(r => RATINGS[r].label).join(', ')}</small></p>`;
/* Under the track: the level in words once the meal holds one of this scale, the legend before that */
export const saidHTML = (r, scale) => (scale.includes(r) ? levelHTML(r) : legendHTML(scale));
/* The slider's class: the level's colour, no thumb unless the level is on this scale, and the thumb lifted while a
   finger or the keyboard is on a level */
export const sliderCls = (r, scale, pointing = false) =>
  `slider${r ? ' ' + rateCls(r) : ''}${scale.includes(r) ? '' : ' unset'}${pointing ? ' pointing' : ''}`;

const stops = slider => [...slider.querySelectorAll('.slider-track button')];
/* The words under the track say level r, or all the levels, and the room they take eases open and shut. A level's
   words that come where the legend stood, or with a rating, rise into place; while a finger slides they simply
   change. */
function say(slider, r, rated = false) {
  const box = slider.querySelector('.slider-say'),
    was = box.firstElementChild?.dataset.r || null;
  if (was === r) return;
  const h0 = box.offsetHeight;
  box.innerHTML = r ? levelHTML(r) : legendHTML(stops(slider).map(b => b.dataset.r));
  if (r && (!was || rated)) box.firstElementChild.classList.add('picked');
  box.style.height = ''; // an easing still under way ends where it stands, and this one starts from there
  slideHeight(box, h0);
}
/* Puts the thumb on level r, lifted, and says it under the track. With null the thumb goes back to what the meal
   holds and the words with it, unless the keyboard is on a level. */
export function showLevel(slider, r) {
  const scale = stops(slider).map(b => b.dataset.r),
    on = r || slider.querySelector('.slider-track button:focus-visible')?.dataset.r,
    shown = on || slider.dataset.r || null,
    at = scale.indexOf(shown);
  slider.className = sliderCls(shown, scale, !!on);
  if (at >= 0) slider.style.setProperty('--at', at);
  slider.querySelector('.slider-thumb > i').innerHTML = thumbHTML(shown);
  slider.querySelectorAll('.slider-names > span').forEach((word, i) => word.classList.toggle('on', i === at));
  say(slider, at >= 0 ? shown : null);
}
/* After a rating: the meal holds level r now. The thumb stands on it and pops, and the words under the track say it.
   Returns the thumb's disc, whose pop the caller waits for. */
export function setLevel(slider, r) {
  const disc = slider.querySelector('.slider-thumb > i');
  slider.dataset.r = r;
  for (const b of stops(slider)) b.setAttribute('aria-pressed', String(b.dataset.r === r));
  say(slider, r, true);
  showLevel(slider, null);
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
  showLevel(slider, null); // the thumb settles on what the meal holds now
});
addEventListener('pointercancel', e => {
  if (press?.id !== e.pointerId) return;
  const {slider, at} = press;
  end();
  if (at) showLevel(slider, null);
});
/* The keyboard: the level it is on lifts the thumb and shows its words, as under a finger */
addEventListener('focusin', e => {
  const b = e.target.closest?.('.slider-track button');
  if (b?.matches(':focus-visible')) showLevel(b.closest('.slider'), b.dataset.r);
});
addEventListener('focusout', e => {
  const slider = e.target.closest?.('.slider-track button')?.closest('.slider');
  if (slider && !slider.contains(e.relatedTarget)) showLevel(slider, null); // on to the next level: focusin shows it
});
