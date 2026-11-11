package com.hushio.player

import android.app.Activity
import android.net.Uri
import androidx.mediarouter.app.MediaRouteChooserDialog
import androidx.mediarouter.media.MediaRouteSelector
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.images.WebImage
import java.util.concurrent.Executors

object CastBridge {
    private val worker = Executors.newSingleThreadExecutor()

    val selector: MediaRouteSelector = MediaRouteSelector.Builder()
        .addControlCategory(
            CastMediaControlIntent.categoryForCast(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID),
        )
        .build()

    fun showDevices(activity: Activity): JSObject {
        MediaRouteChooserDialog(activity).apply { setRouteSelector(selector) }.show()
        return JSObject()
    }

    fun load(
        client: RemoteMediaClient,
        url: String,
        title: String,
        artist: String,
        artworkUrl: String?,
        positionMs: Long,
        autoplay: Boolean,
    ) {
        val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_MUSIC_TRACK).apply {
            putString(MediaMetadata.KEY_TITLE, title)
            putString(MediaMetadata.KEY_ARTIST, artist)
            artworkUrl?.let { addImage(WebImage(Uri.parse(it))) }
        }
        val info = MediaInfo.Builder(url)
            .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
            .setContentType("audio/mp4")
            .setMetadata(metadata)
            .build()
        client.load(
            MediaLoadRequestData.Builder()
                .setMediaInfo(info)
                .setAutoplay(autoplay)
                .setCurrentTime(positionMs)
                .build(),
        )
    }

    fun seek(client: RemoteMediaClient, positionMs: Long) {
        client.seek(MediaSeekOptions.Builder().setPosition(positionMs).build())
    }

    fun status(client: RemoteMediaClient?): JSObject =
        JSObject()
            .put("connected", client != null)
            .put("playing", client?.isPlaying == true)
            .put("positionMs", client?.approximateStreamPosition ?: 0L)

    fun run(activity: Activity, invoke: Invoke, block: (CastContext) -> JSObject) {
        worker.execute {
            val context = try {
                CastContext.getSharedInstance(activity)
            } catch (error: Exception) {
                activity.runOnUiThread { invoke.reject(error.message ?: "Cast is not available on this device") }
                return@execute
            }
            activity.runOnUiThread {
                try {
                    invoke.resolve(block(context))
                } catch (error: Exception) {
                    invoke.reject(error.message ?: "Cast failed")
                }
            }
        }
    }

    fun connectedClient(context: CastContext): RemoteMediaClient =
        context.sessionManager.currentCastSession?.remoteMediaClient
            ?: throw IllegalStateException("Choose a Cast device first")
}
