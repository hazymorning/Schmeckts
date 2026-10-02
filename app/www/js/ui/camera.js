/* Own camera for packaging photos. Resolves to a blob, or null when cancelled; throws without camera or permission,
   so the caller can fall back to the camera app. */
import {$} from '../dom.js';
import {READ_MAX} from '../images.js';
import {report} from '../report.js';
import {esc} from '../text.js';
import {darkBars} from './theme.js';
import {dropViewer} from './viewer.js';

const WANT = {audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1920}, height: {ideal: 1080}}};
let close = null; // null while closed

// for the back button
export const closeCamera = () => {
  if (!close) return false;
  close(null);
  return true;
};

export async function openCamera(hint) {
  if (close) return null;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Keine Kamera in dieser Umgebung.');
  const stream = await navigator.mediaDevices.getUserMedia(WANT);
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
      video.srcObject = null; // release the camera at once
      dlg.removeEventListener('click', tap);
      dlg.removeEventListener('cancel', cancel);
      document.removeEventListener('visibilitychange', hidden);
      dlg.close();
      darkBars(false);
      resolve(blob);
    };
    // ImageCapture reaches the size text is read at, the 1920 x 1080 video does not
    let taking = false;
    const shoot = async () => {
      if (!video.videoWidth || taking) return;
      taking = true;
      video.pause();
      const frame = await new Promise(done => {
        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);
        c.toBlob(done, 'image/jpeg', 0.92);
      });
      const photo = await sharpPhoto(stream).catch(e => {
        if (close) report('the photo from the sensor', e); // if closed meanwhile, that is what stopped it
        return null;
      });
      close?.(photo || frame);
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

// a size outside the camera's range is refused, so clamp READ_MAX to it
async function sharpPhoto(stream) {
  const track = stream.getVideoTracks()[0];
  if (!window.ImageCapture || !track) return null;
  const capture = new ImageCapture(track);
  const {imageWidth, fillLightMode} = await capture.getPhotoCapabilities();
  const edge = imageWidth?.max ? Math.min(imageWidth.max, Math.max(imageWidth.min || 0, READ_MAX)) : undefined;
  return capture.takePhoto({
    ...(edge ? {imageWidth: edge} : {}),
    ...(fillLightMode?.includes('off') ? {fillLightMode: 'off'} : {}),
  });
}
