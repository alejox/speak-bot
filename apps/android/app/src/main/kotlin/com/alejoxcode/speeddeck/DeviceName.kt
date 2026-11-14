package com.alejoxcode.speeddeck

/** What this phone is called where the web app names it (the computer's "ads removed" status). */
object DeviceName {
    const val MAX_LENGTH = 80
    private const val FALLBACK = "Android"

    /** The maker and the model as Android reports them (`Build.MANUFACTURER`, `Build.MODEL`), e.g. "Samsung SM-S921B". */
    fun describe(manufacturer: String?, model: String?): String {
        val maker = clean(manufacturer).replaceFirstChar { it.uppercase() }
        val device = clean(model)
        val name = when {
            device.isEmpty() -> maker
            maker.isEmpty() || device.startsWith(maker, ignoreCase = true) -> device
            else -> "$maker $device"
        }
        return name.take(MAX_LENGTH).trim().ifEmpty { FALLBACK }
    }

    private fun clean(value: String?): String {
        val text = value.orEmpty().filterNot { it.isISOControl() }.trim().replace(Regex("\\s+"), " ")
        return if (text.equals("unknown", ignoreCase = true)) "" else text
    }
}
