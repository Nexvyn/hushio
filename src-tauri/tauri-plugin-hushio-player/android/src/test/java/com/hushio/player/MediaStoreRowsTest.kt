package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MediaStoreRowsTest {

    @Test
    fun mimeTypesFollowTheExtension() {
        assertEquals("audio/mp4", MediaStoreRows.mimeFor("Artist - Song.m4a"))
        assertEquals("audio/mpeg", MediaStoreRows.mimeFor("track.MP3"))
        assertEquals("audio/webm", MediaStoreRows.mimeFor("track.webm"))
        assertNull(MediaStoreRows.mimeFor("notes.txt"))
        assertNull(MediaStoreRows.mimeFor("noextension"))
    }

    @Test
    fun relativePathIsTheMusicFolderOfTheApp() {
        assertEquals("Music/Hushio", MediaStoreRows.relativePath("Hushio"))
    }

    @Test
    fun displayNamesRejectPathsControlsAndLength() {
        assertTrue(MediaStoreRows.validDisplayName("Artist - Song.m4a"))
        assertFalse(MediaStoreRows.validDisplayName("  "))
        assertFalse(MediaStoreRows.validDisplayName("a/b.m4a"))
        assertFalse(MediaStoreRows.validDisplayName("a\\b.m4a"))
        assertFalse(MediaStoreRows.validDisplayName("a\u0001.m4a"))
        assertFalse(MediaStoreRows.validDisplayName("x".repeat(MediaStoreRows.MAX_NAME_CHARS + 1)))
    }

    @Test
    fun onlyExternalAudioUrisAreDeletable() {
        assertTrue(MediaStoreRows.isAudioUri("content://media/external/audio/media/42"))
        assertFalse(MediaStoreRows.isAudioUri("content://com.evil/secret"))
        assertFalse(MediaStoreRows.isAudioUri("file:///data/data/x"))
    }

    @Test
    fun sourceMustBeInsideTheRoot() {
        val root = File(System.getProperty("java.io.tmpdir"), "hushio-cache-test").apply { mkdirs() }
        val inside = File(root, "part.m4a")
        assertTrue(MediaStoreRows.isUnder(inside, root))
        assertFalse(MediaStoreRows.isUnder(File(root.parentFile, "outside.m4a"), root))
        assertFalse(MediaStoreRows.isUnder(File(root.path + "2", "x.m4a"), root))
    }
}
