package com.hushio.player

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.work.Worker
import androidx.work.WorkerParameters

class SyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        if (!hasInternet(applicationContext)) return Result.success()
        val outcome = try {
            SyncOutcome.fromCode(SyncNative.runSync())
        } catch (error: UnsatisfiedLinkError) {
            SyncOutcome.NOT_READY
        }
        when (outcome) {
            SyncOutcome.DONE -> SyncScheduler.reset(applicationContext)
            SyncOutcome.OFFLINE -> SyncScheduler.scheduleRetry(applicationContext)
            SyncOutcome.NOT_READY -> Unit
        }
        return Result.success()
    }

    private fun hasInternet(context: Context): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
