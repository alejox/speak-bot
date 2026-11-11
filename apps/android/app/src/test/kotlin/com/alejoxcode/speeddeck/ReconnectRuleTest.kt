package com.alejoxcode.speeddeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReconnectRuleTest {
    private val studioAtNewAddress = DiscoveredDesktop("Studio (1)", "studio-id", "Studio", "http://192.168.10.19:4545/")
    private val other = DiscoveredDesktop("Other (2)", "other-id", "Other", "http://192.168.10.17:4545/")

    @Test
    fun `finds the saved computer at its new address after the IP changed`() {
        val found = ReconnectRule.find(
            SavedDesktop(address = "http://192.168.10.17:4545/", desktopId = "studio-id"),
            listOf(other, studioAtNewAddress),
        )

        assertEquals(studioAtNewAddress, found)
    }

    @Test
    fun `never moves to another computer that took the old address`() {
        val found = ReconnectRule.find(
            SavedDesktop(address = "http://192.168.10.17:4545/", desktopId = "studio-id"),
            listOf(other),
        )

        assertNull(found)
    }

    @Test
    fun `recognises a computer paired by QR before its id was known by its address`() {
        val found = ReconnectRule.find(
            SavedDesktop(address = "http://192.168.10.17:4545/", desktopId = null),
            listOf(studioAtNewAddress, other),
        )

        assertEquals(other, found)
    }

    @Test
    fun `finds nothing when the saved computer is not announcing itself`() {
        assertNull(ReconnectRule.find(SavedDesktop("http://192.168.10.17:4545/", "studio-id"), emptyList()))
        assertNull(ReconnectRule.find(SavedDesktop("http://192.168.10.50:4545/", null), listOf(other)))
    }

    @Test
    fun `asks to switch only when the address changed`() {
        val saved = SavedDesktop("http://192.168.10.17:4545/", "studio-id")

        assertEquals(true, ReconnectRule.addressChanged(saved, studioAtNewAddress))
        assertEquals(false, ReconnectRule.addressChanged(saved, studioAtNewAddress.copy(address = saved.address)))
    }
}
