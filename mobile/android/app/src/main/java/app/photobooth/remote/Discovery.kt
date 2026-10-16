package app.photobooth.remote

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import java.net.Inet4Address
import java.util.ArrayDeque

/** Finds booths on the Wi-Fi (Bonjour / mDNS) and nearby over Bluetooth LE. */
class Discovery(private val context: Context, private val onChange: (List<FoundBooth>) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private val found = LinkedHashMap<String, FoundBooth>()
    private val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private var nsdListener: NsdManager.DiscoveryListener? = null
    private val toResolve = ArrayDeque<NsdServiceInfo>()
    private var resolving = false
    private var lock: WifiManager.MulticastLock? = null
    private var scanning = false

    private fun put(b: FoundBooth) = main.post {
        found[b.key] = b
        onChange(found.values.toList())
    }

    // ------------------------------------------------------------ Wi-Fi
    fun startWifi() {
        if (nsdListener != null) return
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        lock = wifi.createMulticastLock("photobooth").apply { setReferenceCounted(false); acquire() }
        val l = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onServiceFound(info: NsdServiceInfo) {
                main.post { toResolve.add(info); resolveNext() }
            }
            override fun onServiceLost(info: NsdServiceInfo) {}
        }
        nsdListener = l
        try {
            nsd.discoverServices(Protocol.BONJOUR_TYPE, NsdManager.PROTOCOL_DNS_SD, l)
        } catch (_: Exception) {
            nsdListener = null
        }
    }

    // Older Android versions can only resolve one service at a time.
    @Suppress("DEPRECATION")
    private fun resolveNext() {
        if (resolving) return
        val info = toResolve.poll() ?: return
        resolving = true
        nsd.resolveService(info, object : NsdManager.ResolveListener {
            override fun onResolveFailed(i: NsdServiceInfo, errorCode: Int) {
                main.post { resolving = false; resolveNext() }
            }
            override fun onServiceResolved(i: NsdServiceInfo) {
                val txt = i.attributes.mapValues { (_, v) -> v?.toString(Charsets.UTF_8) ?: "" }
                val ip = i.host?.let { if (it is Inet4Address) it.hostAddress else "[${it.hostAddress}]" } ?: txt["ip"]
                val port = i.port.takeIf { it > 0 } ?: txt["port"]?.toIntOrNull() ?: 8080
                if (ip != null) {
                    put(FoundBooth(name = txt["name"] ?: i.serviceName, via = "wifi", url = "http://$ip:$port", id = txt["id"], host = txt["host"]))
                }
                main.post { resolving = false; resolveNext() }
            }
        })
    }

    fun stopWifi() {
        nsdListener?.let { try { nsd.stopServiceDiscovery(it) } catch (_: Exception) {} }
        nsdListener = null
        lock?.release()
        lock = null
    }

    // ------------------------------------------------------------ Bluetooth
    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val d = result.device
            val name = result.scanRecord?.deviceName ?: try { d.name } catch (_: SecurityException) { null }
            put(FoundBooth(name = name ?: "Photobooth", via = "bluetooth", device = d))
        }
    }

    /** Needs the Bluetooth permissions (asked for by MainActivity). Returns false if Bluetooth is off. */
    @SuppressLint("MissingPermission")
    fun startBluetooth(): Boolean {
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter ?: return false
        if (!adapter.isEnabled) return false
        val scanner = adapter.bluetoothLeScanner ?: return false
        if (scanning) return true
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(Protocol.SERVICE)).build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        scanner.startScan(listOf(filter), settings, scanCallback)
        scanning = true
        main.postDelayed({ stopBluetooth() }, 20000)
        return true
    }

    @SuppressLint("MissingPermission")
    fun stopBluetooth() {
        if (!scanning) return
        scanning = false
        try {
            (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (_: Exception) {
        }
    }

    val isScanning get() = scanning

    fun stop() {
        stopWifi()
        stopBluetooth()
    }
}
