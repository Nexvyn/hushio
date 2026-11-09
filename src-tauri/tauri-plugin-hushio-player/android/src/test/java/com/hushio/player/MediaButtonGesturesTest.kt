package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MediaButtonGesturesTest {

    @Test
    fun singlePressResolvesAfterWindow() {
        val gestures = MediaButtonGestures(windowMs = 500L)
        assertNull(gestures.press(1_000L))
        assertNull(gestures.expire(1_400L))
        assertEquals(MediaButtonGestures.Gesture.SINGLE, gestures.expire(1_500L))
        assertNull(gestures.expire(2_000L))
    }

    @Test
    fun twoQuickPressesAreDouble() {
        val gestures = MediaButtonGestures(windowMs = 500L)
        assertNull(gestures.press(1_000L))
        assertEquals(MediaButtonGestures.Gesture.DOUBLE, gestures.press(1_300L))
        assertNull(gestures.expire(1_900L))
    }

    @Test
    fun slowSecondPressStartsANewGesture() {
        val gestures = MediaButtonGestures(windowMs = 500L)
        assertNull(gestures.press(1_000L))
        assertNull(gestures.press(1_800L))
        assertEquals(MediaButtonGestures.Gesture.SINGLE, gestures.expire(2_300L))
    }

    @Test
    fun pressAfterDoubleStartsOver() {
        val gestures = MediaButtonGestures(windowMs = 500L)
        assertNull(gestures.press(0L))
        assertEquals(MediaButtonGestures.Gesture.DOUBLE, gestures.press(100L))
        assertNull(gestures.press(200L))
    }
}
