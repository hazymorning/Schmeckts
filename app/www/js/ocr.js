/* Packungstext auswerten: Aus dem Text, den das Handy auf dem Foto liest (native.js), wird dieselbe Antwort wie vom
   Server – brand, variety, type, animal, texture. Reine Funktionen, damit sie sich einzeln prüfen lassen.
   Reihenfolge: eigene Sorten, dann Marke aus der Liste, dann die auffälligste Zeile als Sorte. */
import {norm} from './text.js';
import {ANIMAL_WORDS, BRANDS, FLAVORS, TEXTURES, TYPE_WORDS} from './config.js';

export const MAX_VARIETY = 40;
const EMPTY = {brand:'', variety:'', type:'', animal:''};
const QUANTITY = /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)?|\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|stk|stück)\b/gi;
const JUNK = /zutaten|zusammensetzung|analytische|bestandteile|inhaltsstoff|rohprotein|rohfett|rohasche|feuchtigkeit|vitamin|zusatzstoff|alleinfutter|ergänzungsfutter|haltbar|füllmenge|gmbh|www\.|@|\bean\b/i;
const ADS = /^(?:neu|new|jetzt|jetzt neu|gratis|aktion|vorteilspack|sparpack|premium|qualität|natürlich|frisch|lecker|100\s*%\s*natürlich|ohne zucker)$|^\d+\s*%/i;
const squeeze = s => norm(s).replace(/ /g, '');        // unempfindlich gegen Groß/klein, Bindestriche und Leerzeichen
const has = (text, re) => re.test(text);

/* text: der gelesene Text, products: die eigenen Sorten. Ohne Brauchbares bleibt alles leer. */
export function readPack(text, products = []){
  const raw = String(text || '');
  if (!raw.trim()) return {...EMPTY};
  const tight = squeeze(raw);
  const known = products
    .filter(p => squeeze(`${p.brand} ${p.variety}`).length >= 4 && tight.includes(squeeze(p.brand)) && tight.includes(squeeze(p.variety)))
    .sort((a, b) => squeeze(`${b.brand} ${b.variety}`).length - squeeze(`${a.brand} ${a.variety}`).length)[0];
  if (known) return {brand:known.brand || '', variety:known.variety || '', type:known.type || '', animal:known.animal || '', texture:known.texture};

  const flat = ` ${norm(raw)} `;
  const brand = BRANDS.filter(b => flat.includes(` ${norm(b)} `)).sort((a, b) => norm(b).length - norm(a).length)[0] || '';
  const type = foodType(raw);
  const variety = pickVariety(raw, brand);
  if (!brand && !variety) return {...EMPTY};
  const texture = TEXTURES[type]?.items.find(([, , re]) => re.test(raw))?.[0];
  return {brand, variety, type, animal:ANIMAL_WORDS.find(([, re]) => re.test(raw))?.[0] || '', ...(texture ? {texture} : {})};
}

/* Art: erst die eindeutigen Stichwörter, sonst die Stichwörter der Konsistenz (Soße, Pastete → Nassfutter; Stick, Kau → Snack) */
function foodType(raw){
  const direct = TYPE_WORDS.find(([, re]) => re.test(raw));
  if (direct) return direct[0];
  return Object.entries(TEXTURES).find(([, t]) => t.items.some(([, , re]) => re.test(raw)))?.[0] || '';
}

/* Sorte: die auffälligste Zeile ohne Mengen, Werbung, Zutaten und reine Zahlen. Passen mehrere, werden sie in der
   Reihenfolge der Packung zusammengeführt, höchstens MAX_VARIETY Zeichen. */
function pickVariety(raw, brand){
  const bare = norm(brand);
  const lines = raw.split(/\r?\n/)
    .map(l => withoutBrand(l.replace(QUANTITY, ' ').replace(/\s+/g, ' ').trim(), bare).replace(/^[\s\-–,·|]+|[\s\-–,·|]+$/g, ''))
    .filter(v => v.length >= 3 && (v.match(/[A-Za-zÄÖÜäöüß]/g) || []).length >= 3 && !JUNK.test(v) && !ADS.test(v) && norm(v) !== bare);
  const scored = lines.map((v, i) => ({v, i, s:score(v) - Math.min(1, i * .2)})).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return '';
  const take = [scored[0]];
  for (const x of scored.slice(1)) {
    if (x.s < 1) break;
    const merged = [...take, x].sort((a, b) => a.i - b.i).map(y => y.v).join(' ');
    if (merged.length > MAX_VARIETY) break;
    take.push(x);
  }
  return take.sort((a, b) => a.i - b.i).map(x => x.v).join(' ').slice(0, MAX_VARIETY).trim();
}
function withoutBrand(v, bare){ // „Sheba Lachs in Soße“ → „Lachs in Soße“
  if (!bare) return v;
  const words = v.split(' ');
  for (let n = 1; n <= words.length; n++) {
    const head = norm(words.slice(0, n).join(' '));
    if (head === bare) return words.slice(n).join(' ');
    if (!bare.startsWith(head)) break;
  }
  return v;
}
const score = v => (FLAVORS.some(([, re]) => has(v, re)) ? 3 : 0)
  + (Object.values(TEXTURES).some(t => t.items.some(([, , re]) => has(v, re))) ? 2 : 0)
  + (TYPE_WORDS.some(([, re]) => has(v, re)) ? 1 : 0) + Math.min(2, v.length / 12);
