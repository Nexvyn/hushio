package com.hushio.player

object AudioRules {
    const val MAX_ITEMS = 5000
    const val MAX_DEPTH = 8
    private const val TREE_MARK = "/tree/"
    private val EXTENSIONS = setOf("mp3", "m4a", "aac", "flac", "ogg", "oga", "opus", "wav", "webm")
    private val PLAYLISTS = setOf("m3u", "m3u8", "pls")

    fun isTreeUri(uri: String): Boolean = uri.startsWith("content://") && uri.contains(TREE_MARK)

    fun extension(name: String): String {
        val dot = name.lastIndexOf('.')
        return if (dot < 0) "" else name.substring(dot + 1).lowercase()
    }

    fun isAudio(name: String, mime: String?): Boolean {
        if (extension(name) in PLAYLISTS) return false
        return mime?.startsWith("audio/") == true || extension(name) in EXTENSIONS
    }

    fun clean(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }

    fun fallbackTitle(name: String): Pair<String?, String> {
        val base = if (name.lastIndexOf('.') > 0) name.substring(0, name.lastIndexOf('.')) else name
        val parts = base.split(" - ", limit = 2)
        val title = clean(base) ?: name
        return if (parts.size == 2 && clean(parts[0]) != null && clean(parts[1]) != null) {
            Pair(parts[0].trim(), parts[1].trim())
        } else {
            Pair(null, title)
        }
    }

    fun <T> sortByTitle(items: List<T>, title: (T) -> String, uri: (T) -> String): List<T> =
        items.sortedWith(compareBy<T>({ title(it).lowercase() }, { uri(it) }))
}
