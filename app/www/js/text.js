export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const norm = s => String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const andList = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' und ' + l.at(-1) : (l[0] || ''); // „A, B und C“
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
/* Barcode wie auf dem Server: nur EAN-13, EAN-8 und UPC-A mit gültiger Prüfziffer, UPC-A wird EAN-13 mit führender 0.
   Liefert den Code oder '' */
export function normBarcode(raw){
  let c = String(raw ?? '').trim();
  if (!/^[0-9]+$/.test(c)) return '';
  if (c.length === 12) c = '0' + c;
  if (c.length !== 8 && c.length !== 13) return '';
  let sum = 0;
  for (let i = c.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += +c[i] * w; // von rechts: Gewicht 3, 1, 3, …
  return (10 - sum % 10) % 10 === +c[c.length - 1] ? c : '';
}
