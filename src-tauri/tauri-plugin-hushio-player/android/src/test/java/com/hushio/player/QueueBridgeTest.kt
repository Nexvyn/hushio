package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QueueBridgeTest {

    @Test
    fun appendAddsAfterTailAndKeepsCurrent() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 1)
        assertEquals(2, queue.append(listOf("d", "e")))
        assertEquals(listOf("a", "b", "c", "d", "e"), queue.items)
        assertEquals(1, queue.current)
        assertEquals("b", queue.currentItem())
    }

    @Test
    fun appendIntoEmptyQueueStartsAtZero() {
        val queue = QueueMirror<String>()
        assertEquals(1, queue.append(listOf("x")))
        assertEquals(0, queue.current)
        assertEquals("x", queue.currentItem())
    }

    @Test
    fun insertNextAtLastItemAppendsAndKeepsCurrent() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b"), 1)
        assertEquals(2, queue.insertNext(listOf("x", "y")))
        assertEquals(listOf("a", "b", "x", "y"), queue.items)
        assertEquals(1, queue.current)
        assertEquals("b", queue.currentItem())
    }

    @Test
    fun removeCurrentInMiddleMovesIndexToNextItem() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 1)
        assertTrue(queue.removeAt(1))
        assertEquals(1, queue.current)
        assertEquals("c", queue.currentItem())
    }

    @Test
    fun removeAfterCurrentLeavesCurrentAlone() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 0)
        assertTrue(queue.removeAt(2))
        assertEquals(0, queue.current)
        assertEquals("a", queue.currentItem())
        assertEquals(listOf("a", "b"), queue.items)
    }

    @Test
    fun moveToSameIndexChangesNothing() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 1)
        assertTrue(queue.move(1, 1))
        assertEquals(listOf("a", "b", "c"), queue.items)
        assertEquals(1, queue.current)
    }

    @Test
    fun moveAfterCurrentDoesNotShiftCurrent() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c", "d"), 0)
        assertTrue(queue.move(3, 1))
        assertEquals(listOf("a", "d", "b", "c"), queue.items)
        assertEquals(0, queue.current)
        assertEquals("a", queue.currentItem())
    }

    @Test
    fun mirrorRefusesItemOverMaxItems() {
        val queue = QueueMirror<Int>()
        assertEquals(QueueMirror.MAX_ITEMS, queue.replace((1..501).toList(), 0))
        assertEquals(QueueMirror.MAX_ITEMS, queue.items.last())
        assertEquals(0, queue.append(listOf(502)))
        assertEquals(0, queue.insertNext(listOf(503)))
        assertEquals(QueueMirror.MAX_ITEMS, queue.size)
    }

    @Test
    fun insertAndAppendStopAtCapacityMidway() {
        val queue = QueueMirror<Int>()
        queue.replace((1..498).toList(), 0)
        assertEquals(2, queue.insertNext(listOf(-1, -2, -3)))
        assertEquals(listOf(-1, -2), queue.items.subList(1, 3))
        assertEquals(0, queue.append(listOf(499)))
        assertEquals(QueueMirror.MAX_ITEMS, queue.size)
        assertFalse(queue.items.contains(499))
    }

    @Test
    fun replaceAt499ThenAppendAndInsertFillToExactly500() {
        val queue = QueueMirror<Int>()
        queue.replace((1..499).toList(), 0)
        assertEquals(1, queue.append(listOf(500, 501)))
        assertEquals(0, queue.insertNext(listOf(-1)))
        assertEquals(QueueMirror.MAX_ITEMS, queue.size)
        assertEquals(500, queue.items.last())
    }

    @Test
    fun removingOneFromFullQueueReopensOneSlot() {
        val queue = QueueMirror<Int>()
        queue.replace((1..500).toList(), 499)
        assertTrue(queue.removeAt(0))
        assertEquals(500, queue.currentItem())
        assertEquals(1, queue.append(listOf(900, 901)))
        assertEquals(QueueMirror.MAX_ITEMS, queue.size)
        assertEquals(900, queue.items.last())
    }

    @Test
    fun moveWithNegativeOrOutOfRangeIndexLeavesQueueUntouched() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 1)
        assertFalse(queue.move(-1, 0))
        assertFalse(queue.move(0, -1))
        assertFalse(queue.move(3, 0))
        assertFalse(queue.move(0, 3))
        assertEquals(listOf("a", "b", "c"), queue.items)
        assertEquals(1, queue.current)
    }

    @Test
    fun movingCurrentToEitherEndKeepsItCurrent() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 1)
        assertTrue(queue.move(1, 0))
        assertEquals(listOf("b", "a", "c"), queue.items)
        assertEquals(0, queue.current)
        assertTrue(queue.move(0, 2))
        assertEquals(listOf("a", "c", "b"), queue.items)
        assertEquals(2, queue.current)
        assertEquals("b", queue.currentItem())
    }

    @Test
    fun removingEveryItemResetsCurrentToNone() {
        val queue = QueueMirror<String>()
        queue.replace(listOf("a", "b", "c"), 2)
        assertTrue(queue.removeAt(2))
        assertEquals(1, queue.current)
        assertTrue(queue.removeAt(1))
        assertEquals(0, queue.current)
        assertTrue(queue.removeAt(0))
        assertEquals(QueueMirror.NONE, queue.current)
        assertNull(queue.currentItem())
        assertEquals(1, queue.append(listOf("x")))
        assertEquals(0, queue.current)
    }

    @Test
    fun playerEventReachesSinkOnce() {
        val received = mutableListOf<Pair<String, Map<String, Any?>>>()
        PlayerEvents.sink = { name, payload -> received.add(name to payload) }
        try {
            PlayerEvents.emit("player-state", mapOf("positionMs" to 1_000L))
            assertEquals(listOf("player-state" to mapOf("positionMs" to 1_000L)), received)
        } finally {
            PlayerEvents.sink = null
        }
    }
}
