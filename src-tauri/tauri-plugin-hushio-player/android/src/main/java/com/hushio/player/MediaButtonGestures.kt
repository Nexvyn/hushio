package com.hushio.player

class MediaButtonGestures(private val windowMs: Long = WINDOW_MS) {
    private var pendingSinceMs: Long? = null

    enum class Gesture { SINGLE, DOUBLE }

    fun press(nowMs: Long): Gesture? {
        val since = pendingSinceMs
        if (since != null && nowMs - since <= windowMs) {
            pendingSinceMs = null
            return Gesture.DOUBLE
        }
        pendingSinceMs = nowMs
        return null
    }

    fun expire(nowMs: Long): Gesture? {
        val since = pendingSinceMs ?: return null
        if (nowMs - since < windowMs) return null
        pendingSinceMs = null
        return Gesture.SINGLE
    }

    companion object {
        const val WINDOW_MS = 500L
    }
}
