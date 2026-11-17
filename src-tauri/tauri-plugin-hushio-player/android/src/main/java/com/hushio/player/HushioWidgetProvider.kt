package com.hushio.player

import android.content.Context
import android.content.SharedPreferences

class HushioWidgetProvider : HushioWidgetBase(WidgetRender.BAR) {
    companion object {
        fun publish(context: Context, title: String?, artist: String?, playing: Boolean, artwork: String? = null) {
            WidgetStore.write(context, WidgetStore.Snapshot(title, artist, playing, artwork))
            WidgetRender.refreshAll(context)
        }
    }
}

object WidgetStore {
    private const val PREFS = "hushio_widget"
    private const val KEY_TITLE = "title"
    private const val KEY_ARTIST = "artist"
    private const val KEY_PLAYING = "playing"
    private const val KEY_ARTWORK = "artwork"

    data class Snapshot(val title: String?, val artist: String?, val playing: Boolean, val artwork: String? = null)

    fun read(context: Context): Snapshot {
        val prefs = prefs(context)
        return Snapshot(
            prefs.getString(KEY_TITLE, null),
            prefs.getString(KEY_ARTIST, null),
            prefs.getBoolean(KEY_PLAYING, false),
            prefs.getString(KEY_ARTWORK, null),
        )
    }

    fun write(context: Context, snapshot: Snapshot) {
        prefs(context).edit()
            .putString(KEY_TITLE, snapshot.title)
            .putString(KEY_ARTIST, snapshot.artist)
            .putBoolean(KEY_PLAYING, snapshot.playing)
            .putString(KEY_ARTWORK, snapshot.artwork)
            .apply()
    }

    private fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
