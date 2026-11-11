package com.alejoxcode.speeddeck

import org.junit.Assert.assertEquals
import org.junit.Test

class FoundComputerOfferTest {
    private val studio = DiscoveredDesktop("Studio", "studio-id", "Studio", "http://192.168.10.19:4545/")
    private val office = DiscoveredDesktop("Office", "office-id", "Office", "http://192.168.10.20:4545/")

    @Test
    fun `offers nothing when no computer was found`() {
        assertEquals(FoundComputerOffer.None, FoundComputerOffer.choose(emptyList(), emptySet()))
    }

    @Test
    fun `offers the one computer found`() {
        assertEquals(FoundComputerOffer.Single(studio), FoundComputerOffer.choose(listOf(studio), emptySet()))
    }

    @Test
    fun `offers nothing for a computer the user closed the banner for`() {
        assertEquals(FoundComputerOffer.None, FoundComputerOffer.choose(listOf(studio), setOf("studio-id")))
    }

    @Test
    fun `offers the list when several computers were found`() {
        val offer = FoundComputerOffer.choose(listOf(office, studio), emptySet())
        assertEquals(FoundComputerOffer.Several(listOf(office, studio)), offer)
        assertEquals(2, (offer as FoundComputerOffer.Several).count)
    }

    @Test
    fun `leaves dismissed computers out of the count`() {
        val third = DiscoveredDesktop("Den", "den-id", "Den", "http://192.168.10.21:4545/")
        assertEquals(
            FoundComputerOffer.Several(listOf(office, third)),
            FoundComputerOffer.choose(listOf(office, studio, third), setOf("studio-id")),
        )
    }

    @Test
    fun `offers the remaining computer directly when the others were dismissed`() {
        assertEquals(
            FoundComputerOffer.Single(office),
            FoundComputerOffer.choose(listOf(office, studio), setOf("studio-id")),
        )
    }

    @Test
    fun `offers nothing when every computer was dismissed`() {
        assertEquals(
            FoundComputerOffer.None,
            FoundComputerOffer.choose(listOf(office, studio), setOf("studio-id", "office-id")),
        )
    }
}
