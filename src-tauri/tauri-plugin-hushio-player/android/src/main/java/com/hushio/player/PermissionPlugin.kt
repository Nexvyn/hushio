package com.hushio.player

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin(
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")],
)
class PermissionPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun notification_state(invoke: Invoke) {
        invoke.resolve(JSObject().put("state", currentState().wire))
    }

    @Command
    fun notification_request(invoke: Invoke) {
        if (currentState() != NotificationPolicy.State.REQUEST) {
            invoke.resolve(JSObject().put("state", currentState().wire))
            return
        }
        prefs().edit().putBoolean(ASKED_KEY, true).apply()
        requestPermissionForAlias(NOTIFICATIONS, invoke, "onNotifications")
    }

    @PermissionCallback
    fun onNotifications(invoke: Invoke) {
        invoke.resolve(JSObject().put("state", currentState().wire))
    }

    @Command
    fun notification_settings(invoke: Invoke) {
        activity.runOnUiThread {
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
            activity.startActivity(intent)
        }
        invoke.resolve()
    }

    private fun currentState(): NotificationPolicy.State {
        val granted = ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        return NotificationPolicy.state(
            sdk = Build.VERSION.SDK_INT,
            granted = granted,
            showRationale = activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS),
            askedBefore = prefs().getBoolean(ASKED_KEY, false),
        )
    }

    private fun prefs() = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private companion object {
        const val NOTIFICATIONS = "notifications"
        const val PREFS = "hushio-permissions"
        const val ASKED_KEY = "notifications-asked"
    }
}
