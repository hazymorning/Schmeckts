/* Cropping for the profile picture: a square stage, panning with one finger or the mouse, zooming with two fingers
   or the slider. The state c = {w, h, z, cx, cy}: image size, zoom (1 = the short side fills the stage) and the pixel
   at the centre of the stage. The computing functions are pure; mountCrop() wires them to stage and slider. */

export const ZOOM_MAX = 4;
const side = c => Math.min(c.w, c.h) / c.z; // edge length of the crop in pixels
const within = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
function clamp(c){ // the crop stays inside the image
  c.z = within(c.z, 1, ZOOM_MAX);
  const half = side(c) / 2;
  c.cx = within(c.cx, half, c.w - half); c.cy = within(c.cy, half, c.h - half);
  return c;
}
export function cropStart(img){ // fully zoomed out, centre of the image
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  return {w, h, z:1, cx:w / 2, cy:h / 2};
}
export const cropRect = c => ({x:c.cx - side(c) / 2, y:c.cy - side(c) / 2, side:side(c)});
/* dx, dy: distance travelled on the stage in px, stage: its width */
function cropMove(c, dx, dy, stage){
  const k = side(c) / stage;
  c.cx -= dx * k; c.cy -= dy * k;
  return clamp(c);
}
/* The point (fx, fy) of the stage, 0 to 1, stays put while zooming: the centre for the slider, between the fingers when pinching */
function cropZoom(c, z, fx = .5, fy = .5){
  const s0 = side(c), px = c.cx + (fx - .5) * s0, py = c.cy + (fy - .5) * s0;
  c.z = within(z, 1, ZOOM_MAX);
  const s1 = side(c);
  c.cx = px - (fx - .5) * s1; c.cy = py - (fy - .5) * s1;
  return clamp(c);
}

/* stage: the square stage, img: the loaded image (hung inside it), slider: the zoom slider */
export function mountCrop(stage, img, c, slider){
  const layout = () => {
    const k = stage.clientWidth / side(c), r = cropRect(c);
    Object.assign(img.style, {width:c.w * k + 'px', height:c.h * k + 'px', transform:`translate(${-r.x * k}px, ${-r.y * k}px)`});
    slider.value = c.z;
  };
  const pts = new Map(); // active pointers: one finger or the mouse pans, two fingers zoom as well
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
    cropMove(c, b.x - a.x, b.y - a.y, r.width); // first follow the midpoint of the fingers, then zoom around it
    if (a.d && b.d) cropZoom(c, c.z * b.d / a.d, (b.x - r.left) / r.width, (b.y - r.top) / r.height);
    layout();
  });
  const up = e => pts.delete(e.pointerId);
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  slider.addEventListener('input', () => { cropZoom(c, +slider.value); layout(); });
  stage.prepend(img);
  layout();
}
