package com.alejoxcode.speeddeck

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.io.FileNotFoundException
import java.io.InputStream

/**
 * The mobile web app bundled in the APK (assets/web, see the bundleWebApp Gradle task), served at
 * `https://appassets.androidplatform.net/` so it runs in a secure context with its own storage.
 *
 * Anything that is not a bundled file answers 404 right away, so the web app's desktop check
 * (`GET /api/health`) concludes there is no computer and it runs with this phone's boards and voice.
 */
class LocalWebApp(context: Context) {
    private val assets = context.applicationContext.assets
    private val loader = WebViewAssetLoader.Builder()
        .setDomain(WebViewAssetLoader.DEFAULT_DOMAIN)
        .addPathHandler("/", ::open)
        .build()

    /** The response for a request to the local origin; null for any other origin. */
    fun intercept(request: WebResourceRequest): WebResourceResponse? =
        if (isLocal(request.url)) loader.shouldInterceptRequest(request.url) ?: notFound() else null

    private fun open(path: String): WebResourceResponse {
        val file = if (path.isEmpty() || path.endsWith("/")) "${path}index.html" else path
        // The service worker only adds offline caching on the web; here every file is already local.
        if (file in SKIPPED_FILES || file.split('/').any { it == ".." }) return notFound()
        val stream: InputStream = try {
            assets.open("$ASSETS_DIR/$file")
        } catch (_: FileNotFoundException) {
            return notFound()
        }
        return WebResourceResponse(mimeType(file), if (isText(file)) "utf-8" else null, stream)
    }

    private fun notFound() = WebResourceResponse(
        "text/plain",
        "utf-8",
        404,
        "Not Found",
        mapOf("Cache-Control" to "no-store"),
        ByteArrayInputStream(ByteArray(0)),
    )

    companion object {
        const val URL = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/"
        private const val ASSETS_DIR = "web"
        private val SKIPPED_FILES = setOf("registerSW.js", "sw.js")

        fun isLocal(url: Uri): Boolean = url.scheme == "https" && url.host == WebViewAssetLoader.DEFAULT_DOMAIN

        private val MIME_TYPES = mapOf(
            "html" to "text/html",
            "js" to "text/javascript",
            "mjs" to "text/javascript",
            "css" to "text/css",
            "json" to "application/json",
            "webmanifest" to "application/manifest+json",
            "svg" to "image/svg+xml",
            "png" to "image/png",
            "jpg" to "image/jpeg",
            "webp" to "image/webp",
            "ico" to "image/x-icon",
            "woff2" to "font/woff2",
            "woff" to "font/woff",
            "txt" to "text/plain",
        )

        private fun extension(file: String) = file.substringAfterLast('.', "").lowercase()

        private fun mimeType(file: String) = MIME_TYPES[extension(file)] ?: "application/octet-stream"

        private fun isText(file: String) = mimeType(file).let {
            it.startsWith("text/") || it.endsWith("json") || it == "image/svg+xml"
        }
    }
}
