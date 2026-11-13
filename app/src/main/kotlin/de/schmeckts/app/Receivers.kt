package de.schmeckts.app

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI

// What runs without the app open: the alarms of both reminders, and what puts them back after a restart or an update.

/**
 * One inexact alarm per feeding reminder. With a household server it first asks the server whether a meal was served
 * on any phone and stays quiet if so; without an answer it reminds anyway.
 */
class FeedReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        if (intent.action != ACTION) {
            arm(context) // boot or app update
            return
        }
        val result = goAsync() // the server call takes longer than a receiver may block
        Thread {
            try {
                remind(context, intent.getIntExtra("id", 0), intent.getLongExtra("since", 0))
            } finally {
                result.finish()
            }
        }.start()
    }

    companion object {
        const val ACTION = "de.schmeckts.app.FEED_REMINDER"
        private const val PREFS = "feed_reminder"
        private const val CHANNEL = "feed"
        private const val TIMEOUT_MS = 5000 // after that the reminder goes off anyway

        fun store(
            context: Context,
            set: JSONObject,
        ) = prefs(context).edit().putString("set", set.toString()).apply()

        fun arm(context: Context) {
            val alarms = context.getSystemService(AlarmManager::class.java)
            val prefs = prefs(context)
            for (id in prefs.getString("armed", "")!!.split(",")) if (id.isNotEmpty()) alarms.cancel(alarm(context, id.toInt(), 0))
            val armed = StringBuilder()
            val list = set(context).optJSONArray("reminders")
            val now = System.currentTimeMillis()
            for (i in 0 until (list?.length() ?: 0)) {
                val r = list!!.optJSONObject(i) ?: continue
                if (r.optLong("at") <= now) continue
                val id = r.optInt("id")
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.optLong("at"), alarm(context, id, r.optLong("since")))
                armed.append(id).append(',')
            }
            prefs.edit().putString("armed", armed.toString()).apply()
        }

        fun dismiss(
            context: Context,
            ids: List<Int>,
        ) = ids.forEach { NotificationManagerCompat.from(context).cancel(it) }

        private fun remind(
            context: Context,
            id: Int,
            since: Long,
        ) {
            val set = set(context)
            val list = set.optJSONArray("reminders")
            var r: JSONObject? = null
            for (i in 0 until (list?.length() ?: 0)) if (list!!.optJSONObject(i)?.optInt("id") == id) r = list.optJSONObject(i)
            if (r == null) return // removed since the alarm was set
            val server = set.optString("server")
            val code = set.optString("code")
            var body = r.optString("body")
            if (server.isNotEmpty() && code.isNotEmpty()) {
                val fed = fed(server, code, since)
                if (fed == true) return
                if (fed == false) body = r.optString("sure", body)
            }
            show(context, id, r.optString("title"), body)
        }

        /** whether a meal was served since then, on any phone (GET /api/fed, server 1.2.0+); null: it could not say */
        fun fed(
            server: String,
            code: String,
            since: Long,
        ): Boolean? {
            var con: HttpURLConnection? = null
            return try {
                con = URI.create("$server/api/fed?since=$since").toURL().openConnection() as HttpURLConnection
                con.connectTimeout = TIMEOUT_MS
                con.readTimeout = TIMEOUT_MS
                con.setRequestProperty("Authorization", "Bearer $code")
                if (con.responseCode != HttpURLConnection.HTTP_OK) return null
                val out = ByteArrayOutputStream()
                con.inputStream.use { it.copyTo(out) }
                val answer = JSONObject(String(out.toByteArray(), Charsets.UTF_8))
                if (answer.has("fed")) answer.getBoolean("fed") else null
            } catch (e: Exception) {
                null // better one reminder too many than none
            } finally {
                con?.disconnect()
            }
        }

        private fun show(
            context: Context,
            id: Int,
            title: String,
            body: String,
        ) {
            channel(context, CHANNEL, "Ans Füttern erinnern")
            // the app's own link, so a tap works on a cold start too
            val open = Intent(Intent.ACTION_VIEW, Uri.parse("schmeckts://feed"), context, MainActivity::class.java)
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val note =
                NotificationCompat
                    .Builder(context, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_schmeckts)
                    .setColor(ContextCompat.getColor(context, R.color.notification))
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                    .setContentIntent(tap)
                    .setAutoCancel(true)
            notify(context, id, note)
        }

        private fun alarm(
            context: Context,
            id: Int,
            since: Long,
        ): PendingIntent {
            val intent = Intent(context, FeedReceiver::class.java).setAction(ACTION).putExtra("id", id).putExtra("since", since)
            return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        private fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        private fun set(context: Context) =
            try {
                JSONObject(prefs(context).getString("set", "{}")!!)
            } catch (e: Exception) {
                JSONObject() // unreadable: treat as nothing set
            }
    }
}

/** One inexact alarm per rating reminder, planned from the data; after a restart or an update the app plans anew. */
class RateReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        if (intent.action != ACTION) {
            (context.applicationContext as? App)
                ?.main
                ?.logic
                ?.reminders
                ?.reconcile()
            return
        }
        val id = intent.getIntExtra("id", 0)
        val note = Notes.planned(context).find { it.id == id } ?: return // taken back since the alarm was set
        Notes.show(context, note)
    }

    companion object {
        const val ACTION = "de.schmeckts.app.RATE_REMINDER"
    }
}

