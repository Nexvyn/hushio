package com.hushio.player

import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BridgeEdgeTest {

    private fun item(url: String?, contentUri: String?) = QueueItem(
        id = "id",
        title = "t",
        artist = "a",
        album = null,
        artworkUrl = null,
        durationMs = 1_000L,
        url = url,
        headers = emptyMap(),
        liked = false,
        contentUri = contentUri,
    )

    private fun httpKind(status: Int) = StreamPolicy.classify(
        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
        status,
        hasUrl = true,
        isContent = false,
    )

    @Test
    fun playbackUriPrefersContentUriOverUrl() {
        assertEquals("content://media/1", item("https://x/a", "content://media/1").playbackUri())
    }

    @Test
    fun playbackUriFallsBackToUrlThenNull() {
        assertEquals("https://x/a", item("https://x/a", null).playbackUri())
        assertNull(item(null, null).playbackUri())
    }

    @Test
    fun expiryIsUnsetUnlessGiven() {
        assertNull(item("https://x/a", null).expiresAtMs)
    }

    @Test
    fun negativePositionIsReportedAsZero() {
        val payload = PlayerSnapshot(
            playing = false,
            buffering = false,
            positionMs = -5L,
            durationMs = 2_000L,
            index = 0,
            id = "x",
            speed = 1f,
            repeatMode = Player.REPEAT_MODE_OFF,
            shuffle = false,
        ).toPayload()
        assertEquals(0L, payload["positionMs"])
        assertEquals(2_000L, payload["durationMs"])
    }

    @Test
    fun serverStatusRetriesOnlyInside500To599() {
        assertEquals(StreamFailure.FATAL, httpKind(499))
        assertEquals(StreamFailure.RETRY, httpKind(500))
        assertEquals(StreamFailure.RETRY, httpKind(599))
        assertEquals(StreamFailure.FATAL, httpKind(600))
    }

    @Test
    fun localContentNeverRetriesOrAsksForUrl() {
        assertEquals(
            StreamFailure.FATAL,
            StreamPolicy.classify(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, 403, hasUrl = true, isContent = true),
        )
        assertEquals(
            StreamFailure.FATAL,
            StreamPolicy.classify(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, 503, hasUrl = true, isContent = true),
        )
    }

    @Test
    fun missingUrlWinsOverLocalFileState() {
        assertEquals(
            StreamFailure.MISSING,
            StreamPolicy.classify(PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND, 0, hasUrl = false, isContent = true),
        )
    }

    @Test
    fun exhaustedRetryStaysExhaustedUntilReset() {
        val retry = RetryPolicy()
        repeat(3) { retry.next() }
        assertNull(retry.next())
        assertNull(retry.next())
        retry.reset()
        assertEquals(1_000L, retry.next())
    }
}
