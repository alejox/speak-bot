package com.alejoxcode.speeddeck

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
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

/** Asks which computer serves the deck: by scanning its pairing QR code or typing its address. */
class ConnectActivity : AppCompatActivity() {
    private lateinit var addressField: EditText
    private lateinit var errorText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_connect)
        applySystemBarInsets(findViewById(R.id.connect_root))

        addressField = findViewById(R.id.connect_address)
        errorText = findViewById(R.id.connect_error)

        if (savedInstanceState == null) {
            intent.getStringExtra(EXTRA_CURRENT_ADDRESS)?.let(addressField::setText)
        }

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

    private fun scanQrCode() {
        hideError()
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { barcode ->
                val address = barcode.rawValue?.let(DesktopAddress::normalize)
                if (address == null) showError(R.string.connect_invalid_qr) else openDeck(address)
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
            openDeck(address)
        }
    }

    private fun openDeck(address: String) {
        AddressStore(this).save(address)
        startActivity(Intent(this, DeckActivity::class.java))
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
        private const val EXTRA_CURRENT_ADDRESS = "current_address"

        /** Opens the connect screen, pre-filling the address of the computer in use, if any. */
        fun intent(context: Context, currentAddress: String? = null): Intent =
            Intent(context, ConnectActivity::class.java).putExtra(EXTRA_CURRENT_ADDRESS, currentAddress)
    }
}
