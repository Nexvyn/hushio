package com.hushio.player

import android.content.Context
import android.content.Intent
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.CommandButton
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.ConcurrentHashMap

class PlayerService : MediaLibraryService() {

    private lateinit var player: ExoPlayer
    private lateinit var session: MediaLibrarySession
    private lateinit var audioManager: AudioManager

    private val handler = Handler(Looper.getMainLooper())
    private val queue = QueueMirror<QueueItem>()
    private val headersByUrl = ConcurrentHashMap<String, Map<String, String>>()
    private val sleepTimer = SleepTimer()
    private val buttonGestures = MediaButtonGestures()
    private var equalizer: EqualizerController? = null
    private var baseVolume = 1f
    private var headroomDb = 0.0
    private var liked = false
    private var fadeReported = false

    private val sleepTicker = object : Runnable {
        override fun run() {
            tickSleep()
            if (sleepTimer.active) handler.postDelayed(this, SLEEP_TICK_MS)
        }
    }

    private val gestureTimeout = Runnable {
        if (buttonGestures.expire(SystemClock.uptimeMillis()) == MediaButtonGestures.Gesture.SINGLE) {
            togglePlayPause()
        }
    }

    private val restoreVolume = Runnable { applyVolume() }

    private val headerResolver = object : ResolvingDataSource.Resolver {
        override fun resolveDataSpec(dataSpec: DataSpec): DataSpec {
            val headers = headersByUrl[dataSpec.uri.toString()] ?: return dataSpec
            return dataSpec.buildUpon().setHttpRequestHeaders(headers).build()
        }

        override fun resolveReportedUri(uri: Uri): Uri = uri
    }

