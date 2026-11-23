package com.hushio.player

data class Launch(val kind: String, val value: String)

object LaunchIntents {
    const val ACTION_SEND = "android.intent.action.SEND"
    const val ACTION_SEND_MULTIPLE = "android.intent.action.SEND_MULTIPLE"
    const val ACTION_VIEW = "android.intent.action.VIEW"
    const val APP_SCHEME = "hushio"

    fun classify(
        action: String?,
        type: String?,
        scheme: String?,
        dataUri: String?,
        text: String?,
        streamUri: String? = null,
    ): Launch? = when {
        action == ACTION_SEND && type == "text/plain" && !text.isNullOrBlank() -> Launch("text", text)
        (action == ACTION_SEND || action == ACTION_SEND_MULTIPLE) && type?.startsWith("audio/") == true && !streamUri.isNullOrBlank() ->
            Launch("file", streamUri)
        action == ACTION_VIEW && scheme == APP_SCHEME && !dataUri.isNullOrBlank() -> Launch("link", dataUri)
        action == ACTION_VIEW && type?.startsWith("audio/") == true && !dataUri.isNullOrBlank() -> Launch("file", dataUri)
        else -> null
    }
}

object PendingLaunch {
    private var pending: Launch? = null

    @Synchronized
    fun offer(launch: Launch) {
        pending = launch
    }

    @Synchronized
    fun take(): Launch? = pending.also { pending = null }
}
