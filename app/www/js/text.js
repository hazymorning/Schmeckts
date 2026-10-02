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
export const andList = (l, and = 'und') =>
  l.length > 1 ? l.slice(0, -1).join(', ') + ` ${and} ` + l.at(-1) : l[0] || '';
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// filler words, German and English, that carry no meaning on their own
export const SMALL = new Set(
  'und oder mit ohne in im am an auf aus bei fur von vor zu zum zur neu the and with for'.split(' '),
);
// prefers cutting where another language begins (" / ", " | "), then at a word; never ends on a joiner or filler word
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
// must match the server's rules: UPC-A is stored as EAN-13, an invalid code gives ''
export function normBarcode(raw) {
  let c = String(raw ?? '').trim();
  if (!/^[0-9]+$/.test(c)) return '';
  if (c.length === 12) c = '0' + c;
  if (c.length !== 8 && c.length !== 13) return '';
  let sum = 0;
  for (let i = c.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += +c[i] * w; // weights 3, 1, 3, … from the right
  return (10 - (sum % 10)) % 10 === +c[c.length - 1] ? c : '';
}
