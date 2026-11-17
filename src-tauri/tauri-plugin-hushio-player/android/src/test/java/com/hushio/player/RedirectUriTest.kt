package com.hushio.player

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RedirectUriTest {
    private val scheme = "com.googleusercontent.apps.123-abc"

    @Test
    fun acceptsTheRedirectWithQuery() {
        assertTrue(RedirectUri.isOurs("$scheme:/oauth2redirect?code=x&state=y", scheme))
        assertTrue(RedirectUri.isOurs("$scheme:/oauth2redirect", scheme))
    }

    @Test
    fun rejectsOtherSchemesPathsAndPrefixes() {
        assertFalse(RedirectUri.isOurs("other:/oauth2redirect?code=x", scheme))
        assertFalse(RedirectUri.isOurs("$scheme:/oauth2redirectx?code=x", scheme))
        assertFalse(RedirectUri.isOurs("$scheme:/callback?code=x", scheme))
        assertFalse(RedirectUri.isOurs("$scheme:/oauth2redirect?code=x", ""))
    }

    @Test
    fun acceptsTheSpotifyCallbackOnlyForItsOwnScheme() {
        assertTrue(RedirectUri.isOurs("hushio-spotify:/callback?code=x&state=y", "hushio-spotify"))
        assertFalse(RedirectUri.isOurs("hushio-spotify:/oauth2redirect?code=x", "hushio-spotify"))
    }
}
