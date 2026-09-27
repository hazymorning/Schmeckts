package de.schmeckts.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * The feeding reminder (www/js/logic/reminders.js). set() hands over every reminder the app wants at once, each as
 * {id, at, since, title, body, sure}, with the household server and its code while the phone is connected; that
 * replaces whatever was set before. dismiss holds reminders already shown whose meal has been served since.
 * FeedReceiver sets the alarms and decides when one goes off.
 * Registered in MainActivity (scripts/prepare.py); in the app it is Capacitor.Plugins.FeedReminder.
 */
@CapacitorPlugin(name = "FeedReminder")
public class FeedReminderPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        try {
            JSONObject set = new JSONObject();
            set.put("reminders", call.getArray("reminders", new JSArray()));
            set.put("server", call.getString("server", ""));
            set.put("code", call.getString("code", ""));
            FeedReceiver.store(getContext(), set);
            FeedReceiver.arm(getContext());
            FeedReceiver.dismiss(getContext(), call.getArray("dismiss", new JSArray()));
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("feeding reminder not set");
        }
    }
}
