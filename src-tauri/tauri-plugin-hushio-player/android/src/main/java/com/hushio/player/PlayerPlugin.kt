package com.hushio.player

import android.app.Activity
import android.webkit.WebView
import app.tauri.plugin.Plugin

class PlayerPlugin(private val activity: Activity) : Plugin(activity) {
    override fun load(webView: WebView) {
        PlayerService.start(activity)
    }
}
