package app.photobooth.remote

import android.bluetooth.BluetoothDevice
import org.json.JSONObject
import java.util.UUID

/** Bluetooth protocol shared with the booth (server/link.js) and the iOS app. */
object Protocol {
    val SERVICE: UUID = UUID.fromString("7b9a0001-3c4e-4f5a-9b1d-2f6e8c0d1a70")
    val CMD: UUID = UUID.fromString("7b9a0002-3c4e-4f5a-9b1d-2f6e8c0d1a70")
    val EVT: UUID = UUID.fromString("7b9a0003-3c4e-4f5a-9b1d-2f6e8c0d1a70")
    val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    const val BONJOUR_TYPE = "_photobooth._tcp."

    /** Splits a message into packets; first byte = 1 when more packets follow, 0 on the last. */
    fun frame(json: JSONObject, max: Int): List<ByteArray> {
        val data = json.toString().toByteArray(Charsets.UTF_8)
        val size = maxOf(19, max - 1)
        val out = ArrayList<ByteArray>()
        var i = 0
        do {
            val end = minOf(data.size, i + size)
            val pkt = ByteArray(1 + end - i)
            pkt[0] = if (end < data.size) 1 else 0
            System.arraycopy(data, i, pkt, 1, end - i)
            out.add(pkt)
            i = end
        } while (i < data.size)
        return out
    }
}

/** A booth found on the Wi-Fi, over Bluetooth, from an NFC sticker or typed by hand. */
data class FoundBooth(
    val name: String,
    val via: String, // "wifi" | "bluetooth"
    val url: String? = null,
    val device: BluetoothDevice? = null,
    val id: String? = null,
    val host: String? = null, // e.g. "photobooth.local" (from the Bonjour TXT record)
) {
    val key: String get() = if (via == "wifi") "wifi:" + (id ?: url) else "ble:" + device?.address
}

/** One connection to a booth: Wi-Fi (HTTP + live events) or Bluetooth LE. Callbacks run on the main thread. */
interface BoothLink {
    val kind: String
    /** Checks the PIN and starts live updates. */
    fun connect(pin: String, done: (Result<JSONObject>) -> Unit)
    fun send(cmd: String, value: Any?, done: (Result<JSONObject>) -> Unit)
    fun print(copies: Int, photoId: String?, done: (Result<JSONObject>) -> Unit)
    fun hello(done: (Result<JSONObject>) -> Unit)
    /** Live events: "state", "print", "photo", "health" (same small shapes for both links). */
    var onEvent: ((String, JSONObject) -> Unit)?
    var onOnline: ((Boolean) -> Unit)?
    fun close()
}

class BoothError(message: String, val wrongPin: Boolean = false) : Exception(message)
