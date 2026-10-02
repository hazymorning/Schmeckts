/* The native splash stays up until data, home page and fonts are ready, or LATEST at most, so the app cannot hang on
   it. Does nothing in the browser. */
import {dur} from '../motion.js';
import {Native} from '../native.js';
import {report} from '../report.js';

const LATEST = 2500; // ms
const FACES = ['1em "Figtree"', '1em "Faustina"'];

let gone = false;
const frame = () => new Promise(done => requestAnimationFrame(() => done()));

export function hideSplash() {
  if (gone) return;
  gone = true;
  Native?.SplashScreen?.hide({fadeOutDuration: dur('fade')}).catch(e => report('splash screen', e));
}

// armed on load, the first thing main.js does, so any later error still ends here
setTimeout(hideSplash, LATEST);

export function hideSplashWhenReady() {
  ready().catch(e => {
    report('start', e);
    hideSplash();
  });
}
async function ready() {
  await Promise.all(FACES.map(face => document.fonts.load(face)));
  await frame();
  await frame();
  hideSplash();
}
