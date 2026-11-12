package com.alejoxcode.speeddeck

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView

/**
 * Gives the web app the "remove ads" purchase on Google Play, as `window.SpeedDeckAndroidBilling`.
 * The web side is `findAndroidAdsPurchase`.
 *
 * Every change of [RemoveAdsState] goes back through `window.__speedDeckAndroidBillingEvent(state)`.
 * Every page in the WebView can call these methods, so they only read the state and ask the activity to
 * open Google Play's own purchase sheet (where the person confirms) or to look the purchase up again.
 */
class BillingBridge(
    private val webView: WebView,
    private val readState: () -> RemoveAdsState,
    /** Runs on the main thread. */
    private val startPurchase: () -> Unit,
    /** Runs on the main thread. */
    private val checkPurchases: () -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())

    /** `{"available": boolean, "entitlement": "unknown"|"not-owned"|"pending"|"owned", "price": string}`; price "" when not known. */
    @JavascriptInterface
    fun state(): String = readState().toJson()

    /** Opens Google Play's purchase sheet; false when there is nothing to buy (unavailable or already owned). */
    @JavascriptInterface
    fun purchase(): Boolean {
        val current = readState()
        if (!current.available || current.entitlement == AdsEntitlement.OWNED) return false
        main.post(startPurchase)
        return true
    }

    /** Asks Google Play again what this account owns ("Restore purchase"); the answer arrives as an event. */
    @JavascriptInterface
    fun restore() {
        main.post(checkPurchases)
    }

    /** Tells the web app the state changed. Call from the main thread. */
    fun notifyChanged(state: RemoveAdsState) {
        webView.evaluateJavascript("window.$EVENT_CALLBACK && window.$EVENT_CALLBACK(${state.toJson()})", null)
    }

    companion object {
        const val JS_NAME = "SpeedDeckAndroidBilling"
        private const val EVENT_CALLBACK = "__speedDeckAndroidBillingEvent"
    }
}
