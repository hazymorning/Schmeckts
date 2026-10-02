package de.schmeckts.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * One inexact alarm per reminder. With a household server it first asks FeedCheck whether a meal was served on any
 * phone and stays quiet if so; without an answer it reminds anyway.
 */
public class FeedReceiver extends BroadcastReceiver {
    static final String ACTION = "de.schmeckts.app.FEED_REMINDER";
    private static final String PREFS = "feed_reminder";
    private static final String CHANNEL = "feed";

    static void store(Context context, JSONObject set) {
        prefs(context).edit().putString("set", set.toString()).apply();
    }

    static void arm(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        SharedPreferences prefs = prefs(context);
        for (String id : prefs.getString("armed", "").split(",")) {
            if (!id.isEmpty()) alarms.cancel(alarm(context, Integer.parseInt(id), 0));
        }
        StringBuilder armed = new StringBuilder();
        JSONArray list = set(context).optJSONArray("reminders");
        long now = System.currentTimeMillis();
        for (int i = 0; list != null && i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null || r.optLong("at") <= now) continue;
            int id = r.optInt("id");
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.optLong("at"), alarm(context, id, r.optLong("since")));
            armed.append(id).append(',');
        }
        prefs.edit().putString("armed", armed.toString()).apply();
    }

    static void dismiss(Context context, JSONArray ids) {
        for (int i = 0; ids != null && i < ids.length(); i++) NotificationManagerCompat.from(context).cancel(ids.optInt(i));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION.equals(intent.getAction())) {
            arm(context); // boot or app update
            return;
        }
        PendingResult result = goAsync(); // the server call takes longer than a receiver may block
        new Thread(() -> {
            try {
                remind(context, intent.getIntExtra("id", 0), intent.getLongExtra("since", 0));
            } finally {
                result.finish();
            }
        }).start();
    }

    private static void remind(Context context, int id, long since) {
        JSONObject set = set(context), r = null;
        JSONArray list = set.optJSONArray("reminders");
        for (int i = 0; list != null && i < list.length(); i++) {
            if (list.optJSONObject(i) != null && list.optJSONObject(i).optInt("id") == id) r = list.optJSONObject(i);
        }
        if (r == null) return; // removed since the alarm was set
        String server = set.optString("server"), code = set.optString("code"), body = r.optString("body");
        if (!server.isEmpty() && !code.isEmpty()) {
            Boolean fed = FeedCheck.fed(server, code, since);
            if (Boolean.TRUE.equals(fed)) return;
            if (Boolean.FALSE.equals(fed)) body = r.optString("sure", body);
        }
        show(context, id, r.optString("title"), body);
    }

    private static void show(Context context, int id, String title, String body) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(
                new NotificationChannel(CHANNEL, "Ans Füttern erinnern", NotificationManager.IMPORTANCE_DEFAULT)
            );
        }
        // the app's own link, so a tap works on a cold start too
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("schmeckts://feed"), context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(
            context,
            id,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder note = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_schmeckts)
            .setColor(ContextCompat.getColor(context, R.color.notification))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(tap)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(context).notify(id, note.build());
        } catch (SecurityException e) {
            // permission revoked in Android settings; the app's switch asks again
        }
    }

    private static PendingIntent alarm(Context context, int id, long since) {
        Intent intent = new Intent(context, FeedReceiver.class).setAction(ACTION).putExtra("id", id).putExtra("since", since);
        return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject set(Context context) {
        try {
            return new JSONObject(prefs(context).getString("set", "{}"));
        } catch (Exception e) {
            return new JSONObject(); // unreadable: treat as nothing set
        }
    }
}
