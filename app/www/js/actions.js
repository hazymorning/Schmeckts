/* Every click runs through data-action and the ACTIONS object. Plus input, the keyboard, the file picker
   and the deep links schmeckts://feed, schmeckts://scan and schmeckts://photo. Registers itself as it loads. */
import {$} from './dom.js';
import {when} from './dates.js';
import {haptic} from './native.js';
import {REMIND_MAX_H, textureOf} from './config.js';
import {db, prefs, save, savePrefs} from './store.js';
import {checkServer, disconnect, retrySync, startSession} from './sync.js';
import {getProduct, getServing} from './derive.js';
import {forgetPhoto, photoSrc} from './photos.js';
import {applyTheme} from './ui/theme.js';
import {hideToast, toast, toastUndo} from './ui/toast.js';
import {openViewer} from './ui/viewer.js';
import {closeSheet, openPage, openSheet, renderSheet, sheet, sheetBack} from './ui/sheet.js';
import {expandCard, toggleOverview, update} from './views/home.js';
import {jumpToDay, renderServeHits, renderSuggestions, reportState} from './views/sheets.js';
import {paintHouse} from './views/settings.js';
import {guessOf, retryNow, servePhoto, serveProduct, shootPhoto} from './logic/feeding.js';
import {deleteProduct, deleteServing, rate, removeCode, saveName, togglePackLine, useProduct} from './logic/editing.js';
import {setKaufen, shareShopping, toggleTexture} from './logic/products.js';
import {remindStep, setFeedRemind, setRemind} from './logic/reminders.js';
import {scan} from './logic/scan.js';
import {closeCrop, deletePet, editing, openPet, petState, savePet, setPetPhoto} from './logic/pets.js';
import {exportData, exportReading, importData, loadDemo, purgeDemo, wipe} from './logic/data.js';
import {receiveFile, receiveUri, shareChanges} from './logic/exchange.js';

/* Connecting to the household: check address, protocol and code first, then remove the sample data and sync */
async function connectServer() {
  if (sheet?.kind !== 'settings' || sheet.connecting) return;
  Object.assign(sheet, {connecting: true, connectError: ''});
  renderSheet();
  try {
    const found = await checkServer(sheet.code, sheet.server ?? prefs.server);
    purgeDemo();
    const first = startSession(found);
    haptic('success');
    if (sheet?.kind === 'settings') {
      Object.assign(sheet, {connecting: false, connectForm: false, code: '', editServer: false, server: undefined});
      renderSheet();
    }
    update();
    toast('Verbunden. Die Daten werden abgeglichen.');
    await first;
  } catch (e) {
    haptic('strong');
    if (sheet?.kind === 'settings') {
      Object.assign(sheet, {connecting: false, connectError: e.message});
      renderSheet();
      $('#f-code')?.focus();
    }
  }
}
function disconnectServer() {
  // switches to mode `lokal`
  disconnect();
  renderSheet();
  update();
  toast('Verbindung getrennt. Die Daten bleiben auf diesem Handy.');
}
function openConnect() {
  // fields for address and code, from the „Haushalt“ page, from elsewhere in the settings or from the welcome page
  if (sheet?.kind === 'settings') {
    sheet.connectForm = true;
    if (sheet.page === 'house') renderSheet();
    else openPage('house');
  } else openSheet({kind: 'settings', page: 'house', connectForm: true});
  requestAnimationFrame(() => $(prefs.server ? '#f-code' : '#f-server')?.focus({preventScroll: true}));
}
/* „Jetzt abgleichen“: only this hand-started sync shows progress, and only after 600 ms */
async function syncByHand() {
  const s = sheet;
  if (s?.kind !== 'settings' || s.syncing) return;
  s.syncing = 'quiet';
  const timer = setTimeout(() => {
    if (sheet === s) {
      s.syncing = 'shown';
      paintHouse();
    }
  }, 600);
  try {
    await retrySync();
  } finally {
    clearTimeout(timer);
    s.syncing = '';
    if (sheet === s) paintHouse();
  }
}

/* Tap twice instead of a confirmation dialog */
const ARMED = {'delete-product': deleteProduct, 'delete-pet': deletePet, wipe, disconnect: disconnectServer};
let armTimer = null;
function arm(el) {
  const key = el.dataset.then;
  if (sheet.armed === key) {
    sheet.armed = null;
    clearTimeout(armTimer);
    ARMED[key]();
    return;
  }
  sheet.armed = key;
  haptic('select');
  renderSheet();
  clearTimeout(armTimer);
  armTimer = setTimeout(() => {
    if (sheet && sheet.armed === key) {
      sheet.armed = null;
      renderSheet();
    }
  }, 3500);
}

