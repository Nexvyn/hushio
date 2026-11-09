package com.hushio.player

import android.app.Activity
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import app.tauri.annotation.Command
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

class AuthPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun auth_open(invoke: Invoke) {
        val url = invoke.getArgs().optString("url")
        if (Uri.parse(url).scheme != "https") {
            invoke.reject("invalid_url")
            return
        }
        AuthRedirect.cancel()
        activity.runOnUiThread {
            try {
                CustomTabsIntent.Builder().build().launchUrl(activity, Uri.parse(url))
                invoke.resolve()
            } catch (error: Exception) {
                invoke.reject("no_browser")
            }
        }
    }

    @Command
    fun auth_await(invoke: Invoke) {
        AuthRedirect.await { uri ->
            if (uri.isEmpty()) invoke.reject("cancelled")
            else invoke.resolve(JSObject().put("url", uri))
        }
    }
}
