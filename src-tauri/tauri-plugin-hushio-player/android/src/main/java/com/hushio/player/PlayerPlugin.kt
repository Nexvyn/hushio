package com.hushio.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import android.view.HapticFeedbackConstants
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.graphics.Insets
import androidx.core.view.OnApplyWindowInsetsListener
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.Command
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject

class PlayerPlugin(private val activity: Activity) : Plugin(activity) {
    private var webView: WebView? = null
    @Volatile private var insets = InsetsCss.Sides(0f, 0f, 0f, 0f)
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun load(webView: WebView) {
        this.webView = webView
        if (activity.resources.configuration.smallestScreenWidthDp < 600) {
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        PlayerEvents.sink = { name, payload -> trigger(name, toJs(payload)) }
        PlayerService.start(activity)
        watchInsets(webView)
        watchMotionSetting(webView)
        HighRefresh.apply(activity)
    }

    @Command
    fun playerExit(invoke: Invoke) {
        activity.runOnUiThread { activity.finish() }
        invoke.resolve()
    }

    @Command
    fun playerHapticTick(invoke: Invoke) {
        val kind = invoke.getArgs().optString("kind", "tick")
        activity.runOnUiThread {
            val view = webView ?: return@runOnUiThread
            val feedback = when (kind) {
                "select" -> HapticFeedbackConstants.LONG_PRESS
                "success" -> if (android.os.Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
                "warning" -> if (android.os.Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
                else -> HapticFeedbackConstants.CLOCK_TICK
            }
            view.performHapticFeedback(feedback)
            if (kind == "success") mainHandler.postDelayed({ webView?.performHapticFeedback(feedback) }, 55)
        }
        invoke.resolve()
    }

    @Command
    fun playerSetSystemBars(invoke: Invoke) {
        val dark = invoke.getArgs().optBoolean("dark", false)
        activity.runOnUiThread {
            WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
        invoke.resolve()
    }

    @Command
    fun setBackGestureEnabled(invoke: Invoke) {
        val enabled = invoke.getArgs().optBoolean("enabled", true)
        activity.runOnUiThread { BackGesture.setEnabled(enabled) }
        invoke.resolve()
    }

    @Command
    fun playerKeepAwake(invoke: Invoke) {
        val on = invoke.getArgs().optBoolean("on", false)
        activity.runOnUiThread {
            if (on) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        invoke.resolve()
    }

    @Command
    fun playerSetQueue(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        val accepted = player.replaceQueue(
            parseItems(args.getJSONArray("items")),
            args.optInt("startIndex"),
            args.optLong("startPositionMs"),
        )
        invoke.resolve(JSObject().put("accepted", accepted))
    }

    @Command
    fun playerAppend(invoke: Invoke) = withPlayer(invoke) { player ->
        val items = parseItems(invoke.getArgs().getJSONArray("items"))
        invoke.resolve(JSObject().put("count", player.appendItems(items)))
    }

    @Command
    fun playerInsertNext(invoke: Invoke) = withPlayer(invoke) { player ->
        val items = parseItems(invoke.getArgs().getJSONArray("items"))
        invoke.resolve(JSObject().put("count", player.insertNext(items)))
    }

    @Command
    fun playerRemoveAt(invoke: Invoke) = withPlayer(invoke) { player ->
        val index = invoke.getArgs().getInt("index")
        if (player.removeAt(index)) invoke.resolve() else invoke.reject("index_out_of_range")
    }

    @Command
    fun playerMove(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        if (player.moveItem(args.getInt("from"), args.getInt("to"))) invoke.resolve() else invoke.reject("index_out_of_range")
    }

    @Command
    fun playerPlay(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setPlaying(true)
        invoke.resolve()
    }

    @Command
    fun playerPause(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setPlaying(false)
        invoke.resolve()
    }

    @Command
    fun playerToggle(invoke: Invoke) = withPlayer(invoke) { player ->
        val playing = player.setPlaying(!player.playRequested())
        invoke.resolve(JSObject().put("playing", playing))
    }

    @Command
    fun playerNext(invoke: Invoke) = withPlayer(invoke) { player ->
        player.next()
        invoke.resolve()
    }

    @Command
    fun playerPrevious(invoke: Invoke) = withPlayer(invoke) { player ->
        player.previous()
        invoke.resolve()
    }

    @Command
    fun playerSeek(invoke: Invoke) = withPlayer(invoke) { player ->
        player.seekTo(invoke.getArgs().getLong("positionMs"))
        invoke.resolve()
    }

    @Command
    fun playerSetSpeed(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setSpeed(invoke.getArgs().getDouble("speed"))
        invoke.resolve()
    }

    @Command
    fun playerSetVolume(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setVolume(invoke.getArgs().getDouble("volume"))
        invoke.resolve()
    }

    @Command
    fun playerSetRepeat(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setRepeat(invoke.getArgs().getString("mode"))
        invoke.resolve()
    }

    @Command
    fun playerSetShuffle(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setShuffle(invoke.getArgs().getBoolean("enabled"))
        invoke.resolve()
    }

    @Command
    fun playerSetSkipSilence(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setSkipSilence(invoke.getArgs().getBoolean("enabled"))
        invoke.resolve()
    }

    @Command
    fun playerSetEq(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        val bands = player.setEqualizer(args.getBoolean("enabled"), parseGains(args.getJSONArray("gainsDb")))
        invoke.resolve(JSObject().put("appliedBands", bands))
    }

    @Command
    fun playerSetSleepTimer(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        val endsAt = if (args.isNull("endsAtEpochMs")) null else args.getLong("endsAtEpochMs")
        player.setSleepTimer(endsAt, args.optBoolean("endOfSong"))
        invoke.resolve()
    }

    @Command
    fun playerSetUrl(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        val found = player.setUrl(
            args.getString("id"),
            args.getString("url"),
            parseHeaders(args.optJSONObject("headers")),
            args.getLong("expiresAtEpochMs"),
        )
        if (found) invoke.resolve() else invoke.reject("unknown_item")
    }

    @Command
    fun playerSetLike(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        if (player.setLike(args.getString("id"), args.getBoolean("liked"))) invoke.resolve() else invoke.reject("unknown_item")
    }

    @Command
    fun playerGetState(invoke: Invoke) = withPlayer(invoke) { player ->
        invoke.resolve(toJs(player.snapshot().toPayload()))
    }

    @Command
    fun playerGetInsets(invoke: Invoke) {
        invoke.resolve(insetsPayload(insets))
    }

    @Command
    fun playerTakeLaunch(invoke: Invoke) {
        val launch = PendingLaunch.take()
        invoke.resolve(launch?.let { JSObject().put("kind", it.kind).put("value", it.value) } ?: JSObject())
    }

    private fun withPlayer(invoke: Invoke, block: (PlayerService) -> Unit) {
        activity.runOnUiThread { awaitPlayer(invoke, 0, block) }
    }

    private fun awaitPlayer(invoke: Invoke, attempt: Int, block: (PlayerService) -> Unit) {
        val player = PlayerService.current
        if (player == null) {
            if (attempt == 0) PlayerService.start(activity)
            if (attempt >= PLAYER_WAIT_ATTEMPTS) {
                invoke.reject("player_not_ready")
                return
            }
            mainHandler.postDelayed({ awaitPlayer(invoke, attempt + 1, block) }, PLAYER_WAIT_STEP_MS)
            return
        }
        try {
            block(player)
        } catch (error: Exception) {
            invoke.reject(error.message ?: "player_failed", error)
        }
    }

    private fun watchInsets(view: WebView) {
        val listener = OnApplyWindowInsetsListener { _, applied ->
            publishInsets(applied.getInsets(BARS_AND_CUTOUT))
            applied
        }
        ViewCompat.setOnApplyWindowInsetsListener(view, listener)
        val decor = activity.window.decorView
        ViewCompat.setOnApplyWindowInsetsListener(decor, listener)
        ViewCompat.requestApplyInsets(decor)
    }

    private fun publishInsets(bars: Insets) {
        val density = activity.resources.displayMetrics.density
        val next = InsetsCss.sides(bars.top, bars.bottom, bars.left, bars.right, density)
        if (next == insets) return
        insets = next
        webView?.evaluateJavascript(InsetsCss.script(next), null)
        trigger("insets", insetsPayload(next))
    }

    private fun insetsPayload(sides: InsetsCss.Sides): JSObject = JSObject()
        .put("top", sides.top.toDouble())
        .put("bottom", sides.bottom.toDouble())
        .put("left", sides.left.toDouble())
        .put("right", sides.right.toDouble())

    private fun watchMotionSetting(view: WebView) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) = pushMotionSetting(view)
        }
        val uri = Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE)
        activity.contentResolver.registerContentObserver(uri, false, observer)
        pushMotionSetting(view)
    }

    private fun pushMotionSetting(view: WebView) {
        val scale = Settings.Global.getFloat(activity.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        val value = if (ReduceMotion.isOn(scale)) "reduce" else "none"
        val script = "if(document.documentElement){document.documentElement.dataset.systemMotion='$value';" +
            "window.dispatchEvent(new Event('hushio-system-motion'))}"
        view.post { view.evaluateJavascript(script, null) }
    }

    private fun toJs(payload: Map<String, Any?>): JSObject {
        val obj = JSObject()
        for ((key, value) in payload) obj.put(key, value ?: JSONObject.NULL)
        return obj
    }

    private fun parseItems(array: JSONArray): List<QueueItem> =
        List(array.length()) { parseItem(array.getJSONObject(it)) }

    private fun parseItem(obj: JSONObject): QueueItem = QueueItem(
        id = obj.getString("id"),
        title = obj.optString("title"),
        artist = obj.optString("artist"),
        album = optString(obj, "album"),
        artworkUrl = optString(obj, "artworkUrl"),
        durationMs = obj.optLong("durationMs"),
        url = optString(obj, "url"),
        headers = parseHeaders(obj.optJSONObject("headers")),
        liked = obj.optBoolean("liked"),
        contentUri = optString(obj, "contentUri"),
        expiresAtMs = if (obj.isNull("expiresAtEpochMs")) null else obj.getLong("expiresAtEpochMs"),
        artworkData = optString(obj, "artworkData")?.let { Base64.decode(it, Base64.DEFAULT) },
    )

    private fun optString(obj: JSONObject, key: String): String? =
        if (obj.isNull(key)) null else obj.getString(key)

    private fun parseHeaders(obj: JSONObject?): Map<String, String> {
        if (obj == null) return emptyMap()
        return obj.keys().asSequence().associateWith { obj.getString(it) }
    }

    private fun parseGains(array: JSONArray): DoubleArray = DoubleArray(array.length()) { array.getDouble(it) }

    private companion object {
        val BARS_AND_CUTOUT = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
        const val PLAYER_WAIT_ATTEMPTS = 60
        const val PLAYER_WAIT_STEP_MS = 50L
    }

    @Command
    fun castOpen(invoke: Invoke) = CastBridge.run(activity, invoke) { context -> CastBridge.showDevices(activity, context) }

    @Command
    fun castLoad(invoke: Invoke) {
        val args = invoke.getArgs()
        val url = args.optString("url")
        if (url.isBlank()) {
            invoke.reject("Nothing to cast")
            return
        }
        CastBridge.run(activity, invoke) { context ->
            CastBridge.load(
                CastBridge.connectedClient(context),
                url,
                args.optString("contentType").ifBlank { "audio/mp4" },
                args.optString("title"),
                args.optString("artist"),
                args.optString("artworkUrl").takeIf { it.isNotBlank() },
                args.optLong("positionMs"),
                args.optBoolean("playing", true),
            )
            JSObject()
        }
    }

    @Command
    fun castPlayPause(invoke: Invoke) {
        val play = invoke.getArgs().optBoolean("play")
        CastBridge.run(activity, invoke) { context ->
            val client = CastBridge.connectedClient(context)
            if (play) client.play() else client.pause()
            JSObject()
        }
    }

    @Command
    fun castSeek(invoke: Invoke) {
        val positionMs = invoke.getArgs().optLong("positionMs")
        CastBridge.run(activity, invoke) { context ->
            CastBridge.seek(CastBridge.connectedClient(context), positionMs)
            JSObject()
        }
    }

    @Command
    fun castStatus(invoke: Invoke) = CastBridge.run(activity, invoke) { context ->
        CastBridge.status(context.sessionManager.currentCastSession?.remoteMediaClient)
    }

    @Command
    fun castStop(invoke: Invoke) = CastBridge.run(activity, invoke) { context ->
        context.sessionManager.endCurrentSession(true)
        JSObject()
    }

    @Command
    fun castDevices(invoke: Invoke) {
        val scan = invoke.getArgs().optBoolean("scan", true)
        CastBridge.run(activity, invoke) { _ -> CastBridge.devices(activity, scan) }
    }

    @Command
    fun castSelect(invoke: Invoke) {
        val id = invoke.getArgs().optString("id")
        CastBridge.run(activity, invoke) { _ -> CastBridge.select(activity, id) }
    }
}
