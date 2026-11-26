package com.hushio.player

import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player

internal const val RESTART_AFTER_MS = 3_000L

internal class ActionPlayer(
    player: Player,
    private val emit: (String) -> Unit,
) : ForwardingPlayer(player) {

    override fun getAvailableCommands(): Player.Commands =
        super.getAvailableCommands().buildUpon().addAll(*ACTION_COMMANDS).build()

    override fun isCommandAvailable(command: Int): Boolean =
        command in ACTION_COMMANDS || super.isCommandAvailable(command)

    override fun play() {
        emit("play")
        super.play()
    }

    override fun setPlayWhenReady(playWhenReady: Boolean) {
        if (playWhenReady) emit("play")
        super.setPlayWhenReady(playWhenReady)
    }

    override fun seekToNext() = emit("next")

    override fun seekToNextMediaItem() = emit("next")

    override fun seekToPrevious() = previousOrRestart()

    override fun seekToPreviousMediaItem() = previousOrRestart()

    private fun previousOrRestart() {
        if (currentPosition > RESTART_AFTER_MS) seekTo(0) else emit("previous")
    }

    companion object {
        val ACTION_COMMANDS = intArrayOf(
            Player.COMMAND_SEEK_TO_NEXT,
            Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
            Player.COMMAND_SEEK_TO_PREVIOUS,
            Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
        )
    }
}
