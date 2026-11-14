package com.alejoxcode.speeddeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoveAdsEntitlementTest {
    private fun purchase(
        state: OwnedPurchaseState = OwnedPurchaseState.PURCHASED,
        acknowledged: Boolean = true,
        products: List<String> = listOf(RemoveAdsEntitlement.PRODUCT_ID),
        token: String = "token-1",
    ) = OwnedPurchase(products, state, acknowledged, token)

    private fun succeeded(vararg purchases: OwnedPurchase) = PurchaseQuery.Succeeded(purchases.toList())

    @Test
    fun `a purchased remove_ads found by a query owns it, acknowledged or not`() {
        assertEquals(AdsEntitlement.OWNED, RemoveAdsEntitlement.afterQuery(AdsEntitlement.UNKNOWN, succeeded(purchase())))
        assertEquals(
            AdsEntitlement.OWNED,
            RemoveAdsEntitlement.afterQuery(AdsEntitlement.NOT_OWNED, succeeded(purchase(acknowledged = false))),
        )
    }

    @Test
    fun `a pending payment is not owned yet`() {
        val pending = purchase(state = OwnedPurchaseState.PENDING, acknowledged = false)
        assertEquals(AdsEntitlement.PENDING, RemoveAdsEntitlement.afterQuery(AdsEntitlement.NOT_OWNED, succeeded(pending)))
        assertFalse(RemoveAdsEntitlement.hidesAds(AdsEntitlement.PENDING))
    }

    @Test
    fun `a purchased item wins over a pending one`() {
        val query = succeeded(purchase(state = OwnedPurchaseState.PENDING, token = "a"), purchase(token = "b"))
        assertEquals(AdsEntitlement.OWNED, RemoveAdsEntitlement.afterQuery(AdsEntitlement.UNKNOWN, query))
    }

    @Test
    fun `a successful query without the purchase turns ads back on (refund or revoke)`() {
        assertEquals(AdsEntitlement.NOT_OWNED, RemoveAdsEntitlement.afterQuery(AdsEntitlement.OWNED, succeeded()))
        assertEquals(AdsEntitlement.NOT_OWNED, RemoveAdsEntitlement.afterQuery(AdsEntitlement.PENDING, succeeded()))
        assertEquals(AdsEntitlement.NOT_OWNED, RemoveAdsEntitlement.afterQuery(AdsEntitlement.UNKNOWN, succeeded()))
    }

    @Test
    fun `a failed query keeps what was cached`() {
        for (cached in AdsEntitlement.entries) {
            assertEquals(cached, RemoveAdsEntitlement.afterQuery(cached, PurchaseQuery.Failed))
        }
    }

    @Test
    fun `other products and unknown purchase states never own it`() {
        val other = purchase(products = listOf("something_else"))
        val unspecified = purchase(state = OwnedPurchaseState.OTHER)
        assertEquals(AdsEntitlement.NOT_OWNED, RemoveAdsEntitlement.afterQuery(AdsEntitlement.OWNED, succeeded(other, unspecified)))
    }

    @Test
    fun `a purchase update can only move towards owning`() {
        val bought = listOf(purchase(acknowledged = false))
        val pending = listOf(purchase(state = OwnedPurchaseState.PENDING, acknowledged = false))
        assertEquals(AdsEntitlement.OWNED, RemoveAdsEntitlement.afterPurchaseUpdate(AdsEntitlement.NOT_OWNED, bought))
        assertEquals(AdsEntitlement.OWNED, RemoveAdsEntitlement.afterPurchaseUpdate(AdsEntitlement.PENDING, bought))
        assertEquals(AdsEntitlement.PENDING, RemoveAdsEntitlement.afterPurchaseUpdate(AdsEntitlement.UNKNOWN, pending))
        // An update lists only what changed: it never takes away what a query found.
        assertEquals(AdsEntitlement.OWNED, RemoveAdsEntitlement.afterPurchaseUpdate(AdsEntitlement.OWNED, pending))
        assertEquals(AdsEntitlement.OWNED, RemoveAdsEntitlement.afterPurchaseUpdate(AdsEntitlement.OWNED, emptyList()))
        assertEquals(AdsEntitlement.NOT_OWNED, RemoveAdsEntitlement.afterPurchaseUpdate(AdsEntitlement.NOT_OWNED, emptyList()))
    }

    @Test
    fun `only purchased and unacknowledged remove_ads purchases need acknowledging`() {
        val purchases = listOf(
            purchase(acknowledged = false, token = "new"),
            purchase(acknowledged = true, token = "done"),
            purchase(state = OwnedPurchaseState.PENDING, acknowledged = false, token = "pending"),
            purchase(acknowledged = false, products = listOf("something_else"), token = "other"),
        )
        assertEquals(listOf("new"), RemoveAdsEntitlement.tokensToAcknowledge(purchases))
    }

    @Test
    fun `only owning hides ads`() {
        assertTrue(RemoveAdsEntitlement.hidesAds(AdsEntitlement.OWNED))
        assertFalse(RemoveAdsEntitlement.hidesAds(AdsEntitlement.UNKNOWN))
        assertFalse(RemoveAdsEntitlement.hidesAds(AdsEntitlement.NOT_OWNED))
    }

    @Test
    fun `the cached value survives being stored, and anything else is unknown`() {
        for (entitlement in AdsEntitlement.entries) {
            assertEquals(entitlement, AdsEntitlement.fromStored(entitlement.stored))
        }
        assertEquals(AdsEntitlement.UNKNOWN, AdsEntitlement.fromStored(null))
        assertEquals(AdsEntitlement.UNKNOWN, AdsEntitlement.fromStored("bogus"))
    }

    @Test
    fun `the state for the web app is JSON with the names the web side reads`() {
        assertEquals(
            """{"available":true,"entitlement":"not-owned","price":"US${'$'}4.99"}""",
            RemoveAdsState(available = true, entitlement = AdsEntitlement.NOT_OWNED, price = "US$4.99").toJson(),
        )
        assertEquals(
            """{"available":false,"entitlement":"owned","price":""}""",
            RemoveAdsState(available = false, entitlement = AdsEntitlement.OWNED, price = null).toJson(),
        )
        assertEquals(
            """{"available":true,"entitlement":"pending","price":"1\"2\\3\u000a"}""",
            RemoveAdsState(available = true, entitlement = AdsEntitlement.PENDING, price = "1\"2\\3\n").toJson(),
        )
        assertEquals("unknown", AdsEntitlement.UNKNOWN.stored)
    }
}
