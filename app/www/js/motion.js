/* Motion for JavaScript. Durations and curves live in css/tokens.css and nothing in js/ states one: a movement
   starts with a class, and whatever has to wait for it waits with settled(). dur() is for the one number that leaves
   the page, the native splash screen's fade. */
import {reduceMotion} from './dom.js';

const root = document.documentElement;

/* A duration token in ms: dur('fade'), dur('step'), dur('long') */
export function dur(name) {
  const v = getComputedStyle(root).getPropertyValue(`--dur-${name}`).trim();
  return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
}

/* Resolves once the finite animations and transitions running on el (with deep, also inside it) have finished or
   were cancelled, and at once when none runs. Call it right after the class change that starts them:
   getAnimations() brings the styles up to date first. Endless ones (spinner, shimmer) do not count. */
export function settled(el, deep = false) {
  const running = el.getAnimations({subtree: deep}).filter(a => a.effect?.getComputedTiming().endTime !== Infinity);
  return Promise.allSettled(running.map(a => a.finished)).then(() => {});
}

/* el eases from h0 to its new height (--dur-step, --ease-out), carrying "animating" while it does; instantly under
   reduced motion. Measure h0, change the content, then call this. */
export function slideHeight(el, h0) {
  const h1 = el.offsetHeight;
  if (reduceMotion.matches || h1 === h0) return;
  el.style.height = h0 + 'px';
  el.classList.add('animating'); // carries the height transition (app.css, Motion)
  void el.offsetHeight;
  el.style.height = h1 + 'px';
  settled(el).then(() => {
    el.style.height = '';
    el.classList.remove('animating');
  });
}
