package de.schmeckts.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * set() replaces all reminders, each {id, at, since, title, body, sure}, plus server and code while connected.
 * dismiss: ids of shown reminders whose meal has been served. Registered in MainActivity by scripts/prepare.py.
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
