package com.alejoxcode.speeddeck

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClient.ProductType
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams

/**
 * Google Play Billing for the one-time "remove ads" product ([RemoveAdsEntitlement.PRODUCT_ID]).
 *
 * Asks Google Play what this account owns at start and every time the deck comes back to the screen
 * ([refresh]; this is also "restore" after a reinstall or on another phone), acknowledges a completed
 * purchase, and keeps the last known entitlement on the phone so ads stay hidden offline. The decisions
 * are [RemoveAdsEntitlement]'s. [onChanged] runs on the main thread whenever [state] changes.
 *
 * Call [refresh], [purchase] and [close] from the main thread; [state] can be read from any thread.
 */
class RemoveAdsBilling(context: Context, private val onChanged: (RemoveAdsState) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private var entitlement = AdsEntitlement.fromStored(preferences.getString(KEY_ENTITLEMENT, null))
    /** Google Play accepted the connection; the library reconnects by itself when the service drops. */
    private var setUp = false
    private var connecting = false
    private var closed = false
    /** Fresh from the last refresh: Google Play may refuse a purchase started from stale details. */
    private var product: ProductDetails? = null

    @Volatile
    var state: RemoveAdsState = RemoveAdsState(available = false, entitlement = entitlement, price = null)
        private set

    private val client: BillingClient = BillingClient.newBuilder(context.applicationContext)
        .setListener { result, purchases -> main.post { onPurchasesUpdated(result, purchases.orEmpty()) } }
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    /** Connects when needed, then asks Google Play for this account's purchases and the product's price. */
    fun refresh() {
        if (closed) return
        if (!client.isReady) {
            connect()
            return
        }
        queryPurchases()
        queryProduct()
    }

    /** Opens Google Play's purchase sheet over [activity]; false when it could not be opened. */
    fun purchase(activity: Activity): Boolean {
        val details = product
        if (closed || details == null || entitlement == AdsEntitlement.OWNED) return false
        val offerToken = details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details)
        if (!offerToken.isNullOrEmpty()) productParams.setOfferToken(offerToken)
        val params = BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(productParams.build())).build()
        val result = client.launchBillingFlow(activity, params)
        // Bought on another phone or before a reinstall: find it instead of selling it again.
        if (result.responseCode == BillingResponseCode.ITEM_ALREADY_OWNED) refresh()
        return result.responseCode == BillingResponseCode.OK
    }

    fun close() {
        closed = true
        main.removeCallbacksAndMessages(null)
        client.endConnection()
    }

    private fun connect() {
        if (connecting) return
        connecting = true
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) = onMain {
                connecting = false
                setUp = result.responseCode == BillingResponseCode.OK
                if (setUp) {
                    queryPurchases()
                    queryProduct()
                } else {
                    // No Google Play, no account, or an old Play Store: the next refresh tries again.
                    product = null
                }
                publish()
            }

            override fun onBillingServiceDisconnected() = onMain {
                // Automatic reconnection serves the next request; nothing was learnt about purchases.
                connecting = false
            }
        })
    }

    private fun queryPurchases() {
        val params = QueryPurchasesParams.newBuilder().setProductType(ProductType.INAPP).build()
        client.queryPurchasesAsync(params) { result, purchases ->
            onMain {
                val succeeded = result.responseCode == BillingResponseCode.OK
                val owned = purchases.map(::toOwned)
                val query = if (succeeded) PurchaseQuery.Succeeded(owned) else PurchaseQuery.Failed
                entitlement = RemoveAdsEntitlement.afterQuery(entitlement, query)
                publish()
                if (succeeded) acknowledge(owned)
            }
        }
    }

    private fun queryProduct() {
        val wanted = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(RemoveAdsEntitlement.PRODUCT_ID)
            .setProductType(ProductType.INAPP)
            .build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(wanted)).build()
        client.queryProductDetailsAsync(params) { result, found ->
            onMain {
                // Not created in Play Console yet, or not sold in this country: nothing to buy.
                product = if (result.responseCode == BillingResponseCode.OK) {
                    found.productDetailsList.firstOrNull { it.productId == RemoveAdsEntitlement.PRODUCT_ID }
                } else {
                    null
                }
                publish()
            }
        }
    }

    private fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>) {
        if (closed) return
        when (result.responseCode) {
            BillingResponseCode.OK -> {
                val owned = purchases.map(::toOwned)
                entitlement = RemoveAdsEntitlement.afterPurchaseUpdate(entitlement, owned)
                publish()
                acknowledge(owned)
            }
            BillingResponseCode.ITEM_ALREADY_OWNED -> refresh()
            // Cancelled or failed: Google Play already told the person; nothing changed.
            else -> Unit
        }
    }

    /** Google Play refunds a purchase that is not acknowledged within three days; a failure is retried on the next refresh. */
    private fun acknowledge(purchases: List<OwnedPurchase>) {
        for (token in RemoveAdsEntitlement.tokensToAcknowledge(purchases)) {
            val params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build()
            client.acknowledgePurchase(params) { }
        }
    }

    private fun publish() {
        preferences.edit().putString(KEY_ENTITLEMENT, entitlement.stored).apply()
        val price = product?.let { details ->
            details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.formattedPrice
                ?: details.oneTimePurchaseOfferDetails?.formattedPrice
        }
        val next = RemoveAdsState(available = setUp && product != null, entitlement = entitlement, price = price)
        if (next == state) return
        state = next
        onChanged(next)
    }

    /** The library may answer on any thread. */
    private fun onMain(action: () -> Unit) {
        main.post { if (!closed) action() }
    }

    private fun toOwned(purchase: Purchase) = OwnedPurchase(
        products = purchase.products,
        state = when (purchase.purchaseState) {
            Purchase.PurchaseState.PURCHASED -> OwnedPurchaseState.PURCHASED
            Purchase.PurchaseState.PENDING -> OwnedPurchaseState.PENDING
            else -> OwnedPurchaseState.OTHER
        },
        acknowledged = purchase.isAcknowledged,
        token = purchase.purchaseToken,
    )

    private companion object {
        const val PREFERENCES = "remove_ads"
        const val KEY_ENTITLEMENT = "entitlement"
    }
}
