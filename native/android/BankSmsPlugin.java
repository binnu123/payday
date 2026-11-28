package com.payday.tracker;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "BankSms", permissions = {
    @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS })
})
public class BankSmsPlugin extends Plugin {
    @PluginMethod
    public void read(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermissionResult");
            return;
        }
        readMessages(call);
    }

    @PermissionCallback
    private void smsPermissionResult(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permission was not granted.");
            return;
        }
        readMessages(call);
    }

    private void readMessages(PluginCall call) {
        JSArray messages = new JSArray();
        try (Cursor cursor = getContext().getContentResolver().query(
                Uri.parse("content://sms/inbox"),
                new String[]{"address", "body", "date"}, null, null, "date DESC")) {
            if (cursor == null) { call.reject("Could not read the SMS inbox."); return; }
            int count = 0;
            while (cursor.moveToNext() && count++ < 1000) {
                JSObject message = new JSObject();
                message.put("sender", cursor.getString(0));
                message.put("body", cursor.getString(1));
                message.put("date", cursor.getLong(2));
                messages.put(message);
            }
            JSObject result = new JSObject();
            result.put("messages", messages);
            call.resolve(result);
        } catch (Exception e) { call.reject("Could not read the SMS inbox.", e); }
    }
}
