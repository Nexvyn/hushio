package com.hushio.player

import android.app.Activity
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject

class PlayerPlugin(private val activity: Activity) : Plugin(activity) {

    override fun load(webView: WebView) {
        PlayerEvents.sink = { name, payload -> trigger(name, toJs(payload)) }
        PlayerService.start(activity)
    }

    @Command
    fun player_set_queue(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        val accepted = player.replaceQueue(
            parseItems(args.getJSONArray("items")),
            args.optInt("startIndex"),
            args.optLong("startPositionMs"),
        )
        invoke.resolve(JSObject().put("accepted", accepted))
    }

    @Command
    fun player_append(invoke: Invoke) = withPlayer(invoke) { player ->
        val items = parseItems(invoke.getArgs().getJSONArray("items"))
        invoke.resolve(JSObject().put("count", player.appendItems(items)))
    }

    @Command
    fun player_insert_next(invoke: Invoke) = withPlayer(invoke) { player ->
        val items = parseItems(invoke.getArgs().getJSONArray("items"))
        invoke.resolve(JSObject().put("count", player.insertNext(items)))
    }

    @Command
    fun player_remove_at(invoke: Invoke) = withPlayer(invoke) { player ->
        val index = invoke.getArgs().getInt("index")
        if (player.removeAt(index)) invoke.resolve() else invoke.reject("index_out_of_range")
    }

    @Command
    fun player_move(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        if (player.moveItem(args.getInt("from"), args.getInt("to"))) invoke.resolve() else invoke.reject("index_out_of_range")
    }

    @Command
    fun player_play(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setPlaying(true)
        invoke.resolve()
    }

    @Command
    fun player_pause(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setPlaying(false)
        invoke.resolve()
    }

    @Command
    fun player_toggle(invoke: Invoke) = withPlayer(invoke) { player ->
        val playing = player.setPlaying(!player.playRequested())
        invoke.resolve(JSObject().put("playing", playing))
    }

    @Command
    fun player_next(invoke: Invoke) = withPlayer(invoke) { player ->
        player.next()
        invoke.resolve()
    }

    @Command
    fun player_previous(invoke: Invoke) = withPlayer(invoke) { player ->
        player.previous()
        invoke.resolve()
    }

    @Command
    fun player_seek(invoke: Invoke) = withPlayer(invoke) { player ->
        player.seekTo(invoke.getArgs().getLong("positionMs"))
        invoke.resolve()
    }

    @Command
    fun player_set_speed(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setSpeed(invoke.getArgs().getDouble("speed"))
        invoke.resolve()
    }

    @Command
    fun player_set_volume(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setVolume(invoke.getArgs().getDouble("volume"))
        invoke.resolve()
    }

    @Command
    fun player_set_repeat(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setRepeat(invoke.getArgs().getString("mode"))
        invoke.resolve()
    }

    @Command
    fun player_set_shuffle(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setShuffle(invoke.getArgs().getBoolean("enabled"))
        invoke.resolve()
    }

    @Command
    fun player_set_skip_silence(invoke: Invoke) = withPlayer(invoke) { player ->
        player.setSkipSilence(invoke.getArgs().getBoolean("enabled"))
        invoke.resolve()
    }

    @Command
    fun player_set_eq(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        val bands = player.setEqualizer(args.getBoolean("enabled"), parseGains(args.getJSONArray("gainsDb")))
        invoke.resolve(JSObject().put("appliedBands", bands))
    }

    @Command
    fun player_set_sleep_timer(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        val endsAt = if (args.isNull("endsAtEpochMs")) null else args.getLong("endsAtEpochMs")
        player.setSleepTimer(endsAt, args.optBoolean("endOfSong"))
        invoke.resolve()
    }

    @Command
    fun player_set_url(invoke: Invoke) = withPlayer(invoke) { player ->
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
    fun player_set_like(invoke: Invoke) = withPlayer(invoke) { player ->
        val args = invoke.getArgs()
        if (player.setLike(args.getString("id"), args.getBoolean("liked"))) invoke.resolve() else invoke.reject("unknown_item")
    }

    @Command
    fun player_get_state(invoke: Invoke) = withPlayer(invoke) { player ->
        invoke.resolve(toJs(player.snapshot().toPayload()))
    }

    private fun withPlayer(invoke: Invoke, block: (PlayerService) -> Unit) {
        activity.runOnUiThread {
            val player = PlayerService.current
            if (player == null) {
                invoke.reject("player_not_ready")
                return@runOnUiThread
            }
            try {
                block(player)
            } catch (error: Exception) {
                invoke.reject(error.message ?: "player_failed", error)
            }
        }
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
    )

    private fun optString(obj: JSONObject, key: String): String? =
        if (obj.isNull(key)) null else obj.getString(key)

    private fun parseHeaders(obj: JSONObject?): Map<String, String> {
        if (obj == null) return emptyMap()
        return obj.keys().asSequence().associateWith { obj.getString(it) }
    }

    private fun parseGains(array: JSONArray): DoubleArray = DoubleArray(array.length()) { array.getDouble(it) }
}
