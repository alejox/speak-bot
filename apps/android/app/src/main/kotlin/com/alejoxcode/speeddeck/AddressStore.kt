package com.alejoxcode.speeddeck

import android.content.Context

/** Remembers the address of the desktop that serves the deck. */
class AddressStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun load(): String? = preferences.getString(KEY_ADDRESS, null)

    fun save(address: String) {
        preferences.edit().putString(KEY_ADDRESS, address).apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "speed_deck"
        const val KEY_ADDRESS = "desktop_address"
    }
}
