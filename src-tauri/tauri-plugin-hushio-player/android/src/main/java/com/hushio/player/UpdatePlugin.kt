package com.hushio.player

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

@TauriPlugin
class UpdatePlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun update_check(invoke: Invoke) {
        val current = invoke.getArgs().getString("current") ?: ""
        Thread {
            try {
                val (code, body) = fetch(RELEASE_URL, "application/vnd.github+json")
                if (code != HttpURLConnection.HTTP_OK) {
                    invoke.resolve(JSObject().put("state", "error").put("message", "GitHub answered $code"))
                    return@Thread
                }
                val release = UpdateRules.parseLatest(body)
                if (release == null || !UpdateRules.isNewer(release.tag, current)) {
                    invoke.resolve(JSObject().put("state", "current").put("version", current))
                    return@Thread
                }
                val version = UpdateRules.version(release.tag)
                val apk = UpdateRules.pickApk(release, Build.SUPPORTED_ABIS.firstOrNull())
                val sums = UpdateRules.find(release, UpdateRules.SUMS_NAME)
                if (version == null || apk == null || sums == null) {
                    invoke.resolve(JSObject().put("state", "error").put("message", NO_UPDATE))
                    return@Thread
                }
                invoke.resolve(
                    JSObject()
                        .put("state", "available")
                        .put("version", version)
                        .put("apkName", apk.name)
                        .put("apkUrl", apk.url)
                        .put("sumsUrl", sums.url),
                )
            } catch (error: IOException) {
                invoke.resolve(
                    JSObject().put("state", "error").put("message", "Couldn't reach GitHub (${error.message})."),
                )
            }
        }.start()
    }

    @Command
    fun update_download(invoke: Invoke) {
        val args = invoke.getArgs()
        val apkUrl = args.getString("apkUrl")
        val apkName = args.getString("apkName")
        val sumsUrl = args.getString("sumsUrl")
        if (apkUrl == null || apkName == null || sumsUrl == null) {
            invoke.reject(INVALID)
            return
        }
        Thread {
            try {
                val dir = updateDir().apply { mkdirs() }
                dir.listFiles()?.forEach { it.delete() }
                val (sumsCode, sumsBody) = fetch(sumsUrl, "application/octet-stream")
                val expected = if (sumsCode == HttpURLConnection.HTTP_OK) {
                    UpdateRules.parseSums(sumsBody)[apkName]
                } else {
                    null
                }
                val target = File(dir, apkName)
                download(apkUrl, target)
                if (!UpdateRules.checksumMatches(UpdateRules.sha256Hex(target), expected)) {
                    target.delete()
                    invoke.reject(COULDNT_UPDATE)
                    return@Thread
                }
                invoke.resolve(JSObject().put("path", target.absolutePath))
            } catch (error: IOException) {
                invoke.reject(COULDNT_UPDATE)
            }
        }.start()
    }

    @Command
    fun update_install(invoke: Invoke) {
        val path = invoke.getArgs().getString("path")
        val file = path?.let { File(it) }
        if (file == null || !isInsideUpdateDir(file)) {
            invoke.reject(COULDNT_UPDATE)
            return
        }
        if (!activity.packageManager.canRequestPackageInstalls()) {
            invoke.resolve(JSObject().put("state", "unknown_sources"))
            return
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, APK_MIME)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        activity.runOnUiThread { activity.startActivity(intent) }
        invoke.resolve(JSObject().put("state", "started"))
    }

    @Command
    fun update_open_install_settings(invoke: Invoke) {
        activity.runOnUiThread {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                .setData(Uri.parse("package:${activity.packageName}"))
            activity.startActivity(intent)
        }
        invoke.resolve()
    }

    private fun updateDir(): File = File(activity.cacheDir, UPDATE_DIR)

    private fun isInsideUpdateDir(file: File): Boolean =
        file.canonicalPath.startsWith(updateDir().canonicalPath + File.separator)

    private fun fetch(url: String, accept: String): Pair<Int, String> {
        val connection = open(url, accept)
        return try {
            val code = connection.responseCode
            val body = if (code == HttpURLConnection.HTTP_OK) connection.inputStream.bufferedReader().readText() else ""
            code to body
        } finally {
            connection.disconnect()
        }
    }

    private fun download(url: String, target: File) {
        val connection = open(url, "application/octet-stream")
        try {
            if (connection.responseCode != HttpURLConnection.HTTP_OK) throw IOException("download")
            val total = connection.contentLength.toLong()
            var done = 0L
            var lastPercent = -1
            connection.inputStream.use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        done += read
                        if (total > 0) {
                            val percent = (done * 100 / total).toInt().coerceIn(0, 99)
                            if (percent != lastPercent) {
                                lastPercent = percent
                                PlayerEvents.emit("update-progress", mapOf("percent" to percent))
                            }
                        }
                    }
                }
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun open(url: String, accept: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 60_000
            setRequestProperty("User-Agent", USER_AGENT)
            setRequestProperty("Accept", accept)
        }

    private companion object {
        const val RELEASE_URL = "https://api.github.com/repos/Nexvyn/hushio/releases/latest"
        const val UPDATE_DIR = "hushio-update"
        const val APK_MIME = "application/vnd.android.package-archive"
        const val USER_AGENT = "Hushio-Android"
        const val COULDNT_UPDATE = "Couldn't update"
        const val NO_UPDATE = "the release has no update for this app yet"
        const val INVALID = "invalid_args"
    }
}
