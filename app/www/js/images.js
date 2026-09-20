/* Fotos lesen, verkleinern und zuschneiden. Große Fotos für die Erkennung bleiben nur im Arbeitsspeicher. */
import {MAX_FIELD} from './fields.js';

export const memPhotos = new Map(); // große Fotos nur im Arbeitsspeicher, für die Erkennung

/* Bilder */
export function fileToImage(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = rej; img.src = url;
  });
}
export function resize(img, max, q){
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
/* Quadrat aus dem Bild, ohne rect das mittlere; rect {x, y, side} in Bildpunkten kommt vom Zuschnitt (ui/crop.js) */
export function cropSquare(img, size, q, rect){
  const m = Math.min(img.width, img.height), {x, y, side} = rect || {x:(img.width - m) / 2, y:(img.height - m) / 2, side:m};
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, x, y, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', q);
}
export const urlToImage = url => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = url; });
/* Album-Foto eines Tiers: JPEG, längste Seite 960 px, Qualität 0,72. Passt es so nicht in ein Feld des Abgleichs
   (sehr detailreiche Fotos), sinkt die Qualität, bis es passt. */
export function albumPhoto(img){
  let out = '';
  for (const q of [.72, .6, .45, .3]) { out = resize(img, 960, q); if (out.length < MAX_FIELD - 100) break; }
  return out;
}
