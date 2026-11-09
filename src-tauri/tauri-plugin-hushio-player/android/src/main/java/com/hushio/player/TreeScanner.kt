package com.hushio.player

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.documentfile.provider.DocumentFile

class TreeScanner(private val context: Context) {

    fun scan(treeUri: String): List<Map<String, Any?>> {
        val root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri)) ?: return emptyList()
        val found = ArrayList<DocumentFile>()
        walk(root, 0, found)
        val rows = found.map { row(it) }
        return AudioRules.sortByTitle(rows, { it["title"] as String }, { it["uri"] as String })
    }

    private fun walk(dir: DocumentFile, depth: Int, out: MutableList<DocumentFile>) {
        if (depth > AudioRules.MAX_DEPTH) return
        for (child in dir.listFiles()) {
            if (out.size >= AudioRules.MAX_ITEMS) return
            if (child.isDirectory) walk(child, depth + 1, out)
            else if (child.isFile && AudioRules.isAudio(child.name.orEmpty(), child.type)) out.add(child)
        }
    }

    private fun row(file: DocumentFile): Map<String, Any?> {
        val name = file.name.orEmpty()
        val (fallbackArtist, fallbackTitle) = AudioRules.fallbackTitle(name)
        val meta = metadata(file.uri)
        return mapOf(
            "uri" to file.uri.toString(),
            "name" to name,
            "size" to file.length(),
            "mtime" to file.lastModified(),
            "title" to (meta.title ?: fallbackTitle),
            "artist" to (meta.artist ?: fallbackArtist),
            "album" to meta.album,
            "genre" to meta.genre,
            "durationMs" to meta.durationMs,
        )
    }

    private data class Meta(
        val title: String?,
        val artist: String?,
        val album: String?,
        val genre: String?,
        val durationMs: Long,
    )

    private fun metadata(uri: Uri): Meta {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(context, uri)
            Meta(
                title = AudioRules.clean(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)),
                artist = AudioRules.clean(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)),
                album = AudioRules.clean(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)),
                genre = AudioRules.clean(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_GENRE)),
                durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L,
            )
        } catch (error: Exception) {
            Meta(null, null, null, null, 0L)
        } finally {
            retriever.release()
        }
    }
}
