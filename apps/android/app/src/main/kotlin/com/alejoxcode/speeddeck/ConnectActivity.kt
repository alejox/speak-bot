package com.alejoxcode.speeddeck

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.LinearLayout
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.annotation.StringRes
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/**
 * Asks how to use the deck: speaking on this phone alone, or with a computer found on the network,
 * scanned from its pairing QR code or typed by address.
 */
class ConnectActivity : AppCompatActivity() {
    private lateinit var addressField: EditText
    private lateinit var errorText: TextView
    private lateinit var foundStatus: TextView
    private lateinit var foundList: LinearLayout
    private lateinit var discovery: DesktopDiscovery
    private val handler = Handler(Looper.getMainLooper())
    private val showNoneFound = Runnable {
        if (discovery.current.isEmpty()) foundStatus.setText(R.string.connect_none_found)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_connect)
        applySystemBarInsets(findViewById(R.id.connect_root))

        addressField = findViewById(R.id.connect_address)
        errorText = findViewById(R.id.connect_error)
        foundStatus = findViewById(R.id.connect_found_status)
        foundList = findViewById(R.id.connect_found_list)
        discovery = DesktopDiscovery(this, ::showDiscovered)

        if (savedInstanceState == null) {
            intent.getStringExtra(EXTRA_CURRENT_ADDRESS)?.let(addressField::setText)
        }

        findViewById<Button>(R.id.connect_local).setOnClickListener { openLocal() }
        findViewById<Button>(R.id.connect_scan).setOnClickListener { scanQrCode() }
        findViewById<Button>(R.id.connect_open).setOnClickListener { connectToTypedAddress() }
        addressField.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO) {
                connectToTypedAddress()
                true
            } else {
                false
            }
        }
    }

    override fun onStart() {
        super.onStart()
        showDiscovered(discovery.current)
        discovery.start()
        handler.postDelayed(showNoneFound, NONE_FOUND_DELAY_MS)
    }

    override fun onStop() {
        handler.removeCallbacks(showNoneFound)
        discovery.stop()
        super.onStop()
    }

    private fun showDiscovered(desktops: List<DiscoveredDesktop>) {
        foundList.removeAllViews()
        if (desktops.isEmpty()) {
            foundStatus.visibility = View.VISIBLE
            return
        }
        foundStatus.visibility = View.GONE
        for (desktop in desktops) {
            val button = layoutInflater.inflate(R.layout.item_discovered_desktop, foundList, false) as Button
            button.text = getString(R.string.connect_found_item, desktop.name, desktop.address)
            button.contentDescription = desktop.name
            button.setOnClickListener { openDeck(SavedDesktop(desktop.address, desktop.id)) }
            foundList.addView(button)
        }
    }

    private fun scanQrCode() {
        hideError()
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { barcode ->
                val address = barcode.rawValue?.let(DesktopAddress::normalize)
                if (address == null) showError(R.string.connect_invalid_qr) else openDeck(SavedDesktop(address, null))
            }
            .addOnFailureListener { error ->
                val cancelled = error is MlKitException && error.errorCode == MlKitException.CANCELLED
                if (!cancelled) showError(R.string.connect_scanner_unavailable)
            }
    }

    private fun connectToTypedAddress() {
        val address = DesktopAddress.normalize(addressField.text.toString())
        if (address == null) {
            showError(R.string.connect_invalid_address)
            addressField.requestFocus()
        } else {
            openDeck(SavedDesktop(address, null))
        }
    }

    /** Opens the web app bundled in the APK; launches go straight there until a computer is chosen. */
    private fun openLocal() {
        AddressStore(this).chooseLocal()
        // Opened from a deck already speaking without a computer: return to it as it was.
        startActivity(
            Intent(this, DeckActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
        finish()
    }

    /** The id is learned on the deck's first discovery when the computer was paired by QR or address. */
    private fun openDeck(desktop: SavedDesktop) {
        AddressStore(this).save(desktop)
        // Replaces a voice-only deck left below this screen with a deck on the computer.
        startActivity(Intent(this, DeckActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
        finish()
    }

    private fun showError(@StringRes message: Int) {
        errorText.setText(message)
        errorText.visibility = View.VISIBLE
    }

    private fun hideError() {
        errorText.visibility = View.GONE
    }

    private fun applySystemBarInsets(root: View) {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    companion object {
        private const val NONE_FOUND_DELAY_MS = 5_000L
        private const val EXTRA_CURRENT_ADDRESS = "current_address"

        /** Opens the connect screen, pre-filling the address of the computer in use, if any. */
        fun intent(context: Context, currentAddress: String? = null): Intent =
            Intent(context, ConnectActivity::class.java).putExtra(EXTRA_CURRENT_ADDRESS, currentAddress)
    }
}
