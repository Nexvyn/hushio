package com.hushio.player

object RedirectUri {
    const val PATH = "/oauth2redirect"

    fun isOurs(uri: String, scheme: String): Boolean {
        if (scheme.isEmpty() || !uri.startsWith("$scheme:")) return false
        val rest = uri.substring(scheme.length + 1)
        return rest.startsWith(PATH) && (rest.length == PATH.length || rest[PATH.length] in "?#")
    }
}
