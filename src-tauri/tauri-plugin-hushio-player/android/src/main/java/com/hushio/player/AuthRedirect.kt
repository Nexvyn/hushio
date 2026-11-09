package com.hushio.player

object AuthRedirect {
    private var waiter: ((String) -> Unit)? = null

    @Synchronized
    fun await(callback: (String) -> Unit) {
        cancel()
        waiter = callback
    }

    @Synchronized
    fun cancel() {
        val previous = waiter ?: return
        waiter = null
        previous("")
    }

    @Synchronized
    fun deliver(uri: String): Boolean {
        val callback = waiter ?: return false
        waiter = null
        callback(uri)
        return true
    }
}
