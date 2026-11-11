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
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Full-screen WebView that shows the deck served by the saved desktop address, or the web app
 * bundled in the APK when the user chose to speak without a computer ([LocalWebApp], speaking
 * through [SpeechBridge]).
 *
 * The saved computer is looked up on the network at launch and whenever it cannot be reached:
 * when it shows up at a new IP address the deck follows it without asking. Only when that fails
 * too, a native screen offers to retry or change computer.
 * The system back button at the deck's root offers to change computer (or connect to one) or exit.
 *
 * Speaking without a computer, a "Connect computer" pill is always on screen, and computers found on
 * the network are offered in a banner that never takes focus or interrupts speech.
 */
class DeckActivity : AppCompatActivity() {
    private lateinit var store: AddressStore
    /** The computer serving the deck; null when the deck runs on this phone alone. */
    private var saved: SavedDesktop? = null
    private val local: Boolean get() = saved == null
    private val address: String get() = saved?.address ?: LocalWebApp.URL
    private var localWebApp: LocalWebApp? = null
    private var speech: SpeechBridge? = null
    private var device: DeviceBridge? = null
    private lateinit var webView: WebView
    private lateinit var unreachablePanel: View
    private lateinit var searchingPanel: View
    private var discovery: DesktopDiscovery? = null

    /** Voice-only mode: looks for computers to offer in the banner while the deck is on screen. */
    private var offerDiscovery: DesktopDiscovery? = null
    private lateinit var connectPill: View
    private lateinit var foundBanner: View
    /** Ids of computers whose banner the user closed in this session. */
    private val dismissedIds = mutableSetOf<String>()
    /** A banner was closed or used: stop looking for computers until the app is opened again. */
    private var offerFinished = false
    private var offer: FoundComputerOffer = FoundComputerOffer.None

    private val handler = Handler(Looper.getMainLooper())
    private val loadTimeout = Runnable { onDeckUnreachable() }
    private val searchTimeout = Runnable { onSearchEnded() }

    /** Set by a retry so the failed attempt is not left in the back history. */
    private var clearHistoryWhenLoaded = false
    private var mainFrameFailed = false
    /** The current address finished loading without an error. */
    private var deckLoaded = false
    /** The deck failed to load and the result of the network search decides what to show. */
    private var waitingForSearch = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = AddressStore(this)
        when (val target = store.launchTarget()) {
            LaunchTarget.Connect -> {
                startActivity(ConnectActivity.intent(this))
                finish()
                return
            }
            LaunchTarget.Local -> saved = null
            is LaunchTarget.Computer -> saved = target.desktop
        }
        setContentView(R.layout.activity_deck)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        webView = findViewById(R.id.deck_web_view)
        unreachablePanel = findViewById(R.id.deck_unreachable)
        searchingPanel = findViewById(R.id.deck_searching)
        findViewById<TextView>(R.id.deck_unreachable_address).text = address
        findViewById<Button>(R.id.deck_retry).setOnClickListener { retry() }
        findViewById<Button>(R.id.deck_change_computer).setOnClickListener { changeComputer() }
        connectPill = findViewById(R.id.deck_connect_pill)
        foundBanner = findViewById(R.id.deck_found_banner)
        if (local) setUpComputerOffer(savedInstanceState)
        configureWebView()
        onBackPressedDispatcher.addCallback(this, backCallback)

