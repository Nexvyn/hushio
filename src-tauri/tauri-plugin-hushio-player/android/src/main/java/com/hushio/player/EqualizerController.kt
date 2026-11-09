package com.hushio.player

import android.media.audiofx.Equalizer

class EqualizerController private constructor(sessionId: Int) {
    private val equalizer = Equalizer(0, sessionId)
    private val range: IntRange
    private val centersHz: DoubleArray

    val bandCount: Int = equalizer.numberOfBands.toInt()

    init {
        val levels = equalizer.bandLevelRange
        range = levels[0].toInt()..levels[1].toInt()
        centersHz = DoubleArray(bandCount) { equalizer.getCenterFreq(it.toShort()) / 1000.0 }
    }

    fun apply(enabled: Boolean, userGainsDb: DoubleArray): Double {
        val deviceGains = EqualizerMapping.deviceGainsDb(userGainsDb, centersHz)
        deviceGains.forEachIndexed { band, gain ->
            equalizer.setBandLevel(band.toShort(), EqualizerMapping.millibels(gain, range).toShort())
        }
        equalizer.enabled = enabled
        return if (enabled) EqualizerMapping.headroomDb(deviceGains) else 0.0
    }

    fun release() {
        equalizer.release()
    }

    companion object {
        fun create(sessionId: Int): EqualizerController? =
            try {
                EqualizerController(sessionId)
            } catch (error: RuntimeException) {
                null
            }
    }
}
