export const $ = (s, r = document) => r.querySelector(s);
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
