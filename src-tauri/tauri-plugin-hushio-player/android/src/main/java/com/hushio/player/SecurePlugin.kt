package com.hushio.player

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

class SecurePlugin(private val activity: Activity) : Plugin(activity) {
    private val vault by lazy { SecretVault(activity.applicationContext) }

    @Command
    fun secure_set(invoke: Invoke) = run(invoke) { args ->
        val key = args.getString("key")
        vault.set(key, args.getString("value"))
        invoke.resolve()
    }

    @Command
    fun secure_get(invoke: Invoke) = run(invoke) { args ->
        val value = vault.get(args.getString("key"))
        invoke.resolve(JSObject().put("value", value ?: org.json.JSONObject.NULL))
    }

    @Command
    fun secure_clear(invoke: Invoke) = run(invoke) { args ->
        vault.clear(args.getString("key"))
        invoke.resolve()
    }

    private fun run(invoke: Invoke, block: (JSObject) -> Unit) {
        val args = invoke.getArgs()
        if (!SecretRecords.isKey(args.optString("key"))) {
            invoke.reject("unknown_key")
            return
        }
        Thread {
            try {
                block(args)
            } catch (error: Exception) {
                invoke.reject("secret_failed")
            }
        }.start()
    }
}
