package com.hushio.player

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

object PlayerMath {
    const val MIN_SPEED = 0.5
    const val MAX_SPEED = 2.0
    const val MIN_HEADROOM_VOLUME = 0.05f

    fun clampSpeed(speed: Double): Float =
        if (speed.isNaN()) 1f else speed.coerceIn(MIN_SPEED, MAX_SPEED).toFloat()

    fun clampVolume(volume: Double): Float =
        if (volume.isNaN()) 1f else volume.coerceIn(0.0, 1.0).toFloat()

    fun clampSeek(positionMs: Long, durationMs: Long): Long =
        positionMs.coerceIn(0L, max(0L, durationMs))

    fun headroomVolume(volume: Float, boostDb: Double): Float {
        if (boostDb <= 0.0) return volume
        val lowered = volume * 10.0.pow(-boostDb / 20.0).toFloat()
        return max(min(volume, MIN_HEADROOM_VOLUME), lowered)
    }
}
