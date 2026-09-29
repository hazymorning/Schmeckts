export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
export const norm = s =>
  String(s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export const andList = l => (l.length > 1 ? l.slice(0, -1).join(', ') + ' und ' + l.at(-1) : l[0] || ''); // “A, B und C”
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
/* The small words, German and English: what a name is not cut after, and what packaging print says nothing with */
export const SMALL = new Set(
  'und oder mit ohne in im am an auf aus bei fur von vor zu zum zur neu the and with for'.split(' '),
);
/* A name at most `max` characters long: cut where a part in another language begins („ / “, „ | “), otherwise
   after a whole word, and without a joining „&“ or „/“ or a small word („in“, „mit“) left at the end. The variety
   read off a packaging (ocr.js) and the variety in the overview's first sentence (views/home.js) are cut this way. */
export function cutName(v, max) {
  if (v.length <= max) return v.trim();
  const head = v.slice(0, max + 1),
    part = Math.max(head.lastIndexOf(' / '), head.lastIndexOf(' | ')),
    word = head.lastIndexOf(' ');
  let out = part > 0 ? head.slice(0, part) : word > 0 ? head.slice(0, word) : v.slice(0, max);
  const loose = /(?:[\s&+/|,·–-]+|\s(\p{L}+))$/u;
  for (let end; (end = out.match(loose)) && (!end[1] || SMALL.has(norm(end[1])));) out = out.slice(0, end.index);
  return out.trim();
}
/* Barcodes as on the server: EAN-13, EAN-8 and UPC-A with a valid check digit only; UPC-A becomes EAN-13 with a
   leading 0. Returns the code or '' */
export function normBarcode(raw) {
  let c = String(raw ?? '').trim();
  if (!/^[0-9]+$/.test(c)) return '';
  if (c.length === 12) c = '0' + c;
  if (c.length !== 8 && c.length !== 13) return '';
  let sum = 0;
  for (let i = c.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += +c[i] * w; // from the right: weight 3, 1, 3, …
  return (10 - (sum % 10)) % 10 === +c[c.length - 1] ? c : '';
}
