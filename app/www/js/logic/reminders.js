/* This phone's reminders, without an exact alarm: the app does not hold that permission.
   To rate: the serving phone schedules it after serving.
   To feed: at the usual times from the history (feedReminders() in smart.js), if nothing has been served by then.
   syncReminders() reconciles what is scheduled with the data, after changes from other phones too. */
import {timeStr} from '../dates.js';
import {Notifications} from '../native.js';
import {report} from '../report.js';
import {REMIND_DEFAULT, REMIND_MAX_AGE, tidyRemind} from '../config.js';
import {db, prefs, savePrefs} from '../store.js';
import {feedReminders} from '../smart.js';
import {getPet, getProduct, getServing, petNames, pname} from '../derive.js';
import {toast} from '../ui/toast.js';
import {openSheet, renderSheet, sheet} from '../ui/sheet.js';

const idOf = sid => [...sid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7) || 1; // the plugin needs a whole number
const isOpen = s => Object.keys(s.pets).some(pid => getPet(pid) && !s.pets[pid].r);
function notice(s) {
  const p = getProduct(s.productId),
    at = s.servedAt + prefs.remind * 60e3;
  return {
    id: idOf(s.id),
    title: 'Wie war’s?',
    body: `${p ? pname(p) : 'Futter von ' + timeStr(s.servedAt)} für ${petNames(Object.keys(s.pets))}`,
    schedule: {at: new Date(at), allowWhileIdle: true},
    isExactNotification: false,
    extra: {serving: s.id, at},
  };
}

const feedNotice = x => ({
  id: idOf('feed' + x.key),
  title: 'Schon gefüttert?',
  body: `Um diese Zeit gibt es sonst Futter für ${petNames(db.pets.map(p => p.id))}.`,
  schedule: {at: new Date(x.at), allowWhileIdle: true},
  isExactNotification: false,
  extra: {feed: x.key, at: x.at},
});

/* The two switches under „Erinnerungen“: switching one on asks for the permission, and without it the switch
   goes back to off and its row says why (`denied` on the state, read by views/settings.js).
   redraw: false while the field for your own hours is being typed in */
async function allowed(wanted, which) {
  let ok = false;
  try {
    ok =
      !wanted ||
      (await Notifications.checkPermissions()).display === 'granted' ||
      (await Notifications.requestPermissions()).display === 'granted';
  } catch (e) {
    report('notification permission', e);
  }
  if (!ok) toast('Benachrichtigungen sind nicht erlaubt.');
  if (sheet) {
    if (ok) delete sheet.denied;
    else sheet.denied = which;
  }
  return ok;
}
/* The step last chosen, for as long as the app runs: „Aus“ is the switch now, so nothing stores the value.
   After a fresh start the switch turns on with REMIND_DEFAULT. */
let lastStep = 0;
export const remindStep = () => lastStep || REMIND_DEFAULT;
export async function setRemind(minutes, redraw = true) {
  const ok = await allowed(minutes, 'remind');
  prefs.remind = ok ? tidyRemind(minutes) : 0;
  if (prefs.remind) lastStep = prefs.remind;
  savePrefs();
  syncReminders();
  if (redraw || !ok) renderSheet(); // a full redraw would interrupt the typing in the field for your own hours
}
export async function setFeedRemind(on) {
  prefs.feedRemind = on && (await allowed(true, 'feed'));
  savePrefs();
  syncReminders();
  renderSheet();
}

/* after serving on this phone */
export function planReminder(s) {
  if (!prefs.remind || !isOpen(s) || Date.now() - s.servedAt > REMIND_MAX_AGE) return;
  Notifications.schedule({notifications: [notice(s)]}).catch(e => report('rating reminder', e));
}

let timer = null;
export function syncReminders() {
  clearTimeout(timer);
  timer = setTimeout(reconcile, 250);
} // batched
async function reconcile() {
  try {
    const {notifications} = await Notifications.getPending(),
      cancel = [],
      plan = [];
    const feeds = new Map((prefs.feedRemind ? feedReminders(db, Date.now()) : []).map(x => [x.key, feedNotice(x)]));
    for (const n of notifications) {
      if (n.extra?.feed) {
        // to feed: already correct, otherwise cancel it; whatever is then missing gets scheduled
        const want = feeds.get(n.extra.feed);
        if (want && want.extra.at === n.extra.at && want.body === n.body) feeds.delete(n.extra.feed);
        else cancel.push({id: n.id});
        continue;
      }
      const s = getServing(n.extra?.serving),
        want = s && prefs.remind && isOpen(s) ? notice(s) : null;
      if (!want) cancel.push({id: n.id});
      else if (want.extra.at !== n.extra.at || want.body !== n.body)
        (want.extra.at > Date.now() ? plan : cancel).push(want);
    }
    if (cancel.length) await Notifications.cancel({notifications: cancel.map(({id}) => ({id}))});
    plan.push(...feeds.values());
    if (plan.length) await Notifications.schedule({notifications: plan});
  } catch (e) {
    // Whatever is already scheduled stays as it is; the next reconcile tries again
    report('reminders', e);
  }
}

/* A tap on the notification, on a cold start too (Capacitor holds the event back until the listener is registered) */
export function startReminders() {
  Notifications.addListener('localNotificationActionPerformed', ({notification}) => {
    const s = getServing(notification?.extra?.serving);
    if (s) openSheet({kind: 'serving', id: s.id});
    else if (notification?.extra?.feed) openSheet({kind: 'feed'});
  });
  syncReminders();
}
