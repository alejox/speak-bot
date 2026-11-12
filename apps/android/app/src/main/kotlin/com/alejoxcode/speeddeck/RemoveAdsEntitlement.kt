package com.alejoxcode.speeddeck

/** Whether this Google account bought "remove ads". [stored] is the name saved on the phone and sent to the web app. */
enum class AdsEntitlement(val stored: String) {
    /** Google Play has never answered on this phone. */
    UNKNOWN("unknown"),
    NOT_OWNED("not-owned"),
    /** Bought with a payment that is not complete yet (e.g. cash at a shop): not entitled until it is. */
    PENDING("pending"),
    OWNED("owned");

    companion object {
        fun fromStored(value: String?): AdsEntitlement = entries.firstOrNull { it.stored == value } ?: UNKNOWN
    }
}

/** A purchase's state as Google Play reports it, without the Billing Library types. */
enum class OwnedPurchaseState { PURCHASED, PENDING, OTHER }

/** What the entitlement rules need to know about one purchase. */
data class OwnedPurchase(
    val products: List<String>,
    val state: OwnedPurchaseState,
    val acknowledged: Boolean,
    val token: String,
)

/** The answer to "what has this account bought?". */
sealed interface PurchaseQuery {
    data class Succeeded(val purchases: List<OwnedPurchase>) : PurchaseQuery

    /** Offline, Google Play unavailable, or any other error: nothing is known. */
    data object Failed : PurchaseQuery
}

/** What the web app is told about removing ads (`BillingBridge.state()`). */
data class RemoveAdsState(val available: Boolean, val entitlement: AdsEntitlement, val price: String?) {
    /** `{"available":…,"entitlement":"…","price":"…"}`; the price is "" while Google Play has not told it. */
    fun toJson(): String =
        """{"available":$available,"entitlement":"${entitlement.stored}","price":"${escape(price.orEmpty())}"}"""

    private fun escape(text: String): String = buildString {
        for (char in text) {
            when {
                char == '"' || char == '\\' -> append('\\').append(char)
                char.code < 0x20 -> append("\\u%04x".format(char.code))
                else -> append(char)
            }
        }
    }
}

/** The rules of the one-time "remove ads" product: no Android or Billing Library types, so they run in JVM tests. */
object RemoveAdsEntitlement {
    const val PRODUCT_ID = "remove_ads"

    /**
     * The entitlement after asking Google Play what this account owns (at start, on resume, on "restore").
     * A successful answer is the truth, so a refunded or revoked purchase turns ads back on; a failed one
     * (offline, Google Play unavailable) keeps what was [cached], so ads stay hidden offline.
     */
    fun afterQuery(cached: AdsEntitlement, query: PurchaseQuery): AdsEntitlement = when (query) {
        PurchaseQuery.Failed -> cached
        is PurchaseQuery.Succeeded -> of(query.purchases)
    }

    /**
     * The entitlement after Google Play reports new or changed purchases. That list holds only what
     * changed, so it can grant or mark as pending, never take away.
     */
    fun afterPurchaseUpdate(current: AdsEntitlement, purchases: List<OwnedPurchase>): AdsEntitlement {
        val reported = of(purchases)
        return if (rank(reported) > rank(current)) reported else current
    }

    /** Purchase tokens to acknowledge: Google Play refunds a purchase left unacknowledged for three days. */
    fun tokensToAcknowledge(purchases: List<OwnedPurchase>): List<String> =
        purchases.filter { it.isRemoveAds && it.state == OwnedPurchaseState.PURCHASED && !it.acknowledged }.map { it.token }

    fun hidesAds(entitlement: AdsEntitlement): Boolean = entitlement == AdsEntitlement.OWNED

    private val OwnedPurchase.isRemoveAds: Boolean get() = PRODUCT_ID in products

    private fun of(purchases: List<OwnedPurchase>): AdsEntitlement {
        val states = purchases.filter { it.isRemoveAds }.map { it.state }
        return when {
            OwnedPurchaseState.PURCHASED in states -> AdsEntitlement.OWNED
            OwnedPurchaseState.PENDING in states -> AdsEntitlement.PENDING
            else -> AdsEntitlement.NOT_OWNED
        }
    }

    private fun rank(entitlement: AdsEntitlement): Int = when (entitlement) {
        AdsEntitlement.UNKNOWN, AdsEntitlement.NOT_OWNED -> 0
        AdsEntitlement.PENDING -> 1
        AdsEntitlement.OWNED -> 2
    }
}
