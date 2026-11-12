package de.schmeckts.app;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Loads a release's APK into the private cache and opens Android's installer with it. The installer asks before it
 * replaces the app, and the first time Android asks whether Schmeckt's? may install apps at all.
 */
@CapacitorPlugin(name = "Update")
public class UpdatePlugin extends Plugin {
    private File apk() {
        return new File(new File(getContext().getCacheDir(), "update"), "schmeckts.apk");
    }

    // what an earlier update left behind
    @Override
    public void load() {
        apk().delete();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("no address");
            return;
        }
        new Thread(() -> {
            File file = apk();
            try {
                File dir = file.getParentFile();
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cache directory");
                download(url, file);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(intent);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("no installer", e);
                    }
                });
            } catch (Exception e) {
                file.delete();
                call.reject("update failed", e);
            }
        }).start();
    }

    // GitHub answers with a redirect to its file host, which HttpURLConnection follows
    private void download(String url, File file) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(30000);
        try {
            if (con.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + con.getResponseCode());
            long total = con.getContentLengthLong(), done = 0, told = 0;
            try (InputStream in = con.getInputStream(); FileOutputStream out = new FileOutputStream(file)) {
                byte[] buffer = new byte[65536];
                int n;
                while ((n = in.read(buffer)) > 0) {
                    out.write(buffer, 0, n);
                    done += n;
                    if (total > 0 && (done - told) * 50 >= total) {
                        told = done;
                        JSObject share = new JSObject();
                        share.put("share", (double) done / total);
                        notifyListeners("progress", share);
                    }
                }
            }
        } finally {
            con.disconnect();
        }
    }
}
