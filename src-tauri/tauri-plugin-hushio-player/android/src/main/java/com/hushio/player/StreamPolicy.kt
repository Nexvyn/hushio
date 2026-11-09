package com.hushio.player

import androidx.media3.common.PlaybackException

enum class StreamFailure { MISSING, FILE_MISSING, FORBIDDEN, RETRY, FATAL }

object StreamPolicy {
    const val REASON_MISSING = "missing"
    const val REASON_HTTP_403 = "http_403"
    const val REASON_EXPIRED = "expired"
    const val MISSING_URL_WAIT_MS = 15_000L

    fun classify(errorCode: Int, httpStatus: Int, hasUrl: Boolean, isContent: Boolean): StreamFailure = when {
        !hasUrl -> StreamFailure.MISSING
        isContent -> if (errorCode == PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND) {
            StreamFailure.FILE_MISSING
        } else {
            StreamFailure.FATAL
        }
        errorCode == PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> when (httpStatus) {
            403 -> StreamFailure.FORBIDDEN
            in 500..599 -> StreamFailure.RETRY
            else -> StreamFailure.FATAL
        }
        errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ||
            errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> StreamFailure.RETRY
        else -> StreamFailure.FATAL
    }

    fun isExpired(expiresAtMs: Long?, nowMs: Long): Boolean = expiresAtMs != null && nowMs >= expiresAtMs
}

class RetryPolicy(private val delaysMs: List<Long> = DELAYS_MS) {
    private var attempts = 0

    fun next(): Long? = delaysMs.getOrNull(attempts)?.also { attempts += 1 }

    fun reset() {
        attempts = 0
    }

    companion object {
        val DELAYS_MS = listOf(1_000L, 2_000L, 4_000L)
    }
}
