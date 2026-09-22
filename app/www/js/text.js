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
