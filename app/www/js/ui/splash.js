/* The native splash screen stays up until the app is ready, so nobody watches the web page being built. It goes
   when the data is loaded (store.js does that before anything else runs), the home page is drawn, both typefaces
   are ready and two frames have passed, and in any case after LATEST, whatever failed on the way, so the app
   cannot hang on the splash. In the browser there is no splash screen and these functions do nothing. */
import {dur} from '../motion.js';
import {Native} from '../native.js';
import {report} from '../report.js';

const LATEST = 2500; // the safety net
const FACES = ['1em "Figtree"', '1em "Faustina"'];

let gone = false;
const frame = () => new Promise(done => requestAnimationFrame(() => done()));

export function hideSplash() {
  if (gone) return;
  gone = true;
  Native?.SplashScreen?.hide({fadeOutDuration: dur('fade')}).catch(e => report('splash screen', e));
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
