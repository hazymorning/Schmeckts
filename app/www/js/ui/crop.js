/* Zuschnitt fürs Profilbild: quadratische Ansicht, verschieben mit einem Finger oder der Maus, zoomen mit zwei Fingern
   oder dem Regler. Der Zustand c = {w, h, z, cx, cy}: Bildgröße, Zoom (1 = die kurze Seite füllt die Ansicht) und der
   Bildpunkt in der Mitte der Ansicht. Die Rechenfunktionen sind rein, mountCrop() hängt sie an Ansicht und Regler. */

export const ZOOM_MAX = 4;
const side = c => Math.min(c.w, c.h) / c.z; // Kantenlänge des Ausschnitts in Bildpunkten
const within = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
function clamp(c){ // der Ausschnitt bleibt im Bild
  c.z = within(c.z, 1, ZOOM_MAX);
  const half = side(c) / 2;
  c.cx = within(c.cx, half, c.w - half); c.cy = within(c.cy, half, c.h - half);
  return c;
}
export function cropStart(img){ // ganz herausgezoomt, Bildmitte
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  return {w, h, z:1, cx:w / 2, cy:h / 2};
}
export const cropRect = c => ({x:c.cx - side(c) / 2, y:c.cy - side(c) / 2, side:side(c)});
/* dx, dy: Weg in der Ansicht in px, stage: ihre Breite */
function cropMove(c, dx, dy, stage){
  const k = side(c) / stage;
  c.cx -= dx * k; c.cy -= dy * k;
  return clamp(c);
}
/* Der Punkt (fx, fy) der Ansicht, 0 bis 1, bleibt beim Zoomen stehen: die Mitte beim Regler, zwischen den Fingern beim Zwicken */
function cropZoom(c, z, fx = .5, fy = .5){
  const s0 = side(c), px = c.cx + (fx - .5) * s0, py = c.cy + (fy - .5) * s0;
  c.z = within(z, 1, ZOOM_MAX);
  const s1 = side(c);
  c.cx = px - (fx - .5) * s1; c.cy = py - (fy - .5) * s1;
  return clamp(c);
}

/* stage: die quadratische Ansicht, img: das geladene Bild (wird hineingehängt), slider: der Regler */
export function mountCrop(stage, img, c, slider){
  const layout = () => {
    const k = stage.clientWidth / side(c), r = cropRect(c);
    Object.assign(img.style, {width:c.w * k + 'px', height:c.h * k + 'px', transform:`translate(${-r.x * k}px, ${-r.y * k}px)`});
    slider.value = c.z;
  };
  const pts = new Map(); // aktive Zeiger: ein Finger oder die Maus verschiebt, zwei Finger zoomen dazu
  const gauge = () => {
    const l = [...pts.values()], n = l.length || 1;
    return {x:l.reduce((a, p) => a + p.x, 0) / n, y:l.reduce((a, p) => a + p.y, 0) / n, d:l.length > 1 ? Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) : 0};
  };
  stage.addEventListener('pointerdown', e => {
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const a = gauge(); pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    const b = gauge(), r = stage.getBoundingClientRect();
    cropMove(c, b.x - a.x, b.y - a.y, r.width); // erst mit der Mitte der Finger mitgehen, dann um sie zoomen
    if (a.d && b.d) cropZoom(c, c.z * b.d / a.d, (b.x - r.left) / r.width, (b.y - r.top) / r.height);
    layout();
  });
  const up = e => pts.delete(e.pointerId);
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  slider.addEventListener('input', () => { cropZoom(c, +slider.value); layout(); });
  stage.prepend(img);
  layout();
}
