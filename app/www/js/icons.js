/* Our own SVG icon set on a 24 grid. The ratings (r_<key>) show what you see when you come back: the bowl, or the
   morsel for treats. Plus line drawings in the logo's shape language (bowl as a speech bubble) for empty states. */

const BOWL = '<path d="M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"/>';
const DOT = (x, y) => `<circle cx="${x}" cy="${y}" r="1.15" fill="currentColor" stroke="none"/>`;
const CRUMBS = DOT(7.7, 13.1) + DOT(11.3, 16) + DOT(7.6, 17);
const TREAT = '<circle cx="9.6" cy="14.4" r="6"/>' + CRUMBS;
const ABOVE = mark => `<g transform="translate(6.6 .2)">${mark}</g>`; // heart and clock sit top right on the morsel
const HEART =
  '<path d="M12 8.7c-1.4-.9-2.8-2-2.8-3.4a1.45 1.45 0 0 1 2.8-.6 1.45 1.45 0 0 1 2.8.6c0 1.4-1.4 2.5-2.8 3.4z"/>';
const LATER = '<circle cx="12" cy="5.6" r="3.3"/><path d="M12 3.9v1.9l1.2.8"/>';
const FULL =
  '<path d="M5.4 11c.8-2.7 3.5-4.4 6.6-4.4s5.8 1.7 6.6 4.4z" fill="currentColor" fill-opacity=".3"/>' +
  BOWL +
  '<path d="M9.3 4.6c-.6-.7-.6-1.5 0-2.2M14.7 4.6c-.6-.7-.6-1.5 0-2.2"/>';
