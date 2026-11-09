package com.hushio.app

import android.content.Intent
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
    ) ?: return
    PendingLaunch.offer(launch)
    if (warm) PlayerEvents.emit("launch-intent", emptyMap())
  }
}
