package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Test

class SyncBackoffTest {

    @Test
    fun delayDoublesFrom30SecondsAndStopsAtOneHour() {
        assertEquals(30_000L, SyncBackoff.delayMs(0))
        assertEquals(60_000L, SyncBackoff.delayMs(1))
        assertEquals(120_000L, SyncBackoff.delayMs(2))
        assertEquals(1_920_000L, SyncBackoff.delayMs(6))
        assertEquals(3_600_000L, SyncBackoff.delayMs(7))
        assertEquals(3_600_000L, SyncBackoff.delayMs(40))
    }

    @Test
    fun negativeFailureCountUsesTheFirstDelay() {
        assertEquals(30_000L, SyncBackoff.delayMs(-3))
    }

    @Test
    fun nativeCodesMapToOutcomes() {
        assertEquals(SyncOutcome.DONE, SyncOutcome.fromCode(0))
        assertEquals(SyncOutcome.OFFLINE, SyncOutcome.fromCode(1))
        assertEquals(SyncOutcome.NOT_READY, SyncOutcome.fromCode(2))
        assertEquals(SyncOutcome.NOT_READY, SyncOutcome.fromCode(99))
    }
}
