package com.alejoxcode.speeddeck

import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

/**
 * Turns what the user typed or scanned into the deck origin, e.g. `http://192.168.1.5:4545/`.
 *
 * Accepts a bare host ("192.168.1.5"), a host and port ("192.168.1.5:4545") or a full
 * http(s) URL whose path is empty or "/". Anything else is rejected with `null`.
 */
object DesktopAddress {
    const val DEFAULT_PORT = 4545
    private const val DEFAULT_SCHEME = "http"
    private val SCHEME_PREFIX = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://")
    private val ALLOWED_SCHEMES = setOf("http", "https")
    private const val MAX_PORT = 65535

    fun normalize(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return null
        val withScheme = if (SCHEME_PREFIX.containsMatchIn(trimmed)) trimmed else "$DEFAULT_SCHEME://$trimmed"

        val uri = try {
            URI(withScheme).parseServerAuthority()
        } catch (_: URISyntaxException) {
            return null
        }

        val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return null
        val host = uri.host?.lowercase(Locale.ROOT) ?: return null
        val port = if (uri.port == -1) DEFAULT_PORT else uri.port
        val path = uri.rawPath.orEmpty()

        if (scheme !in ALLOWED_SCHEMES) return null
        if (port !in 1..MAX_PORT) return null
        if (path != "" && path != "/") return null
        if (uri.rawQuery != null || uri.rawFragment != null || uri.rawUserInfo != null) return null

        return "$scheme://$host:$port/"
    }
}
