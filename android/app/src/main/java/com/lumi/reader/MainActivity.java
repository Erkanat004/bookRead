package com.lumi.reader;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LumiFilesPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                PluginHandle handle = getBridge().getPlugin("LumiFiles");
                if (handle != null) ((LumiFilesPlugin) handle.getInstance()).requestBack();
                else finish();
            }
        });
    }
}
