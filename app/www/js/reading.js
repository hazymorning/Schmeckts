// Text recognition results as plain data, kept free of the plugin so the Node tests can run it.

/* box is in photo pixels; w and h run along the line's own direction, so a slanted line is not taller than it is;
   tilt is in radians, positive falling to the right. */
export function readingOf(raw, width = 0, height = 0) {
  const lines = [];
  for (const block of raw?.blocks || [])
    for (const line of block?.lines || []) {
      const shape = shapeOf(line);
      if (!shape) continue;
      const elements = (line.elements || [])
        .map(e => ({text: String(e?.text || ''), ...shapeOf(e)}))
        .filter(e => e.text && e.box);
      const lang = String(line.recognizedLanguage || block.recognizedLanguage || '');
      lines.push({text: String(line.text || ''), elements, ...shape, lang});
    }
  return {text: String(raw?.text || ''), width, height, lines};
}

// corners come top left, top right, bottom right, bottom left; without them the box is taken as level
function shapeOf(x) {
  const c = x?.cornerPoints?.length === 4 ? x.cornerPoints : null,
    b = x?.boundingBox;
  const box = b
    ? {left: b.left, top: b.top, right: b.right, bottom: b.bottom}
    : c && {
        left: Math.min(...c.map(p => p.x)),
        top: Math.min(...c.map(p => p.y)),
        right: Math.max(...c.map(p => p.x)),
        bottom: Math.max(...c.map(p => p.y)),
      };
  if (!box || !(box.right >= box.left && box.bottom >= box.top)) return null;
  if (!c) {
    const [w, h] = [box.right - box.left, box.bottom - box.top];
    return {box, w, h, cx: (box.left + box.right) / 2, cy: (box.top + box.bottom) / 2, tilt: 0};
  }
  const span = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
  return {
    box,
    w: (span(c[0], c[1]) + span(c[3], c[2])) / 2,
    h: (span(c[0], c[3]) + span(c[1], c[2])) / 2,
    cx: c.reduce((s, p) => s + p.x, 0) / 4,
    cy: c.reduce((s, p) => s + p.y, 0) / 4,
    tilt: Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x),
  };
}

// from the frame header without decoding; 48 KB reaches past a camera photo's embedded preview
export function jpegSize(b64) {
  const none = {width: 0, height: 0};
  let bytes;
  try {
    bytes = atob(String(b64 || '').slice(0, 65536));
  } catch {
    // not base64, so not a photo either
    return none;
  }
  const at = i => bytes.charCodeAt(i);
  if (at(0) !== 0xff || at(1) !== 0xd8) return none;
  for (let i = 2; i + 8 < bytes.length;) {
    if (at(i) !== 0xff) return none;
    const marker = at(i + 1);
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    // SOF0 to SOF15 carry the size; C4 (Huffman tables), C8 and CC (arithmetic coding) share the range but do not
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return {height: (at(i + 5) << 8) | at(i + 6), width: (at(i + 7) << 8) | at(i + 8)};
    i += 2 + ((at(i + 2) << 8) | at(i + 3));
  }
  return none;
}
