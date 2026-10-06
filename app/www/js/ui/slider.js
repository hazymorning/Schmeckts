/* Pointer handling for the rating slider, modelled on an Android slider inside a scrolling list. The level buttons
   take no touches; every rating goes through their click, so keyboard and screen readers rate the same way. */
import {haptic} from '../native.js';
import {icon} from '../icons.js';
import {rateCls} from '../smart.js';

const SLOP = 8; // px before a touch slides or scrolls, as on Android
const SETTLE = 150; // ms after a scroll in which a touch only stops it
const REST = 100; // ms, Android's tap timeout
let press = null, // at: the level button the thumb is on
  scrolled = -Infinity;
const lifted = []; // resolvers waiting in untouched()

export const thumbHTML = r => (r ? icon('r_' + r) : '');
export const sliderCls = (r, scale, pointing = false) =>
  `slider${r ? ' ' + rateCls(r) : ''}${scale.includes(r) ? '' : ' unset'}${pointing ? ' pointing' : ''}`;

const stops = slider => [...slider.querySelectorAll('.slider-track button')];
// r null: back to the saved level, unless the keyboard is on one
function showLevel(slider, r) {
  const scale = stops(slider).map(b => b.dataset.r),
    on = r || slider.querySelector('.slider-track button:focus-visible')?.dataset.r,
    shown = on || slider.dataset.r || null,
    at = scale.indexOf(shown);
  slider.className = sliderCls(shown, scale, !!on);
  if (at >= 0) slider.style.setProperty('--at', at);
  slider.querySelector('.slider-thumb > i').innerHTML = thumbHTML(shown);
  slider.querySelectorAll('.slider-names > span').forEach((word, i) => word.classList.toggle('on', i === at));
}
// returns the thumb disc so the caller can wait for its pop
export function setLevel(slider, r) {
  const disc = slider.querySelector('.slider-thumb > i');
  slider.dataset.r = r;
  for (const b of stops(slider)) b.setAttribute('aria-pressed', String(b.dataset.r === r));
  showLevel(slider, null);
  disc.classList.remove('picked');
  void disc.offsetWidth; // reflow, so the pop restarts on a second rating
  disc.classList.add('picked');
  return disc;
}
// redraws wait for this, so a slider is never replaced under a finger
export const untouched = () => (press ? new Promise(resolve => lifted.push(resolve)) : Promise.resolve());
export const pressing = () => !!press;

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
  haptic('select');
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
  else if (dy > SLOP) end(); // vertical: the page scrolls
});
addEventListener('pointerup', e => {
  if (press?.id !== e.pointerId) return;
  const {slider} = press,
    at = press.at || nearest(slider, e.clientX);
  end();
  if (!at.isConnected) return; // redrawn meanwhile, e.g. by a sync
  if (at.getAttribute('aria-pressed') !== 'true') at.click();
  showLevel(slider, null);
});
addEventListener('pointercancel', e => {
  if (press?.id !== e.pointerId) return;
  const {slider, at} = press;
  end();
  if (at) showLevel(slider, null);
});
addEventListener('focusin', e => {
  const b = e.target.closest?.('.slider-track button');
  if (b?.matches(':focus-visible')) showLevel(b.closest('.slider'), b.dataset.r);
});
addEventListener('focusout', e => {
  const slider = e.target.closest?.('.slider-track button')?.closest('.slider');
  if (slider && !slider.contains(e.relatedTarget)) showLevel(slider, null); // focus moving to another level: focusin shows it
});
