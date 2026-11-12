package com.alejoxcode.speeddeck

import android.content.Context
import java.util.UUID

/**
 * A random id for this installation, created the first time it is asked for. It tells a computer which
 * phone reported a "remove ads" purchase, and stays the same when the computer's address changes.
 * Reinstalling the app or clearing its data makes a new one.
 */
class DeviceIdStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun loadOrCreate(): String =
        preferences.getString(KEY_DEVICE_ID, null)?.takeIf { it.isNotBlank() }
            ?: UUID.randomUUID().toString().also { preferences.edit().putString(KEY_DEVICE_ID, it).apply() }

    private companion object {
        const val PREFERENCES_NAME = "speed_deck_device"
        const val KEY_DEVICE_ID = "device_id"
    }
}
