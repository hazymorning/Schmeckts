import {measure} from './clock.js';
import {prefs} from './store.js';

export const PROTOCOL = 1;

// kind: offline, auth, locked (too many attempts), busy (cost brake), unavailable, server, bad or input
export class ServerError extends Error {
  constructor(kind, message, status = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

// private ranges and local names; host comes from URL.hostname, so it is already normalised
function isHome(host) {
  const name = host.replace(/\.$/, '');
  if (name === 'localhost' || /\.(local|home\.arpa)$/.test(name)) return true;
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(name);
  if (v4) {
    const a = +v4[1],
      b = +v4[2];
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = /^\[([0-9a-f]{1,4}):/.exec(name),
    h = v6 ? parseInt(v6[1], 16) : 0;
  return (h & 0xfe00) === 0xfc00 || (h & 0xffc0) === 0xfe80;
}

// every address passes here, so plain http is refused outside the home network in one place
export function normServer(s) {
  let v = String(s || '')
    .trim()
    .replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
  let url;
  try {
    url = new URL(v);
  } catch {
    throw new ServerError('input', 'Das ist keine gültige Adresse.');
  }
  if (url.protocol !== 'https:' && !isHome(url.hostname))
    throw new ServerError('input', 'Außerhalb des Heimnetzes geht es nur mit https.');
  return v;
}

// "k7pm 3qxd" → "K7PM-3QXD"
export function normCode(s) {
  const v = String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return v.length === 8 ? v.slice(0, 4) + '-' + v.slice(4) : v;
}

export async function request(method, path, {body, code = prefs.code, base = prefs.server, timeout = 20e3} = {}) {
  base = normServer(base);
  const ctrl = new AbortController(),
    timer = setTimeout(() => ctrl.abort(), timeout);
  const headers = {};
  if (code) headers.Authorization = 'Bearer ' + code;
  if (body) headers['Content-Type'] = 'application/json';
  const sent = Date.now();
  let res, data;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    data = await res.json().catch(() => null); // an answer without JSON is judged by its status below
  } catch {
    throw Object.assign(
      new ServerError(
        'offline',
        ctrl.signal.aborted ? 'Der Server antwortet nicht.' : 'Der Server ist nicht erreichbar.',
      ),
      {timeout: ctrl.signal.aborted},
    );
  } finally {
    clearTimeout(timer);
  }
  measure(data?.now, sent, Date.now());
  if (res.ok && data) return data;
  const s = res.status;
  const kind =
    s === 401
      ? 'auth'
      : s === 429
        ? path.startsWith('/api/recognize')
          ? 'busy'
          : 'locked'
        : s === 503
          ? 'unavailable'
          : s >= 500
            ? 'server'
            : res.ok
              ? 'server'
              : 'bad';
  throw new ServerError(kind, data?.error || `Der Server meldet einen Fehler (${s}).`, s);
}

export const eventsUrl = () => `${normServer(prefs.server)}/api/events?code=${encodeURIComponent(prefs.code)}`;
