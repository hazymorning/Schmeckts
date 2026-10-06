// rating a meal, from its slider or from the reminder's buttons
import {haptic} from '../native.js';
import {RATINGS} from '../config.js';
import {rateCls} from '../smart.js';
import {settled} from '../motion.js';
import {db, save} from '../store.js';
import {byMe, getPet, getServing} from '../derive.js';
import {toast} from '../ui/toast.js';
import {closeSheet, renderSheet, sheet, topDialog} from '../ui/sheet.js';
import {setLevel, untouched} from '../ui/slider.js';
import {viewerOpen} from '../ui/viewer.js';
import {homeView, update} from '../views/home.js';

// a level the meal already holds stays as it is (a second tap, Enter twice)
export function rateMeal(sid, pid, r) {
  const s = getServing(sid);
  if (!s || !s.pets[pid] || !RATINGS[r] || s.pets[pid].r === r) return false;
  const prev = {...s.pets[pid]},
    pet = getPet(pid);
  s.pets[pid] = {r, at: Date.now(), ...byMe()};
  save();
  haptic('success');
  toast(
    `${RATINGS[r].label}${db.pets.length > 1 && pet ? ' für ' + pet.name : ''}. ${RATINGS[r].cheer}`,
    undoRating(s.id, pid, prev),
    {ic: 'r_' + r, tone: rateCls(r)},
  );
  return true;
}
export function rate(el) {
  const {s, p, r} = el.dataset,
    was = getServing(s)?.pets[p]?.r;
  if (rateMeal(s, p, r)) showRated(setLevel(el.closest('.slider'), r), getServing(s), p, !!was);
}

const undoRating = (sid, pid, prev) => () => {
  const cur = getServing(sid);
  if (!cur || !cur.pets[pid]) return;
  cur.pets[pid] = prev;
  save();
  update();
  renderSheet();
};

/* A fully rated meal stays put for a moment so it can be corrected; a finger still on a slider holds it longer.
   Its sheet closes by itself only once the last open pet is rated, not when an old rating is put right. */
const HOLD = 1500; // ms
const holds = new Map(); // meal id → its newest hold, so an older one ending does nothing
let lastHold = 0;
const rated = s => Object.values(s.pets).every(x => x.r);
function showRated(disc, s, pid, corrected) {
  const inSheet = sheet?.kind === 'serving' && sheet.id === s.id;
  if (!inSheet) {
    // the row stays until the pop has run
    if (!homeView.held.has(s.id)) homeView.held.set(s.id, new Set());
    homeView.held.get(s.id).add(pid);
  }
  settled(disc)
    .then(untouched)
    .then(() => update());
  if (!rated(s) || (inSheet && corrected && !holds.has(s.id))) {
    holds.delete(s.id);
    return;
  }
  const mine = ++lastHold;
  holds.set(s.id, mine);
  setTimeout(() => untouched().then(() => holds.get(s.id) === mine && finish(s.id, inSheet)), HOLD);
}
function finish(sid, inSheet) {
  holds.delete(sid);
  const s = getServing(sid);
  if (!s || !rated(s)) return; // undone meanwhile, or given another pet
  if (inSheet) {
    const busy = document.activeElement?.matches('input, textarea') && topDialog()?.contains(document.activeElement);
    if (sheet?.kind === 'serving' && sheet.id === sid && !sheet.step && !busy && !viewerOpen()) closeSheet();
    return;
  }
  const li = document.querySelector(`.pend[data-id="${sid}"]`),
    gone = () => {
      homeView.held.delete(sid);
      update();
    };
  if (!li) return gone();
  li.classList.add('leaving');
  settled(li).then(gone);
}
