package com.hushio.player

import android.app.Activity
import android.content.ContentValues
import android.os.Build
import android.net.Uri
import android.provider.MediaStore
import app.tauri.annotation.Command
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

class MediaStorePlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun media_store_publish(invoke: Invoke) {
        val args = invoke.getArgs()
        val source = File(args.optString("path"))
        val name = args.optString("displayName")
        val mime = MediaStoreRows.mimeFor(name)
        val cacheRoot = activity.cacheDir
        if (Build.VERSION.SDK_INT < 29) {
            invoke.reject("needs_android_10")
            return
        }
        if (!MediaStoreRows.validDisplayName(name) || mime == null ||
            !source.isFile || !MediaStoreRows.isUnder(source, cacheRoot)
        ) {
            invoke.reject("invalid_download")
            return
        }
        Thread {
            val uri = publish(source, name, mime)
            if (uri == null) invoke.reject("publish_failed")
            else invoke.resolve(JSObject().put("uri", uri.toString()))
        }.start()
    }

    @Command
    fun media_store_delete(invoke: Invoke) {
        val uri = invoke.getArgs().optString("uri")
        if (!MediaStoreRows.isAudioUri(uri)) {
            invoke.reject("invalid_uri")
            return
        }
        Thread {
            val rows = activity.contentResolver.delete(Uri.parse(uri), null, null)
            invoke.resolve(JSObject().put("removed", rows > 0))
        }.start()
    }

    private fun publish(source: File, name: String, mime: String): Uri? {
        val resolver = activity.contentResolver
        val pending = ContentValues().apply {
            put(MediaStore.Audio.Media.DISPLAY_NAME, name)
            put(MediaStore.Audio.Media.MIME_TYPE, mime)
            put(MediaStore.Audio.Media.RELATIVE_PATH, MediaStoreRows.relativePath(APP_NAME))
            put(MediaStore.Audio.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, pending) ?: return null
        return try {
            resolver.openOutputStream(uri, "w").use { output ->
                requireNotNull(output) { "no output stream" }
                source.inputStream().use { it.copyTo(output) }
            }
            val done = ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }
            resolver.update(uri, done, null, null)
            uri
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            null
        }
    }

    private companion object {
        const val APP_NAME = "Hushio"
    }
}
