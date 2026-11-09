package com.hushio.player

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateRulesTest {

    private val json = """
        {
          "tag_name": "v1.4.2",
          "assets": [
            {"name": "hushio-1.4.2-arm64-v8a.apk", "browser_download_url": "https://example.test/arm.apk"},
            {"name": "hushio-1.4.2-x86_64.apk", "browser_download_url": "https://example.test/x86.apk"},
            {"name": "SHA256SUMS.txt", "browser_download_url": "https://example.test/sums.txt"},
            {"name": "", "browser_download_url": "https://example.test/empty"}
          ]
        }
    """.trimIndent()

    @Test
    fun parsesTheLatestReleaseAndSkipsNamelessAssets() {
        val release = UpdateRules.parseLatest(json)!!
        assertEquals("v1.4.2", release.tag)
        assertEquals(3, release.assets.size)
        assertEquals("https://example.test/sums.txt", UpdateRules.find(release, "SHA256SUMS.txt")?.url)
    }

    @Test
    fun releaseWithoutTagIsRejected() {
        assertNull(UpdateRules.parseLatest("""{"assets": []}"""))
    }

    @Test
    fun versionRuleAcceptsOnlyPlainSemver() {
        assertEquals("1.4.2", UpdateRules.version("v1.4.2"))
        assertEquals("1.4.2", UpdateRules.version("1.4.2"))
        assertNull(UpdateRules.version("v1.4.2-beta"))
        assertNull(UpdateRules.version("1.4"))
    }

    @Test
    fun newerMeansMajorThenMinorThenPatch() {
        assertTrue(UpdateRules.isNewer("v2.0.0", "1.9.9"))
        assertTrue(UpdateRules.isNewer("v1.5.0", "1.4.9"))
        assertTrue(UpdateRules.isNewer("v1.4.3", "1.4.2"))
        assertFalse(UpdateRules.isNewer("v1.4.2", "1.4.2"))
        assertFalse(UpdateRules.isNewer("v1.4.1", "1.4.2"))
    }

    @Test
    fun preReleaseTagIsNeverNewer() {
        assertFalse(UpdateRules.isNewer("v9.0.0-rc1", "1.0.0"))
    }

    @Test
    fun abiPicksTheMatchingApk() {
        val release = UpdateRules.parseLatest(json)!!
        assertEquals("hushio-1.4.2-arm64-v8a.apk", UpdateRules.pickApk(release, "arm64-v8a")?.name)
        assertEquals("hushio-1.4.2-x86_64.apk", UpdateRules.pickApk(release, "x86_64")?.name)
    }

    @Test
    fun abiWithoutAFileOrOutsideTheList() {
        val release = UpdateRules.parseLatest(json)!!
        assertNull(UpdateRules.pickApk(release, "armeabi-v7a"))
        assertNull(UpdateRules.pickApk(release, "x86"))
        assertNull(UpdateRules.pickApk(release, null))
    }

    @Test
    fun checksumFileLinesAreParsed() {
        val hash = "a".repeat(64)
        val sums = parse(
            "$hash  hushio-1.4.2-arm64-v8a.apk\n" +
                "${"B".repeat(64)} *hushio-1.4.2-x86_64.apk\n" +
                "short  bad.apk\n",
        )
        assertEquals(hash, sums["hushio-1.4.2-arm64-v8a.apk"])
        assertEquals("b".repeat(64), sums["hushio-1.4.2-x86_64.apk"])
        assertEquals(2, sums.size)
    }

    @Test
    fun checksumComparisonIgnoresCaseAndRejectsMissingHash() {
        val hash = "0123456789abcdef".repeat(4)
        assertTrue(UpdateRules.checksumMatches(hash, hash.uppercase()))
        assertFalse(UpdateRules.checksumMatches(hash, "f".repeat(64)))
        assertFalse(UpdateRules.checksumMatches(hash, null))
        assertFalse(UpdateRules.checksumMatches(hash, ""))
    }

    @Test
    fun sha256OfAFileMatchesTheKnownDigest() {
        val file = File.createTempFile("hushio-sha", ".bin")
        try {
            file.writeText("abc")
            assertEquals(
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                UpdateRules.sha256Hex(file),
            )
        } finally {
            file.delete()
        }
    }

    private fun parse(text: String) = UpdateRules.parseSums(text)
}
