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
