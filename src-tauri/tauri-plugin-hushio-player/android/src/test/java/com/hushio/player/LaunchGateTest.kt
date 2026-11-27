package com.hushio.player

import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class LaunchGateTest {

    @Before
    fun reset() {
        LaunchGate.ready = false
    }

    @After
    fun clear() {
        LaunchGate.ready = false
    }

    @Test
    fun holdsUntilTheWebUiIsReady() {
        assertTrue(LaunchGate.keepOnScreen(1_000L, 1_500L))
    }

    @Test
    fun releasesOnceReady() {
        LaunchGate.markReady()
        assertFalse(LaunchGate.keepOnScreen(1_000L, 1_500L))
    }

    @Test
    fun releasesAfterTimeoutEvenIfNotReady() {
        assertTrue(LaunchGate.keepOnScreen(1_000L, 3_999L))
        assertFalse(LaunchGate.keepOnScreen(1_000L, 4_000L))
    }
}
