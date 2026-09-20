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
 * Kleines eigenes Plugin: startet die System-Kamera-App und liefert das Foto als Base64 zurück.
 * Der Rückfall, wenn die eigene Kamera der App (www/js/ui/camera.js) nicht geht: keine Kamera für die
 * WebView oder Kamerarecht verweigert. Die Option „hinweis“ erscheint kurz über der Kamera, etwa „Vorderseite
 * fotografieren“. Das Foto macht die Kamera-App und schreibt es über den FileProvider in den Cache.
 * Grenze von Android: Weil die App das Kamerarecht im Manifest führt, startet Android die Kamera-App für sie nur,
 * solange das Recht nicht verweigert ist (sonst SecurityException). Dann meldet das Plugin „Die Kamera ließ sich
 * nicht öffnen.“ und die App weist auf die Android-Einstellungen hin.
 * Angemeldet wird das Plugin in MainActivity (scripts/prepare.py), in der App heißt es Capacitor.Plugins.Foto.
 */
@CapacitorPlugin(name = "Foto")
public class FotoPlugin extends Plugin {
    private Uri ziel;
    private File datei;

    @PluginMethod
    public void aufnehmen(PluginCall call) {
        try {
            File ordner = new File(getContext().getCacheDir(), "foto");
            if (!ordner.isDirectory() && !ordner.mkdirs()) throw new java.io.IOException("Cache-Ordner");
            datei = new File(ordner, "packung.jpg");
            ziel = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", datei);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, ziel);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            String hinweis = call.getString("hinweis");
            if (hinweis != null && !hinweis.isEmpty()) {
                getActivity().runOnUiThread(() -> Toast.makeText(getContext(), hinweis, Toast.LENGTH_LONG).show());
            }
            startActivityForResult(call, intent, "fertig");
        } catch (Exception e) {
            call.reject("Die Kamera ließ sich nicht öffnen.");
        }
    }

    @ActivityCallback
    private void fertig(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || ziel == null) {
            if (datei != null) datei.delete();
            call.reject("abgebrochen");
            return;
        }
        try (InputStream in = getContext().getContentResolver().openInputStream(ziel)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] puffer = new byte[65536];
            int n;
            while ((n = in.read(puffer)) > 0) out.write(puffer, 0, n);
            JSObject ret = new JSObject();
            ret.put("base64", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)); // die App dreht und verkleinert selbst
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Das Foto ließ sich nicht lesen.");
        } finally {
            if (datei != null) datei.delete();
        }
    }
}
