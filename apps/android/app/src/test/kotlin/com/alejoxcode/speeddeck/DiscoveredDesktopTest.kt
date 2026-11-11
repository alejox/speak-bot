package com.alejoxcode.speeddeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DiscoveredDesktopTest {
    private fun txt(vararg pairs: Pair<String, String?>): Map<String, ByteArray?> =
        pairs.associate { (key, value) -> key to value?.toByteArray(Charsets.UTF_8) }

    @Test
    fun `reads the id, name and address of an announced desktop`() {
        val desktop = DiscoveredDesktop.fromService(
            serviceName = "Studio Mac (0f8e2c)",
            hostAddress = "192.168.10.19",
            port = 4545,
            attributes = txt("id" to "0f8e2c1a-id", "name" to "Studio Mac", "v" to "1"),
        )

        assertEquals(
            DiscoveredDesktop("Studio Mac (0f8e2c)", "0f8e2c1a-id", "Studio Mac", "http://192.168.10.19:4545/"),
            desktop,
        )
    }

    @Test
    fun `uses the service name when the announcement has no display name`() {
        val desktop = DiscoveredDesktop.fromService("Desk (abc)", "10.0.0.2", 4546, txt("id" to "abc", "v" to "1"))

        assertEquals("Desk (abc)", desktop?.name)
        assertEquals("http://10.0.0.2:4546/", desktop?.address)
    }

    @Test
    fun `ignores an announcement without an id`() {
        assertNull(DiscoveredDesktop.fromService("Desk", "10.0.0.2", 4545, txt("name" to "Desk", "v" to "1")))
        assertNull(DiscoveredDesktop.fromService("Desk", "10.0.0.2", 4545, txt("id" to "", "v" to "1")))
        assertNull(DiscoveredDesktop.fromService("Desk", "10.0.0.2", 4545, txt("id" to null, "v" to "1")))
    }

    @Test
    fun `ignores an announcement of an unsupported protocol version`() {
        assertNull(DiscoveredDesktop.fromService("Desk", "10.0.0.2", 4545, txt("id" to "abc", "v" to "2")))
        assertNull(DiscoveredDesktop.fromService("Desk", "10.0.0.2", 4545, txt("id" to "abc")))
    }

    @Test
    fun `ignores an announcement with an unusable address`() {
        assertNull(DiscoveredDesktop.fromService("Desk", "", 4545, txt("id" to "abc", "v" to "1")))
        assertNull(DiscoveredDesktop.fromService("Desk", "10.0.0.2", 0, txt("id" to "abc", "v" to "1")))
    }

    @Test
    fun `lists each computer once, sorted by name, and replaces a computer seen at a new address`() {
        val studio = DiscoveredDesktop("Studio (1)", "1", "Studio", "http://10.0.0.17:4545/")
        val attic = DiscoveredDesktop("Attic (2)", "2", "attic", "http://10.0.0.30:4545/")
        val studioMoved = studio.copy(address = "http://10.0.0.19:4545/")

        val list = DiscoveredDesktop.merge(DiscoveredDesktop.merge(listOf(studio), attic), studioMoved)

        assertEquals(listOf(attic, studioMoved), list)
    }

    @Test
    fun `removes a computer that stopped announcing itself`() {
        val studio = DiscoveredDesktop("Studio (1)", "1", "Studio", "http://10.0.0.17:4545/")
        val attic = DiscoveredDesktop("Attic (2)", "2", "Attic", "http://10.0.0.30:4545/")

        assertEquals(listOf(attic), DiscoveredDesktop.without(listOf(attic, studio), "Studio (1)"))
    }
}
