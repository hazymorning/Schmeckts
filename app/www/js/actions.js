// registers its document listeners on import
import {$} from './dom.js';
import {when} from './dates.js';
import {haptic} from './native.js';
import {REMIND_MAX_H, textureOf} from './config.js';
import {db, prefs, save, savePrefs} from './store.js';
import {ServerError} from './api.js';
import {checkServer, disconnect, isConnected, retrySync, startSession} from './sync.js';
import {getProduct, getServing} from './derive.js';
import {forgetPhoto, keptPhoto, photoSrc} from './photos.js';
import {timing} from './recognize.js';
import {applyTheme} from './ui/theme.js';
import {hideToast, toast, toastUndo} from './ui/toast.js';
import {openViewer} from './ui/viewer.js';
import {closeAll, closeSheet, openPage, openSheet, renderSheet, sheet, sheetBack} from './ui/sheet.js';
import {toggleObserve, toggleOverview, update} from './views/home.js';
import {foldPart, jumpToDay, renderServeHits, renderSuggestions, reportState} from './views/sheets.js';
import {paintHouse} from './views/settings.js';
import {
  guessOf,
  productPhotoFile,
  replacePhoto,
  rephoto,
  reshootProduct,
  retryNow,
  servePhoto,
  serveProduct,
  shootPhoto,
} from './logic/feeding.js';
import {deleteProduct, deleteServing, rate, removeCode, saveName, setPackLine, useProduct} from './logic/editing.js';
import {setKaufen, shareShopping, toggleTexture, unsharePhoto} from './logic/products.js';
import {remindStep, setFeedRemind, setRemind} from './logic/reminders.js';
import {scan} from './logic/scan.js';
import {closeCrop, deletePet, editing, openPet, petState, savePet, setPetPhoto} from './logic/pets.js';
import {exportData, exportReading, importData, loadDemo, purgeDemo, wipe} from './logic/data.js';
import {receiveFile, receiveUri, shareChanges} from './logic/exchange.js';
import {
  deleteObservation,
  observe,
  setObservationKind,
  setObservationTime,
  toggleObservationPet,
} from './logic/observations.js';

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
  disconnect();
  renderSheet();
  update();
  toast('Verbindung getrennt. Die Daten bleiben auf diesem Handy.');
}
function openConnect() {
  if (sheet?.kind === 'settings') {
    sheet.connectForm = true;
    if (sheet.page === 'house') renderSheet();
    else openPage('house');
  } else openSheet({kind: 'settings', page: 'house', connectForm: true});
  requestAnimationFrame(() => $(prefs.server ? '#f-code' : '#f-server')?.focus({preventScroll: true}));
}
// progress shows only after 600 ms, so a quick sync does not flicker
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

