package com.alejoxcode.speeddeck

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Full-screen WebView that shows the deck served by the saved desktop address.
 *
 * When the desktop cannot be reached, a native screen offers to retry or change computer.
 * The system back button on the deck's first page offers to change computer or exit.
 */
class DeckActivity : AppCompatActivity() {
    private lateinit var address: String
    private lateinit var webView: WebView
    private lateinit var unreachablePanel: View

    private val handler = Handler(Looper.getMainLooper())
    private val loadTimeout = Runnable { onDeckUnreachable() }

    /** Set by a retry so the failed attempt is not left in the back history. */
    private var clearHistoryWhenLoaded = false
    private var mainFrameFailed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val saved = AddressStore(this).load()
        if (saved == null) {
            startActivity(ConnectActivity.intent(this))
            finish()
            return
        }
        address = saved
        setContentView(R.layout.activity_deck)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        webView = findViewById(R.id.deck_web_view)
        unreachablePanel = findViewById(R.id.deck_unreachable)
        findViewById<TextView>(R.id.deck_unreachable_address).text = address
        findViewById<Button>(R.id.deck_retry).setOnClickListener { retry() }
        findViewById<Button>(R.id.deck_change_computer).setOnClickListener { changeComputer() }
        configureWebView()
        onBackPressedDispatcher.addCallback(this, backCallback)

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(address)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacks(loadTimeout)
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }
        webView.webViewClient = DeckWebViewClient()
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun retry() {
        unreachablePanel.visibility = View.GONE
        webView.visibility = View.VISIBLE
        clearHistoryWhenLoaded = true
        webView.loadUrl(address)
    }

    private fun onDeckUnreachable() {
        mainFrameFailed = true
        handler.removeCallbacks(loadTimeout)
        webView.stopLoading()
        webView.visibility = View.INVISIBLE
        unreachablePanel.visibility = View.VISIBLE
        findViewById<Button>(R.id.deck_retry).requestFocus()
    }

    private fun changeComputer() {
        startActivity(ConnectActivity.intent(this, address))
        finish()
    }

    private fun showLeaveMenu() {
        val choices = arrayOf(getString(R.string.change_computer), getString(R.string.deck_menu_exit))
        AlertDialog.Builder(this)
            .setTitle(R.string.deck_menu_title)
            .setItems(choices) { _, which ->
                if (which == 0) changeComputer() else finish()
            }
            .setNegativeButton(R.string.deck_menu_cancel, null)
            .show()
    }

    private fun isDeckUrl(url: Uri): Boolean {
        val deck = Uri.parse(address)
        return url.scheme == deck.scheme && url.host == deck.host && url.port == deck.port
    }

    private fun openExternally(url: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, url))
        } catch (_: ActivityNotFoundException) {
            // Nothing on the phone can open this link; stay on the deck.
        }
    }

    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            if (unreachablePanel.visibility != View.VISIBLE && webView.canGoBack()) {
                webView.goBack()
            } else {
                showLeaveMenu()
            }
        }
    }

    private inner class DeckWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (isDeckUrl(request.url)) return false
            openExternally(request.url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            mainFrameFailed = false
            handler.removeCallbacks(loadTimeout)
            handler.postDelayed(loadTimeout, LOAD_TIMEOUT_MS)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            handler.removeCallbacks(loadTimeout)
            if (!mainFrameFailed && clearHistoryWhenLoaded) {
                clearHistoryWhenLoaded = false
                view.clearHistory()
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) onDeckUnreachable()
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            errorResponse: WebResourceResponse,
        ) {
            if (request.isForMainFrame) onDeckUnreachable()
        }
    }

    private companion object {
        const val LOAD_TIMEOUT_MS = 15_000L
    }
}
