package com.hushio.player

import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.roundToInt

object EqualizerMapping {
    const val USER_BANDS = 10

    val USER_CENTERS_HZ = doubleArrayOf(32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0)

    fun deviceGainsDb(userGainsDb: DoubleArray, deviceCentersHz: DoubleArray): DoubleArray {
        require(userGainsDb.size == USER_BANDS)
        val sums = DoubleArray(deviceCentersHz.size)
        val counts = IntArray(deviceCentersHz.size)
        userGainsDb.forEachIndexed { index, gain ->
            val target = nearestBand(USER_CENTERS_HZ[index], deviceCentersHz)
            sums[target] += gain
            counts[target]++
        }
        return DoubleArray(deviceCentersHz.size) { if (counts[it] == 0) 0.0 else sums[it] / counts[it] }
    }

    fun headroomDb(deviceGainsDb: DoubleArray): Double =
        max(0.0, deviceGainsDb.maxOrNull() ?: 0.0)

    fun millibels(gainDb: Double, range: IntRange): Int =
        (gainDb * 100).roundToInt().coerceIn(range)

    private fun nearestBand(hz: Double, centersHz: DoubleArray): Int {
        var best = 0
        var bestDistance = Double.MAX_VALUE
        centersHz.forEachIndexed { band, center ->
            val distance = abs(ln(hz) - ln(center))
            if (distance < bestDistance) {
                best = band
                bestDistance = distance
            }
        }
        return best
    }
}
