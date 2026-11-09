package com.hushio.player

import com.hushio.player.NotificationPolicy.State
import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationPolicyTest {

    @Test
    fun belowAndroid13NeedsNoRequest() {
        assertEquals(State.GRANTED, NotificationPolicy.state(32, false, false, false))
    }

    @Test
    fun grantedStaysGranted() {
        assertEquals(State.GRANTED, NotificationPolicy.state(35, true, false, true))
    }

    @Test
    fun firstAskAndRationaleBothRequest() {
        assertEquals(State.REQUEST, NotificationPolicy.state(35, false, false, false))
        assertEquals(State.REQUEST, NotificationPolicy.state(35, false, true, true))
    }

    @Test
    fun deniedWithoutRationaleOpensSettings() {
        assertEquals(State.SETTINGS, NotificationPolicy.state(35, false, false, true))
    }
}