        if (!local) startSearch()
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(address)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) webView.saveState(outState)
        outState.putStringArrayList(STATE_DISMISSED_IDS, ArrayList(dismissedIds))
        outState.putBoolean(STATE_OFFER_FINISHED, offerFinished)
    }

    override fun onStart() {
        super.onStart()
        if (local && !offerFinished && ::foundBanner.isInitialized) {
            val search = offerDiscovery ?: DesktopDiscovery(this, ::onOfferChanged).also { offerDiscovery = it }
            search.start()
        }
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onStop() {
        // Searching in the background would only drain the battery.
        offerDiscovery?.stop()
        if (discovery != null) {
            stopSearch()
            if (waitingForSearch) showUnreachable()
        }
        super.onStop()
    }

    override fun onDestroy() {
        handler.removeCallbacks(loadTimeout)
        stopSearch()
        stopOfferDiscovery()
        speech?.shutdown()
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
        if (local) localWebApp = LocalWebApp(this)
        // The WebView has no speechSynthesis, so "speak on this device" needs the bridge in both modes.
        // Only the bundled app or the user's own computer ever loads here: other links open outside the app.
        speech = SpeechBridge(this, webView).also { webView.addJavascriptInterface(it, SpeechBridge.JS_NAME) }
        // Vibrates when the phone loses the computer (or gets it back) and names that computer in the banner.
        device = DeviceBridge(this) { saved?.name }.also { webView.addJavascriptInterface(it, DeviceBridge.JS_NAME) }
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
        startSearch()
        load(address)
    }

    private fun load(url: String) {
        waitingForSearch = false
        unreachablePanel.visibility = View.GONE
        searchingPanel.visibility = View.GONE
        webView.visibility = View.VISIBLE
        clearHistoryWhenLoaded = true
        webView.stopLoading()
        webView.loadUrl(url)
    }

    private fun onDeckUnreachable() {
        mainFrameFailed = true
        deckLoaded = false
        handler.removeCallbacks(loadTimeout)
        webView.stopLoading()
        webView.visibility = View.INVISIBLE
        if (local) {
            showUnreachable()
            return
        }
        // The computer may have a new IP address: look for it before giving up.
        if (discovery == null) startSearch()
        waitingForSearch = true
        unreachablePanel.visibility = View.GONE
        searchingPanel.visibility = View.VISIBLE
    }

    private fun showUnreachable() {
        waitingForSearch = false
        searchingPanel.visibility = View.GONE
        unreachablePanel.visibility = View.VISIBLE
        findViewById<Button>(R.id.deck_retry).requestFocus()
    }

    /** Looks for the saved computer on the network for a few seconds. */
    private fun startSearch() {
        if (local) return
        val search = discovery ?: DesktopDiscovery(this, ::onDiscovered).also { discovery = it }
        search.start()
        handler.removeCallbacks(searchTimeout)
        handler.postDelayed(searchTimeout, SEARCH_WINDOW_MS)
    }

    private fun stopSearch() {
        handler.removeCallbacks(searchTimeout)
        discovery?.stop()
        discovery = null
    }

    private fun onSearchEnded() {
        stopSearch()
        if (waitingForSearch) showUnreachable()
    }

    private fun onDiscovered(desktops: List<DiscoveredDesktop>) {
        val current = saved ?: return
        val found = ReconnectRule.find(current, desktops) ?: return
        stopSearch()
        val moved = ReconnectRule.addressChanged(current, found)
        if (moved && deckLoaded) {
            // The saved address works; keep it, and learn the computer's name for the disconnect banner.
            if (current.name != found.name) saved = current.copy(name = found.name).also(store::save)
            return
        }
        saved = SavedDesktop(found.address, found.id, found.name).also(store::save)
        findViewById<TextView>(R.id.deck_unreachable_address).text = address
        when {
            moved -> load(address)
            // Announced at the same address, yet the deck did not load: nothing else to try.
            waitingForSearch -> showUnreachable()
        }
    }

    private fun changeComputer() {
        startActivity(ConnectActivity.intent(this, saved?.address))
        finish()
    }

    /**
     * Voice-only mode: opens the connect screen over the deck, so going back returns to the words
     * being typed; choosing there replaces this deck.
     */
    private fun connectToComputer() {
        startActivity(ConnectActivity.intent(this, store.load()?.address))
    }

    private fun setUpComputerOffer(savedInstanceState: Bundle?) {
        savedInstanceState?.getStringArrayList(STATE_DISMISSED_IDS)?.let(dismissedIds::addAll)
        offerFinished = savedInstanceState?.getBoolean(STATE_OFFER_FINISHED) ?: false
        connectPill.setOnClickListener { connectToComputer() }
        findViewById<Button>(R.id.deck_found_connect).setOnClickListener { acceptOffer() }
        findViewById<ImageButton>(R.id.deck_found_close).setOnClickListener { dismissOffer() }
        // Keep the overlays clear of a camera cutout; the system bars are hidden.
        for (overlay in listOf(connectPill, foundBanner)) {
            val margins = overlay.layoutParams as ViewGroup.MarginLayoutParams
            val baseTop = margins.topMargin
            ViewCompat.setOnApplyWindowInsetsListener(overlay) { view, insets ->
                val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
                (view.layoutParams as ViewGroup.MarginLayoutParams).topMargin = baseTop + cutout.top
                view.requestLayout()
                insets
            }
        }
        showOffer(FoundComputerOffer.None)
    }

    private fun onOfferChanged(desktops: List<DiscoveredDesktop>) {
        if (!offerFinished) showOffer(FoundComputerOffer.choose(desktops, dismissedIds))
    }

    private fun showOffer(next: FoundComputerOffer) {
        offer = next
        val message = findViewById<TextView>(R.id.deck_found_message)
        val action = findViewById<Button>(R.id.deck_found_connect)
        when (next) {
            FoundComputerOffer.None -> Unit
            is FoundComputerOffer.Single -> {
                message.text = getString(R.string.found_one, next.desktop.name)
                action.setText(R.string.found_connect)
            }
            is FoundComputerOffer.Several -> {
                message.text = getString(R.string.found_several, next.count)
                action.setText(R.string.found_choose)
            }
        }
        val showBanner = next != FoundComputerOffer.None
        foundBanner.visibility = if (showBanner) View.VISIBLE else View.GONE
        // One clear call to action at a time.
        connectPill.visibility = if (showBanner) View.GONE else View.VISIBLE
    }

    private fun acceptOffer() {
        when (val current = offer) {
            FoundComputerOffer.None -> return
            is FoundComputerOffer.Single -> {
                finishOffer()
                // Exactly like picking it on the connect screen.
                store.save(SavedDesktop(current.desktop.address, current.desktop.id, current.desktop.name))
                startActivity(Intent(this, DeckActivity::class.java))
                finish()
            }
            is FoundComputerOffer.Several -> {
                finishOffer()
                connectToComputer()
            }
        }
    }

    private fun dismissOffer() {
        when (val current = offer) {
            FoundComputerOffer.None -> return
            is FoundComputerOffer.Single -> dismissedIds += current.desktop.id
            is FoundComputerOffer.Several -> current.desktops.mapTo(dismissedIds) { it.id }
        }
        finishOffer()
    }

    private fun finishOffer() {
        offerFinished = true
        stopOfferDiscovery()
        showOffer(FoundComputerOffer.None)
    }

    private fun stopOfferDiscovery() {
        offerDiscovery?.stop()
        offerDiscovery = null
    }

    private fun showLeaveMenu() {
        val computerChoice = if (local) R.string.connect_to_computer else R.string.change_computer
        val choices = arrayOf(getString(computerChoice), getString(R.string.deck_menu_exit))
        AlertDialog.Builder(this)
            .setTitle(R.string.deck_menu_title)
            .setItems(choices) { _, which ->
                when {
                    which != 0 -> finish()
                    local -> connectToComputer()
                    else -> changeComputer()
                }
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
            val canGoBack = webView.visibility == View.VISIBLE && webView.canGoBack()
            when (DeckBack.choose(canGoBack, webView.url, address)) {
                DeckBack.GO_BACK -> webView.goBack()
                DeckBack.SHOW_MENU -> showLeaveMenu()
            }
        }
    }

    private inner class DeckWebViewClient : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            localWebApp?.intercept(request)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (isDeckUrl(request.url)) return false
            openExternally(request.url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            mainFrameFailed = false
            deckLoaded = false
            handler.removeCallbacks(loadTimeout)
            handler.postDelayed(loadTimeout, LOAD_TIMEOUT_MS)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            handler.removeCallbacks(loadTimeout)
            deckLoaded = !mainFrameFailed
            if (!mainFrameFailed && clearHistoryWhenLoaded) {
                clearHistoryWhenLoaded = false
                view.clearHistory()
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            // A load abandoned for a new address may still report an error for the old one.
            if (request.isForMainFrame && isDeckUrl(request.url)) onDeckUnreachable()
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            errorResponse: WebResourceResponse,
        ) {
            if (request.isForMainFrame && isDeckUrl(request.url)) onDeckUnreachable()
        }
    }

    private companion object {
        const val LOAD_TIMEOUT_MS = 15_000L
        /** How long to look for the saved computer on the network. */
        const val SEARCH_WINDOW_MS = 6_000L
        const val STATE_DISMISSED_IDS = "found_dismissed_ids"
        const val STATE_OFFER_FINISHED = "found_offer_finished"
    }
}