/** the channel for a reminder, its name as the settings say it */
fun channel(
    context: Context,
    id: String,
    name: String,
) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val was = manager.getNotificationChannel(id)
    if (was == null ||
        was.name != name
    ) {
        manager.createNotificationChannel(NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT))
    }
}

fun notify(
    context: Context,
    id: Int,
    note: NotificationCompat.Builder,
) {
    try {
        NotificationManagerCompat.from(context).notify(id, note.build())
    } catch (e: SecurityException) {
        // permission revoked in Android settings; the app's switch asks again
    }
}

/* Rating reminders as 0.42 showed them through Capacitor's plugin: channel "default", the meal's id as a number, and a
   tap or a button opening MainActivity with the plugin's extras. A reminder 0.42 left on screen works the same way. */
object Notes {
    private const val PREFS = "rate_reminder"
    private const val CHANNEL = "default"
    private const val ACTION = "LocalNotificationUserAction"
    private const val ID = "LocalNotificationId"
    private const val OBJECT = "LocalNotficationObject" // so written by the plugin

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun toJson(n: Note) =
        JSONObject()
            .put("id", n.id)
            .put("title", n.title)
            .put("body", n.body)
            .put(
                "extra",
                JSONObject().put("serving", n.serving).put("at", n.at).apply {
                    if (n.pet != null) put("pet", n.pet)
                    if (n.rate.isNotEmpty()) put("rate", n.rate.joinToString(","))
                },
            )

    private fun noteOf(o: JSONObject): Note {
        val x = o.optJSONObject("extra") ?: JSONObject()
        return Note(
            o.optInt("id"),
            o.optString("title"),
            o.optString("body"),
            x.optLong("at"),
            x.optString("serving"),
            x.optString("pet").ifEmpty { null },
            x.optString("rate").split(",").filter { it.isNotEmpty() },
        )
    }

    fun planned(context: Context): List<Note> =
        try {
            val a = JSONArray(prefs(context).getString("set", "[]"))
            (0 until a.length()).map { noteOf(a.getJSONObject(it)) }
        } catch (e: Exception) {
            emptyList()
        }

    /** every reminder there should be: future ones armed, the rest taken back, shown ones of rated meals dismissed */
    fun plan(
        context: Context,
        notes: List<Note>,
    ) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        val prefs = prefs(context)
        val was =
            prefs
                .getString("armed", "")!!
                .split(",")
                .filter { it.isNotEmpty() }
                .map { it.toInt() }
        val now = System.currentTimeMillis()
        val armed = notes.filter { it.at > now }
        for (id in was) if (armed.none { it.id == id }) alarms.cancel(alarm(context, id))
        for (n in armed) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, n.at, alarm(context, n.id))
        prefs
            .edit()
            .putString("set", JSONArray(notes.map(::toJson)).toString())
            .putString("armed", armed.joinToString(",") { it.id.toString() })
            .apply()
        if (Build.VERSION.SDK_INT >= 23) {
            val wanted = notes.map { it.id }.toSet()
            val manager = context.getSystemService(NotificationManager::class.java)
            for (s in manager.activeNotifications) {
                val channelOk = Build.VERSION.SDK_INT < 26 || s.notification.channelId == CHANNEL
                if (channelOk && s.id !in wanted) manager.cancel(s.id)
            }
        }
    }

    private fun alarm(
        context: Context,
        id: Int,
    ): PendingIntent {
        val intent = Intent(context, RateReceiver::class.java).setAction(RateReceiver.ACTION).putExtra("id", id)
        return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun open(
        context: Context,
        n: Note,
        action: String,
        code: Int,
    ): PendingIntent {
        val intent =
            Intent(context, MainActivity::class.java)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(ID, n.id)
                .putExtra(ACTION, action)
                .putExtra(OBJECT, toJson(n).toString())
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun show(
        context: Context,
        n: Note,
    ) {
        channel(context, CHANNEL, "Ans Bewerten erinnern")
        val b =
            NotificationCompat
                .Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_schmeckts)
                .setColor(ContextCompat.getColor(context, R.color.notification))
                .setContentTitle(n.title)
                .setContentText(n.body)
                .setContentIntent(open(context, n, "tap", n.id))
                .setAutoCancel(true)
        for (r in n.rate) b.addAction(0, RATINGS[r]?.short ?: r, open(context, n, r, n.id + r.hashCode()))
        notify(context, n.id, b)
    }

    /** a tap or a button on a reminder: its action, meal and pet; the reminder goes from the screen */
    fun fromIntent(
        context: Context,
        intent: Intent,
    ): Triple<String, String?, String?>? {
        val action = intent.getStringExtra(ACTION) ?: return null
        val o =
            try {
                JSONObject(intent.getStringExtra(OBJECT) ?: "{}")
            } catch (e: Exception) {
                JSONObject()
            }
        val x = o.optJSONObject("extra") ?: JSONObject()
        val id = intent.getIntExtra(ID, o.optInt("id"))
        if (id != 0) NotificationManagerCompat.from(context).cancel(id)
        intent.removeExtra(ACTION) // handled once, not again when the activity is made anew
        return Triple(action, x.optString("serving").ifEmpty { null }, x.optString("pet").ifEmpty { null })
    }
}
