package com.hushio.player

import kotlin.math.max
import kotlin.math.min

sealed interface SleepStep {
    data object Idle : SleepStep
    data class Fading(val volume: Float) : SleepStep
    data object Fire : SleepStep
}

class SleepTimer {
    var endsAtMs: Long? = null
        private set

    var endOfSong: Boolean = false
        private set

    val active: Boolean
        get() = endsAtMs != null

    fun set(endsAtEpochMs: Long?, endOfSong: Boolean) {
        endsAtMs = endsAtEpochMs
        this.endOfSong = endOfSong
    }

    fun endOfSongConsumed() {
        endOfSong = false
    }

    fun clear() {
        endsAtMs = null
        endOfSong = false
    }

    fun step(nowEpochMs: Long): SleepStep {
        val endsAt = endsAtMs ?: return SleepStep.Idle
        val remaining = endsAt - nowEpochMs
        return when {
            remaining <= 0 -> {
                clear()
                SleepStep.Fire
            }
            remaining < FADE_MS -> SleepStep.Fading(volumeFor(remaining))
            else -> SleepStep.Idle
        }
    }

    companion object {
        const val FADE_MS = 10_000L

        fun volumeFor(remainingMs: Long): Float =
            min(1f, max(0f, remainingMs / FADE_MS.toFloat()))
    }
}
