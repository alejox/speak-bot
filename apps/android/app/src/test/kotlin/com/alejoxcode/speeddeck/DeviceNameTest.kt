package com.alejoxcode.speeddeck

import org.junit.Assert.assertEquals
import org.junit.Test

class DeviceNameTest {
    @Test
    fun `joins the maker and the model`() {
        assertEquals("Samsung SM-S921B", DeviceName.describe("samsung", "SM-S921B"))
        assertEquals("Motorola moto g54", DeviceName.describe(" motorola ", " moto g54 "))
    }

    @Test
    fun `does not repeat a maker the model already starts with`() {
        assertEquals("Google Pixel 8", DeviceName.describe("Google", "Google Pixel 8"))
        assertEquals("OnePlus 12", DeviceName.describe("oneplus", "OnePlus 12"))
    }

    @Test
    fun `falls back to what is known`() {
        assertEquals("Pixel 8", DeviceName.describe(null, "Pixel 8"))
        assertEquals("Pixel 8", DeviceName.describe("unknown", "Pixel 8"))
        assertEquals("Samsung", DeviceName.describe("samsung", ""))
        assertEquals("Android", DeviceName.describe(null, null))
        assertEquals("Android", DeviceName.describe("  ", "unknown"))
    }

    @Test
    fun `drops control characters and keeps the name short`() {
        assertEquals("Acme Phone X", DeviceName.describe("acme", "Phone\u0000\n X"))
        assertEquals(DeviceName.MAX_LENGTH, DeviceName.describe("acme", "x".repeat(300)).length)
    }
}