// tap twice instead of a confirmation dialog
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
    if (id !== 'all' && (db.pets.length === 1 || prefs.activePet === id)) return openPet(id); // tapping again edits
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
  },
  'toggle-overview'() {
    haptic('select');
    toggleOverview();
  },
  'observe-open'() {
    haptic('select');
    toggleObserve();
  },
  observe(el) {
    observe(el.dataset.v);
  },
  'open-observation'(el) {
    openSheet({kind: 'observation', id: el.dataset.id});
  },
  'set-observation-kind'(el) {
    setObservationKind(el.dataset.v);
  },
  'toggle-observation-pet'(el) {
    toggleObservationPet(el.dataset.id);
  },
  'delete-observation'(el) {
    deleteObservation(el.dataset.id);
  },
  'open-settings'() {
    openSheet({kind: 'settings'});
  },
  'settings-page'(el) {
    haptic('select');
    openPage(el.dataset.v);
  },
  'settings-back'() {
    haptic('select');
    sheetBack();
  },
  'open-report'(el) {
    openSheet(reportState(el.dataset.v || null));
  },
  'open-evaluation'() {
    openSheet({kind: 'evaluation'});
  },
  'open-level'(el) {
    openPage(el.dataset.v);
  },
  'open-shop'() {
    openSheet({kind: 'shop'});
  },
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
    closeAll().then(() => serveProduct(id, code)); // the meal is rated on the home page
  },
  scan() {
    scan();
  },
  photo() {
    shootPhoto('', sheet?.kind === 'feed' ? sheet.code : '');
  },
  'new-product'(el) {
    openSheet({kind: 'new', brand: '', variety: el.dataset.v || '', type: 'Nassfutter'});
  },
  rate(el) {
    rate(el);
  },
  // a photo found nowhere is let go, and so is a sharedPhoto mark the server cannot back up
  async 'view-photo'(el) {
    const s = getServing(el.dataset.s),
      p = getProduct(el.dataset.p);
    let away = null;
    if (p && !keptPhoto(p.id)) el.setAttribute('aria-busy', 'true');
    let stale = null,
      missing = false;
    const load = () =>
      photoSrc(s, p, e => {
        stale = e;
      })
        .then(src => {
          missing = !src;
          return src;
        })
        .catch(e => {
          if (!(e instanceof ServerError)) throw e;
          away = e;
          return null;
        })
        .finally(() => el.removeAttribute('aria-busy'));
    if ((await openViewer(load, el)) !== false) {
      if (stale) toast('Das Foto liegt auf dem Server, und der ist gerade nicht erreichbar.');
      return;
    }
    if (away)
      return toast(
        away.kind === 'offline' ? 'Das Foto liegt auf dem Server, und der ist gerade nicht erreichbar.' : away.message,
      );
    if (!missing) return toast('Das Foto ließ sich nicht öffnen.');
    if (p) {
      forgetPhoto(p.id);
      if (p.sharedPhoto && isConnected()) unsharePhoto(p);
    }
    toast('Das Foto ist nicht mehr da.');
    if (sheet) renderSheet();
    else update();
  },
  'open-serving'(el) {
    const s = getServing(el.dataset.id);
    if (!s) return;
    const unknown = !s.productId && s.status !== 'recognizing';
    openSheet({kind: 'serving', id: s.id, step: unknown ? 'name' : null, ...guessOf(s)});
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
  rephoto() {
    rephoto();
  },
  'product-photo'(el) {
    reshootProduct(el.dataset.id);
  },
  'use-product'(el) {
    useProduct(el.dataset.id);
  },
  'pack-line'(el) {
    setPackLine(el.dataset.field, el.dataset.v);
  },
  'set-type'(el) {
    sheet.type = el.dataset.v;
    if (!textureOf(sheet, sheet.texture)) delete sheet.texture;
    renderSheet();
  },
  'set-texture'(el) {
    // a second tap clears it; saved at once in the food sheet, on save while naming
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
  'delete-serving'(el) {
    deleteServing(el.dataset.id || sheet?.id);
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
  },
  'hint-buy'(el) {
    setKaufen(el.dataset.id, el.dataset.v);
    haptic('success');
    update();
  },
  'hide-hint'(el) {
    if (!prefs.hiddenHints.includes(el.dataset.v)) prefs.hiddenHints.push(el.dataset.v);
    savePrefs();
    haptic('select');
    update();
  },
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
  },
  lookup() {
    prefs.lookup = !prefs.lookup;
    savePrefs();
    haptic('select');
    renderSheet();
  },
  'server-photo'() {
    prefs.serverPhoto = !prefs.serverPhoto;
    savePrefs();
    haptic('select');
    renderSheet();
  },
  'feed-remind'() {
    haptic('select');
    setFeedRemind(!prefs.feedRemind);
  },
  'remind-on'() {
    haptic('select');
    sheet.ownRemind = false;
    setRemind(prefs.remind ? 0 : remindStep());
  },
  remind(el) {
    haptic('select');
    sheet.ownRemind = false;
    setRemind(+el.dataset.v);
  },
  'remind-own'() {
    // minutes; 2 h when coming from off
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
  },
  'send-answer'() {
    haptic('select');
    shareChanges(sheet?.exchange?.peer);
  },
  demo() {
    loadDemo();
  },
  fold(el) {
    haptic('select');
    foldPart(el.dataset.v);
  },
  'jump-day'(el) {
    haptic('select');
    if (sheet?.kind === 'report') return jumpToDay(el.dataset.day);
    openSheet(reportState('d-' + el.dataset.day));
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

// fuettern and foto are the old names, still in people's shortcuts
const LINKS = {feed: null, fuettern: null, scan, photo: shootPhoto, foto: shootPhoto};
export async function openLink(url) {
  const raw = String(url || '');
  if (/^(content|file):/i.test(raw)) {
    await receiveUri(raw);
    return true;
  }
  const path = raw
    .replace(/^schmeckts:\/*/i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  if (path === 'ocr-dump') {
    await exportReading();
    return true;
  }
  if (path === 'ocr-measure') {
    timing.on = !timing.on;
    toast(timing.on ? 'Lesezeiten werden gemessen.' : 'Lesezeiten werden nicht mehr gemessen.');
    return true;
  }
  if (!(path in LINKS)) return false;
  if (!db.pets.length) {
    openSheet({kind: 'pet', ...petState(null)});
    toast('Leg zuerst dein Tier an.');
    return true;
  }
  await closeAll();
  openSheet({kind: 'feed'});
  await LINKS[path]?.();
  return true;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el);
});
// pack-line chips take no focus, so the field keeps its keyboard
document.addEventListener('pointerdown', e => {
  if (e.target.closest('[data-action=pack-line]')) e.preventDefault();
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
    // valid values apply at once, without a redraw that would interrupt typing
    const h = Number(t.value);
    if (Number.isInteger(h) && h >= 1 && h <= REMIND_MAX_H) setRemind(h * 60, false);
  }
  if (t.hasAttribute('data-search')) renderServeHits(t.value);
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-action]')) {
    e.preventDefault();
    e.target.click();
    return;
  }
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
  if (t.hasAttribute('data-remind')) return renderSheet();
  if (t.dataset.obsTime && t.value) return setObservationTime(t.dataset.obsTime, new Date(t.value).getTime());
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
onFile('#camInputSheet', f => servePhoto(f, sheet?.kind === 'feed' ? sheet.code : ''));
onFile('#camInputName', f => replacePhoto(sheet?.id, f));
onFile('#camInputProduct', productPhotoFile);
onFile('#petPhotoInput', setPetPhoto);
onFile('#importInput', importData);
onFile('#exchangeInput', receiveFile);
