const rtf = new Intl.RelativeTimeFormat('de', {numeric: 'auto'});
export const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
export const timeStr = t => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// as the app says a time: 7:05, not 07:05
export const clockStr = t => {
  const d = new Date(t);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
};
// min: minutes after midnight, to the quarter hour
export function quarterStr(min) {
  const m = Math.round(min / 15) * 15;
  return `${Math.floor(m / 60) % 24}:${pad(m % 60)}`;
}
export const dayStart = t => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
// counts local days; the same all day
export const dayNumber = t => Math.round(dayStart(t) / DAY);
export const dayKey = t => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const daysAgo = t => Math.round((dayStart(Date.now()) - dayStart(t)) / DAY);
export const addDays = (t, n) => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}; // setDate, so a day stays a day across daylight saving changes
export const weekStart = t => addDays(dayStart(t), -((new Date(t).getDay() + 6) % 7)); // Monday 00:00 local time
export const toLocalInput = t => `${dayKey(t)}T${timeStr(t)}`;
export function dayLabel(t) {
  const n = daysAgo(t);
  if (n === 0) return 'Heute';
  if (n === 1) return 'Gestern';
  const o = {weekday: 'long', day: 'numeric', month: 'long'};
  if (new Date(t).getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return new Date(t).toLocaleDateString('de-DE', o);
}
// every date with its time: heute um 7:05, gestern um 18:30, am 2. Okt. um 18:29
export function when(t) {
  const n = daysAgo(t),
    d = new Date(t),
    year = d.getFullYear() !== new Date().getFullYear() ? {year: 'numeric'} : {};
  const day =
    n === 0
      ? 'heute'
      : n === 1
        ? 'gestern'
        : 'am ' + d.toLocaleDateString('de-DE', {day: 'numeric', month: 'short', ...year});
  return `${day} um ${clockStr(t)}`;
}
export function ago(t) {
  const d = (t - Date.now()) / 1000,
    a = Math.abs(d);
  if (a < 60) return 'gerade eben';
  if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  if (a < 86400 * 7) return rtf.format(Math.round(d / 86400), 'day');
  return 'am ' + new Date(t).toLocaleDateString('de-DE', {day: 'numeric', month: 'long'});
}
