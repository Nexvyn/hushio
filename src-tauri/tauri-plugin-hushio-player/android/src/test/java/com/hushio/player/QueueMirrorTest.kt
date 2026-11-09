package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QueueMirrorTest {

    @Test
    fun replaceSetsItemsAndClampsStartIndex() {
        val queue = QueueMirror<String>()
        assertEquals(3, queue.replace(listOf("a", "b", "c"), 9))
        assertEquals(2, queue.current)
        assertEquals("c", queue.currentItem())
    }

    @Test
    fun replaceCapsAtMaxItems() {
        val queue = QueueMirror<Int>()
        val accepted = queue.replace((1..600).toList(), 0)
        assertEquals(QueueMirror.MAX_ITEMS, accepted)
        assertEquals(QueueMirror.MAX_ITEMS, queue.size)
    }

    @Test
    fun appendRespectsCapacity() {
        val queue = QueueMirror<Int>(capacity = 4)
        queue.replace(listOf(1, 2), 0)
        assertEquals(2, queue.append(listOf(3, 4, 5, 6)))
        assertEquals(listOf(1, 2, 3, 4), queue.items)
        assertEquals(0, queue.current)
    }

    @Test
    fun insertNextPutsItemsAfterCurrent() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 1)
        assertEquals(2, queue.insertNext(listOf("x", "y")))
        assertEquals(listOf("a", "b", "x", "y", "c"), queue.items)
        assertEquals(1, queue.current)
    }

    @Test
    fun insertNextIntoEmptyQueueStartsAtZero() {
        val queue = QueueMirror<String>()
        assertEquals(1, queue.insertNext(listOf("x")))
        assertEquals(0, queue.current)
        assertEquals(listOf("x"), queue.items)
    }

    @Test
    fun removeBeforeCurrentMovesCurrentBack() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 2)
        assertTrue(queue.removeAt(0))
        assertEquals(1, queue.current)
        assertEquals("c", queue.currentItem())
    }

    @Test
    fun removeCurrentKeepsIndexAndClampsAtEnd() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b"), 1)
        assertTrue(queue.removeAt(1))
        assertEquals(0, queue.current)
        assertEquals("a", queue.currentItem())
    }

    @Test
    fun removeLastItemEmptiesQueue() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a"), 0)
        assertTrue(queue.removeAt(0))
        assertEquals(QueueMirror.NONE, queue.current)
        assertFalse(queue.removeAt(0))
    }

    @Test
    fun moveForwardPastCurrentShiftsCurrentBack() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 1)
        assertTrue(queue.move(0, 2))
        assertEquals(listOf("b", "c", "a"), queue.items)
        assertEquals(0, queue.current)
    }

    @Test
    fun moveBackPastCurrentShiftsCurrentForward() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 1)
        assertTrue(queue.move(2, 0))
        assertEquals(listOf("c", "a", "b"), queue.items)
        assertEquals(2, queue.current)
    }

    @Test
    fun moveCurrentFollowsTheItem() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 0)
        assertTrue(queue.move(0, 2))
        assertEquals(2, queue.current)
        assertEquals("a", queue.currentItem())
    }

    @Test
    fun invalidIndicesAreRejected() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a"), 0)
        assertFalse(queue.move(0, 3))
        assertFalse(queue.setCurrent(-1))
        assertFalse(queue.removeAt(5))
        assertEquals(0, queue.current)
    }
}
