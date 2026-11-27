package com.hushio.player

import androidx.activity.BackEventCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

object BackGesture {
    private var inFlight = false

    fun install(activity: ComponentActivity) {
        val dispatcher = activity.onBackPressedDispatcher
        val callback = object : OnBackPressedCallback(true) {
            override fun handleOnBackStarted(backEvent: BackEventCompat) {
                inFlight = true
                PlayerEvents.emit("back-progress", payload(backEvent))
            }

            override fun handleOnBackProgressed(backEvent: BackEventCompat) {
                inFlight = true
                PlayerEvents.emit("back-progress", payload(backEvent))
            }

            override fun handleOnBackCancelled() {
                inFlight = false
                PlayerEvents.emit("back-cancel", emptyMap())
            }

            override fun handleOnBackPressed() {
                if (inFlight) PlayerEvents.emit("back-commit", emptyMap())
                inFlight = false
                isEnabled = false
                try {
                    dispatcher.onBackPressed()
                } finally {
                    isEnabled = true
                }
            }
        }
        dispatcher.addCallback(activity, callback)
    }

    private fun payload(event: BackEventCompat): Map<String, Any?> = mapOf(
        "progress" to event.progress,
        "swipeEdge" to if (event.swipeEdge == BackEventCompat.EDGE_RIGHT) "right" else "left",
    )
}
