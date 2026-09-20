/* Bottom Sheet: öffnen, schließen, wischen, Zurück-Geste.
   Was im Sheet steht, melden die Ansichten über setSheetView() an. */
import {$, reduceMotion} from '../dom.js';

export const dlg = $('#sheet'), sheetBody = $('#sheetBody');
export let sheet = null; // der Zustand des offenen Sheets, null wenn zu
let viewKey = '', histPushed = false, closing = null;

export function openSheet(state){
  sheet = state;
  renderSheet();
  if (!dlg.open) {
    dlg.classList.remove('closing'); dlg.style.transform = ''; dlg.style.transition = '';
    dlg.showModal(); document.body.classList.add('locked');
    sheetBody.scrollTop = 0; // der Browser merkt sich sonst die Scrollposition des letzten Sheets
    try { history.pushState({sheet:1}, ''); histPushed = true; } catch (e) { histPushed = false; }
  }
}
let drawView = () => {}; // setzen die Sheet-Ansichten: zeichnet den Inhalt des offenen Sheets
export function setSheetView(fn){ drawView = fn; }
export function renderSheet(){
  if (!sheet) return;
  drawView(sheet);
  const key = `${sheet.kind}:${sheet.step || ''}:${sheet.id || ''}`;
  if (key !== viewKey) {
    viewKey = key; sheetBody.scrollTop = 0;
    sheetBody.classList.remove('swap-in'); void sheetBody.offsetWidth; sheetBody.classList.add('swap-in');
  }
}
export function closeSheet(fromPop = false){
  if (closing) return closing;
  if (!dlg.open) return Promise.resolve();
  /* Fertig ist das Schließen erst, wenn auch der Verlaufseintrag des Sheets weg ist: Käme popstate nach dem
     Öffnen des nächsten Sheets, würde es dieses schließen */
  const popped = histPushed && !fromPop ? new Promise(resolve => addEventListener('popstate', resolve, {once:true})) : null;
  if (popped) history.back();
  histPushed = false;
  const hidden = reduceMotion.matches ? Promise.resolve() : new Promise(resolve => { dlg.classList.add('closing'); setTimeout(resolve, 240); });
  closing = Promise.all([popped, hidden.then(() => {
    dlg.classList.remove('closing'); dlg.style.transform = ''; dlg.style.transition = '';
    sheetBody.scrollTop = 0;
    dlg.close();
    sheet = null; viewKey = ''; sheetBody.innerHTML = '';
    document.body.classList.remove('locked');
    const t = $('#toast');
    if (t.parentNode === dlg) { t.classList.remove('in-sheet'); document.body.appendChild(t); }
  })]).then(() => { closing = null; });
  return closing;
}
window.addEventListener('popstate', () => { if (histPushed) { histPushed = false; closeSheet(true); } });
dlg.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
dlg.addEventListener('click', e => { if (e.target === dlg) closeSheet(); });

/* Nach unten wischen schließt das Sheet */
(() => {
  let startY = 0, dy = 0, t0 = 0, dragging = false;
  dlg.addEventListener('pointerdown', e => {
    if (!e.target.closest('.grip-zone, .sh-head') || e.target.closest('button, input, label')) return;
    dragging = true; startY = e.clientY; dy = 0; t0 = performance.now();
    dlg.style.transition = 'none';
    try { dlg.setPointerCapture(e.pointerId); } catch (err) {}
  });
  dlg.addEventListener('pointermove', e => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    dlg.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const v = dy / Math.max(1, performance.now() - t0);
    if (dy > 110 || (v > .5 && dy > 24)) closeSheet();
    else { dlg.style.transition = 'transform .4s cubic-bezier(.22,1,.36,1)'; dlg.style.transform = ''; }
  };
  dlg.addEventListener('pointerup', end);
  dlg.addEventListener('pointercancel', end);
})();
