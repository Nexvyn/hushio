package com.hushio.player

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

abstract class HushioWidgetBase(private val style: WidgetRender.Style) : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = WidgetRender.views(context, style, WidgetStore.read(context))
        for (id in appWidgetIds) manager.updateAppWidget(id, views)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action ?: return
        if (action !in WidgetRender.ACTIONS) return
        val player = PlayerService.current
        if (player == null) {
            WidgetRender.openApp(context)
            return
        }
        when (action) {
            WidgetRender.ACTION_TOGGLE -> player.togglePlayPause()
            WidgetRender.ACTION_PREVIOUS -> player.previous()
            WidgetRender.ACTION_NEXT -> player.next()
        }
    }
}
