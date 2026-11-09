package com.hushio.player

import kotlin.math.min

object SyncBackoff {
    const val FIRST_MS = 30_000L
    const val MAX_MS = 3_600_000L

    fun delayMs(failures: Int): Long {
        val shift = failures.coerceIn(0, 20)
        return min(FIRST_MS shl shift, MAX_MS)
    }
}

enum class SyncOutcome {
    DONE,
    OFFLINE,
    NOT_READY;

    companion object {
        fun fromCode(code: Int): SyncOutcome = when (code) {
            0 -> DONE
            1 -> OFFLINE
            else -> NOT_READY
        }
    }
}
