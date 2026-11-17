package com.hushio.player

import android.app.Activity
import android.net.Uri
import androidx.mediarouter.app.MediaRouteChooserDialog
import androidx.mediarouter.app.MediaRouteControllerDialog
import androidx.mediarouter.media.MediaRouteSelector
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.images.WebImage

object CastBridge {
    private var sessionListenerAttached = false

    val selector: MediaRouteSelector = MediaRouteSelector.Builder()
        .addControlCategory(
            CastMediaControlIntent.categoryForCast(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID),
        )
        .build()

    fun showDevices(activity: Activity, context: CastContext): JSObject {
        if (context.sessionManager.currentCastSession != null) {
            MediaRouteControllerDialog(activity).show()
        } else {
            MediaRouteChooserDialog(activity).apply { setRouteSelector(selector) }.show()
        }
        return JSObject()
    }

    fun load(
        client: RemoteMediaClient,
        url: String,
        contentType: String,
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
            .setContentType(contentType)
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
        activity.runOnUiThread {
            val context = try {
                CastContext.getSharedInstance(activity).also(::attachSessionListener)
            } catch (error: Exception) {
                invoke.reject("Cast is not available on this device")
                return@runOnUiThread
            }
            try {
                invoke.resolve(block(context))
            } catch (error: Exception) {
                invoke.reject(error.message ?: "Cast failed")
            }
        }
    }

    fun connectedClient(context: CastContext): RemoteMediaClient =
        context.sessionManager.currentCastSession?.remoteMediaClient
            ?: throw IllegalStateException("Choose a Cast device first")

    private fun attachSessionListener(context: CastContext) {
        if (sessionListenerAttached) return
        sessionListenerAttached = true
        context.sessionManager.addSessionManagerListener(sessionListener, CastSession::class.java)
    }

    private val sessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarting(session: CastSession) = Unit
        override fun onSessionStarted(session: CastSession, sessionId: String) = emitSession("started", session)
        override fun onSessionStartFailed(session: CastSession, error: Int) = emitSession("failed", session)
        override fun onSessionEnding(session: CastSession) = Unit
        override fun onSessionEnded(session: CastSession, error: Int) = emitSession("ended", session)
        override fun onSessionResuming(session: CastSession, sessionId: String) = Unit
        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) = emitSession("started", session)
        override fun onSessionResumeFailed(session: CastSession, error: Int) = emitSession("failed", session)
        override fun onSessionSuspended(session: CastSession, reason: Int) = Unit
    }

    private fun emitSession(state: String, session: CastSession) {
        PlayerEvents.emit(
            "cast-session",
            mapOf("state" to state, "deviceName" to session.castDevice?.friendlyName),
        )
    }
}
