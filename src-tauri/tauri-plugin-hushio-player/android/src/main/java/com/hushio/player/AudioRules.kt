package com.hushio.player

import java.net.URLDecoder

object AudioRules {
    const val MAX_ITEMS = 5000
    const val MAX_DEPTH = 8
    private const val TREE_MARK = "/tree/"
    private const val DOCUMENT_MARK = "/document/"
    private const val URI_SAFE = "_-!.~'()*"
    private val LRC_EXTENSIONS = listOf("lrc", "LRC")
    private val EXTENSIONS = setOf("mp3", "m4a", "aac", "flac", "ogg", "oga", "opus", "wav", "webm")
    private val PLAYLISTS = setOf("m3u", "m3u8", "pls")

    fun isTreeUri(uri: String): Boolean = uri.startsWith("content://") && uri.contains(TREE_MARK)

    fun sidecarLrcUris(documentUri: String): List<String> {
        if (!documentUri.startsWith("content://") || !documentUri.contains(DOCUMENT_MARK)) return emptyList()
        val treePart = documentUri.substringBefore(DOCUMENT_MARK)
        val id = try {
            URLDecoder.decode(documentUri.substringAfter(DOCUMENT_MARK).replace("+", "%2B"), "UTF-8")
        } catch (error: IllegalArgumentException) {
            return emptyList()
        }
        val name = id.substringAfterLast('/')
        if (name.isEmpty()) return emptyList()
        val folder = id.substringBeforeLast('/', "")
        val folderPrefix = if (folder.isEmpty()) "" else "$folder/"
        val dot = name.lastIndexOf('.')
        val stem = if (dot > 0) name.substring(0, dot) else name
        return LRC_EXTENSIONS.map { extension ->
            "$treePart$DOCUMENT_MARK${encodeDocumentId("$folderPrefix$stem.$extension")}"
        }
    }

    private fun encodeDocumentId(value: String): String = buildString {
        for (byte in value.toByteArray(Charsets.UTF_8)) {
            val code = byte.toInt() and 0xFF
            val char = code.toChar()
            if (code < 128 && char.isLetterOrDigit() || char in URI_SAFE) append(char) else append("%%%02X".format(code))
        }
    }

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
