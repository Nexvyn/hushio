package com.hushio.player

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class SyncPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun schedule(invoke: Invoke) {
        SyncScheduler.scheduleRetry(activity.applicationContext)
        invoke.resolve()
    }
}
