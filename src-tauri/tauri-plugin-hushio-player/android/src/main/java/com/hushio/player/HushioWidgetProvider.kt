package com.hushio.player

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.widget.RemoteViews

class HushioWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = views(context, WidgetStore.read(context))
        for (id in appWidgetIds) manager.updateAppWidget(id, views)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action != ACTION_TOGGLE) return
        val player = PlayerService.current
        if (player == null) openApp(context) else player.togglePlayPause()
    }

    companion object {
        const val ACTION_TOGGLE = "com.hushio.player.widget.TOGGLE"

        fun publish(context: Context, title: String?, artist: String?, playing: Boolean) {
            WidgetStore.write(context, WidgetStore.Snapshot(title, artist, playing))
            refresh(context)
        }

        private fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, HushioWidgetProvider::class.java))
            if (ids.isEmpty()) return
            val views = views(context, WidgetStore.read(context))
            for (id in ids) manager.updateAppWidget(id, views)
        }

        private fun views(context: Context, state: WidgetStore.Snapshot): RemoteViews {
            val view = WidgetState.view(state.title, state.artist, state.playing)
            val (icon, label) = when (view.action) {
                WidgetAction.PLAY -> R.drawable.ic_widget_play to R.string.hushio_player_widget_play
                WidgetAction.PAUSE -> R.drawable.ic_widget_pause to R.string.hushio_player_widget_pause
                WidgetAction.OPEN -> R.drawable.ic_widget_play to R.string.hushio_player_widget_open
            }
            return RemoteViews(context.packageName, R.layout.hushio_widget).apply {
                setTextViewText(R.id.widget_title, view.title)
                setTextViewText(R.id.widget_subtitle, view.subtitle)
                setImageViewResource(R.id.widget_toggle, icon)
                setContentDescription(R.id.widget_toggle, context.getString(label))
                setOnClickPendingIntent(R.id.widget_toggle, togglePending(context))
                setOnClickPendingIntent(R.id.widget_body, openPending(context))
            }
        }

        private fun togglePending(context: Context): PendingIntent {
            val intent = Intent(context, HushioWidgetProvider::class.java).setAction(ACTION_TOGGLE)
            return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        private fun openPending(context: Context): PendingIntent {
            val intent = launchIntent(context) ?: Intent()
            return PendingIntent.getActivity(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        private fun openApp(context: Context) {
            launchIntent(context)?.let { context.startActivity(it) }
        }

        private fun launchIntent(context: Context): Intent? =
            context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}

object WidgetStore {
    private const val PREFS = "hushio_widget"
    private const val KEY_TITLE = "title"
    private const val KEY_ARTIST = "artist"
    private const val KEY_PLAYING = "playing"

    data class Snapshot(val title: String?, val artist: String?, val playing: Boolean)

    fun read(context: Context): Snapshot {
        val prefs = prefs(context)
        return Snapshot(prefs.getString(KEY_TITLE, null), prefs.getString(KEY_ARTIST, null), prefs.getBoolean(KEY_PLAYING, false))
    }

    fun write(context: Context, snapshot: Snapshot) {
        prefs(context).edit()
            .putString(KEY_TITLE, snapshot.title)
            .putString(KEY_ARTIST, snapshot.artist)
            .putBoolean(KEY_PLAYING, snapshot.playing)
            .apply()
    }

    private fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
