/* Mood picture behind the header: the profile picture of the pet in the filter, or of the only pet. Under „Alle“
   with several pets there is none. */
import {$} from '../dom.js';
import {db, prefs} from '../store.js';

export function moodPhoto(){
  if (!prefs.backdrop) return '';
  const pet = db.pets.length === 1 ? db.pets[0] : db.pets.find(p => p.id === prefs.activePet);
  return pet?.photo || '';
}

/* Drawn with the home page */
export function renderMood(){
  const el = $('#mood'), img = el.firstElementChild, src = moodPhoto();
  el.hidden = !src;
  if (src) img.src = src; else img.removeAttribute('src');
}
