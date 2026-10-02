// Mood picture behind the header
import {$} from '../dom.js';
import {db, prefs} from '../store.js';

function moodPhoto() {
  if (!prefs.backdrop) return '';
  const pet = db.pets.length === 1 ? db.pets[0] : db.pets.find(p => p.id === prefs.activePet);
  return pet?.photo || '';
}

export function renderMood() {
  const el = $('#mood'),
    img = el.firstElementChild,
    src = moodPhoto();
  el.hidden = !src;
  if (src) img.src = src;
  else img.removeAttribute('src');
}
