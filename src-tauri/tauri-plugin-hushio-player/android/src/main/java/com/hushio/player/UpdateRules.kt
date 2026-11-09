package com.hushio.player

import java.io.File
import java.security.MessageDigest
import org.json.JSONObject

data class ReleaseAsset(val name: String, val url: String)

data class LatestRelease(val tag: String, val assets: List<ReleaseAsset>)

object UpdateRules {
    const val SUMS_NAME = "SHA256SUMS.txt"
    private val SUPPORTED_ABIS = listOf("arm64-v8a", "armeabi-v7a", "x86_64")
    private val VERSION = Regex("""v?(\d+)\.(\d+)\.(\d+)""")
    private val HASH = Regex("""[0-9a-fA-F]{64}""")
    private val SPACES = Regex("""\s+""")

    fun version(tag: String): String? {
        val match = VERSION.matchEntire(tag) ?: return null
        return match.groupValues.drop(1).joinToString(".")
    }

    fun isNewer(latestTag: String, installed: String): Boolean {
        val latest = parts(latestTag) ?: return false
        val current = parts(installed) ?: return false
        return latest.zip(current).firstOrNull { it.first != it.second }?.let { it.first > it.second } ?: false
    }

    fun isSupportedAbi(abi: String?): Boolean = abi != null && abi in SUPPORTED_ABIS

    fun apkName(version: String, abi: String): String = "hushio-$version-$abi.apk"

    fun pickApk(release: LatestRelease, abi: String?): ReleaseAsset? {
        if (!isSupportedAbi(abi)) return null
        val version = version(release.tag) ?: return null
        return find(release, apkName(version, abi!!))
    }

    fun find(release: LatestRelease, name: String): ReleaseAsset? = release.assets.firstOrNull { it.name == name }

    fun parseSums(text: String): Map<String, String> {
        val sums = LinkedHashMap<String, String>()
        for (line in text.lineSequence()) {
            val fields = line.trim().split(SPACES, limit = 2)
            if (fields.size != 2) continue
            val hash = fields[0]
            if (!HASH.matches(hash)) continue
            sums[fields[1].removePrefix("*")] = hash.lowercase()
        }
        return sums
    }

    fun checksumMatches(actualHex: String, expectedHex: String?): Boolean =
        !expectedHex.isNullOrEmpty() && actualHex.equals(expectedHex, ignoreCase = true)

    fun parseLatest(json: String): LatestRelease? {
        val root = JSONObject(json)
        val tag = root.optString("tag_name").takeIf { it.isNotBlank() } ?: return null
        val list = root.optJSONArray("assets") ?: return LatestRelease(tag, emptyList())
        val assets = (0 until list.length()).mapNotNull { index ->
            val asset = list.optJSONObject(index) ?: return@mapNotNull null
            val name = asset.optString("name")
            val url = asset.optString("browser_download_url")
            if (name.isEmpty() || url.isEmpty()) null else ReleaseAsset(name, url)
        }
        return LatestRelease(tag, assets)
    }

    fun sha256Hex(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun parts(text: String): List<Int>? {
        val match = VERSION.matchEntire(text) ?: return null
        return match.groupValues.drop(1).map { it.toIntOrNull() ?: return null }
    }
}
