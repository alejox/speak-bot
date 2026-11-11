package com.alejoxcode.speeddeck

import java.net.URI
import java.net.URISyntaxException

/** What the system back button does on the deck. */
enum class DeckBack {
    /** Return to the previous page loaded in the WebView. */
    GO_BACK,

    /** Offer to change (or connect to) a computer, or to exit. */
    SHOW_MENU;

    companion object {
        /**
         * The deck is a single-page app, so at its root the menu shows at once, whatever in-app
         * history it pushed; only a real page loaded on top of the root goes back first.
         */
        fun choose(canGoBack: Boolean, currentUrl: String?, deckUrl: String): DeckBack {
            if (!canGoBack) return SHOW_MENU
            val current = parse(currentUrl) ?: return SHOW_MENU
            val deck = parse(deckUrl) ?: return SHOW_MENU
            val sameOrigin = current.scheme.equals(deck.scheme, ignoreCase = true) &&
                current.host.equals(deck.host, ignoreCase = true) &&
                current.port == deck.port
            if (!sameOrigin) return SHOW_MENU
            return if (rootPath(current) == rootPath(deck)) SHOW_MENU else GO_BACK
        }

        private fun parse(url: String?): URI? =
            try {
                url?.let(::URI)?.takeIf { it.scheme != null && it.host != null }
            } catch (_: URISyntaxException) {
                null
            }

        private fun rootPath(uri: URI): String = uri.path.orEmpty().trimEnd('/')
    }
}
