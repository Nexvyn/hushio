package com.hushio.player

import org.junit.Assert.assertEquals
import org.junit.Test

class TabBarStateTest {

    @Test
    fun tappingTheActiveTabIsAgain() {
        assertEquals("home" to true, TabBarState.pressEvent("home", "home"))
    }

    @Test
    fun tappingAnotherTabIsNotAgain() {
        assertEquals("library" to false, TabBarState.pressEvent("home", "library"))
    }

    @Test
    fun noActiveTabMeansNothingIsAgain() {
        assertEquals("search" to false, TabBarState.pressEvent(null, "search"))
    }
}
