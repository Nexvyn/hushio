package com.hushio.player

object SecretRecords {
    val KEYS = setOf("google-refresh-token", "youtube-tv-token")
    private const val SEPARATOR = '='

    fun isKey(key: String): Boolean = key in KEYS

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
