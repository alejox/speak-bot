package com.alejoxcode.speeddeck

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface

/**
 * Gives the web app the phone's vibrator and the saved computer's name, as `window.SpeedDeckAndroidDevice`.
 * The web side is `createDeviceSignals`. Every page in the WebView can call it, so the pattern is bounded
 * ([VibrationPattern]) and only the name of the computer the user chose is shared.
 */
class DeviceBridge(context: Context, private val computerName: () -> String?) {
    private val vibrator: Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }

    /** [pattern] is comma-separated milliseconds, on first; false when refused or the phone cannot vibrate. */
    @JavascriptInterface
    fun vibrate(pattern: String): Boolean {
        val timings = VibrationPattern.parse(pattern) ?: return false
        val target = vibrator?.takeIf { it.hasVibrator() } ?: return false
        target.vibrate(VibrationEffect.createWaveform(timings, NO_REPEAT))
        return true
    }

    /** Empty when the computer was paired by QR or address and has not been seen on the network yet. */
    @JavascriptInterface
    fun computerName(): String = computerName.invoke().orEmpty()

    companion object {
        const val JS_NAME = "SpeedDeckAndroidDevice"
        private const val NO_REPEAT = -1
    }
}
