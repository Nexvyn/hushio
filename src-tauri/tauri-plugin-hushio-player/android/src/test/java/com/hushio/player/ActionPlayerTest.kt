package com.hushio.player

import androidx.media3.common.Player
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ActionPlayerTest {

    private class Recorder(var position: Long = 0L) : InvocationHandler {
        val calls = mutableListOf<String>()
        val seeks = mutableListOf<Long>()

        override fun invoke(proxy: Any, method: Method, args: Array<out Any?>?): Any? {
            calls += method.name
            if (method.name == "seekTo" && args != null) seeks += args[0] as Long
            return when (method.returnType) {
                java.lang.Long.TYPE -> if (method.name == "getCurrentPosition") position else 0L
                java.lang.Boolean.TYPE -> false
                java.lang.Integer.TYPE -> 0
                else -> null
            }
        }
    }

    private fun wrap(recorder: Recorder, emitted: MutableList<String>): ActionPlayer {
        val player = Proxy.newProxyInstance(
            Player::class.java.classLoader,
            arrayOf<Class<*>>(Player::class.java),
            recorder,
        ) as Player
        return ActionPlayer(player) { emitted += it }
    }

    @Test
    fun nextButtonsEmitNextWithoutMovingThePlayer() {
        val recorder = Recorder()
        val emitted = mutableListOf<String>()
        val player = wrap(recorder, emitted)

        player.seekToNext()
        player.seekToNextMediaItem()

        assertEquals(listOf("next", "next"), emitted)
        assertTrue(recorder.seeks.isEmpty())
    }

    @Test
    fun previousNearTheStartEmitsPreviousAndKeepsThePosition() {
        val recorder = Recorder(position = RESTART_AFTER_MS)
        val emitted = mutableListOf<String>()
        val player = wrap(recorder, emitted)

        player.seekToPrevious()

        assertEquals(listOf("previous"), emitted)
        assertTrue(recorder.seeks.isEmpty())
    }

    @Test
    fun previousPastTheThresholdRestartsTheTrack() {
        val recorder = Recorder(position = RESTART_AFTER_MS + 1)
        val emitted = mutableListOf<String>()
        val player = wrap(recorder, emitted)

        player.seekToPreviousMediaItem()

        assertTrue(emitted.isEmpty())
        assertEquals(listOf(0L), recorder.seeks)
    }

    @Test
    fun playAndResumeEmitPlay() {
        val recorder = Recorder()
        val emitted = mutableListOf<String>()
        val player = wrap(recorder, emitted)

        player.play()
        player.playWhenReady = true
        player.playWhenReady = false

        assertEquals(listOf("play", "play"), emitted)
        assertTrue(recorder.calls.contains("play"))
    }

    @Test
    fun actionCommandsAreAdvertisedEvenWhenTheWrappedPlayerLacksThem() {
        val emitted = mutableListOf<String>()
        val player = wrap(Recorder(), emitted)

        for (command in ActionPlayer.ACTION_COMMANDS) {
            assertTrue(player.isCommandAvailable(command))
        }
    }
}
