package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetStateTest {

    @Test
    fun playingTrackShowsPauseAction() {
        val view = WidgetState.view("  Song  ", " Artist ", playing = true)
        assertEquals(WidgetView("Song", "Artist", WidgetAction.PAUSE), view)
    }

    @Test
    fun pausedTrackShowsPlayAction() {
        assertEquals(WidgetAction.PLAY, WidgetState.view("Song", "Artist", playing = false).action)
    }

    @Test
    fun missingArtistLeavesSubtitleEmpty() {
        assertEquals("", WidgetState.view("Song", null, playing = false).subtitle)
    }

    @Test
    fun noTrackShowsEmptyStateThatOpensTheApp() {
        val view = WidgetState.view("   ", "Artist", playing = true)
        assertEquals(WidgetState.EMPTY_TITLE, view.title)
        assertEquals(WidgetState.EMPTY_SUBTITLE, view.subtitle)
        assertEquals(WidgetAction.OPEN, view.action)
    }

    @Test
    fun nullTrackShowsEmptyState() {
        assertEquals(WidgetAction.OPEN, WidgetState.view(null, null, playing = false).action)
    }
}
