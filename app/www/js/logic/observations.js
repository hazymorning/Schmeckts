// noted for all pets, an observation means one of them or all, as with a shared litter box
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

export function setObservationKind(kind) {
  const o = getObservation(sheet?.id);
  if (!o || o.kind === kind) return;
  o.kind = kind;
  save();
  haptic('select');
  renderSheet();
  update();
}
// several pets mean it is unclear which one it was
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
      renderSheet();
    });
  });
}
