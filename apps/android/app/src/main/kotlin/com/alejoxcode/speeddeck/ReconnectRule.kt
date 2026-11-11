package com.alejoxcode.speeddeck

/**
 * The computer the deck was last opened from. [desktopId] is unknown when it was paired by QR or address;
 * [name] is what its network announcement calls it, once seen.
 */
data class SavedDesktop(val address: String, val desktopId: String?, val name: String? = null)

/** Decides whether a discovered computer is the saved one, so the deck can follow it to a new address. */
object ReconnectRule {
    /**
     * The saved computer among [discovered]: matched by id when the id is known (another computer
     * that took the old address is never picked), otherwise by address, to learn its id.
     */
    fun find(saved: SavedDesktop, discovered: List<DiscoveredDesktop>): DiscoveredDesktop? =
        if (saved.desktopId != null) {
            discovered.firstOrNull { it.id == saved.desktopId }
        } else {
            discovered.firstOrNull { it.address == saved.address }
        }

    fun addressChanged(saved: SavedDesktop, found: DiscoveredDesktop): Boolean = found.address != saved.address
}
