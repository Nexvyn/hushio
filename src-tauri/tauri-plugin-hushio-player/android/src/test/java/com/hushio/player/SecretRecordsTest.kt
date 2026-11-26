package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SecretRecordsTest {

    @Test
    fun onlyKnownKeysAreAccepted() {
        assertTrue(SecretRecords.isKey("google-refresh-token"))
        assertTrue(SecretRecords.isKey("youtube-tv-token"))
        assertFalse(SecretRecords.isKey("google-refresh-token2"))
        assertFalse(SecretRecords.isKey(""))
    }

    @Test
    fun scrobbleAndNetworkKeysAreAccepted() {
        assertTrue(SecretRecords.isKey("spotify-refresh-token"))
        assertTrue(SecretRecords.isKey("lastfm-session"))
        assertTrue(SecretRecords.isKey("lastfm-pending-token"))
        assertTrue(SecretRecords.isKey("listenbrainz-token"))
        assertTrue(SecretRecords.isKey("network-share:0a1b2c3d4e5f6071"))
        assertFalse(SecretRecords.isKey("network-share:"))
        assertFalse(SecretRecords.isKey("network-share:a=b"))
        assertFalse(SecretRecords.isKey("network-share:a\nb"))
        assertFalse(SecretRecords.isKey("lastfm-session2"))
    }

    @Test
    fun roundTripKeepsBase64Padding() {
        val records = mapOf("google-refresh-token" to "YWJj/+ZA==", "youtube-tv-token" to "eHl6")
        assertEquals(records, SecretRecords.parse(SecretRecords.serialize(records)))
    }

    @Test
    fun parseSkipsMalformedAndUnknownLines() {
        val text = "no-separator\n=empty-key\nother=value\ngoogle-refresh-token=abc\n"
        assertEquals(mapOf("google-refresh-token" to "abc"), SecretRecords.parse(text))
    }

    @Test
    fun serializeDropsUnknownKeysAndNewlines() {
        val text = SecretRecords.serialize(
            mapOf("google-refresh-token" to "ok", "other" to "x", "youtube-tv-token" to "a\nb"),
        )
        assertEquals("google-refresh-token=ok\n", text)
    }

    @Test
    fun missingKeyIsNull() {
        assertNull(SecretRecords.parse("").get("google-refresh-token"))
    }
}
