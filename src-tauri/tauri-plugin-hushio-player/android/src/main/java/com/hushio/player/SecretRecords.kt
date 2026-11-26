package com.hushio.player

object SecretRecords {
    val KEYS = setOf(
        "google-refresh-token",
        "spotify-refresh-token",
        "youtube-tv-token",
        "lastfm-session",
        "lastfm-pending-token",
        "listenbrainz-token",
    )
    private const val SEPARATOR = '='
    private const val SHARE_PREFIX = "network-share:"

    fun isKey(key: String): Boolean = key in KEYS || isShareKey(key)

    private fun isShareKey(key: String): Boolean {
        if (!key.startsWith(SHARE_PREFIX)) return false
        val id = key.substring(SHARE_PREFIX.length)
        return id.isNotEmpty() && id.all { it.isLetterOrDigit() || it == '-' || it == '_' }
    }

    fun parse(text: String): Map<String, String> {
        val records = LinkedHashMap<String, String>()
        for (line in text.lineSequence()) {
            val index = line.indexOf(SEPARATOR)
            if (index <= 0) continue
            val key = line.substring(0, index)
            if (isKey(key)) records[key] = line.substring(index + 1)
        }
        return records
    }

    fun serialize(records: Map<String, String>): String =
        records.entries
            .filter { isKey(it.key) && !it.value.contains('\n') }
            .joinToString(separator = "\n", postfix = "\n") { "${it.key}$SEPARATOR${it.value}" }
}
