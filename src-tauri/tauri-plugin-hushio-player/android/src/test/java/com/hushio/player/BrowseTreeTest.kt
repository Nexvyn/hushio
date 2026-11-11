package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BrowseTreeTest {

    private fun item(id: String, liked: Boolean = false) = QueueItem(
        id = id,
        title = "Title $id",
        artist = "Artist",
        album = null,
        artworkUrl = null,
        durationMs = 1_000L,
        url = "https://example.com/$id",
        headers = emptyMap(),
        liked = liked,
        contentUri = null,
    )

    @Test
    fun rootOffersHomeLibraryAndRecent() {
        assertEquals(
            listOf("Home", "Library", "Recent"),
            BrowseTree.SECTIONS.map { it.second },
        )
        assertEquals(true, BrowseTree.isSection(BrowseTree.RECENT_ID))
        assertEquals(false, BrowseTree.isSection(BrowseTree.ROOT_ID))
    }

    @Test
    fun homeListsTheQueueInOrder() {
        val queue = listOf(item("a"), item("b"))
        assertEquals(queue, BrowseTree.songs(BrowseTree.HOME_ID, queue, emptyList()))
    }

    @Test
    fun libraryListsOnlyLikedSongsFromTheQueue() {
        val queue = listOf(item("a"), item("b", liked = true))
        assertEquals(listOf("b"), BrowseTree.songs(BrowseTree.LIBRARY_ID, queue, emptyList()).map { it.id })
    }

    @Test
    fun recentRemembersNewestFirstWithoutDuplicates() {
        val recent = ArrayList<QueueItem>()
        BrowseTree.remember(recent, item("a"))
        BrowseTree.remember(recent, item("b"))
        BrowseTree.remember(recent, item("a"))
        assertEquals(listOf("a", "b"), recent.map { it.id })
    }

    @Test
    fun recentIsCapped() {
        val recent = ArrayList<QueueItem>()
        for (index in 0 until BrowseTree.RECENT_LIMIT + 5) {
            BrowseTree.remember(recent, item("song-$index"))
        }
        assertEquals(BrowseTree.RECENT_LIMIT, recent.size)
        assertEquals("song-${BrowseTree.RECENT_LIMIT + 4}", recent.first().id)
    }

    @Test
    fun resolveFindsSongsInTheQueueOrInRecent() {
        val queue = listOf(item("a"))
        val recent = listOf(item("old"))
        assertEquals("a", BrowseTree.resolve("a", queue, recent)?.id)
        assertEquals("old", BrowseTree.resolve("old", queue, recent)?.id)
        assertNull(BrowseTree.resolve("missing", queue, recent))
        assertNull(BrowseTree.resolve(null, queue, recent))
    }

    @Test
    fun pagesAreSlicedAndBadInputIsEmpty() {
        val items = (1..5).toList()
        assertEquals(listOf(3, 4), BrowseTree.page(items, 1, 2))
        assertEquals(emptyList<Int>(), BrowseTree.page(items, -1, 2))
        assertEquals(emptyList<Int>(), BrowseTree.page(items, 0, 0))
    }
}
