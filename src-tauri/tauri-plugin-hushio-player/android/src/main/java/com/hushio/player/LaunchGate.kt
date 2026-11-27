package com.hushio.player

object LaunchGate {
    @Volatile var ready = false

    fun markReady() {
        ready = true
    }

    fun keepOnScreen(startedAt: Long, now: Long): Boolean = !ready && now - startedAt < 3000
}
