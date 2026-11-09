package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioRulesTest {

    @Test
    fun treeUrisAreOnlyContentTreeUris() {
        assertTrue(AudioRules.isTreeUri("content://com.android.externalstorage.documents/tree/primary%3AMusic"))
        assertFalse(AudioRules.isTreeUri("content://com.android.externalstorage.documents/document/primary%3AMusic"))
        assertFalse(AudioRules.isTreeUri("file:///storage/emulated/0/tree/x"))
    }

    @Test
    fun audioFilterUsesMimeOrExtension() {
        assertTrue(AudioRules.isAudio("song.bin", "audio/flac"))
        assertTrue(AudioRules.isAudio("Song.MP3", null))
        assertTrue(AudioRules.isAudio("song.opus", "application/octet-stream"))
        assertFalse(AudioRules.isAudio("cover.jpg", "image/jpeg"))
        assertFalse(AudioRules.isAudio("list.m3u", "audio/x-mpegurl"))
        assertFalse(AudioRules.isAudio("notes", null))
    }

    @Test
    fun fallbackTitleSplitsArtistAndTitle() {
        assertEquals(Pair<String?, String>("The Band", "Blue Song"), AudioRules.fallbackTitle("The Band - Blue Song.m4a"))
        assertEquals(Pair<String?, String>(null, "Blue Song"), AudioRules.fallbackTitle("Blue Song.m4a"))
        assertEquals(Pair<String?, String>(null, "A -"), AudioRules.fallbackTitle("A - .mp3"))
        assertEquals(Pair<String?, String>(null, "noext"), AudioRules.fallbackTitle("noext"))
    }

    @Test
    fun cleanTurnsBlanksIntoNull() {
        assertNull(AudioRules.clean("   "))
        assertNull(AudioRules.clean(null))
        assertEquals("Song", AudioRules.clean("  Song "))
    }

    @Test
    fun sortIsByTitleIgnoringCaseThenUri() {
        val rows = listOf("b|Zed", "a|apple", "c|Apple")
        val sorted = AudioRules.sortByTitle(rows, { it.split("|")[1] }, { it.split("|")[0] })
        assertEquals(listOf("a|apple", "c|Apple", "b|Zed"), sorted)
    }
}
