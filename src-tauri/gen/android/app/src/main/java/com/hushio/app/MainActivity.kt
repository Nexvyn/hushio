package com.hushio.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import com.hushio.player.LaunchIntents
import com.hushio.player.PendingLaunch
import com.hushio.player.PlayerEvents

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    if (savedInstanceState == null) accept(intent, warm = false)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    accept(intent, warm = true)
  }

  private fun accept(intent: Intent, warm: Boolean) {
    val launch = LaunchIntents.classify(
      intent.action,
      intent.type,
      intent.data?.scheme,
      intent.dataString,
      intent.getStringExtra(Intent.EXTRA_TEXT),
      sharedStream(intent)?.toString(),
    ) ?: return
    PendingLaunch.offer(launch)
    if (warm) PlayerEvents.emit("launch-intent", emptyMap())
  }

  private fun sharedStream(intent: Intent): Uri? {
    if (intent.action == LaunchIntents.ACTION_SEND_MULTIPLE) {
      val list = if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
      }
      return list?.firstOrNull()
    }
    return if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
    }
  }
}
