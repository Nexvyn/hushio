package com.hushio.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.view.animation.PathInterpolator
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.hushio.player.BackGesture
import com.hushio.player.LaunchGate
import com.hushio.player.LaunchIntents
import com.hushio.player.PendingLaunch
import com.hushio.player.PlayerEvents

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    val startedAt = SystemClock.uptimeMillis()
    val splash = installSplashScreen()
    splash.setKeepOnScreenCondition { LaunchGate.keepOnScreen(startedAt, SystemClock.uptimeMillis()) }
    splash.setOnExitAnimationListener { provider ->
      val scale = Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
      if (scale == 0f) {
        provider.remove()
      } else {
        provider.view.animate()
          .alpha(0f)
          .setDuration(175)
          .setInterpolator(PathInterpolator(0.3f, 0f, 1f, 1f))
          .withEndAction { provider.remove() }
          .start()
      }
    }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    BackGesture.install(this)
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
