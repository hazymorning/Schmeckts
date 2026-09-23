/* Our own camera for packaging photos. openCamera(hint) returns the photo as a blob, null on „Abbrechen“, and
   throws without a camera or the permission: the caller then falls back to the camera app. */
import {$} from '../dom.js';
import {esc} from '../text.js';
import {darkBars} from './theme.js';
import {dropViewer} from './viewer.js';

const WANT = {audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1920}, height: {ideal: 1080}}};
let close = null; // closes the open camera, null when closed

export const closeCamera = () => {
  if (!close) return false;
  close(null);
  return true;
}; // for the back button

export async function openCamera(hint) {
  if (close) return null;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Keine Kamera in dieser Umgebung.');
  const stream = await navigator.mediaDevices.getUserMedia(WANT); // asks for the permission the first time
  const dlg = $('#camera'),
    video = $('video', dlg);
  $('.cam-hint', dlg).innerHTML = esc(hint);
  video.srcObject = stream;
  dropViewer();
  dlg.showModal();
  darkBars(true);
  return new Promise(resolve => {
    const hidden = () => {
      if (document.hidden) close(null);
    };
    close = blob => {
      close = null;
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null; // release it at once
      dlg.removeEventListener('click', tap);
      dlg.removeEventListener('cancel', cancel);
      document.removeEventListener('visibilitychange', hidden);
      dlg.close();
      darkBars(false);
      resolve(blob);
    };
    const shoot = () => {
      if (!video.videoWidth) return; // no frame yet
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      c.toBlob(blob => close?.(blob), 'image/jpeg', 0.92);
    };
    const tap = e => {
      const a = e.target.closest('[data-cam]')?.dataset.cam;
      if (a === 'shoot') shoot();
      else if (a === 'cancel') close(null);
    };
    const cancel = e => {
      e.preventDefault();
      close(null);
    };
    dlg.addEventListener('click', tap);
    dlg.addEventListener('cancel', cancel);
    document.addEventListener('visibilitychange', hidden);
  });
}
