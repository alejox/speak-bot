package com.alejoxcode.speeddeck

import org.junit.Assert.assertEquals
import org.junit.Test

class DeckBackTest {
    private val local = "https://appassets.androidplatform.net/"
    private val computer = "http://192.168.10.19:4545/"

    @Test
    fun `shows the menu when there is nothing to go back to`() {
        assertEquals(DeckBack.SHOW_MENU, DeckBack.choose(false, "${computer}dock", computer))
    }

    @Test
    fun `shows the menu at the root even when the app pushed history`() {
        assertEquals(DeckBack.SHOW_MENU, DeckBack.choose(true, local, local))
        assertEquals(DeckBack.SHOW_MENU, DeckBack.choose(true, "https://appassets.androidplatform.net", local))
    }

    @Test
    fun `treats query and fragment routes of the root as the root`() {
        assertEquals(DeckBack.SHOW_MENU, DeckBack.choose(true, "$local?section=voice", local))
        assertEquals(DeckBack.SHOW_MENU, DeckBack.choose(true, "$computer#/boards", computer))
    }

    @Test
    fun `goes back from another page of the deck`() {
        assertEquals(DeckBack.GO_BACK, DeckBack.choose(true, "${computer}dock", computer))
    }

    @Test
    fun `shows the menu when the current page is unknown or unreadable`() {
        assertEquals(DeckBack.SHOW_MENU, DeckBack.choose(true, null, computer))
        assertEquals(DeckBack.SHOW_MENU, DeckBack.choose(true, "not a url %%", computer))
    }

    @Test
    fun `shows the menu for a page outside the deck`() {
        assertEquals(DeckBack.SHOW_MENU, DeckBack.choose(true, "http://192.168.10.20:4545/dock", computer))
    }
}
