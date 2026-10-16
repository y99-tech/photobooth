package app.photobooth.remote

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Photobooth Remote — one screen to find the booth (Wi-Fi / Bluetooth / NFC / typed address)
 * and one screen to control it. The UI is built in code so the app has no dependencies.
 */
class MainActivity : Activity() {
    private val bg = Color.parseColor("#0f0d0b")
    private val panel = Color.parseColor("#1c1916")
    private val panel2 = Color.parseColor("#2a2520")
    private val accent = Color.parseColor("#c9a36b")
    private val ink = Color.parseColor("#f3ece2")
    private val muted = Color.parseColor("#a89c8c")
    private val okColor = Color.parseColor("#4caf50")
    private val errColor = Color.parseColor("#ef5350")

    private val prefs by lazy { getSharedPreferences("booth", Context.MODE_PRIVATE) }
    private lateinit var discovery: Discovery
    private var nfc: NfcAdapter? = null
    private var link: BoothLink? = null
    private var booth: JSONObject = JSONObject() // hello: name, host, port, url…
    private var found: List<FoundBooth> = emptyList()
    private var onControl = false
    private var nfcWriteUrl: String? = null
    private var pendingBluetoothScan = false

    // connect screen views
    private var foundBox: LinearLayout? = null
    private var bleBox: LinearLayout? = null
    private var statusText: TextView? = null
    private var pinField: EditText? = null

    // control screen views
    private var stateText: TextView? = null
    private var dot: View? = null
    private var shootBtn: Button? = null
    private var printMsg: TextView? = null
    private var photoView: ImageView? = null
    private var alertsBox: LinearLayout? = null
    private var tilesBox: LinearLayout? = null
    private val chips = HashMap<String, MutableList<Pair<String, Button>>>()
    private var lastPhotoId: String? = null

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = bg
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        nfc = NfcAdapter.getDefaultAdapter(this)
        discovery = Discovery(this) { list ->
            found = list
            renderFound()
        }
        showConnect()
        Nfc.boothUrl(intent)?.let { connectUrl(it) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        Nfc.boothUrl(intent)?.let { connectUrl(it) }
    }

    override fun onResume() {
        super.onResume()
        if (!onControl) discovery.startWifi()
        // While the app is open, NFC stickers come straight here (read, or write in write mode).
        nfc?.enableReaderMode(this, { tag -> onTag(tag) },
            NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V, null)
    }

    override fun onPause() {
        super.onPause()
        nfc?.disableReaderMode(this)
        discovery.stop()
    }

    override fun onDestroy() {
        link?.close()
        super.onDestroy()
    }

    private fun onTag(tag: Tag) {
        val writeUrl = nfcWriteUrl
        if (writeUrl != null) {
            val err = Nfc.write(tag, writeUrl)
            runOnUiThread {
                nfcWriteUrl = null
                toast(err ?: S.t("✅ Sticker written. Any phone that touches it opens this booth."))
            }
            return
        }
        val url = Nfc.read(tag) ?: return
        runOnUiThread { if (!onControl) connectUrl(url) }
    }

    // ================================================================ UI helpers
    private fun round(color: Int, radius: Int, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
        if (stroke != null) setStroke(dp(2), stroke)
    }

    private fun text(s: String, size: Float = 16f, color: Int = ink, bold: Boolean = false) = TextView(this).apply {
        text = s
        textSize = size
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
        setPadding(0, dp(4), 0, dp(4))
    }

    private fun button(label: String, primary: Boolean = false, onClick: (View) -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 16f
        setTextColor(if (primary) Color.parseColor("#1b140b") else ink)
        background = round(if (primary) accent else panel2, 14)
        minHeight = dp(52)
        setPadding(dp(12), 0, dp(12), 0)
        setOnClickListener {
            it.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            onClick(it)
        }
    }

    private fun lp(weight: Float = 0f, top: Int = 0) = LinearLayout.LayoutParams(
        if (weight > 0) 0 else ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, weight
    ).apply {
        topMargin = dp(top)
        if (weight > 0) { marginStart = dp(4); marginEnd = dp(4) }
    }

