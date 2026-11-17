package com.hushio.player

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

object WidgetCover {
    private const val SIZE_PX = 288
    private const val TIMEOUT_MS = 10_000
    private val loader = Executors.newSingleThreadExecutor()
    private var key: String? = null
    private var bitmap: Bitmap? = null

    fun bitmapFor(context: Context, url: String?): Bitmap? {
        synchronized(this) {
            if (url == key) return bitmap
            key = url
            bitmap = null
        }
        if (url.isNullOrBlank()) return null
        val app = context.applicationContext
        loader.execute {
            val loaded = runCatching { decode(app, url) }.getOrNull()
            val current = synchronized(this) {
                if (key != url) return@synchronized false
                bitmap = loaded
                true
            }
            if (current && loaded != null) WidgetRender.refreshAll(app)
        }
        return null
    }

    private fun decode(context: Context, url: String): Bitmap? {
        val uri = Uri.parse(url)
        val bytes = when (uri.scheme) {
            "http", "https" -> (URL(url).openConnection() as HttpURLConnection).run {
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                try {
                    inputStream.use { it.readBytes() }
                } finally {
                    disconnect()
                }
            }
            "content", "file" -> context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            else -> null
        } ?: return null

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= SIZE_PX) sample *= 2
        val source = BitmapFactory.decodeByteArray(
            bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample },
        ) ?: return null

        val side = min(source.width, source.height)
        val square = Bitmap.createBitmap(source, (source.width - side) / 2, (source.height - side) / 2, side, side)
        return Bitmap.createScaledBitmap(square, SIZE_PX, SIZE_PX, true)
    }
}
