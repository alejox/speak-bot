package com.alejoxcode.speeddeck

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject

/**
 * Gives the bundled web app Android's TextToSpeech, as `window.SpeedDeckAndroidSpeech`
 * (Android's WebView has no speechSynthesis). The web side is `AndroidSpeechSynthesizer`.
 *
 * Events go back through `window.__speedDeckAndroidSpeechEvent({type, id, reason})`.
 * Only attach it to a WebView that shows [LocalWebApp]: every page in it can call these methods.
 */
class SpeechBridge(context: Context, private val webView: WebView) {
    private val main = Handler(Looper.getMainLooper())
    private val lock = Any()
    private var ready = false
    private var failed = false
    /** Utterances asked for before the engine finished starting. */
    private val waiting = mutableListOf<Request>()

    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status -> onEngineReady(status) }

    private data class Request(
        val id: String,
        val text: String,
        val voiceId: String,
        val rate: Float,
        val pitch: Float,
        val queue: Boolean,
    )

    init {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) = Unit

            override fun onDone(utteranceId: String) = emitDone(utteranceId)

            override fun onStop(utteranceId: String, interrupted: Boolean) = emitDone(utteranceId)

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String) = emitError(utteranceId, "synthesis-failed")

            override fun onError(utteranceId: String, errorCode: Int) = emitError(utteranceId, "error-$errorCode")
        })
    }

    @JavascriptInterface
    fun speak(id: String, text: String, voiceId: String, rate: Double, pitch: Double, queue: Boolean): Boolean {
        val request = Request(id, text, voiceId, rate.toFloat(), pitch.toFloat(), queue)
        synchronized(lock) {
            if (failed) return false
            if (!ready) {
                if (!queue) waiting.clear()
                waiting += request
                return true
            }
        }
        return say(request)
    }

    @JavascriptInterface
    fun cancel() {
        synchronized(lock) { waiting.clear() }
        tts.stop()
    }

    /** JSON array of `{id, name, lang, isDefault}`; empty until the engine has started. */
    @JavascriptInterface
    fun getVoices(): String {
        synchronized(lock) { if (!ready) return "[]" }
        val default = runCatching { tts.defaultVoice?.name }.getOrNull()
        val voices = runCatching { tts.voices.orEmpty() }.getOrDefault(emptySet())
            .filter { TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in it.features.orEmpty() }
            .sortedBy { it.name }
        val list = JSONArray()
        for (voice in voices) list.put(voice.toJson(voice.name == default))
        return list.toString()
    }

    /** Stops speaking and releases the engine. */
    fun shutdown() {
        synchronized(lock) {
            failed = true
            waiting.clear()
        }
        tts.stop()
        tts.shutdown()
    }

    private fun onEngineReady(status: Int) {
        val pending: List<Request>
        synchronized(lock) {
            if (failed) return
            if (status == TextToSpeech.SUCCESS) ready = true else failed = true
            pending = waiting.toList()
            waiting.clear()
        }
        if (status == TextToSpeech.SUCCESS) {
            pending.forEach(::say)
            emit(JSONObject().put("type", "voices"))
        } else {
            pending.forEach { emitError(it.id, "engine-unavailable") }
        }
    }

    private fun say(request: Request): Boolean {
        val voice = request.voiceId.takeIf(String::isNotEmpty)?.let { id ->
            runCatching { tts.voices?.firstOrNull { it.name == id } }.getOrNull()
        }
        // Rate, pitch and voice apply to the utterances queued after them.
        (voice ?: tts.defaultVoice)?.let { tts.voice = it }
        tts.setSpeechRate(request.rate)
        tts.setPitch(request.pitch)
        val mode = if (request.queue) TextToSpeech.QUEUE_ADD else TextToSpeech.QUEUE_FLUSH
        return tts.speak(request.text, mode, Bundle(), request.id) == TextToSpeech.SUCCESS
    }

    private fun emitDone(id: String) = emit(JSONObject().put("type", "done").put("id", id))

    private fun emitError(id: String, reason: String) =
        emit(JSONObject().put("type", "error").put("id", id).put("reason", reason))

    private fun emit(event: JSONObject) {
        val script = "window.$EVENT_CALLBACK && window.$EVENT_CALLBACK($event)"
        main.post { webView.evaluateJavascript(script, null) }
    }

    private fun Voice.toJson(isDefault: Boolean): JSONObject = JSONObject()
        .put("id", name)
        .put("name", displayName())
        .put("lang", locale.toLanguageTag())
        .put("isDefault", isDefault)

    /** E.g. "español (Estados Unidos) · es-us-x-esd-local": the language named in itself. */
    private fun Voice.displayName(): String = "${locale.getDisplayName(locale)} · $name"

    companion object {
        const val JS_NAME = "SpeedDeckAndroidSpeech"
        private const val EVENT_CALLBACK = "__speedDeckAndroidSpeechEvent"
    }
}
