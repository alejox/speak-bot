package com.alejoxcode.speeddeck

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.net.Inet4Address
import java.net.InetAddress

/**
 * Browses the local network for Speed Deck desktops (`_speeddeck._tcp`) with [NsdManager].
 *
 * [onChange] is called on the main thread with the full, sorted list each time a computer
 * appears, moves or goes away. Uses the system mDNS service, so no multicast lock is needed.
 */
class DesktopDiscovery(
    context: Context,
    private val onChange: (List<DiscoveredDesktop>) -> Unit,
) {
    private val nsd = context.applicationContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val main = Handler(Looper.getMainLooper())

    private var listener: NsdManager.DiscoveryListener? = null
    private var desktops = emptyList<DiscoveredDesktop>()

    /** Resolves run one at a time: before Android 14 a second concurrent resolve fails. */
    private val pendingResolves = ArrayDeque<NsdServiceInfo>()
    private var resolving = false

    val current: List<DiscoveredDesktop> get() = desktops

    fun start() {
        if (listener != null) return
        val discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) = Unit
            override fun onDiscoveryStopped(serviceType: String) = Unit

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                main.post { if (listener === this) listener = null }
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                main.post { if (listener === this) enqueueResolve(serviceInfo) }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                main.post {
                    if (listener === this) update(DiscoveredDesktop.without(desktops, serviceInfo.serviceName))
                }
            }
        }
        listener = discoveryListener
        try {
            nsd.discoverServices(DiscoveredDesktop.SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (_: RuntimeException) {
            listener = null
        }
    }

    fun stop() {
        val active = listener ?: return
        listener = null
        pendingResolves.clear()
        try {
            nsd.stopServiceDiscovery(active)
        } catch (_: RuntimeException) {
            // Discovery had already stopped or never started.
        }
    }

    private fun enqueueResolve(serviceInfo: NsdServiceInfo) {
        pendingResolves.addLast(serviceInfo)
        resolveNext()
    }

    @Suppress("DEPRECATION") // resolveService works on every supported version; its replacement needs API 34.
    private fun resolveNext() {
        if (resolving) return
        val next = pendingResolves.removeFirstOrNull() ?: return
        resolving = true
        val session = listener
        nsd.resolveService(next, object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                main.post { finishResolve() }
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                main.post {
                    if (listener === session) toDesktop(serviceInfo)?.let { update(DiscoveredDesktop.merge(desktops, it)) }
                    finishResolve()
                }
            }
        })
    }

    private fun finishResolve() {
        resolving = false
        if (listener != null) resolveNext()
    }

    private fun update(next: List<DiscoveredDesktop>) {
        if (next == desktops) return
        desktops = next
        onChange(next)
    }

    private fun toDesktop(info: NsdServiceInfo): DiscoveredDesktop? {
        val host = ipv4Address(info)?.hostAddress ?: return null
        return DiscoveredDesktop.fromService(info.serviceName, host, info.port, info.attributes.orEmpty())
    }

    /** The desktop accepts IP literals as Host, and an IPv4 address is what its QR code shows. */
    @Suppress("DEPRECATION")
    private fun ipv4Address(info: NsdServiceInfo): InetAddress? {
        val addresses = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            info.hostAddresses
        } else {
            listOfNotNull(info.host)
        }
        return addresses.firstOrNull { it is Inet4Address }
    }
}
