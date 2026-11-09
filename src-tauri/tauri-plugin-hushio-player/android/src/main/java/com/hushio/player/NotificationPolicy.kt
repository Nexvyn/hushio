package com.hushio.player

object NotificationPolicy {
    enum class State(val wire: String) { GRANTED("granted"), REQUEST("request"), SETTINGS("settings") }

    fun state(sdk: Int, granted: Boolean, showRationale: Boolean, askedBefore: Boolean): State = when {
        sdk < 33 || granted -> State.GRANTED
        !askedBefore || showRationale -> State.REQUEST
        else -> State.SETTINGS
    }
}
