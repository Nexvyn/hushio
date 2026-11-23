package com.hushio.player

class QueueMirror<T>(private val capacity: Int = MAX_ITEMS) {
    private val list = ArrayList<T>()

    var current: Int = NONE
        private set

    val items: List<T>
        get() = list.toList()

    val size: Int
        get() = list.size

    fun currentItem(): T? = list.getOrNull(current)

    fun replace(items: List<T>, startIndex: Int): Int {
        val kept = items.take(capacity)
        list.clear()
        list.addAll(kept)
        current = if (kept.isEmpty()) NONE else startIndex.coerceIn(0, kept.lastIndex)
        return kept.size
    }

    fun append(items: List<T>): Int {
        val count = minOf(items.size, capacity - list.size).coerceAtLeast(0)
        list.addAll(items.take(count))
        if (current == NONE && list.isNotEmpty()) current = 0
        return count
    }

    fun insertNext(items: List<T>): Int {
        val count = minOf(items.size, capacity - list.size).coerceAtLeast(0)
        val at = if (current == NONE) 0 else current + 1
        list.addAll(at, items.take(count))
        if (current == NONE && list.isNotEmpty()) current = 0
        return count
    }

    fun removeAt(index: Int): Boolean {
        if (index !in list.indices) return false
        list.removeAt(index)
        current = when {
            list.isEmpty() -> NONE
            index < current -> current - 1
            current >= list.size -> list.lastIndex
            else -> current
        }
        return true
    }

    fun move(from: Int, to: Int): Boolean {
        if (from !in list.indices || to !in list.indices) return false
        list.add(to, list.removeAt(from))
        current = when {
            current == NONE -> current
            current == from -> to
            from < current && to >= current -> current - 1
            from > current && to <= current -> current + 1
            else -> current
        }
        return true
    }

    fun replaceAt(index: Int, item: T): Boolean {
        if (index !in list.indices) return false
        list[index] = item
        return true
    }

    fun setCurrent(index: Int): Boolean {
        if (index !in list.indices) return false
        current = index
        return true
    }

    companion object {
        const val MAX_ITEMS = 5000
        const val NONE = -1
    }
}
