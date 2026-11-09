package com.hushio.player

import androidx.media3.common.Player
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlayerPayloadsTest {

    @Test
    fun repeatNamesRoundTrip() {
        for (name in listOf("off", "all", "one")) {
            assertEquals(name, PlayerPayloads.repeatName(PlayerPayloads.repeatMode(name)))
        }
        assertEquals(Player.REPEAT_MODE_OFF, PlayerPayloads.repeatMode("unknown"))
    }

    @Test
    fun automaticAndRepeatTransitionsAreAuto() {
        assertEquals("auto", PlayerPayloads.trackReason(Player.MEDIA_ITEM_TRANSITION_REASON_AUTO, afterError = false))
        assertEquals("auto", PlayerPayloads.trackReason(Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT, afterError = false))
    }

    @Test
    fun seekAndPlaylistChangesAreUser() {
        assertEquals("user", PlayerPayloads.trackReason(Player.MEDIA_ITEM_TRANSITION_REASON_SEEK, afterError = false))
        assertEquals(
            "user",
            PlayerPayloads.trackReason(Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED, afterError = false),
        )
    }

    @Test
    fun skippingAFailedItemIsError() {
        assertEquals("error", PlayerPayloads.trackReason(Player.MEDIA_ITEM_TRANSITION_REASON_SEEK, afterError = true))
    }

    @Test
    fun snapshotPayloadClampsUnsetDurationAndKeepsNullId() {
        val payload = PlayerSnapshot(
            playing = true,
            buffering = false,
            positionMs = 1_500L,
            durationMs = -9_223_372_036_854_775_807L,
            index = 2,
            id = null,
            speed = 1.5f,
            repeatMode = Player.REPEAT_MODE_ONE,
            shuffle = true,
        ).toPayload()
        assertEquals(true, payload["playing"])
        assertEquals(1_500L, payload["positionMs"])
        assertEquals(0L, payload["durationMs"])
        assertEquals(2, payload["index"])
        assertNull(payload["id"])
        assertEquals(1.5, payload["speed"])
        assertEquals("one", payload["repeat"])
        assertEquals(true, payload["shuffle"])
    }
}
