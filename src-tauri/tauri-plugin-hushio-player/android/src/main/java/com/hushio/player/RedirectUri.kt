package com.hushio.player

object RedirectUri {
    const val PATH = "/oauth2redirect"
    const val SPOTIFY_SCHEME = "hushio-spotify"
    const val SPOTIFY_PATH = "/callback"

    fun isOurs(uri: String, scheme: String): Boolean {
        if (scheme.isEmpty() || !uri.startsWith("$scheme:")) return false
        val path = if (scheme == SPOTIFY_SCHEME) SPOTIFY_PATH else PATH
        val rest = uri.substring(scheme.length + 1)
        return rest.startsWith(path) && (rest.length == path.length || rest[path.length] in "?#")
    }
}