const ACTIONS = {
  filter(el) {
    const id = el.dataset.id;
    if (id !== 'all' && (db.pets.length === 1 || prefs.activePet === id)) return openPet(id); // tapping again = edit
    prefs.activePet = id;
    savePrefs();
    haptic('select');
    update();
  },
  'add-pet'() {
    if (sheet?.kind === 'settings') openPage('pet', petState(null));
    else openSheet({kind: 'pet', ...petState(null)});
  },
  'edit-pet'(el) {
    openPet(el.dataset.id, true);
  },
  'open-pet'(el) {
    openPet(el.dataset.id);
  }, // from the overview
  'open-settings'() {
    openSheet({kind: 'settings'});
  },
  // The settings: one page per group of settings, the back arrow and the Android back button lead to the overview
  'settings-page'(el) {
    haptic('select');
    openPage(el.dataset.v);
  },
  'settings-back'() {
    haptic('select');
    sheetBack(); // one level, and from the overview out to the home page
  },
  'open-report'(el) {
    openSheet(reportState(el.dataset.v || null));
  }, // data-v: the day it opens at
  'open-server'() {
    openSheet({kind: 'settings', page: 'house'});
  },
  connect() {
    connectServer();
  },
  'connect-form'() {
    haptic('select');
    openConnect();
  },
  'mode-local'() {
    prefs.mode = 'lokal';
    savePrefs();
    haptic('select');
    update();
  }, // welcome page: „Nur auf diesem Handy“
  'edit-server'() {
    sheet.editServer = true;
    renderSheet();
    $('#f-server')?.focus();
  },
  'sync-now'() {
    haptic('select');
    syncByHand();
  },
  close() {
    closeSheet();
  },
  feed() {
    openSheet({kind: 'feed'});
  },
  serve(el) {
    const {id, code} = el.dataset;
    closeSheet().then(() => serveProduct(id, code));
  }, // code: from the choice after scanning
  scan() {
    scan();
  },
  photo() {
    shootPhoto('', sheet?.kind === 'feed' ? sheet.code : '');
  }, // the code after scanning, if the photo button takes it over
  // data-v: what was typed in the feeding sheet's search, when nothing matched it
  'new-product'(el) {
    openSheet({kind: 'new', brand: '', variety: el.dataset.v || '', type: 'Nassfutter'});
  },
  rate(el) {
    rate(el);
  },
  // The packaging photo, large, grown out of its thumbnail. A file that can no longer be read is let go.
  async 'view-photo'(el) {
    const s = getServing(el.dataset.s),
      p = getProduct(el.dataset.p);
    if ((await openViewer(() => photoSrc(s, p), el)) !== false) return; // open, or already opening
    if (p) forgetPhoto(p.id);
    toast('Das Foto ist nicht mehr da.');
    if (sheet) renderSheet();
    else update(); // the thumbnail is a plain one again
  },
  'open-serving'(el) {
    const s = getServing(el.dataset.id);
    if (!s) return;
    const unknown = !s.productId && s.status !== 'recognizing';
    openSheet({kind: 'serving', id: s.id, step: unknown ? 'name' : null, ...guessOf(s)}); // the brand and variety that were read are already there
  },
  'edit-name'() {
    const s = getServing(sheet.id),
      p = getProduct(s?.productId);
    Object.assign(sheet, {
      step: 'name',
      ...(p ? {brand: p.brand, variety: p.variety, type: p.type || 'Nassfutter', texture: p.texture} : guessOf(s)),
    });
    renderSheet();
  },
  'save-name'() {
    saveName();
  },
  'use-product'(el) {
    useProduct(el.dataset.id);
  },
  'pack-line'(el) {
    togglePackLine(el.dataset.v);
  }, // a line read off the packaging, into the active field or out of it again
  'set-type'(el) {
    sheet.type = el.dataset.v;
    if (!textureOf(sheet, sheet.texture)) delete sheet.texture;
    renderSheet();
  }, // the texture no longer fits the new type: cleared, so it is asked again
  'set-texture'(el) {
    // a second tap clears it (null = none): at once in the food sheet, until „Speichern“ while naming
    const v = el.dataset.v;
    if (sheet.kind === 'product' && sheet.step !== 'name') {
      toggleTexture(sheet.id, v);
      update();
    } else sheet.texture = sheet.texture === v ? null : v;
    haptic('select');
    renderSheet();
  },
  'toggle-serving-pet'(el) {
    const s = getServing(sheet.id);
    if (!s) return;
    const id = el.dataset.id;
    if (s.pets[id]) {
      if (Object.keys(s.pets).length === 1) {
        toast('Mindestens ein Tier muss dabei sein.');
        return;
      }
      delete s.pets[id];
    } else s.pets[id] = {r: null, at: null};
    delete s.autoPets;
    const p = getProduct(s.productId);
    if (p) p.lastPets = Object.keys(s.pets);
    prefs.lastPets = Object.keys(s.pets);
    save();
    savePrefs();
    haptic('select');
    renderSheet();
    update();
  },
  retry() {
    if (sheet?.id) retryNow(sheet.id);
  },
  'delete-serving'() {
    deleteServing(sheet.id);
  },
  'open-product'(el) {
    openSheet({kind: 'product', id: el.dataset.id});
  },
  'remove-code'(el) {
    removeCode(el.dataset.code);
  },
  buy(el) {
    setKaufen(sheet.id, el.dataset.v);
    haptic('select');
    renderSheet();
    update();
  }, // food sheet, section „Kaufen“
  'hint-buy'(el) {
    setKaufen(el.dataset.id, el.dataset.v);
    haptic('success');
    update();
  }, // hint settled, on every device
  'hide-hint'(el) {
    if (!prefs.hiddenHints.includes(el.dataset.v)) prefs.hiddenHints.push(el.dataset.v);
    savePrefs();
    haptic('select');
    update();
  },
  'close-week'(el) {
    prefs.closedWeek = el.dataset.v;
    savePrefs();
    haptic('select');
    update();
  }, // weekly review, per week and device
  'share-list'() {
    shareShopping();
  },
  'rename-product'() {
    const p = getProduct(sheet.id);
    if (!p) return;
    Object.assign(sheet, {
      step: 'name',
      brand: p.brand,
      variety: p.variety,
      type: p.type || 'Nassfutter',
      texture: p.texture,
    });
    renderSheet();
  },
  arm(el) {
    arm(el);
  },
  'set-species'(el) {
    sheet.species = el.dataset.v;
    renderSheet();
  },
  'save-pet'() {
    savePet();
  },
  'crop-apply'() {
    closeCrop(true);
  },
  'crop-cancel'() {
    closeCrop(false);
  },
  backdrop() {
    prefs.backdrop = !prefs.backdrop;
    savePrefs();
    haptic('select');
    renderSheet();
    update();
  }, // the profile picture behind the header
  lookup() {
    prefs.lookup = !prefs.lookup;
    savePrefs();
    haptic('select');
    renderSheet();
  }, // product lookup on the internet, off by default
  'server-photo'() {
    prefs.serverPhoto = !prefs.serverPhoto;
    savePrefs();
    haptic('select');
    renderSheet();
  }, // photo recognition through the server, only on this phone, on by default
  'feed-remind'() {
    haptic('select');
    setFeedRemind(!prefs.feedRemind);
  }, // reminder to feed at the usual times
  'remind-on'() {
    // the switch: on takes the step last chosen, off keeps it for the next time
    haptic('select');
    sheet.ownRemind = false;
    setRemind(prefs.remind ? 0 : remindStep());
  },
  remind(el) {
    haptic('select');
    sheet.ownRemind = false;
    setRemind(+el.dataset.v);
  }, // rating reminder, asks for the permission
  'remind-own'() {
    // „Eigene“: a field for whole hours, starting at the current interval, or 2 hours coming from „Aus“
    haptic('select');
    sheet.ownRemind = true;
    setRemind(prefs.remind || 120).then(() => $('#f-remind')?.select());
  },
  theme(el) {
    prefs.theme = el.dataset.v;
    savePrefs();
    applyTheme();
    renderSheet();
    haptic('select');
  },
  export() {
    exportData();
  },
  'share-changes'() {
    haptic('select');
    shareChanges();
  }, // manual exchange, page „Austausch von Hand“
  'send-answer'() {
    haptic('select');
    shareChanges(sheet?.exchange?.peer);
  }, // exactly what the other device is missing
  demo() {
    loadDemo();
  },
  expand(el) {
    haptic('select');
    expandCard(el.dataset.v);
  },
  'toggle-overview'() {
    haptic('select');
    toggleOverview();
  }, // the overview's full text and back
  'jump-day'(el) {
    haptic('select');
    if (sheet?.kind === 'report') return jumpToDay(el.dataset.day); // the page's own calendar scrolls within it
    openSheet(reportState('d-' + el.dataset.day)); // the home page shows only the current day: the history page opens there
  },
  undo() {
    const u = toastUndo;
    hideToast();
    if (u) {
      haptic('select');
      u();
    }
  },
};

