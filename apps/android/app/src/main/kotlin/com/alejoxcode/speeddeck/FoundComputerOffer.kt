package com.alejoxcode.speeddeck

/**
 * What the banner offers while speaking without a computer, given the computers found on the
 * network and the ones the user closed the banner for in this session.
 */
sealed interface FoundComputerOffer {
    /** Nothing to offer: no computer found, or every one was dismissed. */
    data object None : FoundComputerOffer

    /** One computer: "Found <name> · Connect" switches straight to it. */
    data class Single(val desktop: DiscoveredDesktop) : FoundComputerOffer

    /** Several computers: "Found <count> computers · Choose" opens the list of computers. */
    data class Several(val desktops: List<DiscoveredDesktop>) : FoundComputerOffer {
        val count: Int get() = desktops.size
    }

    companion object {
        fun choose(found: List<DiscoveredDesktop>, dismissedIds: Set<String>): FoundComputerOffer {
            val offered = found.filterNot { it.id in dismissedIds }
            return when (offered.size) {
                0 -> None
                1 -> Single(offered.single())
                else -> Several(offered)
            }
        }
    }
}
