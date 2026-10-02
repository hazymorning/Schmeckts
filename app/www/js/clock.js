// "<ms, 13 digits>-<counter, 4 digits>-<device>", sortable as text; ms is our time plus the server offset

const PATTERN = /^(\d{13})-(\d{4})-([a-z0-9]{4,16})$/;
const FUTURE = 10 * 60e3; // the server rejects clocks further ahead

export const clockState = {device: '', offset: 0, ms: 0, n: 0};

export function randomId(len = 16) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), b => abc[b % 36]).join('');
}

const serverNow = () => Date.now() + clockState.offset;

export function stamp() {
  const t = serverNow();
  if (t > clockState.ms) {
    clockState.ms = t;
    clockState.n = 0;
  } else if (++clockState.n > 9999) {
    clockState.ms++;
    clockState.n = 0;
  }
  return `${String(clockState.ms).padStart(13, '0')}-${String(clockState.n).padStart(4, '0')}-${clockState.device}`;
}

export function observe(t) {
  const m = PATTERN.exec(t);
  if (!m) return;
  const ms = +m[1],
    n = +m[2];
  if (ms > serverNow() + FUTURE) return;
  if (ms > clockState.ms || (ms === clockState.ms && n > clockState.n)) {
    clockState.ms = ms;
    clockState.n = n;
  }
}

export function measure(server, sentAt, receivedAt) {
  if (typeof server !== 'number' || receivedAt - sentAt > 10e3) return;
  clockState.offset = Math.round(server - (sentAt + receivedAt) / 2);
}

// after the server rejected a clock
export function rebase() {
  const t = serverNow();
  if (clockState.ms > t) {
    clockState.ms = t;
    clockState.n = 0;
  }
}
