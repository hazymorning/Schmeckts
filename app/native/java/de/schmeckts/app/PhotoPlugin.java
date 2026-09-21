package de.schmeckts.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;

/**
 * A small plugin of our own: starts the system camera app and returns the photo as base64.
 * It is the fallback for when the app's own camera (www/js/ui/camera.js) will not run: no camera for the
 * WebView, or the camera permission denied. The "hint" option appears briefly above the camera, for example
 * "Vorderseite fotografieren". The camera app takes the photo and writes it to the cache via the FileProvider.
 * An Android limitation: because the app declares the camera permission in its manifest, Android only starts the
 * camera app on its behalf while that permission is not denied (SecurityException otherwise). The plugin then
 * reports "camera unavailable" and the app points at the Android settings.
 * The plugin is registered in MainActivity (scripts/prepare.py); in the app it is Capacitor.Plugins.Photo.
 */
@CapacitorPlugin(name = "Photo")
public class PhotoPlugin extends Plugin {
    private Uri target;
    private File file;

    @PluginMethod
    public void capture(PluginCall call) {
        try {
            File dir = new File(getContext().getCacheDir(), "photo");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new java.io.IOException("cache directory");
            file = new File(dir, "package.jpg");
            target = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, target);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            String hint = call.getString("hint");
            if (hint != null && !hint.isEmpty()) {
                getActivity().runOnUiThread(() -> Toast.makeText(getContext(), hint, Toast.LENGTH_LONG).show());
            }
            startActivityForResult(call, intent, "done");
        } catch (Exception e) {
            call.reject("camera unavailable");
        }
    }

    @ActivityCallback
    private void done(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || target == null) {
            if (file != null) file.delete();
            call.reject("cancelled");
            return;
        }
        try (InputStream in = getContext().getContentResolver().openInputStream(target)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[65536];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            JSObject ret = new JSObject();
            ret.put("base64", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)); // the app rotates and shrinks it itself
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("photo unreadable");
        } finally {
            if (file != null) file.delete();
        }
    }
}
