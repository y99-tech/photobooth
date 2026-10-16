package app.photobooth.remote

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.ArrayDeque

/**
 * Talks to the booth over Bluetooth LE — works with no Wi-Fi at all (see server/link.js).
 * Permissions (BLUETOOTH_CONNECT / location on old phones) are asked for by MainActivity first.
 */
@SuppressLint("MissingPermission")
class BleLink(private val context: Context, private val device: BluetoothDevice) : BoothLink {
    override val kind = "bluetooth"
    override var onEvent: ((String, JSONObject) -> Unit)? = null
    override var onOnline: ((Boolean) -> Unit)? = null

    private val main = Handler(Looper.getMainLooper())
    private var gatt: BluetoothGatt? = null
    private var cmd: BluetoothGattCharacteristic? = null
    private var mtu = 23
    private var ready = false
    private var closed = false
    private var pin = ""
    private var nextId = 1
    private val pending = HashMap<Int, (Result<JSONObject>) -> Unit>()
    private val waitingForReady = ArrayList<() -> Unit>()
    private val queue = ArrayDeque<ByteArray>()
    private var writing = false
    private val incoming = ByteArrayOutputStream()

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            main.post {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    if (!g.requestMtu(185)) g.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    ready = false
                    writing = false
                    queue.clear()
                    failAll("Bluetooth connection lost")
                    onOnline?.invoke(false)
                    if (!closed) main.postDelayed({ if (!closed) reconnect() }, 2000)
                }
            }
        }

        override fun onMtuChanged(g: BluetoothGatt, newMtu: Int, status: Int) {
            main.post {
                if (status == BluetoothGatt.GATT_SUCCESS) mtu = newMtu
                g.discoverServices()
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            main.post { setUp(g) }
        }

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
            main.post { becomeReady() }
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
            main.post {
                writing = false
                pump()
            }
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {
            val copy = value.copyOf()
            main.post { received(copy) }
        }

        @Deprecated("Android 12 and older")
        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            @Suppress("DEPRECATION")
            val copy = (c.value ?: return).copyOf()
            main.post { received(copy) }
        }
    }

    private fun setUp(g: BluetoothGatt) {
        val service = g.getService(Protocol.SERVICE)
        val c = service?.getCharacteristic(Protocol.CMD)
        val e = service?.getCharacteristic(Protocol.EVT)
        if (c == null || e == null) {
            failAll("This Bluetooth device is not a photobooth")
            return
        }
        cmd = c
        g.setCharacteristicNotification(e, true)
        val d = e.getDescriptor(Protocol.CCCD)
        if (d == null) {
            becomeReady()
        } else if (Build.VERSION.SDK_INT >= 33) {
            g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
        } else {
            @Suppress("DEPRECATION")
            d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            @Suppress("DEPRECATION")
            g.writeDescriptor(d)
        }
    }

    init {
        reconnect()
    }

    private fun reconnect() {
        gatt?.close()
        gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    }

    private fun becomeReady() {
        if (ready) return
        ready = true
        val waiting = ArrayList(waitingForReady)
        waitingForReady.clear()
        waiting.forEach { it() }
        if (pin.isNotEmpty()) {
            // reconnected: log in again so live updates keep coming
            request("check", null, true) { r -> if (r.isSuccess) onOnline?.invoke(true) }
        }
    }

    private fun received(pkt: ByteArray) {
        if (pkt.isEmpty()) return
        incoming.write(pkt, 1, pkt.size - 1)
        if (pkt[0].toInt() != 0) return
        val text = incoming.toString("UTF-8")
        incoming.reset()
        val msg = try {
            JSONObject(text)
        } catch (_: Exception) {
            return
        }
        when (val t = msg.optString("t")) {
            "ack" -> {
                val cb = pending.remove(msg.optInt("id")) ?: return
                if (msg.optBoolean("ok")) cb(Result.success(msg))
                else cb(Result.failure(BoothError(msg.optString("e", "Error"), wrongPin = msg.optString("e") == "Wrong PIN")))
            }
            else -> if (!closed) onEvent?.invoke(t, msg)
        }
    }

    private fun failAll(why: String) {
        val cbs = pending.values.toList()
        pending.clear()
        cbs.forEach { it(Result.failure(BoothError(why))) }
        val waiting = ArrayList(waitingForReady)
        waitingForReady.clear()
        waiting.forEach { it() }
    }

    private fun request(c: String, v: Any?, withPin: Boolean, done: (Result<JSONObject>) -> Unit) {
        if (closed) return done(Result.failure(BoothError("Disconnected")))
        if (!ready) {
            waitingForReady.add { if (ready) request(c, v, withPin, done) else done(Result.failure(BoothError("Bluetooth: could not connect to the booth"))) }
            return
        }
        val id = nextId++
        val msg = JSONObject().put("id", id).put("c", c).put("v", v ?: JSONObject.NULL)
        if (withPin) msg.put("p", pin)
        pending[id] = done
        main.postDelayed({ pending.remove(id)?.invoke(Result.failure(BoothError("The booth did not answer over Bluetooth"))) }, 8000)
        queue.addAll(Protocol.frame(msg, mtu - 3))
        pump()
    }

    private fun pump() {
        val g = gatt ?: return
        val c = cmd ?: return
        if (writing || queue.isEmpty()) return
        val pkt = queue.poll() ?: return
        writing = true
        val ok = if (Build.VERSION.SDK_INT >= 33) {
            g.writeCharacteristic(c, pkt, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothGatt.GATT_SUCCESS
        } else {
            @Suppress("DEPRECATION")
            c.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            @Suppress("DEPRECATION")
            c.value = pkt
            @Suppress("DEPRECATION")
            g.writeCharacteristic(c)
        }
        if (!ok) {
            // the stack was busy: try again shortly
            writing = false
            queue.addFirst(pkt)
            main.postDelayed({ pump() }, 50)
        }
    }

    override fun hello(done: (Result<JSONObject>) -> Unit) = request("hello", null, false, done)

    override fun connect(pin: String, done: (Result<JSONObject>) -> Unit) {
        this.pin = pin
        request("check", null, true) { r ->
            done(r)
            if (r.isSuccess) {
                onOnline?.invoke(true)
                r.getOrNull()?.optJSONObject("state")?.let { onEvent?.invoke("state", it) }
                request("health", null, true) { h -> h.getOrNull()?.optJSONObject("health")?.let { onEvent?.invoke("health", compact(it)) } }
            }
        }
    }

    private fun compact(h: JSONObject): JSONObject {
        val cam = h.optJSONObject("camera")
        return JSONObject()
            .put("alerts", h.optJSONArray("alerts"))
            .put("battery", if (cam != null && !cam.isNull("battery")) cam.optInt("battery") else JSONObject.NULL)
            .put("camera", cam?.optBoolean("available") ?: JSONObject.NULL)
            .put("freeGB", h.optJSONObject("disk")?.optDouble("freeGB") ?: JSONObject.NULL)
            .put("paperLeft", h.optJSONObject("print")?.let { if (it.optBoolean("enabled")) it.optInt("paperLeft", -1) else null } ?: JSONObject.NULL)
            .put("photos", h.optInt("photos"))
    }

    override fun send(cmd: String, value: Any?, done: (Result<JSONObject>) -> Unit) = request(cmd, value, true, done)

    override fun print(copies: Int, photoId: String?, done: (Result<JSONObject>) -> Unit) {
        val v = JSONObject().put("copies", copies)
        if (photoId != null) v.put("id", photoId)
        request("print", v, true, done)
    }

    override fun close() {
        closed = true
        failAll("Disconnected")
        gatt?.disconnect()
        gatt?.close()
        gatt = null
    }
}
