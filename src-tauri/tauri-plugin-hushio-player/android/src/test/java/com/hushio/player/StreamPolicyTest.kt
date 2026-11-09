package com.hushio.player

import androidx.media3.common.PlaybackException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StreamPolicyTest {

    @Test
    fun retryWaitsOneTwoAndFourSeconds() {
        val retry = RetryPolicy()
        assertEquals(1_000L, retry.next())
        assertEquals(2_000L, retry.next())
        assertEquals(4_000L, retry.next())
        assertNull(retry.next())
    }

    @Test
    fun resetStartsTheScheduleAgain() {
        val retry = RetryPolicy()
        retry.next()
        retry.next()
        retry.reset()
        assertEquals(1_000L, retry.next())
    }

    @Test
    fun missingUrlIsNeverRetried() {
        assertEquals(
            StreamFailure.MISSING,
            StreamPolicy.classify(PlaybackException.ERROR_CODE_IO_UNSPECIFIED, 0, hasUrl = false, isContent = false),
        )
    }

    @Test
    fun http403AsksForAFreshUrl() {
        assertEquals(
            StreamFailure.FORBIDDEN,
            StreamPolicy.classify(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, 403, hasUrl = true, isContent = false),
        )
    }

    @Test
    fun serverErrorsAndNetworkErrorsRetry() {
        assertEquals(
            StreamFailure.RETRY,
            StreamPolicy.classify(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, 503, hasUrl = true, isContent = false),
        )
        assertEquals(
            StreamFailure.RETRY,
            StreamPolicy.classify(
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                0,
                hasUrl = true,
                isContent = false,
            ),
        )
        assertEquals(
            StreamFailure.RETRY,
            StreamPolicy.classify(
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
                0,
                hasUrl = true,
                isContent = false,
            ),
        )
    }

    @Test
    fun notFoundOverHttpIsFatal() {
        assertEquals(
            StreamFailure.FATAL,
            StreamPolicy.classify(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, 404, hasUrl = true, isContent = false),
        )
    }

    @Test
    fun missingLocalFileIsReportedWithoutRetry() {
        assertEquals(
            StreamFailure.FILE_MISSING,
            StreamPolicy.classify(PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND, 0, hasUrl = true, isContent = true),
        )
        assertEquals(
            StreamFailure.FATAL,
            StreamPolicy.classify(
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                0,
                hasUrl = true,
                isContent = true,
            ),
        )
    }

    @Test
    fun expiryNeedsAKnownExpiryInThePast() {
        assertFalse(StreamPolicy.isExpired(null, 1_000L))
        assertFalse(StreamPolicy.isExpired(2_000L, 1_999L))
        assertTrue(StreamPolicy.isExpired(2_000L, 2_000L))
    }
}
