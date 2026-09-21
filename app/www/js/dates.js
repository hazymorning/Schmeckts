/* Date and time in local time; calendar days survive daylight saving changes. */

const rtf = new Intl.RelativeTimeFormat('de', {numeric:'auto', style:'short'});
const pad = n => String(n).padStart(2, '0');
export const timeStr = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysAgo = t => Math.round((dayStart(Date.now()) - dayStart(t)) / 864e5);
export const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }; // calendar days, across daylight saving changes too
export const weekStart = t => addDays(dayStart(t), -((new Date(t).getDay() + 6) % 7)); // Monday 00:00 local time
export const toLocalInput = t => `${dayKey(t)}T${timeStr(t)}`;
export function dayLabel(t){
  const n = daysAgo(t);
  if (n === 0) return 'Heute';
  if (n === 1) return 'Gestern';
  const o = {weekday:'long', day:'numeric', month:'long'};
  if (new Date(t).getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return new Date(t).toLocaleDateString('de-DE', o);
}
export function when(t){
  const n = daysAgo(t);
  const d = n === 0 ? 'heute' : n === 1 ? 'gestern' : new Date(t).toLocaleDateString('de-DE', {weekday:'short', day:'numeric', month:'short'});
  return `${d}, ${timeStr(t)} Uhr`;
}
export function ago(t){
  const d = (t - Date.now()) / 1000, a = Math.abs(d);
  if (a < 60) return 'gerade eben';
  if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  if (a < 86400 * 7) return rtf.format(Math.round(d / 86400), 'day');
  return new Date(t).toLocaleDateString('de-DE', {day:'numeric', month:'short'});
}
