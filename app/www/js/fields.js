/* Datensätze als Felder, so wie der Server sie abgleicht: jeder Schlüssel außer id, Karten (MAPS) Eintrag für Eintrag
   als <karte>.<schlüssel>. null entfernt, lokale Felder bleiben auf dem Handy. Reine Funktionen. */

export const COLLECTIONS = ['pets', 'products', 'servings'];
const MAPS = {servings:['pets'], products:['codes'], pets:['photos']};    // Karten, Eintrag für Eintrag abgeglichen
const LOCAL = new Set(['photo', 'status', 'error', 'autoPets', 'scanCode']); // nur in servings
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;                         // wie auf dem Server
export const validId = id => typeof id === 'string' && ID_RE.test(id); // test(undefined) wäre sonst wahr
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const FIELD_RE = /^(_del|[A-Za-z][A-Za-z0-9]{0,31})(\.[A-Za-z0-9_-]{1,40})?$/;
export const MAX_FIELD = 500e3;                                         // der Server nimmt bis 512 KB pro Feld

const isMap = (c, k) => !!MAPS[c]?.includes(k);

/* Alle abgeglichenen Felder eines Datensatzes als JSON-Text: {feld: '"wert"'} */
export function fieldsOf(c, rec){
  const out = {};
  const put = (k, v) => {
    if (v == null || !FIELD_RE.test(k) || k === '_del') return;
    const j = JSON.stringify(v);
    if (j.length <= MAX_FIELD) out[k] = j; else console.warn('Feld zu groß, bleibt auf dem Gerät:', c, rec.id, k);
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

/* Setzt ein Feld. false: Dieses Gerät kennt das Feld nicht (Karte einer neueren Version) und hält es nicht. */
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

/* Datensatz aus Feldwerten {feld: wert} */
export function fromFields(c, id, values){
  const rec = {id};
  for (const m of MAPS[c] || []) rec[m] = {};
  for (const [k, v] of Object.entries(values)) setField(c, rec, k, v);
  return rec;
}

/* Nur vollständige Datensätze erscheinen in der App */
export const complete = (c, rec) => c !== 'servings' || (typeof rec.servedAt === 'number' && !!rec.pets);

export const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
