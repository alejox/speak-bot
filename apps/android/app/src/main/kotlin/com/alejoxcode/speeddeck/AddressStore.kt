package com.alejoxcode.speeddeck

import android.content.Context

/**
 * Remembers how the deck was last opened: the computer that serves it (its address and, once known,
 * its stable id), or speaking without a computer.
 */
class AddressStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun load(): SavedDesktop? {
        val address = preferences.getString(KEY_ADDRESS, null) ?: return null
        return SavedDesktop(address, preferences.getString(KEY_DESKTOP_ID, null), preferences.getString(KEY_DESKTOP_NAME, null))
    }

    fun loadMode(): LaunchMode? =
        preferences.getString(KEY_MODE, null)?.let { saved -> LaunchMode.entries.firstOrNull { it.name == saved } }

    fun launchTarget(): LaunchTarget = LaunchTarget.choose(loadMode(), load())

    /** Saves the computer and makes it what the app opens next time. */
    fun save(desktop: SavedDesktop) {
        preferences.edit()
            .putString(KEY_ADDRESS, desktop.address)
            .putString(KEY_DESKTOP_ID, desktop.desktopId)
            .putString(KEY_DESKTOP_NAME, desktop.name)
            .putString(KEY_MODE, LaunchMode.COMPUTER.name)
            .apply()
    }

    /** Opens the app without a computer next time; the saved computer is kept for "Change computer". */
    fun chooseLocal() {
        preferences.edit().putString(KEY_MODE, LaunchMode.LOCAL.name).apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "speed_deck"
        const val KEY_ADDRESS = "desktop_address"
        const val KEY_DESKTOP_ID = "desktop_id"
        const val KEY_DESKTOP_NAME = "desktop_name"
        const val KEY_MODE = "launch_mode"
    }
}
