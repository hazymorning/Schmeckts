/* Reading, shrinking and cropping photos. Large photos for recognition stay in memory only. */
export const memPhotos = new Map(); // large photos in memory only, for recognition

/* Images */
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
/* A square out of the image, the middle one without rect; rect {x, y, side} in pixels comes from cropping (ui/crop.js) */
export function cropSquare(img, size, q, rect){
  const m = Math.min(img.width, img.height), {x, y, side} = rect || {x:(img.width - m) / 2, y:(img.height - m) / 2, side:m};
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, x, y, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', q);
}
