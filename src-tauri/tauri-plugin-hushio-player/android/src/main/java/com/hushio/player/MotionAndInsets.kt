package com.hushio.player

import java.util.Locale

object ReduceMotion {
    fun isOn(animatorDurationScale: Float): Boolean = animatorDurationScale == 0f
}

object InsetsCss {
    fun dp(px: Int, density: Float): Float = if (density <= 0f) 0f else px / density

    fun declarations(top: Int, bottom: Int, left: Int, right: Int, density: Float): String =
        listOf("top" to top, "bottom" to bottom, "left" to left, "right" to right).joinToString(";") { (side, px) ->
            "--inset-$side:${String.format(Locale.US, "%.2f", dp(px, density))}px"
        }
}
