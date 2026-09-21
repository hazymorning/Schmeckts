/* Records as fields, the way the server syncs them: every key except id, and maps (MAPS) entry by entry as
   <map>.<key>. null removes, local fields stay on the phone. Pure functions. */

export const COLLECTIONS = ['pets', 'products', 'servings'];
const MAPS = {servings:['pets'], products:['codes'], pets:['photos']};    // maps, synced entry by entry
const LOCAL = new Set(['photo', 'status', 'error', 'autoPets', 'scanCode', 'guess']); // in servings only
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;                         // as on the server
export const validId = id => typeof id === 'string' && ID_RE.test(id); // test(undefined) would otherwise be true
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const FIELD_RE = /^(_del|[A-Za-z][A-Za-z0-9]{0,31})(\.[A-Za-z0-9_-]{1,40})?$/;
export const MAX_FIELD = 500e3;                                         // the server accepts up to 512 KB per field

const isMap = (c, k) => !!MAPS[c]?.includes(k);

/* Every synced field of a record as JSON text: {field: '"value"'} */
export function fieldsOf(c, rec){
  const out = {};
  const put = (k, v) => {
    if (v == null || !FIELD_RE.test(k) || k === '_del') return;
    const j = JSON.stringify(v);
    if (j.length <= MAX_FIELD) out[k] = j; else console.warn('field too large, stays on the device:', c, rec.id, k);
  };
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'id' || (c === 'servings' && LOCAL.has(k))) continue;
    if (isMap(c, k)) for (const [key, x] of Object.entries(v || {})) put(k + '.' + key, x);
    else put(k, v);
  }
  return out;
}

const splitKey = k => { const i = k.indexOf('.'); return i < 0 ? [k, null] : [k.slice(0, i), k.slice(i + 1)]; };

export function valueOf(c, rec, k){
  const [a, b] = splitKey(k);
  return (b != null ? rec?.[a]?.[b] : rec?.[a]) ?? null;
}

/* Sets a field. false: this device does not know the field (a map from a newer version) and does not keep it. */
export function setField(c, rec, k, v){
  const [a, b] = splitKey(k);
  if (b != null) {
    if (!isMap(c, a)) return false;
    rec[a] ||= {};
    if (v == null) delete rec[a][b]; else rec[a][b] = v;
  } else if (k !== 'id' && k !== '_del') {
    if (v == null) delete rec[k]; else rec[k] = v;
  } else return false;
  return true;
}

/* Record from field values {field: value} */
export function fromFields(c, id, values){
  const rec = {id};
  for (const m of MAPS[c] || []) rec[m] = {};
  for (const [k, v] of Object.entries(values)) setField(c, rec, k, v);
  return rec;
}

/* Only complete records show up in the app */
export const complete = (c, rec) => c !== 'servings' || (typeof rec.servedAt === 'number' && !!rec.pets);

export const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
