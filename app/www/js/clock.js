/* Hybrid clock for the sync protocol: "<ms, 13 digits>-<counter, 4 digits>-<device>", sortable as text.
   ms is our own time plus the offset to server time. Every new clock is larger than every one handed out
   and every one seen before, across restarts too (the state lives in sync.json). */

const PATTERN = /^(\d{13})-(\d{4})-([a-z0-9]{4,16})$/;
const FUTURE = 10 * 60e3; // how far a clock may run ahead; the server rejects more

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

/* Saw a foreign clock: whatever is changed here afterwards gets a larger one. */
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

/* Offset to server time from a response, measured at the midpoint of the request */
export function measure(server, sentAt, receivedAt) {
  if (typeof server !== 'number' || receivedAt - sentAt > 10e3) return;
  clockState.offset = Math.round(server - (sentAt + receivedAt) / 2);
}

/* After a rejection over the clock: do not keep counting in the future */
export function rebase() {
  const t = serverNow();
  if (clockState.ms > t) {
    clockState.ms = t;
    clockState.n = 0;
  }
}
