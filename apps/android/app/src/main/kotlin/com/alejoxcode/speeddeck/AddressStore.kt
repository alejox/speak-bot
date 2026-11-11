package com.alejoxcode.speeddeck

import android.content.Context

/** Remembers the desktop that serves the deck: its address and, once known, its stable id. */
class AddressStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun load(): SavedDesktop? {
        val address = preferences.getString(KEY_ADDRESS, null) ?: return null
        return SavedDesktop(address, preferences.getString(KEY_DESKTOP_ID, null))
    }

    fun save(desktop: SavedDesktop) {
        preferences.edit()
            .putString(KEY_ADDRESS, desktop.address)
            .putString(KEY_DESKTOP_ID, desktop.desktopId)
            .apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "speed_deck"
        const val KEY_ADDRESS = "desktop_address"
        const val KEY_DESKTOP_ID = "desktop_id"
    }
}
