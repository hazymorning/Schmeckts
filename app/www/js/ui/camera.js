/* Eigene Kamera für Packungsfotos. openCamera(hint) liefert das Foto als Blob, null bei „Abbrechen“, und wirft ohne
   Kamera oder Recht: Dann nimmt der Aufrufer die Kamera-App. Nach dem Recht fragt die WebView beim ersten Gebrauch. */
import {$} from '../dom.js';
import {esc} from '../text.js';

const WANT = {audio:false, video:{facingMode:{ideal:'environment'}, width:{ideal:1920}, height:{ideal:1080}}};
let close = null; // schließt die offene Kamera, null wenn zu

export const closeCamera = () => { if (!close) return false; close(null); return true; }; // für die Zurück-Taste

export async function openCamera(hint){
  if (close) return null;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Keine Kamera in dieser Umgebung.');
  const stream = await navigator.mediaDevices.getUserMedia(WANT); // fragt beim ersten Mal nach dem Recht
  const dlg = $('#camera'), video = $('video', dlg);
  $('.cam-hint', dlg).innerHTML = esc(hint);
  video.srcObject = stream;
  dlg.showModal();
  return new Promise(resolve => {
    const hidden = () => { if (document.hidden) close(null); };
    close = blob => {
      close = null;
      stream.getTracks().forEach(t => t.stop()); video.srcObject = null; // sofort freigeben
      dlg.removeEventListener('click', tap); dlg.removeEventListener('cancel', cancel); document.removeEventListener('visibilitychange', hidden);
      dlg.close();
      resolve(blob);
    };
    const shoot = () => {
      if (!video.videoWidth) return; // noch kein Bild
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      c.toBlob(blob => close?.(blob), 'image/jpeg', .92);
    };
    const tap = e => { const a = e.target.closest('[data-cam]')?.dataset.cam; if (a === 'shoot') shoot(); else if (a === 'cancel') close(null); };
    const cancel = e => { e.preventDefault(); close(null); };
    dlg.addEventListener('click', tap); dlg.addEventListener('cancel', cancel); document.addEventListener('visibilitychange', hidden);
  });
}
