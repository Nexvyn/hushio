package com.hushio.player

data class QueueItem(
    val id: String,
    val title: String,
    val artist: String,
    val album: String?,
    val artworkUrl: String?,
    val durationMs: Long,
    val url: String?,
    val headers: Map<String, String>,
    val liked: Boolean,
    val contentUri: String?,
    val expiresAtMs: Long? = null,
) {
    fun playbackUri(): String? = contentUri ?: url
}
