package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Test

class EqualizerMappingTest {

    private val device = doubleArrayOf(60.0, 230.0, 910.0, 3600.0, 14000.0)

    @Test
    fun userBandMapsToNearestDeviceBandInLogFrequency() {
        val gains = DoubleArray(10) { 0.0 }
        gains[5] = 4.0
        val mapped = EqualizerMapping.deviceGainsDb(gains, device)
        assertEquals(2.0, mapped[2], 0.0001)
        assertEquals(0.0, mapped[0], 0.0001)
        assertEquals(0.0, mapped[4], 0.0001)
    }

    @Test
    fun userBandsSharingADeviceBandAreAveraged() {
        val gains = DoubleArray(10) { 0.0 }
        gains[4] = 2.0
        gains[5] = 6.0
        val mapped = EqualizerMapping.deviceGainsDb(gains, device)
        assertEquals(4.0, mapped[2], 0.0001)
    }

    @Test
    fun headroomIsTheStrongestPositiveBand() {
        assertEquals(3.0, EqualizerMapping.headroomDb(doubleArrayOf(-2.0, 3.0, 1.0)), 0.0001)
        assertEquals(0.0, EqualizerMapping.headroomDb(doubleArrayOf(-2.0, -1.0)), 0.0001)
    }

    @Test
    fun gainsConvertToClampedMillibels() {
        assertEquals(550, EqualizerMapping.millibels(5.5, -1500..1500))
        assertEquals(1500, EqualizerMapping.millibels(40.0, -1500..1500))
        assertEquals(-1500, EqualizerMapping.millibels(-20.0, -1500..1500))
    }
}
