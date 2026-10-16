package app.photobooth.remote

import android.content.Intent
import android.net.Uri
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import android.os.Build

/**
 * NFC sticker on the booth: a web address record (opens the web remote on any phone, including
 * iPhones) followed by an Android Application Record so Android phones open this app instead.
 */
object Nfc {
    const val PACKAGE = "app.photobooth.remote"

    /** "http://photobooth.local:8080/remote" → "http://photobooth.local:8080" */
    fun boothUrl(uri: Uri?): String? {
        if (uri == null) return null
        if (uri.scheme == "photobooth") return uri.getQueryParameter("url")
        if (uri.scheme != "http" && uri.scheme != "https") return null
        val port = if (uri.port > 0) ":${uri.port}" else ""
        return "${uri.scheme}://${uri.host}$port"
    }

    fun boothUrl(msg: NdefMessage?): String? {
        for (r in msg?.records ?: return null) {
            val u = r.toUri() ?: continue
            boothUrl(u)?.let { return it }
        }
        return null
    }

    /** Booth address from an intent: NFC tag (NDEF_DISCOVERED) or a photobooth:// link. */
    fun boothUrl(intent: Intent?): String? {
        if (intent == null) return null
        if (intent.action == NfcAdapter.ACTION_NDEF_DISCOVERED) {
            val msgs = if (Build.VERSION.SDK_INT >= 33) {
                intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES, NdefMessage::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)
            }
            msgs?.forEach { m -> boothUrl(m as? NdefMessage)?.let { return it } }
        }
        return boothUrl(intent.data)
    }

    fun read(tag: Tag): String? {
        val ndef = Ndef.get(tag) ?: return null
        return try {
            ndef.connect()
            boothUrl(ndef.ndefMessage ?: ndef.cachedNdefMessage)
        } catch (_: Exception) {
            boothUrl(ndef.cachedNdefMessage)
        } finally {
            try { ndef.close() } catch (_: Exception) {}
        }
    }

    /** Writes the booth's remote address on a sticker. Returns an error text or null when done. */
    fun write(tag: Tag, remoteUrl: String): String? {
        val msg = NdefMessage(arrayOf(NdefRecord.createUri(remoteUrl), NdefRecord.createApplicationRecord(PACKAGE)))
        try {
            val ndef = Ndef.get(tag)
            if (ndef != null) {
                ndef.connect()
                try {
                    if (!ndef.isWritable) return "This sticker is locked"
                    if (ndef.maxSize < msg.toByteArray().size) return "This sticker is too small (use NTAG213 / 215)"
                    ndef.writeNdefMessage(msg)
                } finally {
                    ndef.close()
                }
                return null
            }
            val f = NdefFormatable.get(tag) ?: return "This sticker can't store a web address"
            f.connect()
            try {
                f.format(msg)
            } finally {
                f.close()
            }
            return null
        } catch (e: Exception) {
            return e.message ?: "Could not write the sticker — hold the phone still and try again"
        }
    }
}
