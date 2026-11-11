package com.hushio.player

import java.util.Locale

object ReduceMotion {
    fun isOn(animatorDurationScale: Float): Boolean = animatorDurationScale == 0f
}

object InsetsCss {
    data class Sides(val top: Float, val bottom: Float, val left: Float, val right: Float)

    fun dp(px: Int, density: Float): Float = if (density <= 0f) 0f else px / density

    fun sides(top: Int, bottom: Int, left: Int, right: Int, density: Float): Sides =
        Sides(dp(top, density), dp(bottom, density), dp(left, density), dp(right, density))

    fun script(sides: Sides): String =
        listOf("top" to sides.top, "bottom" to sides.bottom, "left" to sides.left, "right" to sides.right)
            .joinToString(";") { (side, value) ->
                "document.documentElement.style.setProperty('--inset-$side','${format(value)}px')"
            }

    fun format(value: Float): String = String.format(Locale.US, "%.2f", value)
}
