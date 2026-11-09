package com.hushio.player

import java.io.File

object MediaStoreRows {
    const val MAX_NAME_CHARS = 120
    private const val AUDIO_URI_PREFIX = "content://media/external"

    fun relativePath(appName: String): String = "Music/$appName"

    fun mimeFor(fileName: String): String? = when (fileName.substringAfterLast('.', "").lowercase()) {
        "m4a" -> "audio/mp4"
        "mp3" -> "audio/mpeg"
        "webm" -> "audio/webm"
        else -> null
    }

    fun validDisplayName(name: String): Boolean =
        name.isNotBlank() &&
            name.length <= MAX_NAME_CHARS &&
            !name.contains('/') &&
            !name.contains('\\') &&
            name.none { it.code < 0x20 }

    fun isAudioUri(uri: String): Boolean = uri.startsWith(AUDIO_URI_PREFIX)

    fun isUnder(child: File, root: File): Boolean =
        child.canonicalPath.startsWith(root.canonicalPath + File.separator)
}
