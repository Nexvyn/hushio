package com.hushio.player

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
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

}
