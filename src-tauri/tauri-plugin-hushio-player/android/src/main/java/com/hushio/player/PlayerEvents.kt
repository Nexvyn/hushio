package com.hushio.player

object PlayerEvents {
    @Volatile
    var sink: ((String, Map<String, Any?>) -> Unit)? = null

    fun emit(name: String, payload: Map<String, Any?>) {
        sink?.invoke(name, payload)
    }
}
