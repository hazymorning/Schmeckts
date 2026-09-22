/* The native splash screen stays until the app is really there, so nobody watches a web page build itself up.
   It goes when the data is loaded (store.js does that before anything else runs), the home page is drawn, both
   typefaces are ready and two frames have passed — and in any case after LATEST, whatever went wrong on the way:
   the app must never hang on the splash. In the browser there is none and everything here does nothing. */
import {Native} from '../native.js';
import {report} from '../report.js';

const FADE = 200; // how long it fades out
const LATEST = 2500; // the safety net
const FACES = ['1em "Figtree"', '1em "Fraunces"'];

let gone = false;
const frame = () => new Promise(done => requestAnimationFrame(() => done()));

export function hideSplash() {
  if (gone) return;
  gone = true;
  Native?.SplashScreen?.hide({fadeOutDuration: FADE}).catch(e => report('splash screen', e));
}

// Armed as this module loads, which is the first thing main.js does: an error anywhere after that still ends here
setTimeout(hideSplash, LATEST);

/* Called once the home page has been drawn. */
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
