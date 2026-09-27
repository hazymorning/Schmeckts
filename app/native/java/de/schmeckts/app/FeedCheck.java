package de.schmeckts.app;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Asks the household server whether a meal has been served since a moment, on any phone (GET /api/fed, from
 * server 1.2.0). FeedReceiver asks it before a feeding reminder goes off. Plain Java apart from org.json, which
 * Android brings along.
 */
final class FeedCheck {
    static final int TIMEOUT_MS = 5000; // the phone may just be waking up; after that the reminder goes off anyway

    private FeedCheck() {}

    /** true: a meal has been served since then; false: none; null: the server could not say (offline, too old). */
    static Boolean fed(String server, String code, long since) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) URI.create(server + "/api/fed?since=" + since).toURL().openConnection();
            con.setConnectTimeout(TIMEOUT_MS);
            con.setReadTimeout(TIMEOUT_MS);
            con.setRequestProperty("Authorization", "Bearer " + code);
            if (con.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int n;
                while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                JSONObject answer = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
                return answer.has("fed") ? answer.getBoolean("fed") : null;
            }
        } catch (Exception e) {
            return null; // unreachable or unreadable: the reminder is better given once too often than not at all
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
