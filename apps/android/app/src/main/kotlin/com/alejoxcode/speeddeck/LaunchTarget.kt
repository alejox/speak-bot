package com.alejoxcode.speeddeck

/** How the user last chose to use the app: with a computer, or speaking on this phone alone. */
enum class LaunchMode { COMPUTER, LOCAL }

/** What the app opens at launch. */
sealed interface LaunchTarget {
    /** Nothing chosen yet: list the computers found and the other options; never pick one alone. */
    data object Connect : LaunchTarget

    /** The web app bundled in the APK, speaking with this phone's voice. */
    data object Local : LaunchTarget

    data class Computer(val desktop: SavedDesktop) : LaunchTarget

    companion object {
        /** Versions before launch modes only saved a computer, so a missing mode with a computer means [Computer]. */
        fun choose(mode: LaunchMode?, desktop: SavedDesktop?): LaunchTarget = when {
            mode == LaunchMode.LOCAL -> Local
            desktop != null -> Computer(desktop)
            else -> Connect
        }
    }
}
