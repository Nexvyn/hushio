package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LaunchIntentsTest {

    @Test
    fun sharedTextBecomesTextLaunch() {
        val launch = LaunchIntents.classify(LaunchIntents.ACTION_SEND, "text/plain", null, null, "https://youtu.be/abc")
        assertEquals(Launch("text", "https://youtu.be/abc"), launch)
    }

    @Test
    fun blankSharedTextIsIgnored() {
        assertNull(LaunchIntents.classify(LaunchIntents.ACTION_SEND, "text/plain", null, null, "   "))
        assertNull(LaunchIntents.classify(LaunchIntents.ACTION_SEND, "image/png", null, null, "https://youtu.be/abc"))
    }

    @Test
    fun appSchemeBecomesLinkLaunch() {
        val launch = LaunchIntents.classify(LaunchIntents.ACTION_VIEW, null, "hushio", "hushio://playlist?list=PL1", null)
        assertEquals(Launch("link", "hushio://playlist?list=PL1"), launch)
    }

    @Test
    fun audioViewBecomesFileLaunch() {
        val uri = "content://media/external/audio/media/42"
        assertEquals(Launch("file", uri), LaunchIntents.classify(LaunchIntents.ACTION_VIEW, "audio/mpeg", "content", uri, null))
    }

    @Test
    fun sharedAudioStreamBecomesFileLaunch() {
        val uri = "content://media/external/audio/media/7"
        assertEquals(Launch("file", uri), LaunchIntents.classify(LaunchIntents.ACTION_SEND, "audio/mpeg", null, null, null, uri))
        assertEquals(
            Launch("file", uri),
            LaunchIntents.classify(LaunchIntents.ACTION_SEND_MULTIPLE, "audio/*", null, null, null, uri),
        )
    }

    @Test
    fun sharedStreamThatIsNotAudioOrIsBlankIsIgnored() {
        assertNull(LaunchIntents.classify(LaunchIntents.ACTION_SEND, "video/mp4", null, null, null, "content://x/1"))
        assertNull(LaunchIntents.classify(LaunchIntents.ACTION_SEND, "audio/mpeg", null, null, null, "  "))
        assertNull(LaunchIntents.classify(LaunchIntents.ACTION_SEND, "audio/mpeg", null, null, null, null))
    }

    @Test
    fun otherViewsAreIgnored() {
        assertNull(LaunchIntents.classify(LaunchIntents.ACTION_VIEW, "video/mp4", "content", "content://x/1", null))
        assertNull(LaunchIntents.classify(LaunchIntents.ACTION_VIEW, null, "https", "https://example.com", null))
        assertNull(LaunchIntents.classify("android.intent.action.MAIN", null, null, null, null))
    }

    @Test
    fun pendingLaunchIsTakenOnce() {
        PendingLaunch.offer(Launch("file", "content://a"))
        assertEquals(Launch("file", "content://a"), PendingLaunch.take())
        assertNull(PendingLaunch.take())
    }
}
