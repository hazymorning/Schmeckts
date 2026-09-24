/* What the phone reads off a photo, apart from the plugin: the size of the photo it read. Pure functions, used by
   native.js and by the tests in Node. */

/* The size of a JPEG given as base64, from its frame header, without decoding the picture. {width, height}, both 0
   when there is no header to read. The photos come from a canvas, so the header sits in the first few hundred
   bytes; a camera's photo with a large preview in front of it is read up to 48 KB. */
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
