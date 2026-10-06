// no exact alarms: the app does not hold that permission
import {clockStr} from '../dates.js';
import {FeedReminder, Notifications} from '../native.js';
import {report} from '../report.js';
import {RATINGS, REMIND_DEFAULT, REMIND_MAX_AGE, tidyRemind} from '../config.js';
import {db, prefs, savePrefs} from '../store.js';
import {caughtUp, isConnected, reachable} from '../sync.js';
import {fedToday, feedReminders, quickRatings} from '../smart.js';
import {callName, getPet, getProduct, getServing, petNames, pname} from '../derive.js';
import {toast} from '../ui/toast.js';
import {openSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';
import {rateMeal} from './rating.js';

// the plugin needs a whole number
const idOf = sid => [...sid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7) || 1;
const openPets = s => Object.keys(s.pets).filter(pid => getPet(pid) && !s.pets[pid].r);
const isOpen = s => openPets(s).length > 0;
// one pet by any of its names, the same for one reminder, so its text does not change once planned
const calling = (ids, seed) => (ids.length === 1 ? callName(getPet(ids[0]), seed) : petNames(ids));

// with one pet left to rate, buttons rate it; getPending() leaves out actionTypeId, so extra.rate says which
let buttons = true;
function notice(s) {
  const p = getProduct(s.productId),
    at = s.servedAt + prefs.remind * 60e3,
    open = openPets(s),
    rate = buttons && open.length === 1 ? quickRatings(db, s, open[0]).join(',') : '';
  return {
    id: idOf(s.id),
    title: 'Wie war’s?',
    body: `${p ? pname(p) : 'Mahlzeit von ' + clockStr(s.servedAt)} für ${calling(open, s.id)}`,
    schedule: {at: new Date(at), allowWhileIdle: true},
    isExactNotification: false,
    ...(rate ? {actionTypeId: 'rate:' + rate} : {}),
    extra: {serving: s.id, at, ...(rate ? {pet: open[0], rate} : {})},
  };
}
// the plugin keeps a type's buttons for good and puts them on a notification when it is scheduled
const registered = new Set();
async function schedule(list) {
  const types = new Map(
    list.filter(n => n.actionTypeId && !registered.has(n.actionTypeId)).map(n => [n.actionTypeId, n.extra.rate]),
  );
  if (types.size)
    try {
      await Notifications.registerActionTypes({
        types: [...types].map(([id, rate]) => ({
          id,
          actions: rate.split(',').map(r => ({id: r, title: RATINGS[r].short})),
        })),
      });
      types.forEach((_, id) => registered.add(id));
    } catch (e) {
      report('reminder buttons', e);
      buttons = false;
      list = list
        .map(n => getServing(n.extra.serving))
        .filter(Boolean)
        .map(notice); // now without buttons
    }
  await Notifications.schedule({notifications: list});
}

// sure: the text once the server confirmed nothing was served since `since`
const dayPart = at => {
  const h = new Date(at).getHours() + new Date(at).getMinutes() / 60;
  return h < 10.5 ? 'Heute Morgen' : h < 14 ? 'Heute Mittag' : h < 17.5 ? 'Heute Nachmittag' : 'Heute Abend';
};
function feedNotice(x) {
  const all = db.pets.map(p => p.id),
    body = `Um diese Zeit gibt es sonst Futter für ${calling(all, x.key)}.`;
  return {
    id: idOf('feed' + x.key),
    key: x.key,
    at: x.at,
    since: x.since,
    title: 'Schon gefüttert?',
    body,
    sure: `${dayPart(x.at)} ist noch nichts eingetragen. ${body}`,
  };
}

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
  if (!ok && sheet?.kind !== 'settings') toast('Benachrichtigungen sind nicht erlaubt.'); // there the switch's line says it
  if (sheet) {
    if (ok) delete sheet.denied;
    else sheet.denied = which;
  }
  return ok;
}
// this run only; after a fresh start the switch turns on with REMIND_DEFAULT
let lastStep = 0;
export const remindStep = () => lastStep || REMIND_DEFAULT;
export async function setRemind(minutes, redraw = true) {
  const ok = await allowed(minutes, 'remind');
  prefs.remind = ok ? tidyRemind(minutes) : 0;
  if (prefs.remind) lastStep = prefs.remind;
  savePrefs();
  syncReminders();
  if (redraw || !ok) renderSheet(); // a full redraw would interrupt typing in the hours field
}
export async function setFeedRemind(on) {
  prefs.feedRemind = on && (await allowed(true, 'feed'));
  savePrefs();
  syncReminders();
  renderSheet();
}

export function planReminder(s) {
  if (!prefs.remind || !isOpen(s) || Date.now() - s.servedAt > REMIND_MAX_AGE) return;
  schedule([notice(s)]).catch(e => report('rating reminder', e));
}

let timer = null;
export function syncReminders() {
  clearTimeout(timer);
  timer = setTimeout(reconcile, 250);
}
async function reconcile() {
  try {
    const {notifications} = await Notifications.getPending(),
      cancel = [],
      plan = [];
    for (const n of notifications) {
      const s = getServing(n.extra?.serving),
        want = s && prefs.remind && isOpen(s) ? notice(s) : null;
      if (!want) cancel.push({id: n.id});
      else if (want.extra.at !== n.extra.at) (want.extra.at > Date.now() ? plan : cancel).push(want);
      // one already due may still be on its way, inexact as it is: new text or buttons do not cancel it
      else if (want.extra.at > Date.now() && (want.body !== n.body || want.extra.rate !== n.extra.rate))
        plan.push(want);
    }
    if (cancel.length) await Notifications.cancel({notifications: cancel.map(({id}) => ({id}))});
    if (plan.length) await schedule(plan);
  } catch (e) {
    report('reminders', e);
  }
  await setFeed();
}
// the plugin replaces what it held and asks the server, when one is due, whether a meal was served since
let lastFeed = '';
async function setFeed() {
  const now = Date.now(),
    set = {
      reminders: prefs.feedRemind ? feedReminders(db, now).map(feedNotice) : [],
      dismiss: fedToday(db, now).map(k => idOf('feed' + k)),
      ...(isConnected() ? {server: prefs.server, code: prefs.code} : {}),
    },
    json = JSON.stringify(set);
  if (json === lastFeed) return;
  try {
    await FeedReminder.set(set);
    lastFeed = json;
  } catch (e) {
    // lastFeed stays, so the next reconcile tries again
    report('feeding reminders', e);
  }
}

/* Capacitor holds a cold-start tap back until the listener is registered. A button opens the app like a tap; it rates
   only a pet still open once the household's changes are in, else the meal opens to show what it holds. */
const CATCH_UP = 3000; // ms at most
export function startReminders() {
  Notifications.addListener('localNotificationActionPerformed', async ({actionId, notification}) => {
    if (RATINGS[actionId] && reachable()) await caughtUp(CATCH_UP);
    const s = getServing(notification?.extra?.serving),
      pid = notification?.extra?.pet;
    if (!s) return;
    if (RATINGS[actionId] && s.pets[pid] && !s.pets[pid].r && rateMeal(s.id, pid, actionId)) {
      update();
      renderSheet();
    } else openSheet({kind: 'serving', id: s.id});
  });
  FeedReminder.addListener?.('tap', () => openSheet({kind: 'feed'}));
  syncReminders();
}
