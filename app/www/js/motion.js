// durations live in css/tokens.css; code waits for a movement with settled() instead of stating a number
import {reduceMotion} from './dom.js';

const root = document.documentElement;

// ms, from the --dur-* tokens
export function dur(name) {
  const v = getComputedStyle(root).getPropertyValue(`--dur-${name}`).trim();
  return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
}

// call right after the class change that starts them; getAnimations() updates styles first, endless ones do not count
export function settled(el, deep = false) {
  const running = el.getAnimations({subtree: deep}).filter(a => a.effect?.getComputedTiming().endTime !== Infinity);
  return Promise.allSettled(running.map(a => a.finished)).then(() => {});
}

// measure h0, change the content, then call this
export function slideHeight(el, h0) {
  const h1 = el.offsetHeight;
  if (reduceMotion.matches || h1 === h0) return;
  el.style.height = h0 + 'px';
  el.classList.add('animating');
  void el.offsetHeight;
  el.style.height = h1 + 'px';
  settled(el).then(() => {
    el.style.height = '';
    el.classList.remove('animating');
  });
}
