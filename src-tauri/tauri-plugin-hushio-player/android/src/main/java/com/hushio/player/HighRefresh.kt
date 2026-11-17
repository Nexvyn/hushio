package com.hushio.player

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.view.Display

internal object HighRefresh {
    fun apply(activity: Activity) {
        val power = activity.getSystemService(Context.POWER_SERVICE) as? PowerManager
        if (power?.isPowerSaveMode == true) return
        val display = displayOf(activity) ?: return
        val current = display.mode
        val fastest = display.supportedModes
            .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
            .maxByOrNull { it.refreshRate } ?: return
        if (fastest.refreshRate <= current.refreshRate + 0.5f) return
        val params = activity.window.attributes
        params.preferredDisplayModeId = fastest.modeId
        activity.window.attributes = params
    }

    @Suppress("DEPRECATION")
    private fun displayOf(activity: Activity): Display? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) activity.display else activity.windowManager.defaultDisplay
}
