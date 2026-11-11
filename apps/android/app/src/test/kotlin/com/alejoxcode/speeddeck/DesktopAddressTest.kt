package com.alejoxcode.speeddeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DesktopAddressTest {
    @Test
    fun `accepts the URL encoded in the desktop pairing QR code`() {
        assertEquals("http://192.168.10.17:4545/", DesktopAddress.normalize("http://192.168.10.17:4545/"))
    }

    @Test
    fun `adds the default scheme and port to a bare IP address`() {
        assertEquals("http://192.168.1.5:4545/", DesktopAddress.normalize("192.168.1.5"))
    }

    @Test
    fun `keeps an explicit port`() {
        assertEquals("http://192.168.1.5:8080/", DesktopAddress.normalize("192.168.1.5:8080"))
    }

    @Test
    fun `adds a trailing slash to a URL without a path`() {
        assertEquals("http://192.168.1.5:4545/", DesktopAddress.normalize("http://192.168.1.5:4545"))
    }

    @Test
    fun `uses the default port when a URL has none`() {
        assertEquals("http://192.168.1.5:4545/", DesktopAddress.normalize("http://192.168.1.5/"))
    }

    @Test
    fun `accepts https`() {
        assertEquals("https://deck.local:4545/", DesktopAddress.normalize("https://deck.local:4545"))
    }

    @Test
    fun `accepts a machine name`() {
        assertEquals("http://studio-pc:4545/", DesktopAddress.normalize("studio-pc"))
    }

    @Test
    fun `trims whitespace and lowercases scheme and host`() {
        assertEquals("http://studio-pc:4545/", DesktopAddress.normalize("  HTTP://Studio-PC:4545/ \n"))
    }

    @Test
    fun `rejects empty input`() {
        assertNull(DesktopAddress.normalize(""))
        assertNull(DesktopAddress.normalize("   "))
    }

    @Test
    fun `rejects schemes other than http and https`() {
        assertNull(DesktopAddress.normalize("ftp://192.168.1.5:4545/"))
        assertNull(DesktopAddress.normalize("javascript:alert(1)"))
        assertNull(DesktopAddress.normalize("file:///sdcard/deck.html"))
    }

    @Test
    fun `rejects paths other than the root`() {
        assertNull(DesktopAddress.normalize("http://192.168.1.5:4545/settings"))
        assertNull(DesktopAddress.normalize("192.168.1.5:4545/deck"))
    }

    @Test
    fun `rejects queries, fragments and credentials`() {
        assertNull(DesktopAddress.normalize("http://192.168.1.5:4545/?token=1"))
        assertNull(DesktopAddress.normalize("http://192.168.1.5:4545/#deck"))
        assertNull(DesktopAddress.normalize("http://user:pass@192.168.1.5:4545/"))
    }

    @Test
    fun `rejects invalid ports and hosts`() {
        assertNull(DesktopAddress.normalize("192.168.1.5:abc"))
        assertNull(DesktopAddress.normalize("192.168.1.5:0"))
        assertNull(DesktopAddress.normalize("192.168.1.5:70000"))
        assertNull(DesktopAddress.normalize("http://:4545/"))
        assertNull(DesktopAddress.normalize("not an address"))
    }
}
