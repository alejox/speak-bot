package com.alejoxcode.speeddeck

import org.junit.Assert.assertEquals
import org.junit.Test

class LaunchTargetTest {
    private val studio = SavedDesktop("http://192.168.10.19:4545/", "studio-id")

    @Test
    fun `shows the connect screen on first launch, without picking a computer`() {
        assertEquals(LaunchTarget.Connect, LaunchTarget.choose(mode = null, desktop = null))
    }

    @Test
    fun `opens the saved computer`() {
        assertEquals(LaunchTarget.Computer(studio), LaunchTarget.choose(LaunchMode.COMPUTER, studio))
    }

    @Test
    fun `opens the saved computer saved by a version without launch modes`() {
        assertEquals(LaunchTarget.Computer(studio), LaunchTarget.choose(mode = null, desktop = studio))
    }

    @Test
    fun `goes straight to speaking without a computer when that was the last choice`() {
        assertEquals(LaunchTarget.Local, LaunchTarget.choose(LaunchMode.LOCAL, studio))
        assertEquals(LaunchTarget.Local, LaunchTarget.choose(LaunchMode.LOCAL, null))
    }

    @Test
    fun `shows the connect screen when the computer mode has no saved computer`() {
        assertEquals(LaunchTarget.Connect, LaunchTarget.choose(LaunchMode.COMPUTER, null))
    }
}
