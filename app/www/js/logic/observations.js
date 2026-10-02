/* Observations: what a pet showed that stood out, noted with one tap on a chip of the overview card („Beobachtung
   notieren“), and put right or deleted later from the diary, where each one opens its sheet. One noted stands for the
   pets in view: the one chosen in the pet bar, or with „Alle“ every pet, which then means one of them or all, as
   with a litter box two cats share. Ratings stay what they are; the evaluation reads observations beside them. */
import {haptic} from '../native.js';
import {observationOf} from '../config.js';
import {uid} from '../fields.js';
import {db, prefs, save} from '../store.js';
import {byMe, getObservation} from '../derive.js';
import {toast} from '../ui/toast.js';
import {closeSheet, renderSheet, sheet} from '../ui/sheet.js';
import {homeView, update} from '../views/home.js';
import {whoObserved} from '../views/parts.js';

const shown = () =>
  prefs.activePet !== 'all' && db.pets.some(p => p.id === prefs.activePet) ? [prefs.activePet] : db.pets.map(p => p.id);
const petSet = ids => Object.fromEntries(ids.map(id => [id, true]));
const sortObs = () => db.observations.sort((a, b) => b.at - a.at);

/* A chip tapped: saved at once, the chips fold away with the redraw, and the toast says it with „Rückgängig“ */
export function observe(kind) {
  const ids = shown();
  if (!ids.length) return;
  const o = {id: uid(), kind, at: Date.now(), pets: petSet(ids), ...byMe()};
  db.observations.unshift(o);
  save();
  haptic('success');
  homeView.observing = false;
  update();
  toast(`${observationOf(kind).said}${db.pets.length > 1 ? ` für ${whoObserved(ids)}` : ''}.`, () => {
    db.observations = db.observations.filter(x => x.id !== o.id);
    save();
    update();
    renderSheet();
  });
}

/* In its sheet: another kind, takes effect at once */
export function setObservationKind(kind) {
  const o = getObservation(sheet?.id);
  if (!o || o.kind === kind) return;
  o.kind = kind;
  save();
  haptic('select');
  renderSheet();
  update();
}
/* In its sheet: whom it concerns. At least one pet stays; several mean it is not clear which of them it was. */
export function toggleObservationPet(pid) {
  const o = getObservation(sheet?.id);
  if (!o) return;
  if (o.pets[pid]) {
    if (Object.keys(o.pets).length === 1) {
      toast('Mindestens ein Tier muss dabei sein.');
      return;
    }
    delete o.pets[pid];
  } else o.pets[pid] = true;
  save();
  haptic('select');
  renderSheet();
  update();
}
/* In its sheet: when it was, never in the future */
export function setObservationTime(id, t) {
  const o = getObservation(id);
  if (!o || !Number.isFinite(t)) return;
  o.at = Math.min(t, Date.now());
  sortObs();
  save();
  haptic('select');
  renderSheet();
  update();
}
/* „Eintrag löschen“: one tap, undone from the toast, as with a meal */
export function deleteObservation(id) {
  const o = getObservation(id);
  if (!o) return;
  db.observations = db.observations.filter(x => x !== o);
  save();
  haptic('strong');
  closeSheet().then(() => {
    update();
    toast('Eintrag gelöscht', () => {
      db.observations.push(o);
      sortObs();
      save();
      update();
      renderSheet(); // the page it was deleted from, „Verlauf“
    });
  });
}
