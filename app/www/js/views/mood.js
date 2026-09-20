/* Stimmungsbild hinter der Kopfzeile: Album-Fotos des gewählten oder einzigen Tiers, bei „Alle“ aller Tiere. Wechselt
   alle 12 Sekunden, nur sichtbar und ohne reduzierte Bewegung. */
import {$, reduceMotion} from '../dom.js';
import {db, prefs} from '../store.js';

const EVERY = 12e3;
let list = [], shown = '', timer = null;

export function moodPhotos(){
  if (!prefs.backdrop) return [];
  const pets = db.pets.length > 1 && prefs.activePet !== 'all' ? db.pets.filter(p => p.id === prefs.activePet) : db.pets;
  return pets.flatMap(p => Object.keys(p.photos || {}).sort().map(k => p.photos[k]));
}

/* Zwei Bilder liegen übereinander, das mit der Klasse „on“ ist zu sehen; der Wechsel ändert nur die Deckkraft (2 s, CSS) */
function show(src){
  const [a, b] = $('#mood').children, to = a.classList.contains('on') ? b : a, from = to === a ? b : a;
  shown = src; to.src = src;
  const swap = () => { if (shown === src) { to.classList.add('on'); from.classList.remove('on'); } };
  to.decode().then(swap, swap);
}
function next(){
  if (document.hidden || reduceMotion.matches || list.length < 2) return;
  show(list[(list.indexOf(shown) + 1) % list.length]);
}

/* Mit der Startseite zeichnen: Ein laufendes Foto bleibt stehen, solange es zur Auswahl gehört */
export function renderMood(){
  const el = $('#mood');
  list = moodPhotos();
  el.hidden = !list.length;
  if (!list.length) { shown = ''; for (const img of el.children) { img.classList.remove('on'); img.removeAttribute('src'); } }
  else if (!list.includes(shown)) show(list[0]);
  timer ||= setInterval(next, EVERY);
}
