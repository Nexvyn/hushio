package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SleepTimerTest {

    @Test
    fun idleBeforeFadeWindow() {
        val timer = SleepTimer()
        timer.set(100_000L, false)
        assertEquals(SleepStep.Idle, timer.step(60_000L))
        assertTrue(timer.active)
    }

    @Test
    fun fadesInLastTenSeconds() {
        val timer = SleepTimer()
        timer.set(100_000L, false)
        assertEquals(SleepStep.Fading(0.5f), timer.step(95_000L))
    }

    @Test
    fun firesAtZeroAndClears() {
        val timer = SleepTimer()
        timer.set(100_000L, false)
        assertEquals(SleepStep.Fire, timer.step(100_000L))
        assertFalse(timer.active)
        assertEquals(SleepStep.Idle, timer.step(100_001L))
    }

    @Test
    fun volumeFollowsRemainingTime() {
        assertEquals(1f, SleepTimer.volumeFor(10_000L), 0f)
        assertEquals(0.3f, SleepTimer.volumeFor(3_000L), 0.0001f)
        assertEquals(0f, SleepTimer.volumeFor(0L), 0f)
        assertEquals(1f, SleepTimer.volumeFor(25_000L), 0f)
    }

    @Test
    fun endOfSongFlagIsKeptUntilConsumed() {
        val timer = SleepTimer()
        timer.set(null, true)
        assertTrue(timer.endOfSong)
        assertFalse(timer.active)
        timer.endOfSongConsumed()
        assertFalse(timer.endOfSong)
    }

    @Test
    fun clearCancelsEverything() {
        val timer = SleepTimer()
        timer.set(100_000L, true)
        timer.clear()
        assertFalse(timer.active)
        assertFalse(timer.endOfSong)
    }
}
