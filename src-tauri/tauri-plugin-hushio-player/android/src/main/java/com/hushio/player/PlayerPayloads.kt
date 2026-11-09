package com.hushio.player

import androidx.media3.common.Player

data class PlayerSnapshot(
    val playing: Boolean,
    val buffering: Boolean,
    val positionMs: Long,
    val durationMs: Long,
    val index: Int,
    val id: String?,
    val speed: Float,
    val repeatMode: Int,
    val shuffle: Boolean,
) {
    fun toPayload(): Map<String, Any?> = mapOf(
        "playing" to playing,
        "buffering" to buffering,
        "positionMs" to positionMs.coerceAtLeast(0L),
        "durationMs" to durationMs.coerceAtLeast(0L),
        "index" to index,
        "id" to id,
        "speed" to speed.toDouble(),
        "repeat" to PlayerPayloads.repeatName(repeatMode),
        "shuffle" to shuffle,
    )
}

object PlayerPayloads {
    fun repeatName(mode: Int): String = when (mode) {
        Player.REPEAT_MODE_ALL -> "all"
        Player.REPEAT_MODE_ONE -> "one"
        else -> "off"
    }

    fun repeatMode(name: String): Int = when (name) {
        "all" -> Player.REPEAT_MODE_ALL
        "one" -> Player.REPEAT_MODE_ONE
        else -> Player.REPEAT_MODE_OFF
    }

    fun trackReason(transition: Int, afterError: Boolean): String = when {
        afterError -> "error"
        transition == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO ||
            transition == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT -> "auto"
        else -> "user"
    }
}
