package com.alejoxcode.speeddeck

import java.util.Locale

/**
 * A Speed Deck desktop found on the local network through its `_speeddeck._tcp` announcement.
 *
 * @property serviceName the DNS-SD instance name, unique on the network.
 * @property id stable id of the computer; survives restarts and IP address changes.
 * @property name what the user sees in the list of computers.
 * @property address the deck origin, in the same shape as [DesktopAddress.normalize].
 */
data class DiscoveredDesktop(val serviceName: String, val id: String, val name: String, val address: String) {
    companion object {
        const val SERVICE_TYPE = "_speeddeck._tcp"
        /** The TXT `v` value this app understands. */
        const val SUPPORTED_PROTOCOL_VERSION = "1"

        /** Reads a resolved announcement; `null` when it is not a usable Speed Deck desktop. */
        fun fromService(
            serviceName: String,
            hostAddress: String,
            port: Int,
            attributes: Map<String, ByteArray?>,
        ): DiscoveredDesktop? {
            val text = { key: String -> attributes[key]?.toString(Charsets.UTF_8)?.trim()?.takeIf(String::isNotEmpty) }
            if (text("v") != SUPPORTED_PROTOCOL_VERSION) return null
            val id = text("id") ?: return null
            if (hostAddress.isBlank() || port !in 1..65535) return null
            val address = DesktopAddress.normalize("http://$hostAddress:$port/") ?: return null
            return DiscoveredDesktop(serviceName, id, text("name") ?: serviceName, address)
        }

        /** Adds or updates [found] (matched by service name or id), keeping the list sorted by name. */
        fun merge(current: List<DiscoveredDesktop>, found: DiscoveredDesktop): List<DiscoveredDesktop> =
            (current.filterNot { it.serviceName == found.serviceName || it.id == found.id } + found)
                .sortedBy { it.name.lowercase(Locale.ROOT) }

        fun without(current: List<DiscoveredDesktop>, serviceName: String): List<DiscoveredDesktop> =
            current.filterNot { it.serviceName == serviceName }
    }
}
