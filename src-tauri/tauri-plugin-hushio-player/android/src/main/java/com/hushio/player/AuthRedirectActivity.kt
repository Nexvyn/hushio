package com.hushio.player

import android.app.Activity
import android.content.Intent
import android.os.Bundle

class AuthRedirectActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uri = intent?.dataString.orEmpty()
        if (RedirectUri.isOurs(uri, intent?.data?.scheme.orEmpty())) AuthRedirect.deliver(uri)
        packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
            launch.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            startActivity(launch)
        }
        finish()
    }
}
