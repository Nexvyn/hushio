package com.hushio.player

object BrowseTree {
    const val ROOT_ID = "[root]"
    const val HOME_ID = "[home]"
    const val LIBRARY_ID = "[library]"
    const val RECENT_ID = "[recent]"
    const val RECENT_LIMIT = 50

    val SECTIONS: List<Pair<String, String>> = listOf(
        HOME_ID to "Home",
        LIBRARY_ID to "Library",
        RECENT_ID to "Recent",
    )

    fun isSection(id: String): Boolean = SECTIONS.any { it.first == id }

    fun songs(section: String, queue: List<QueueItem>, recent: List<QueueItem>): List<QueueItem> =
        when (section) {
            HOME_ID -> queue
            LIBRARY_ID -> queue.filter { it.liked }
            RECENT_ID -> recent
            else -> emptyList()
        }

    fun remember(recent: MutableList<QueueItem>, item: QueueItem) {
        recent.removeAll { it.id == item.id }
        recent.add(0, item)
        while (recent.size > RECENT_LIMIT) recent.removeAt(recent.lastIndex)
    }

    fun resolve(id: String?, queue: List<QueueItem>, recent: List<QueueItem>): QueueItem? {
        if (id == null) return null
        return queue.firstOrNull { it.id == id } ?: recent.firstOrNull { it.id == id }
    }

    fun <T> page(items: List<T>, page: Int, pageSize: Int): List<T> {
        if (page < 0 || pageSize <= 0) return emptyList()
        return items.drop(page * pageSize).take(pageSize)
    }
}
