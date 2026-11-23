package com.hushio.player

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import org.json.JSONArray
import org.json.JSONObject

class LocalAudioPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun pick_tree(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        startActivityForResult(invoke, intent, "onTreePicked")
    }

    @ActivityCallback
    fun onTreePicked(invoke: Invoke, result: ActivityResult) {
        val uri: Uri? = if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
        if (uri == null) {
            invoke.resolve(JSObject().put("uri", JSONObject.NULL))
            return
        }
        try {
            activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (error: SecurityException) {
            invoke.reject("permission_not_granted")
            return
        }
        invoke.resolve(JSObject().put("uri", uri.toString()))
    }

    @Command
    fun scan_tree(invoke: Invoke) {
        val uri = invoke.getArgs().optString("uri")
        if (!AudioRules.isTreeUri(uri)) {
            invoke.reject("invalid_tree")
            return
        }
        Thread {
            try {
                val rows = TreeScanner(activity.applicationContext).scan(uri)
                val array = JSONArray()
                for (row in rows) array.put(JSONObject(row))
                invoke.resolve(JSObject().put("items", array))
            } catch (error: Exception) {
                invoke.reject("scan_failed")
            }
        }.start()
    }

    @Command
    fun read_sidecar_lrc(invoke: Invoke) {
        val uri = invoke.getArgs().optString("uri")
        Thread {
            val text = AudioRules.sidecarLrcUris(uri).asSequence().mapNotNull { readText(it) }.firstOrNull()
            invoke.resolve(JSObject().put("text", text ?: JSONObject.NULL))
        }.start()
    }

    private fun readText(uri: String): String? = try {
        activity.contentResolver.openInputStream(Uri.parse(uri))?.use { stream ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (output.size() < MAX_LRC_BYTES) {
                val read = stream.read(buffer, 0, minOf(buffer.size, MAX_LRC_BYTES - output.size()))
                if (read < 0) break
                output.write(buffer, 0, read)
            }
            String(output.toByteArray(), Charsets.UTF_8)
        }
    } catch (error: Exception) {
        null
    }

    @Command
    fun read_image(invoke: Invoke) {
        val uri = invoke.getArgs().optString("uri")
        Thread {
            val bytes = readImageBytes(uri)
            if (bytes == null) {
                invoke.reject("Could not read the picked image")
            } else {
                invoke.resolve(JSObject().put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP)))
            }
        }.start()
    }

    private fun readImageBytes(uri: String): ByteArray? = try {
        activity.contentResolver.openInputStream(Uri.parse(uri))?.use { stream ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (output.size() <= MAX_IMAGE_BYTES) {
                val read = stream.read(buffer)
                if (read < 0) break
                output.write(buffer, 0, read)
            }
            output.toByteArray()
        }
    } catch (error: Exception) {
        null
    }

    private companion object {
        const val MAX_LRC_BYTES = 1048576
        const val MAX_IMAGE_BYTES = 10 * 1024 * 1024
    }

}
