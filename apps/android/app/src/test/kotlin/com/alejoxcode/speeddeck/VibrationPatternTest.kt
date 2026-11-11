package com.alejoxcode.speeddeck

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VibrationPatternTest {
    @Test
    fun `reads the web pattern and starts the waveform with no delay`() {
        assertArrayEquals(longArrayOf(0, 250, 120, 250), VibrationPattern.parse("250,120,250"))
        assertArrayEquals(longArrayOf(0, 60), VibrationPattern.parse(" 60 "))
    }

    @Test
    fun `refuses what is not a short list of durations`() {
        assertNull(VibrationPattern.parse(""))
        assertNull(VibrationPattern.parse("abc"))
        assertNull(VibrationPattern.parse("100,,100"))
        assertNull(VibrationPattern.parse("-5,100"))
        assertNull(VibrationPattern.parse("0,0"))
        assertNull(VibrationPattern.parse(List(VibrationPattern.MAX_STEPS + 1) { "10" }.joinToString(",")))
    }

    @Test
    fun `refuses a pattern that would buzz for too long`() {
        assertNull(VibrationPattern.parse("${VibrationPattern.MAX_STEP_MS + 1}"))
        assertNull(VibrationPattern.parse(List(5) { VibrationPattern.MAX_STEP_MS }.joinToString(",")))
    }
}