/* Deep links and app shortcuts: schmeckts://feed opens the feeding sheet, schmeckts://scan starts the scanner in it
   (logic/scan.js), schmeckts://photo our own camera (shootPhoto in logic/feeding.js). The German names from before
   the move to English keep working: they sit in people's shortcuts. After „Abbrechen“ the feeding sheet stays open.
   schmeckts://ocr-dump is for collecting test fixtures and shares the last text read off a photo (logic/data.js). */
const LINKS = {feed: null, fuettern: null, scan, photo: shootPhoto, foto: shootPhoto};
export async function openLink(url) {
  const raw = String(url || '');
  if (/^(content|file):/i.test(raw)) {
    await receiveUri(raw);
    return true;
  } // an exchange file from another app
  const path = raw
    .replace(/^schmeckts:\/*/i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  if (path === 'ocr-dump') {
    await exportReading();
    return true;
  }
  if (!(path in LINKS)) return false;
  if (!db.pets.length) {
    openSheet({kind: 'pet', ...petState(null)});
    toast('Leg zuerst dein Tier an.');
    return true;
  }
  await closeSheet();
  openSheet({kind: 'feed'});
  await LINKS[path]?.();
  return true;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el);
});
// Which of the two naming fields was touched last: the chips under „Auf der Packung gelesen“ fill that one
document.addEventListener('focusin', e => {
  if (sheet && (e.target.id === 'f-brand' || e.target.id === 'f-variety')) sheet.lastField = e.target.dataset.field;
});
let noteTimer = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.field && sheet) {
    sheet[t.dataset.field] = t.value;
    if (t.dataset.field === 'brand' || t.dataset.field === 'variety') renderSuggestions();
  }
  if (t.dataset.note) {
    const s = getServing(t.dataset.note);
    if (s) {
      s.note = t.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(save, 400);
    }
  }
  if (t.dataset.setting) {
    prefs[t.dataset.setting] = t.value.trim();
    savePrefs();
  }
  if (t.hasAttribute('data-remind')) {
    // own hours: valid values take effect at once, the field stays put while typing
    const h = Number(t.value);
    if (Number.isInteger(h) && h >= 1 && h <= REMIND_MAX_H) setRemind(h * 60, false);
  }
  if (t.hasAttribute('data-search')) renderServeHits(t.value);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !sheet || e.target.tagName !== 'INPUT') return;
  if (e.target.id === 'f-server' && $('#f-code') && !$('#f-code').value) {
    e.preventDefault();
    $('#f-code').focus();
  } else if (e.target.id === 'f-code' || e.target.id === 'f-server') {
    e.preventDefault();
    connectServer();
  } else if (e.target.id === 'f-remind') {
    e.preventDefault();
    e.target.blur();
  } else if (editing(sheet)) {
    e.preventDefault();
    savePet();
  } else if (sheet.step === 'name' || sheet.kind === 'new') {
    e.preventDefault();
    if (e.target.id === 'f-brand') $('#f-variety')?.focus();
    else saveName();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.hasAttribute('data-remind')) return renderSheet(); // leaving the field: shows the current value again
  if (!t.dataset.time || !t.value) return;
  const s = getServing(t.dataset.time),
    ts = new Date(t.value).getTime();
  if (!s || isNaN(ts)) return;
  s.servedAt = Math.min(ts, Date.now());
  db.servings.sort((a, b) => b.servedAt - a.servedAt);
  save();
  haptic('select');
  renderSheet();
  update();
  toast(`Zeitpunkt: ${when(s.servedAt)}`);
});
const onFile = (id, fn) =>
  $(id).addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    fn(f);
  });
onFile('#camInputSheet', f => servePhoto(f, sheet?.kind === 'feed' ? sheet.code : '')); // the code after scanning, if the photo button takes it over
onFile('#petPhotoInput', setPetPhoto);
onFile('#importInput', importData);
onFile('#exchangeInput', receiveFile);
