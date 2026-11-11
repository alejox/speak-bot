package com.alejoxcode.speeddeck

/**
 * Reads a vibration pattern sent by the web app (`navigator.vibrate` style: comma-separated milliseconds,
 * on, off, on…) into an Android waveform, which starts with an off step. Any page in the WebView can ask, so
 * only short, sane patterns are accepted.
 */
object VibrationPattern {
    const val MAX_STEPS = 10
    const val MAX_STEP_MS = 1_000L
    const val MAX_TOTAL_MS = 3_000L

    /** The waveform timings (`0` first), or null when the pattern is malformed, silent or too long. */
    fun parse(pattern: String): LongArray? {
        val steps = pattern.split(",").map { it.trim().toLongOrNull() ?: return null }
        if (steps.isEmpty() || steps.size > MAX_STEPS) return null
        if (steps.any { it < 0 || it > MAX_STEP_MS }) return null
        if (steps.sum() > MAX_TOTAL_MS) return null
        // Only the odd positions (0, 2…) vibrate; a pattern with nothing on is not a vibration.
        if (steps.filterIndexed { index, _ -> index % 2 == 0 }.all { it == 0L }) return null
        return longArrayOf(0) + steps.toLongArray()
    }
}
