package de.schmeckts.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Parcelable;
import com.getcapacitor.BridgeActivity;

// Replaces the template's MainActivity (scripts/prepare.py copies app/native over app/android).
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhotoPlugin.class);
        registerPlugin(FeedReminderPlugin.class);
        shared(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(Intent intent) {
        shared(intent);
        super.onNewIntent(intent);
    }

    // A file shared from another app arrives as ACTION_SEND; as ACTION_VIEW Capacitor passes it on as appUrlOpen.
    private void shared(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        Parcelable file = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (file instanceof Uri) {
            intent.setAction(Intent.ACTION_VIEW);
            intent.setData((Uri) file);
        }
    }
}
