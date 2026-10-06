// The cat calendar's turn of sheets and what the overview card and the calendar share; the texts are in content/
import {DAY, dayKey, dayNumber} from '../dates.js';
import {esc} from '../text.js';
import {sexOf} from '../config.js';
import {FACTS} from '../content/facts.js';

// Sunday first, as getDay() counts
export const WEEK = ['Wissen', 'Katzenlogik', 'Stimmt’s?', 'Kurios', 'Wissen', 'Flachwitz', 'Sprache'];

// mixed once with a fixed seed, the same order on every phone
function shuffled(list, seed) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 2 ** 32) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
// the seed keeps sheets up to two apart in a list, often on the same theme, off turns in a row
const ORDERS = Object.fromEntries(Object.entries(FACTS).map(([format, list]) => [format, shuffled(list, 90950)]));
const START = 20454; // 1 January 2026 as dayNumber() counts it
const inSeason = (f, month) => !f.months || f.months.includes(month);
// dayNumber() counts a local date as UTC counts the same date
const dateOf = day => new Date((day + 0.5) * DAY);
const monthOf = day => dateOf(day).getUTCMonth() + 1;
const formatOf = day => WEEK[dateOf(day).getUTCDay()];
export const formatOn = date => formatOf(dayNumber(date));

/* The days of a format from START on take its sheets in turn; one out of season is skipped, so none comes twice
   before the others have had their turn. */
export function factOn(date) {
  const today = dayNumber(date),
    format = formatOf(today),
    order = ORDERS[format];
  let at = 0;
  for (let day = Math.min(START, today); ; day++) {
    if (formatOf(day) !== format) continue;
    const month = monthOf(day);
    while (!inSeason(order[at % order.length], month)) at++;
    if (day === today) break;
    at++;
  }
  return order[at % order.length];
}
export const sheetOn = date => ({sheet: factOn(date), format: formatOn(date)});
/* sheetDay: the day of the sheet on top, "YYYY-MM-DD". Before today it still hangs over today's sheet: the last one
   seen, whatever came in between. Its noon, or null. */
export function hangingDay(sheetDay, now) {
  if (!sheetDay || sheetDay >= dayKey(now)) return null;
  const [y, m, d] = sheetDay.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

// the household's only cat, if its sex is known: the variants and „dein Kater“ speak of it
export function catOf(pets) {
  const cats = pets.filter(p => p.species === 'Katze');
  return cats.length === 1 && sexOf(cats[0]) ? cats[0] : null;
}
export function sheetText(sheet, cat, back = false) {
  const text = back ? sheet.back : (cat && sheet[cat.sex]) || sheet.text,
    yours = cat?.sex === 'm' ? 'ein Kater' : 'eine Katze';
  return fill(text, {name: cat && esc(cat.name)}).replace(/\{([Dd])eine Katze\}/g, (_, d) => d + yours);
}

// values come escaped from the caller; one missing stays as it is, so a test sees it
export const fill = (template, values) => template.replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all);
// small words a heading and its sentence may share without sounding repetitive
const STOP = new Set(
  `der die das dem den des ein eine einen einem einer und oder aber auch noch schon mal nur ist sind war hat haben
  gibt gab sie dein deine dich dir man sich hier nicht nichts auf aufs aus bei mit von vom zum zur für fürs bis seit
  nach vor wie was`.split(/\s+/),
);
// content words cut to a light stem, so Tag, Tage and Tagen match; numbers do not count, 3 Stunden is not 3 Tage
const words = text =>
  new Set(
    text
      .replace(/<[^>]*>/g, ' ')
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter(w => w.length > 2 && !STOP.has(w))
      .map(w => w.replace(/(?<=.{3})(e[nrs]?|[ns])$/, '')),
  );
export function sharesWord(a, b) {
  const seen = words(a);
  return [...words(b)].some(w => seen.has(w));
}
