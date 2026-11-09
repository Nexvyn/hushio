package com.hushio.player

enum class WidgetAction { PLAY, PAUSE, OPEN }

data class WidgetView(val title: String, val subtitle: String, val action: WidgetAction)

object WidgetState {
    const val EMPTY_TITLE = "Nothing playing"
    const val EMPTY_SUBTITLE = "Open Hushio to start music"

    fun view(title: String?, artist: String?, playing: Boolean): WidgetView {
        if (title.isNullOrBlank()) return WidgetView(EMPTY_TITLE, EMPTY_SUBTITLE, WidgetAction.OPEN)
        val action = if (playing) WidgetAction.PAUSE else WidgetAction.PLAY
        return WidgetView(title.trim(), artist?.trim().orEmpty(), action)
    }
}
