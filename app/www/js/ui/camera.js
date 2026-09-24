/* Our own camera for packaging photos. openCamera(hint) returns the photo as a blob, null on „Abbrechen“, and
   throws without a camera or the permission: the caller then falls back to the camera app. */
import {$} from '../dom.js';
import {READ_MAX} from '../images.js';
import {report} from '../report.js';
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
    /* The shutter: the preview stands still at that moment, then a photo from the sensor at the size the text is
       read at (ImageCapture), which the video's 1920 × 1080 does not reach; failing that the frame on screen. */
    let taking = false;
    const shoot = async () => {
      if (!video.videoWidth || taking) return; // no frame yet, or already taking one
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
        if (close) report('the photo from the sensor', e); // closed meanwhile: that is what stopped it
        return null; // the frame will do, as it did before
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

/* A photo from the camera's sensor instead of the video's frame, where the WebView can take one: as close to READ_MAX
   on its long edge as the camera offers (a size out of its range is refused), without the flash. null where it
   cannot. */
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
