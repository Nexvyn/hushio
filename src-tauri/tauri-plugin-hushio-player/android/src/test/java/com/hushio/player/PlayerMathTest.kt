package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Test

class PlayerMathTest {

    @Test
    fun speedIsClampedToHalfToDouble() {
        assertEquals(0.5f, PlayerMath.clampSpeed(0.1), 0f)
        assertEquals(2f, PlayerMath.clampSpeed(9.0), 0f)
        assertEquals(1.25f, PlayerMath.clampSpeed(1.25), 0f)
        assertEquals(1f, PlayerMath.clampSpeed(Double.NaN), 0f)
    }

    @Test
    fun volumeIsClampedToZeroAndOne() {
        assertEquals(0f, PlayerMath.clampVolume(-0.4), 0f)
        assertEquals(1f, PlayerMath.clampVolume(1.7), 0f)
        assertEquals(0.6f, PlayerMath.clampVolume(0.6), 0.0001f)
    }

    @Test
    fun seekIsClampedToTheItem() {
        assertEquals(0L, PlayerMath.clampSeek(-5L, 1_000L))
        assertEquals(1_000L, PlayerMath.clampSeek(5_000L, 1_000L))
        assertEquals(0L, PlayerMath.clampSeek(5L, -1L))
        assertEquals(400L, PlayerMath.clampSeek(400L, 1_000L))
    }

    @Test
    fun headroomLowersVolumeByBoostInDecibels() {
        assertEquals(1f, PlayerMath.headroomVolume(1f, 0.0), 0f)
        assertEquals(0.7079f, PlayerMath.headroomVolume(1f, 3.0), 0.001f)
    }

    @Test
    fun headroomNeverGoesBelowFloor() {
        assertEquals(0.05f, PlayerMath.headroomVolume(1f, 40.0), 0.0001f)
        assertEquals(0f, PlayerMath.headroomVolume(0f, 6.0), 0f)
    }
}