const I = {
  r_top: BOWL + HEART,
  r_gut: BOWL + LATER,
  r_mittel:
    '<path d="M5.3 14.3h13.4l-.75 3.1a1.4 1.4 0 0 1-1.36 1.07H7.41A1.4 1.4 0 0 1 6.05 17.4z" fill="currentColor" fill-opacity=".35" stroke="none"/>' +
    BOWL,
  r_sosse:
    BOWL +
    DOT(9, 15.4) +
    DOT(12.2, 16.2) +
    DOT(15.1, 15.2) +
    '<path d="M12 2.8c1.2 1.5 2.1 2.7 2.1 3.8a2.1 2.1 0 0 1-4.2 0c0-1.1.9-2.3 2.1-3.8z"/>',
  r_schlecht: FULL,
  r_gern: BOWL + HEART,
  r_normal: BOWL,
  r_wenig: '<path d="M5.4 11c1.2-1.6 3.6-2.5 6.6-2.5s5.4.9 6.6 2.5z" fill="currentColor" fill-opacity=".3"/>' + BOWL,
  r_liegen: FULL,
  r_verputzt: TREAT + ABOVE(HEART),
  r_spaeter: TREAT + ABOVE(LATER),
  r_angeknabbert:
    '<path d="M11.55 8.73A6 6 0 1 0 15.27 12.45 2.7 2.7 0 0 1 11.55 8.73z"/>' +
    CRUMBS +
    DOT(17.8, 8.2) +
    DOT(19.6, 11.4),
  r_unberuehrt: TREAT + '<path d="M16.3 5.8h4.6"/>',
  bowl:
    '<path class="fill" fill="currentColor" stroke="none" d="M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"/>' +
    BOWL +
    '<path d="M12 5.2v3.6M10.2 7h3.6"/>',
  barcode:
    '<path d="M4 8.5V6.3A2.3 2.3 0 0 1 6.3 4h2.2M15.5 4h2.2A2.3 2.3 0 0 1 20 6.3v2.2M20 15.5v2.2a2.3 2.3 0 0 1-2.3 2.3h-2.2M8.5 20H6.3A2.3 2.3 0 0 1 4 17.7v-2.2"/><path d="M8 8.5v7M10.6 8.5v7M13.4 8.5v7M16 8.5v7"/>',
  camera:
    '<path d="M3.5 8.8a2.3 2.3 0 0 1 2.3-2.3h1.7l1.3-1.9a1.4 1.4 0 0 1 1.16-.6h4.08a1.4 1.4 0 0 1 1.16.6l1.3 1.9h1.7a2.3 2.3 0 0 1 2.3 2.3v8.4a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3z"/><circle cx="12" cy="12.9" r="3.4"/>',
  sliders:
    '<path d="M4 7.5h8.5M16.5 7.5H20M4 16.5h3.5M11.5 16.5H20"/><circle cx="14.5" cy="7.5" r="2"/><circle cx="9.5" cy="16.5" r="2"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  undo: '<path d="M8.5 13.5l-4-4 4-4"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>',
  trash:
    '<path d="M4.5 7h15M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.8 11.3a2 2 0 0 0 2 1.7h5.4a2 2 0 0 0 2-1.7L17.5 7M10.2 11v5M13.8 11v5"/>',
  search: '<circle cx="11" cy="11" r="6.2"/><path d="M19.5 19.5l-3.9-3.9"/>',
  pencil: '<path d="M4.5 19.5h4l10-10a2.83 2.83 0 0 0-4-4l-10 10z"/><path d="M13.5 7l3.5 3.5"/>',
  check: '<path d="M5 12.5l4.3 4.3L19 7.5"/>',
  trophy:
    '<path d="M8 4.5h8v4.2a4 4 0 0 1-8 0z"/><path d="M8 6H5.6v1a2.6 2.6 0 0 0 2.6 2.6M16 6h2.4v1a2.6 2.6 0 0 1-2.6 2.6M12 12.7v3.6M8.8 19.5h6.4M9.9 16.3h4.2l.6 3.2H9.3z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.3l2.8 1.7"/>',
  phone: '<rect x="7" y="3.5" width="10" height="17" rx="2.4"/><path d="M10.8 17.4h2.4"/>',
  house: '<path d="M4.5 10.6L12 4.5l7.5 6.1v8a1.4 1.4 0 0 1-1.4 1.4h-3.6v-5.4h-5v5.4H5.9a1.4 1.4 0 0 1-1.4-1.4z"/>',
  alert:
    '<path d="M10.6 5.2a1.6 1.6 0 0 1 2.8 0l6.6 11.9a1.6 1.6 0 0 1-1.4 2.4H5.4A1.6 1.6 0 0 1 4 17.1z"/><path d="M12 9.8v3.7M12 16.4v.2"/>',
  refresh:
    '<path d="M19 12.5a7 7 0 0 1-12.4 4.1M5 11.5a7 7 0 0 1 12.4-4.1"/><path d="M17.8 3.9v3.8H14M6.2 20.1v-3.8H10"/>',
  unplug: '<path d="M8.5 7.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M15.5 16.5l2-2a3.5 3.5 0 0 0-5-5l-2 2M4.5 4.5l15 15"/>',
  chevron: '<path d="M9.5 6l6 6-6 6"/>',
  paw: '<circle cx="6.6" cy="10.4" r="1.7"/><circle cx="10" cy="6.6" r="1.7"/><circle cx="14" cy="6.6" r="1.7"/><circle cx="17.4" cy="10.4" r="1.7"/><path d="M12 12.2c-2.5 0-4.8 2.4-4.8 4.8 0 1.5 1.1 2.5 2.4 2.5.9 0 1.6-.5 2.4-.5s1.5.5 2.4.5c1.3 0 2.4-1 2.4-2.5 0-2.4-2.3-4.8-4.8-4.8z"/>',
  shield: '<path d="M12 3.5l7 2.5v5.3c0 4.4-2.9 7.8-7 9.2-4.1-1.4-7-4.8-7-9.2V6z"/><path d="M9.2 12l2 2 3.6-3.8"/>',
  pin: '<path d="M9.2 3.5h5.6l-.9 5.6 3.1 3.3v1.4H7v-1.4l3.1-3.3z"/><path d="M12 13.8v6.7"/>',
  award: '<circle cx="12" cy="9.5" r="5.5"/><path d="M8.7 13.9l-1.2 6.6 4.5-2.4 4.5 2.4-1.2-6.6"/>',
  layers: '<path d="M12 4.5l8 4-8 4-8-4z"/><path d="M4 12.3l8 4 8-4"/><path d="M4 16.1l8 4 8-4"/>',
  fish: '<path d="M21 12c-1.7 3-4.5 5-7.8 5-3.4 0-6.1-2-7.7-5 1.6-3 4.3-5 7.7-5 3.3 0 6.1 2 7.8 5z"/><path d="M5.5 12L2.5 8.8v6.4z"/><path d="M16.6 10.9v.2"/>',
  drop: '<path d="M12 3.8c3.1 3.7 5.6 6.8 5.6 9.9a5.6 5.6 0 0 1-11.2 0c0-3.1 2.5-6.2 5.6-9.9z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3"/>',
  moon: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
  auto: '<circle cx="12" cy="12" r="7.8"/><path d="M12 4.2v15.6a7.8 7.8 0 0 0 0-15.6z" fill="currentColor"/>',
  download: '<path d="M12 4.5V15M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4.5M7.5 9L12 4.5 16.5 9M5 19.5h14"/>',
  sparkle: '<path d="M12 4l1.7 4.6 4.6 1.4-4.6 1.7L12 16.3l-1.7-4.6L5.7 10l4.6-1.4z"/><path d="M18.5 16v3M17 17.5h3"/>',
  cat: '<path d="M5.2 10.2V4.6l4.1 3.1h5.4l4.1-3.1v5.6c.7 1.1 1.1 2.4 1.1 3.8 0 3.9-3.6 6.4-7.9 6.4s-7.9-2.5-7.9-6.4c0-1.4.4-2.7 1.1-3.8z"/><path d="M9.3 13.2v.4M14.7 13.2v.4"/><path d="M11.1 16.1l.9.7.9-.7"/>',
  dog: '<path d="M8.2 5.5h7.6a3 3 0 0 1 3 3v4.6a6.8 6.8 0 0 1-13.6 0V8.5a3 3 0 0 1 3-3z"/><path d="M7.4 5.7C5 5.7 3 7 3.2 9.8c.1 1.7.8 3 1.9 3.4M16.6 5.7c2.4 0 4.4 1.3 4.2 4.1-.1 1.7-.8 3-1.9 3.4"/><path d="M9.6 11.3v.4M14.4 11.3v.4"/><path d="M10.9 14.8h2.2L12 16z"/>',
  rabbit:
    '<path d="M9.9 9.3C8.6 7.4 8 4.9 8.6 3.8c.8-1.3 2.6.6 3.2 4.6M14.1 9.3c1.3-1.9 1.9-4.4 1.3-5.5-.8-1.3-2.6.6-3.2 4.6"/><circle cx="12" cy="14.3" r="5.6"/><path d="M10 13.6v.4M14 13.6v.4M11.2 16.3h1.6"/>',
  bird: '<path d="M4.8 13.2c0-4.2 2.9-7.2 6.7-7.2 2.4 0 4.2 1.4 5 3.4l3.8.9-3.5 1.7c.1 4.6-3.2 8.2-7.7 8.2H6l1.9-2.5c-1.9-.9-3.1-2.5-3.1-4.5z"/><path d="M13.9 9.4v.4"/><path d="M8.5 13.5c1.3 1.3 3.2 1.6 4.9.7"/>',
  rodent:
    '<path d="M6.2 9a2 2 0 1 1 3-2.3M17.8 9a2 2 0 1 0-3-2.3"/><path d="M4.4 14.2c0-4 3.4-6.9 7.6-6.9s7.6 2.9 7.6 6.9c0 3.6-3.4 5.9-7.6 5.9s-7.6-2.3-7.6-5.9z"/><path d="M9.8 13.2v.4M14.2 13.2v.4M11.2 15.8h1.6"/>',
};
/* Line drawings on a 64 grid: the logo's speech bubble with a bowl, and a heart, crumbs or camera as the case may be */
const BUBBLE = '<path d="M34 8A22 22 0 1 1 20.5 47.2L12 57l3.4-15.4A22 22 0 0 1 34 8z"/>';
const S = {
  empty: BUBBLE + '<circle cx="34" cy="30" r="12"/><path d="M26.5 33.5a8 8 0 0 0 15 0" stroke-dasharray="1.5 3.2"/>',
  camera:
    BUBBLE +
    '<path d="M25 26.5a2 2 0 0 1 2-2h2.4l1.4-2h5.4l1.4 2H40a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H27a2 2 0 0 1-2-2z"/><circle cx="33.5" cy="31.2" r="3.3"/>',
};
export const sketch = (n, cls = '') =>
  `<svg class="sk ${cls}" viewBox="0 0 64 64" aria-hidden="true">${S[n] || ''}</svg>`;

export const icon = (n, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;
