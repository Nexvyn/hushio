package com.hushio.player

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews

object WidgetRender {
    const val ACTION_TOGGLE = "com.hushio.player.widget.TOGGLE"
    const val ACTION_PREVIOUS = "com.hushio.player.widget.PREVIOUS"
    const val ACTION_NEXT = "com.hushio.player.widget.NEXT"
    val ACTIONS = setOf(ACTION_TOGGLE, ACTION_PREVIOUS, ACTION_NEXT)

    data class Style(
        val provider: Class<out AppWidgetProvider>,
        val layout: Int,
        val play: Int,
        val pause: Int,
        val cover: Boolean = false,
        val controls: Boolean = false,
    )

    val BAR = Style(
        HushioWidgetProvider::class.java, R.layout.hushio_widget,
        R.drawable.ic_widget_glyph_play, R.drawable.ic_widget_glyph_pause, cover = true,
    )
    val SQUARE = Style(
        HushioWidgetSquareProvider::class.java, R.layout.hushio_widget_square,
        R.drawable.ic_widget_glyph_play, R.drawable.ic_widget_glyph_pause, cover = true,
    )
    val CONTROLS = Style(
        HushioWidgetControlsProvider::class.java, R.layout.hushio_widget_controls,
        R.drawable.ic_widget_glyph_play, R.drawable.ic_widget_glyph_pause, cover = true, controls = true,
    )
    private val ALL = listOf(BAR, SQUARE, CONTROLS)

    fun refreshAll(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val state = WidgetStore.read(context)
        for (style in ALL) {
            val ids = manager.getAppWidgetIds(ComponentName(context, style.provider))
            if (ids.isNotEmpty()) manager.updateAppWidget(ids, views(context, style, state))
        }
    }

    fun views(context: Context, style: Style, state: WidgetStore.Snapshot): RemoteViews {
        val view = WidgetState.view(state.title, state.artist, state.playing)
        val (icon, label) = when (view.action) {
            WidgetAction.PLAY -> style.play to R.string.hushio_player_widget_play
            WidgetAction.PAUSE -> style.pause to R.string.hushio_player_widget_pause
            WidgetAction.OPEN -> style.play to R.string.hushio_player_widget_open
        }
        return RemoteViews(context.packageName, style.layout).apply {
            setTextViewText(R.id.widget_title, view.title)
            setTextViewText(R.id.widget_subtitle, view.subtitle)
            setImageViewResource(R.id.widget_toggle, icon)
            setContentDescription(R.id.widget_toggle, context.getString(label))
            setOnClickPendingIntent(R.id.widget_toggle, actionPending(context, style, ACTION_TOGGLE))
            setOnClickPendingIntent(R.id.widget_body, openPending(context))
            if (style.cover) {
                WidgetCover.bitmapFor(context, state.artwork)?.let { bitmap ->
                    setImageViewBitmap(R.id.widget_cover, bitmap)
                    setViewVisibility(R.id.widget_cover_glyph, View.GONE)
                }
            }
            if (style.controls) {
                setOnClickPendingIntent(R.id.widget_previous, actionPending(context, style, ACTION_PREVIOUS))
                setOnClickPendingIntent(R.id.widget_next, actionPending(context, style, ACTION_NEXT))
                setContentDescription(R.id.widget_previous, context.getString(R.string.hushio_player_widget_previous))
                setContentDescription(R.id.widget_next, context.getString(R.string.hushio_player_widget_next))
            }
        }
    }

    fun openApp(context: Context) {
        launchIntent(context)?.let { context.startActivity(it) }
    }

    private fun actionPending(context: Context, style: Style, action: String): PendingIntent {
        val intent = Intent(context, style.provider).setAction(action)
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun openPending(context: Context): PendingIntent {
        val intent = launchIntent(context) ?: Intent()
        return PendingIntent.getActivity(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun launchIntent(context: Context): Intent? =
        context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