    private val playerListener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            queue.setCurrent(player.currentMediaItemIndex)
            refreshLiked()
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (playWhenReady) return
            when (reason) {
                Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM -> if (sleepTimer.endOfSong) {
                    sleepTimer.endOfSongConsumed()
                    player.setPauseAtEndOfMediaItems(false)
                }
                Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY ->
                    PlayerEvents.emit("player-route", mapOf("reason" to "becoming_noisy"))
                Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS ->
                    PlayerEvents.emit("player-focus", mapOf("state" to "lost"))
            }
        }
    }

    private val audioDeviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
            val outputRemoved = removedDevices.any { it.isSink && it.type in OUTPUT_TYPES }
            if (outputRemoved && player.playWhenReady) {
                player.pause()
                PlayerEvents.emit("player-route", mapOf("reason" to "device_removed"))
            }
        }
    }

    private val libraryCallback = object : MediaLibrarySession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS
                .buildUpon()
                .add(LIKE_COMMAND)
                .build()
            return MediaSession.ConnectionResult.accept(commands, MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS)
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            if (customCommand.customAction == LIKE_ACTION) {
                val action = if (liked) "unlike" else "like"
                setLiked(!liked)
                PlayerEvents.emit("player-action", mapOf("action" to action))
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }

        override fun onMediaButtonEvent(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            intent: Intent,
        ): Boolean {
            @Suppress("DEPRECATION")
            val event = intent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return false
            if (event.action != KeyEvent.ACTION_DOWN || event.repeatCount != 0) return false
            if (event.keyCode !in PLAY_PAUSE_KEYS) return false
            handler.removeCallbacks(gestureTimeout)
            when (buttonGestures.press(SystemClock.uptimeMillis())) {
                MediaButtonGestures.Gesture.DOUBLE -> {
                    player.seekToNext()
                    PlayerEvents.emit("player-action", mapOf("action" to "next"))
                }
                MediaButtonGestures.Gesture.SINGLE, null ->
                    handler.postDelayed(gestureTimeout, MediaButtonGestures.WINDOW_MS)
            }
            return true
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: MediaLibraryService.LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val root = MediaItem.Builder()
                .setMediaId(ROOT_ID)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(packageManager.getApplicationLabel(applicationInfo))
                        .setIsBrowsable(true)
                        .setIsPlayable(false)
                        .build(),
                )
                .build()
            return Futures.immediateFuture(LibraryResult.ofItem(root, params))
        }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: MediaLibraryService.LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> =
            Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params))
    }

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setLoadControl(loadControl())
            .setSeekBackIncrementMs(SEEK_INCREMENT_MS)
            .setSeekForwardIncrementMs(SEEK_INCREMENT_MS)
            .setMediaSourceFactory(
                DefaultMediaSourceFactory(
                    DefaultDataSource.Factory(
                        this,
                        ResolvingDataSource.Factory(DefaultHttpDataSource.Factory(), headerResolver),
                    ),
                ),
            )
            .build()
        session = MediaLibrarySession.Builder(this, player, libraryCallback)
            .setId(SESSION_ID)
            .build()
        session.setMediaButtonPreferences(buttons())
        player.addListener(playerListener)
        audioManager.registerAudioDeviceCallback(audioDeviceCallback, handler)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession = session

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
        equalizer?.release()
        session.release()
        player.release()
        super.onDestroy()
    }

    fun replaceQueue(items: List<QueueItem>, startIndex: Int, startPositionMs: Long): Int {
        val accepted = queue.replace(items, startIndex)
        headersByUrl.clear()
        queue.items.forEach(::remember)
        if (queue.size == 0) {
            player.clearMediaItems()
        } else {
            player.setMediaItems(queue.items.map(::toMediaItem), queue.current, startPositionMs)
            player.prepare()
            player.pause()
        }
        refreshLiked()
        return accepted
    }

    fun appendItems(items: List<QueueItem>): Int {
        val count = queue.append(items)
        val kept = items.take(count)
        kept.forEach(::remember)
        player.addMediaItems(kept.map(::toMediaItem))
        return count
    }

    fun insertNext(items: List<QueueItem>): Int {
        val at = if (queue.current == QueueMirror.NONE) 0 else queue.current + 1
        val count = queue.insertNext(items)
        val kept = items.take(count)
        kept.forEach(::remember)
        player.addMediaItems(at, kept.map(::toMediaItem))
        return count
    }

    fun removeAt(index: Int): Boolean {
        if (!queue.removeAt(index)) return false
        player.removeMediaItem(index)
        return true
    }

    fun moveItem(from: Int, to: Int): Boolean {
        if (!queue.move(from, to)) return false
        player.moveMediaItem(from, to)
        return true
    }

    fun seekTo(positionMs: Long) {
        player.seekTo(PlayerMath.clampSeek(positionMs, player.duration))
    }

    fun setSpeed(speed: Double) {
        player.playbackParameters = PlaybackParameters(PlayerMath.clampSpeed(speed), 1f)
    }

    fun setSkipSilence(enabled: Boolean) {
        player.skipSilenceEnabled = enabled
    }

    fun setVolume(volume: Double) {
        baseVolume = PlayerMath.clampVolume(volume)
        applyVolume()
    }

    fun setEqualizer(enabled: Boolean, gainsDb: DoubleArray): Int {
        val controller = equalizer
            ?: EqualizerController.create(player.audioSessionId)?.also { equalizer = it }
            ?: return 0
        headroomDb = controller.apply(enabled, gainsDb)
        applyVolume()
        return controller.bandCount
    }

    fun setSleepTimer(endsAtEpochMs: Long?, endOfSong: Boolean) {
        sleepTimer.set(endsAtEpochMs, endOfSong)
        fadeReported = false
        player.setPauseAtEndOfMediaItems(endOfSong)
        handler.removeCallbacks(sleepTicker)
        handler.removeCallbacks(restoreVolume)
        if (sleepTimer.active) handler.post(sleepTicker) else applyVolume()
    }

    fun togglePlayPause() {
        val playing = player.playWhenReady
        if (playing) player.pause() else player.play()
        PlayerEvents.emit("player-action", mapOf("action" to if (playing) "pause" else "play"))
    }

    private fun tickSleep() {
        when (val step = sleepTimer.step(System.currentTimeMillis())) {
            SleepStep.Idle -> Unit
            is SleepStep.Fading -> {
                player.volume = step.volume
                if (!fadeReported) {
                    fadeReported = true
                    PlayerEvents.emit("player-sleep", mapOf("state" to "fading"))
                }
            }
            SleepStep.Fire -> {
                player.pause()
                fadeReported = false
                PlayerEvents.emit("player-sleep", mapOf("state" to "fired"))
                handler.postDelayed(restoreVolume, VOLUME_RESTORE_MS)
            }
        }
    }

    private fun applyVolume() {
        player.volume = PlayerMath.headroomVolume(baseVolume, headroomDb)
    }

    private fun refreshLiked() {
        setLiked(queue.currentItem()?.liked ?: false)
    }

    private fun setLiked(value: Boolean) {
        liked = value
        session.setMediaButtonPreferences(buttons())
    }

    private fun buttons(): List<CommandButton> {
        val like = CommandButton.Builder(if (liked) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)
            .setSessionCommand(LIKE_COMMAND)
            .setDisplayName(if (liked) "Unlike" else "Like")
            .build()
        val previous = CommandButton.Builder(CommandButton.ICON_PREVIOUS)
            .setPlayerCommand(Player.COMMAND_SEEK_TO_PREVIOUS)
            .setDisplayName("Previous")
            .build()
        val next = CommandButton.Builder(CommandButton.ICON_NEXT)
            .setPlayerCommand(Player.COMMAND_SEEK_TO_NEXT)
            .setDisplayName("Next")
            .build()
        val back = CommandButton.Builder(CommandButton.ICON_SKIP_BACK_10)
            .setPlayerCommand(Player.COMMAND_SEEK_BACK)
            .setDisplayName("Back 10 seconds")
            .build()
        val forward = CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD_10)
            .setPlayerCommand(Player.COMMAND_SEEK_FORWARD)
            .setDisplayName("Forward 10 seconds")
            .build()
        return listOf(like, previous, back, forward, next)
    }

    private fun remember(item: QueueItem) {
        val uri = item.playbackUri() ?: return
        if (item.headers.isNotEmpty()) headersByUrl[uri] = item.headers
    }

    private fun toMediaItem(item: QueueItem): MediaItem {
        val metadata = MediaMetadata.Builder()
            .setTitle(item.title)
            .setArtist(item.artist)
            .setAlbumTitle(item.album)
            .setArtworkUri(item.artworkUrl?.let(Uri::parse))
            .build()
        return MediaItem.Builder()
            .setMediaId(item.id)
            .setUri(item.playbackUri().orEmpty())
            .setMediaMetadata(metadata)
            .build()
    }

    private fun loadControl(): DefaultLoadControl =
        DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                MIN_BUFFER_MS,
                MAX_BUFFER_MS,
                DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
                DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
            )
            .setBackBuffer(0, false)
            .build()

    companion object {
        private const val SESSION_ID = "hushio-player"
        private const val ROOT_ID = "[root]"
        private const val LIKE_ACTION = "hushio.like"
        private const val MIN_BUFFER_MS = 15_000
        private const val MAX_BUFFER_MS = 30_000
        private const val SEEK_INCREMENT_MS = 10_000L
        private const val SLEEP_TICK_MS = 250L
        private const val VOLUME_RESTORE_MS = 500L
        private val LIKE_COMMAND = SessionCommand(LIKE_ACTION, Bundle.EMPTY)
        private val PLAY_PAUSE_KEYS = setOf(
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_HEADSETHOOK,
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE,
        )
        private val OUTPUT_TYPES = setOf(
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_USB_DEVICE,
            AudioDeviceInfo.TYPE_HDMI,
        )

        fun start(context: Context) {
            context.startService(Intent(context, PlayerService::class.java))
        }
    }
}
