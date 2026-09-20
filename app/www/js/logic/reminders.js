/* Erinnerungen dieses Handys, ohne exakten Alarm, das Recht dafür hat die App nicht.
   Ans Bewerten: Das servierende Handy plant sie nach dem Servieren.
   Ans Füttern: zu den üblichen Zeiten aus dem Verlauf (feedReminders() in smart.js), falls dann noch nichts serviert ist.
   syncReminders() gleicht Geplantes mit den Daten ab, auch nach Änderungen anderer Handys. */
import {$} from '../dom.js';
import {timeStr} from '../dates.js';
import {Notifications} from '../native.js';
import {REMIND_MAX_AGE, tidyRemind} from '../config.js';
import {db, prefs, savePrefs} from '../store.js';
import {feedReminders} from '../smart.js';
import {getPet, getProduct, getServing, petNames, pname} from '../derive.js';
import {toast} from '../ui/toast.js';
import {openSheet, renderSheet} from '../ui/sheet.js';
import {remindHint} from '../views/sheets.js';

const idOf = sid => [...sid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7) || 1; // das Plugin verlangt eine ganze Zahl
const isOpen = s => Object.keys(s.pets).some(pid => getPet(pid) && !s.pets[pid].r);
function notice(s){
  const p = getProduct(s.productId), at = s.servedAt + prefs.remind * 60e3;
  return {id:idOf(s.id), title:'Wie war’s?', body:`${p ? pname(p) : 'Futter von ' + timeStr(s.servedAt)} für ${petNames(Object.keys(s.pets))}`,
    schedule:{at:new Date(at), allowWhileIdle:true}, isExactNotification:false, extra:{serving:s.id, at}};
}

const feedNotice = x => ({id:idOf('feed' + x.key), title:'Schon gefüttert?', body:`Um diese Zeit gibt es sonst Futter für ${petNames(db.pets.map(p => p.id))}.`,
  schedule:{at:new Date(x.at), allowWhileIdle:true}, isExactNotification:false, extra:{feed:x.key, at:x.at}});

/* Einstellungen unter „Erinnerung“: Einschalten fragt nach der Erlaubnis, ohne sie bleibt es bei „Aus“.
   redraw: false, solange im Feld für die eigenen Stunden getippt wird */
async function allowed(wanted){
  let ok = false;
  try { ok = !wanted || (await Notifications.checkPermissions()).display === 'granted' || (await Notifications.requestPermissions()).display === 'granted'; } catch (e) {}
  if (!ok) toast('Benachrichtigungen sind nicht erlaubt.');
  return ok;
}
export async function setRemind(minutes, redraw = true){
  const ok = await allowed(minutes);
  prefs.remind = ok ? tidyRemind(minutes) : 0;
  savePrefs(); syncReminders();
  if (redraw || !ok) renderSheet();
  else { const hint = $('#remind-hint'); if (hint) hint.textContent = remindHint(); } // beim Tippen bleibt das Feld stehen, der Hinweis folgt
}
export async function setFeedRemind(on){
  prefs.feedRemind = on && await allowed(true);
  savePrefs(); syncReminders(); renderSheet();
}

/* nach dem Servieren auf diesem Handy */
export function planReminder(s){
  if (!prefs.remind || !isOpen(s) || Date.now() - s.servedAt > REMIND_MAX_AGE) return;
  Notifications.schedule({notifications:[notice(s)]}).catch(() => {});
}

let timer = null;
export function syncReminders(){ clearTimeout(timer); timer = setTimeout(reconcile, 250); } // gebündelt
async function reconcile(){
  try {
    const {notifications} = await Notifications.getPending(), cancel = [], plan = [];
    const feeds = new Map((prefs.feedRemind ? feedReminders(db, Date.now()) : []).map(x => [x.key, feedNotice(x)]));
    for (const n of notifications) {
      if (n.extra?.feed) { // ans Füttern: steht schon richtig, sonst absagen; was dann noch fehlt, wird geplant
        const want = feeds.get(n.extra.feed);
        if (want && want.extra.at === n.extra.at && want.body === n.body) feeds.delete(n.extra.feed); else cancel.push({id:n.id});
        continue;
      }
      const s = getServing(n.extra?.serving), want = s && prefs.remind && isOpen(s) ? notice(s) : null;
      if (!want) cancel.push({id:n.id});
      else if (want.extra.at !== n.extra.at || want.body !== n.body) (want.extra.at > Date.now() ? plan : cancel).push(want);
    }
    if (cancel.length) await Notifications.cancel({notifications:cancel.map(({id}) => ({id}))});
    plan.push(...feeds.values());
    if (plan.length) await Notifications.schedule({notifications:plan});
  } catch (e) {}
}

/* Tipp auf die Benachrichtigung, auch beim Kaltstart (Capacitor hält das Ereignis bis zum Anmelden zurück) */
export function startReminders(){
  Notifications.addListener('localNotificationActionPerformed', ({notification}) => {
    const s = getServing(notification?.extra?.serving);
    if (s) openSheet({kind:'serving', id:s.id});
    else if (notification?.extra?.feed) openSheet({kind:'feed'});
  });
  syncReminders();
}