    private fun card(parent: LinearLayout, title: String? = null): LinearLayout {
        val c = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = round(panel, 18)
            setPadding(dp(16), dp(14), dp(16), dp(16))
        }
        if (title != null) c.addView(text(title, 18f, bold = true))
        parent.addView(c, lp(top = 14))
        return c
    }

    private fun row(parent: LinearLayout, vararg views: View): LinearLayout {
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        views.forEach { r.addView(it, lp(1f)) }
        parent.addView(r, lp(top = 8))
        return r
    }

    private fun field(hint: String, type: Int) = EditText(this).apply {
        this.hint = hint
        inputType = type
        setTextColor(ink)
        setHintTextColor(muted)
        textSize = 17f
        background = round(panel2, 12)
        setPadding(dp(14), dp(12), dp(14), dp(12))
    }

    private fun page(): LinearLayout {
        val scroll = ScrollView(this).apply { setBackgroundColor(bg); isFillViewport = true }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(20), dp(16), dp(32))
        }
        scroll.addView(col)
        setContentView(scroll)
        return col
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    // ================================================================ connect screen
    private fun showConnect(message: String? = null) {
        onControl = false
        chips.clear()
        val col = page()
        col.addView(text("📸 " + S.t("Booth Remote"), 28f, bold = true))
        col.addView(text(S.t("Control the photobooth over Wi-Fi, Bluetooth or NFC."), 15f, muted))

        pinField = field(S.t("PIN"), InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD).apply {
            setText(prefs.getString("pin", ""))
        }
        col.addView(pinField, lp(top = 14))
        statusText = text(message ?: "", 15f, if (message != null) errColor else muted)
        col.addView(statusText)

        val lastUrl = prefs.getString("lastUrl", null)
        if (lastUrl != null) {
            col.addView(button(S.t("Reconnect to") + " " + prefs.getString("lastName", lastUrl), primary = true) { connectUrl(lastUrl) }, lp(top = 6))
        }

        val wifi = card(col, "📶 " + S.t("On this Wi-Fi"))
        foundBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        wifi.addView(foundBox)

        val ble = card(col, "🔵 " + S.t("Bluetooth"))
        bleBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        ble.addView(bleBox)
        ble.addView(button(S.t("Search over Bluetooth")) { searchBluetooth() }, lp(top = 8))

        val manual = card(col, "⌨️ " + S.t("Type the address"))
        val addr = field(S.t("e.g. photobooth.local:8080 or 192.168.1.20:8080"), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI).apply {
            imeOptions = EditorInfo.IME_ACTION_GO
        }
        manual.addView(addr, lp(top = 6))
        manual.addView(button(S.t("Connect")) { if (addr.text.isNotBlank()) connectUrl(addr.text.toString()) }, lp(top = 8))
        addr.setOnEditorActionListener { _, _, _ -> if (addr.text.isNotBlank()) connectUrl(addr.text.toString()); true }

        if (nfc != null) col.addView(text("🏷️ " + S.t("NFC: touch the sticker on the booth with the back of the phone."), 15f, muted), lp(top = 14))
        renderFound()
        discovery.startWifi()
    }

    private fun renderFound() {
        val box = foundBox ?: return
        box.removeAllViews()
        val wifi = found.filter { it.via == "wifi" }
        if (wifi.isEmpty()) box.addView(text(S.t("No booth found yet. Is the phone on the same Wi-Fi as the booth?"), 15f, muted))
        wifi.forEach { b -> box.addView(button("📸 ${b.name}", primary = true) { connect(b) }, lp(top = 6)) }
        val ble = bleBox ?: return
        ble.removeAllViews()
        val bt = found.filter { it.via == "bluetooth" }
        if (bt.isEmpty() && discovery.isScanning) ble.addView(text(S.t("Searching over Bluetooth…"), 15f, muted))
        bt.forEach { b -> ble.addView(button("🔵 ${b.name}", primary = true) { connect(b) }, lp(top = 6)) }
    }

    private fun bluetoothPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= 31) arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

    private fun hasBluetoothPermission() = bluetoothPermissions().all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

    private fun searchBluetooth() {
        if (!hasBluetoothPermission()) {
            pendingBluetoothScan = true
            requestPermissions(bluetoothPermissions(), 7)
            return
        }
        if (!discovery.startBluetooth()) toast(S.t("Turn Bluetooth on first"))
        renderFound()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 7 && pendingBluetoothScan) {
            pendingBluetoothScan = false
            if (hasBluetoothPermission()) searchBluetooth() else toast(S.t("Bluetooth permission is needed"))
        }
    }

    private fun pin(): String? {
        val p = pinField?.text?.toString()?.trim() ?: prefs.getString("pin", "")
        if (p.isNullOrEmpty()) {
            statusText?.apply { text = S.t("Enter the PIN first"); setTextColor(errColor) }
            pinField?.requestFocus()
            return null
        }
        return p
    }

    /** "photobooth.local:8080", "http://192.168.1.20:8080/remote", "photobooth://connect?url=…" → base URL */
    private fun normalize(input: String): String {
        var s = input.trim()
        Nfc.boothUrl(Uri.parse(s))?.let { if (s.contains("://")) s = it }
        if (!s.contains("://")) s = "http://$s"
        val u = Uri.parse(s)
        val port = if (u.port > 0) u.port else 8080
        return "${u.scheme}://${u.host}:$port"
    }

    private fun connectUrl(input: String) {
        val url = normalize(input)
        val host = Uri.parse(url).host ?: ""
        // A ".local" name from the sticker: use the address found on the Wi-Fi when we have it.
        val match = found.firstOrNull { it.via == "wifi" && it.host != null && it.host.equals(host, ignoreCase = true) }
        connect(match ?: FoundBooth(name = host, via = "wifi", url = url))
    }

    private fun connect(b: FoundBooth) {
        val p = pin() ?: return
        prefs.edit().putString("pin", p).apply()
        link?.close()
        discovery.stopBluetooth()
        statusText?.apply { text = S.t("Connecting…"); setTextColor(muted) }
        val l: BoothLink = if (b.via == "bluetooth" && b.device != null) BleLink(this, b.device) else WifiLink(b.url!!)
        link = l
        val fail = { e: Throwable ->
            if (link === l) {
                l.close()
                link = null
                val msg = if ((e as? BoothError)?.wrongPin == true) S.t("Wrong PIN") else e.message ?: "Error"
                statusText?.apply { text = "⚠️ $msg"; setTextColor(errColor) }
            }
        }
        l.hello { h ->
            if (h.isFailure) return@hello fail(h.exceptionOrNull()!!)
            booth = h.getOrNull() ?: JSONObject()
            l.connect(p) { r ->
                if (r.isFailure) return@connect fail(r.exceptionOrNull()!!)
                if (l is WifiLink) prefs.edit().putString("lastUrl", l.base).putString("lastName", booth.optString("name")).apply()
                showControl(l)
            }
        }
    }

    // ================================================================ control screen
    private fun showControl(l: BoothLink) {
        onControl = true
        discovery.stop()
        chips.clear()
        val col = page()

        val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        dot = View(this).apply { background = round(okColor, 6) }
        top.addView(dot, LinearLayout.LayoutParams(dp(12), dp(12)).apply { marginEnd = dp(8) })
        val title = text(booth.optString("name", "Photobooth") + "  ·  " + if (l.kind == "wifi") "📶 " + S.t("Wi-Fi") else "🔵 " + S.t("Bluetooth"), 16f, bold = true)
        top.addView(title, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        top.addView(Button(this).apply {
            text = S.t("Disconnect")
            isAllCaps = false
            setTextColor(muted)
            background = round(panel2, 12)
            setOnClickListener { disconnect() }
        })
        col.addView(top)

        stateText = text("…", 19f).apply { gravity = Gravity.CENTER }
        col.addView(stateText, lp(top = 10))

        val size = (minOf(resources.displayMetrics.widthPixels, dp(300)) * 0.62).toInt()
        shootBtn = Button(this).apply {
            text = S.t("SHOOT")
            textSize = 26f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#1b140b"))
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(accent); setStroke(dp(8), panel2) }
            setOnClickListener { it.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS); command("shoot") }
        }
        col.addView(shootBtn, LinearLayout.LayoutParams(size, size).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = dp(12) })
        row(col, button(S.t("↺ Retake")) { command("retake") }, button(S.t("✓ Accept"), primary = true) { command("accept") }, button(S.t("⌂ Home")) { command("home") })
        col.addView(text(S.t("Volume buttons and Bluetooth selfie buttons also take a photo."), 13f, muted).apply { gravity = Gravity.CENTER })

        val opts = card(col)
        choice(opts, S.t("Mode"), "mode", listOf("single" to "Single", "strip" to "4-shot", "gif" to "GIF", "boomerang" to "Boomerang", "message" to "Message"))
        choice(opts, S.t("Frame"), "template", listOf("elegant" to "Elegant", "polaroid" to "Polaroid", "minimal" to "Minimal", "none" to "None"))
        choice(opts, S.t("Camera"), "camera", listOf("dslr" to "DSLR", "webcam" to "Webcam"))

        val greet = card(col, S.t("Greeting on the current photo"))
        val g = field(S.t("Type a greeting"), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE)
        greet.addView(g, lp(top = 6))
        greet.addView(button(S.t("Send to screen")) { command("greeting", g.text.toString()) { toast(S.t("Sent")) } }, lp(top = 8))

        val pr = card(col, "🖨️ " + S.t("Print"))
        row(pr, button(S.t("Print")) { print(1) }, button(S.t("Print ×2")) { print(2) })
        printMsg = text("", 15f, muted)
        pr.addView(printMsg)
        photoView = ImageView(this).apply { adjustViewBounds = true; visibility = View.GONE }
        pr.addView(photoView, lp(top = 8))

        val health = card(col, "🩺 " + S.t("Booth health"))
        alertsBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        health.addView(alertsBox)
        tilesBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        health.addView(tilesBox)

        if (nfc != null) {
            val n = card(col, "🏷️ " + S.t("NFC sticker"))
            n.addView(button(S.t("Write this booth on an NFC sticker")) {
                val host = booth.optString("host").ifEmpty { Uri.parse(booth.optString("url")).host ?: "" }
                val port = booth.optInt("port", Uri.parse(booth.optString("url")).port.takeIf { it > 0 } ?: 8080)
                nfcWriteUrl = "http://$host:$port/remote"
                toast(S.t("Now touch the sticker with the back of the phone…"))
            }, lp(top = 6))
        }

        l.onEvent = { type, d -> onEvent(type, d) }
        l.onOnline = { on ->
            dot?.background = round(if (on) okColor else errColor, 6)
            if (!on) stateText?.text = S.t("Reconnecting…")
        }
    }

    private fun choice(parent: LinearLayout, title: String, key: String, items: List<Pair<String, String>>) {
        parent.addView(text(title, 16f, bold = true), lp(top = 6))
        val list = ArrayList<Pair<String, Button>>()
        items.chunked(3).forEach { part ->
            val buttons = part.map { (value, label) ->
                button(S.t(label)) { command(key, value) }.also { list.add(value to it) }
            }
            row(parent, *buttons.toTypedArray())
        }
        chips[key] = list
    }

    private fun select(key: String, value: String?) {
        chips[key]?.forEach { (v, b) -> b.background = round(panel2, 14, if (v == value) accent else null) }
    }

    private fun command(cmd: String, value: Any? = null, ok: (() -> Unit)? = null) {
        val l = link ?: return
        l.send(cmd, value) { r ->
            if (r.isSuccess) ok?.invoke()
            else if ((r.exceptionOrNull() as? BoothError)?.wrongPin == true) showConnect(S.t("Wrong PIN"))
            else toast("⚠️ " + r.exceptionOrNull()?.message)
        }
    }

    private fun print(copies: Int) {
        link?.print(copies, lastPhotoId) { r ->
            if (r.isFailure) printMsg?.text = "⚠️ " + r.exceptionOrNull()?.message
        }
    }

    private fun onEvent(type: String, d: JSONObject) {
        when (type) {
            "state" -> {
                val screen = d.optString("screen")
                stateText?.text = when (screen) {
                    "attract" -> S.t("Ready — waiting for guests")
                    "live" -> S.t("📸 Shooting…")
                    "review" -> S.t("✍️ Guest is reviewing")
                    "shareScr" -> S.t("📲 Guest is sharing")
                    else -> screen
                }
                shootBtn?.text = S.t(if (screen == "review") "RESHOOT" else "SHOOT")
                shootBtn?.isEnabled = screen != "live"
                shootBtn?.alpha = if (screen == "live") 0.45f else 1f
                select("mode", d.optString("mode"))
                select("template", d.optString("template"))
                select("camera", d.optString("camera"))
            }
            "print" -> {
                val status = d.optString("status").takeIf { it.isNotEmpty() && it != "null" }
                val word = when (status) {
                    "queued" -> S.t("queued"); "printing" -> S.t("printing…"); "done" -> S.t("sent ✓")
                    "failed" -> S.t("failed") + ": " + d.optString("error"); else -> null
                }
                val paper = d.optInt("paperLeft", -1).takeIf { it >= 0 && d.optBoolean("enabled", true) }?.let { "🧻 $it " + S.t("prints of paper left") }
                printMsg?.text = listOfNotNull(word?.let { "🖨️ $it" }, paper).joinToString(" · ")
            }
            "photo" -> {
                lastPhotoId = d.optString("id")
                d.optString("image").takeIf { it.isNotEmpty() }?.let { loadImage(it) }
            }
            "health" -> renderHealth(d)
        }
    }

    private fun renderHealth(h: JSONObject) {
        val alerts = alertsBox ?: return
        alerts.removeAllViews()
        val list = h.optJSONArray("alerts")
        for (i in 0 until (list?.length() ?: 0)) {
            val a = list!!.optJSONObject(i) ?: continue
            val error = a.optString("level") == "error"
            alerts.addView(text("⚠️ " + a.optString("text"), 15f, if (error) Color.parseColor("#ff8a80") else Color.parseColor("#f5c66b"), bold = true).apply {
                background = round(if (error) Color.parseColor("#3b1717") else Color.parseColor("#3b2f12"), 12)
                setPadding(dp(12), dp(10), dp(12), dp(10))
            }, lp(top = 6))
        }
        if ((list?.length() ?: 0) > 0) window.decorView.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        val tiles = tilesBox ?: return
        tiles.removeAllViews()
        fun tile(label: String, value: String) = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = round(panel2, 12)
            setPadding(dp(10), dp(8), dp(10), dp(8))
            addView(text(label, 13f, muted))
            addView(text(value, 19f, bold = true))
        }
        val battery = if (h.isNull("battery")) (if (h.optBoolean("camera", false)) "OK" else "—") else "🔋 ${h.optInt("battery")}%"
        val free = if (h.isNull("freeGB")) "?" else "${h.optDouble("freeGB")} GB"
        val paper = if (h.isNull("paperLeft")) "—" else h.optInt("paperLeft").let { if (it < 0) "∞" else "$it" }
        row(tiles, tile("📷 " + S.t("Battery"), battery), tile("💾 " + S.t("Free space"), free))
        row(tiles, tile("🧻 " + S.t("Paper"), paper), tile("📸 " + S.t("Photos"), "${h.optInt("photos")}"))
    }

    private fun loadImage(url: String) {
        Thread {
            try {
                val c = URL(url).openConnection() as HttpURLConnection
                c.connectTimeout = 5000
                c.readTimeout = 10000
                val opts = BitmapFactory.Options().apply { inSampleSize = 2 }
                val bmp = c.inputStream.use { BitmapFactory.decodeStream(it, null, opts) }
                c.disconnect()
                runOnUiThread { photoView?.apply { setImageBitmap(bmp); visibility = View.VISIBLE } }
            } catch (_: Exception) {
            }
        }.start()
    }

    private fun disconnect() {
        link?.close()
        link = null
        showConnect()
    }

    // Volume buttons (and Bluetooth selfie remotes paired with the phone) take a photo.
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (onControl && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            if (event?.repeatCount == 0) command("shoot")
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    @Deprecated("Back button")
    override fun onBackPressed() {
        if (onControl) disconnect() else super.onBackPressed()
    }
}
