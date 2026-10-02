export const memPhotos = new Map(); // large photos, memory only

// ML Kit wants about 16 px per letter, small print has less at the 1100 px of memPhotos
export const READ_MAX = 2400;
const READ_QUALITY = 0.9;
export function readable(img, max = READ_MAX) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return encoded(c);
}
// enlarged to at least `width` px but no taller than READ_MAX, never shrunk; scale is how much larger it came out
export async function cropped(img, rect, width) {
  const [w, h] = [rect.right - rect.left, rect.bottom - rect.top];
  const c = document.createElement('canvas');
  c.width = Math.round(w * Math.max(1, Math.min(width / w, READ_MAX / h)));
  c.height = Math.round((h * c.width) / w);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, rect.left, rect.top, w, h, 0, 0, c.width, c.height);
  return {b64: await encoded(c), scale: c.width / w};
}
// toBlob encodes off the main thread, which matters at these sizes
const encoded = c =>
  new Promise((done, fail) =>
    c.toBlob(b => (b ? done(b) : fail(new Error('JPEG not encoded'))), 'image/jpeg', READ_QUALITY),
  ).then(
    b =>
      new Promise((done, fail) => {
        const r = new FileReader();
        r.onload = () => done(String(r.result).split(',')[1]);
        r.onerror = () => fail(r.error);
        r.readAsDataURL(b);
      }),
  );
export const photoOf = b64 =>
  fetch('data:image/jpeg;base64,' + b64)
    .then(r => r.blob())
    .then(fileToImage);

export function fileToImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file),
      img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = rej;
    img.src = url;
  });
}
export function resize(img, max, q) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
// rect {x, y, side} in pixels, the centre square without one
export function cropSquare(img, size, q, rect) {
  const m = Math.min(img.width, img.height),
    {x, y, side} = rect || {x: (img.width - m) / 2, y: (img.height - m) / 2, side: m};
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, x, y, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', q);
}
