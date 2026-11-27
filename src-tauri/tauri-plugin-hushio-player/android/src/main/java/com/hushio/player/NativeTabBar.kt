package com.hushio.player

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.provider.Settings
import android.text.TextUtils
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.abs
import kotlin.math.roundToInt

object TabBarState {
    val IDS = listOf("home", "search", "library")
    const val LONG_HOLD_MS = 500L
    const val TAB_DP = 56
    const val CORNER_DP = 24
    const val ANIM_MS = 175L

    data class Snapshot(
        val active: String?,
        val visible: Boolean,
        val rounded: Boolean,
        val surface: String,
        val ink1: String,
        val ink2: String,
        val labels: List<String>,
    )

    fun pressEvent(current: String?, tapped: String): Pair<String, Boolean> = tapped to (tapped == current)
}

private class TabItem(val id: String, val root: LinearLayout, val icon: ImageView, val label: TextView)

object NativeTabBar {
    private var density = 1f
    private var bar: LinearLayout? = null
    private var tabs: List<TabItem> = emptyList()
    private var current: TabBarState.Snapshot? = null
    private var shownVisible: Boolean? = null
    private var longFired = false
    private var downX = 0f
    private var downY = 0f

    private val holdFire = Runnable {
        longFired = true
        val search = tabs.firstOrNull { it.id == "search" } ?: return@Runnable
        search.root.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        PlayerEvents.emit("tab-long-press", mapOf("id" to "search"))
    }

    fun apply(activity: Activity, state: TabBarState.Snapshot) {
        density = activity.resources.displayMetrics.density
        val host = activity.findViewById<ViewGroup>(android.R.id.content)
        val existing = bar?.takeIf { it.parent === host }
        val row = existing ?: build(activity, host)
        bar = row
        current = state
        val ink1 = Color.parseColor(state.ink1)
        val ink2 = Color.parseColor(state.ink2)
        row.background = surfaceBackground(Color.parseColor(state.surface), state.rounded)
        val ripple = ColorStateList.valueOf(Color.argb(31, Color.red(ink1), Color.green(ink1), Color.blue(ink1)))
        tabs.forEachIndexed { index, tab ->
            val isActive = tab.id == state.active
            val color = if (isActive) ink1 else ink2
            tab.icon.setImageResource(icon(tab.id, isActive))
            tab.icon.imageTintList = ColorStateList.valueOf(color)
            tab.label.text = state.labels.getOrNull(index) ?: tab.id
            tab.label.setTextColor(color)
            tab.label.typeface = if (isActive) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            tab.root.background = RippleDrawable(ripple, null, ColorDrawable(Color.WHITE))
        }
        val fresh = existing == null
        if (fresh || shownVisible != state.visible) {
            val reduced = ReduceMotion.isOn(
                Settings.Global.getFloat(activity.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f),
            )
            place(row, state.visible, animate = !fresh && !reduced)
        }
        shownVisible = state.visible
    }

    private fun build(activity: Activity, host: ViewGroup): LinearLayout {
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM,
            )
            elevation = 0f
            ViewCompat.setOnApplyWindowInsetsListener(this) { view, insets ->
                view.setPadding(0, 0, 0, insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom)
                insets
            }
        }
        tabs = TabBarState.IDS.map { buildItem(activity, it) }
        tabs.forEach { row.addView(it.root, LinearLayout.LayoutParams(0, dp(TabBarState.TAB_DP), 1f)) }
        host.addView(row)
        ViewCompat.requestApplyInsets(row)
        return row
    }

    private fun buildItem(activity: Activity, id: String): TabItem {
        val icon = ImageView(activity).apply {
            layoutParams = LinearLayout.LayoutParams(dp(24), dp(24))
        }
        val label = TextView(activity).apply {
            textSize = 12f
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(4) }
        }
        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            addView(icon)
            addView(label)
            setOnTouchListener { view, event ->
                if (id == "search") holdTouch(view, event)
                false
            }
            setOnClickListener { view -> onTab(view, id) }
        }
        return TabItem(id, root, icon, label)
    }

    private fun onTab(view: View, id: String) {
        if (id == "search" && longFired) {
            longFired = false
            return
        }
        view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
        val (tapped, again) = TabBarState.pressEvent(current?.active, id)
        PlayerEvents.emit("tab-press", mapOf("id" to tapped, "again" to again))
    }

    private fun holdTouch(view: View, event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                longFired = false
                downX = event.x
                downY = event.y
                view.postDelayed(holdFire, TabBarState.LONG_HOLD_MS)
            }
            MotionEvent.ACTION_MOVE -> {
                val slop = ViewConfiguration.get(view.context).scaledTouchSlop
                if (abs(event.x - downX) > slop || abs(event.y - downY) > slop) view.removeCallbacks(holdFire)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> view.removeCallbacks(holdFire)
        }
    }

    private fun place(row: LinearLayout, visible: Boolean, animate: Boolean) {
        val target = if (visible) 0f else hiddenOffset(row)
        row.animate().cancel()
        if (!animate) {
            row.translationY = target
            return
        }
        row.animate()
            .translationY(target)
            .setDuration(TabBarState.ANIM_MS)
            .setInterpolator(if (visible) DecelerateInterpolator() else PathInterpolator(0.3f, 0f, 1f, 1f))
            .start()
    }

    private fun hiddenOffset(row: View): Float = (if (row.height > 0) row.height else dp(TabBarState.TAB_DP)).toFloat()

    private fun icon(id: String, active: Boolean): Int = when (id) {
        "home" -> if (active) R.drawable.ic_tab_home_fill else R.drawable.ic_tab_home
        "search" -> if (active) R.drawable.ic_tab_search_fill else R.drawable.ic_tab_search
        else -> if (active) R.drawable.ic_tab_library_fill else R.drawable.ic_tab_library
    }

    private fun surfaceBackground(color: Int, rounded: Boolean): GradientDrawable {
        val radius = if (rounded) TabBarState.CORNER_DP * density else 0f
        return GradientDrawable().apply {
            setColor(color)
            cornerRadii = floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f)
        }
    }

    private fun dp(value: Int): Int = (value * density).roundToInt()
}
