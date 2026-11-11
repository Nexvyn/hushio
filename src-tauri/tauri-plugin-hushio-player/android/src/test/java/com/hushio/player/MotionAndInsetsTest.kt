package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MotionAndInsetsTest {

    @Test
    fun removeAnimationsIsReducedMotion() {
        assertTrue(ReduceMotion.isOn(0f))
        assertFalse(ReduceMotion.isOn(1f))
        assertFalse(ReduceMotion.isOn(0.5f))
        assertFalse(ReduceMotion.isOn(2f))
    }

    @Test
    fun pixelInsetsBecomeDp() {
        assertEquals(32f, InsetsCss.dp(84, 2.625f), 0.0001f)
        assertEquals(0f, InsetsCss.dp(40, 0f), 0f)
    }

    @Test
    fun sidesConvertEachEdgeToDp() {
        assertEquals(
            InsetsCss.Sides(32f, 16f, 0f, 0f),
            InsetsCss.sides(84, 42, 0, 0, 2.625f),
        )
    }

    @Test
    fun scriptSetsEachInsetProperty() {
        assertEquals(
            "document.documentElement.style.setProperty('--inset-top','32.00px');" +
                "document.documentElement.style.setProperty('--inset-bottom','16.00px');" +
                "document.documentElement.style.setProperty('--inset-left','0.00px');" +
                "document.documentElement.style.setProperty('--inset-right','0.00px')",
            InsetsCss.script(InsetsCss.sides(84, 42, 0, 0, 2.625f)),
        )
    }
}
