package app.photobooth.remote

import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** Talks to the booth over the venue Wi-Fi: the same HTTP API the web remote uses. */
class WifiLink(baseUrl: String) : BoothLink {
    override val kind = "wifi"
    val base = baseUrl.trimEnd('/')
    override var onEvent: ((String, JSONObject) -> Unit)? = null
    override var onOnline: ((Boolean) -> Unit)? = null

    private val main = Handler(Looper.getMainLooper())
    private val pool = Executors.newCachedThreadPool()
    @Volatile private var closed = false
    @Volatile private var pin = ""
    @Volatile private var lastPhotoId: String? = null
    private var events: HttpURLConnection? = null

    private fun request(method: String, path: String, body: JSONObject? = null, timeout: Int = 6000): JSONObject {
        val c = URL(base + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = timeout
            c.readTimeout = timeout
            c.setRequestProperty("x-pin", pin)
            c.setRequestProperty("Accept", "application/json")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            val json = if (text.trim().startsWith("{")) JSONObject(text) else if (text.trim().startsWith("[")) JSONObject().put("list", JSONArray(text)) else JSONObject()
            if (code == 401) throw BoothError("Wrong PIN", wrongPin = true)
            if (code >= 400) throw BoothError(json.optString("error", "HTTP $code"))
            return json
        } finally {
            c.disconnect()
        }
    }

    private fun async(done: (Result<JSONObject>) -> Unit, work: () -> JSONObject) {
        pool.execute {
            val r = try {
                Result.success(work())
            } catch (e: BoothError) {
                Result.failure(e)
            } catch (e: Exception) {
                Result.failure(BoothError(e.message ?: "No connection"))
            }
            main.post { done(r) }
        }
    }

    override fun hello(done: (Result<JSONObject>) -> Unit) = async(done) {
        val h = request("GET", "/api/remote/hello", timeout = 4000)
        if (h.optString("app") != "photobooth") throw BoothError("That address is not a photobooth")
        h
    }

    override fun connect(pin: String, done: (Result<JSONObject>) -> Unit) {
        this.pin = pin
        async({ r ->
            done(r)
            if (r.isSuccess) {
                r.getOrNull()?.optJSONObject("state")?.let { emit("state", it) }
                startEvents()
                refreshHealth()
            }
        }) { request("GET", "/api/remote/check") }
    }

    override fun send(cmd: String, value: Any?, done: (Result<JSONObject>) -> Unit) = async(done) {
        request("POST", "/api/remote", JSONObject().put("cmd", cmd).put("value", value ?: JSONObject.NULL))
    }

    override fun print(copies: Int, photoId: String?, done: (Result<JSONObject>) -> Unit) = async(done) {
        val id = photoId ?: lastPhotoId ?: request("GET", "/api/photos?limit=1&kind=photo").optJSONArray("list")?.optJSONObject(0)?.optString("id")
        ?: throw BoothError("No photo to print yet")
        request("POST", "/api/remote/print/$id", JSONObject().put("copies", copies))
    }

    private fun refreshHealth() = pool.execute {
        try {
            val h = request("GET", "/api/health", timeout = 10000)
            emit("health", compactHealth(h))
        } catch (_: Exception) {
        }
    }

    private fun emit(type: String, data: JSONObject) = main.post { if (!closed) onEvent?.invoke(type, data) }
    private fun online(on: Boolean) = main.post { if (!closed) onOnline?.invoke(on) }

    /** Server-Sent Events: reconnects by itself until close(). */
    private fun startEvents() = pool.execute {
        var failures = 0
        while (!closed) {
            try {
                val c = URL("$base/api/events").openConnection() as HttpURLConnection
                events = c
                c.connectTimeout = 5000
                c.readTimeout = 45000 // the booth sends a ping every 20 s
                c.setRequestProperty("Accept", "text/event-stream")
                val reader = BufferedReader(InputStreamReader(c.inputStream, Charsets.UTF_8))
                online(true)
                if (failures > 0) refreshHealth()
                failures = 0
                var type = "message"
                val data = StringBuilder()
                while (!closed) {
                    val line = reader.readLine() ?: break
                    when {
                        line.startsWith("event:") -> type = line.substring(6).trim()
                        line.startsWith("data:") -> data.append(line.substring(5).trim())
                        line.isEmpty() -> {
                            if (data.isNotEmpty()) handle(type, data.toString())
                            type = "message"
                            data.setLength(0)
                        }
                    }
                }
                c.disconnect()
            } catch (_: Exception) {
            }
            if (closed) break
            online(false)
            failures++
            Thread.sleep(if (failures < 5) 1500L else 4000L)
        }
    }

    private fun handle(type: String, raw: String) {
        val d = try {
            JSONObject(raw)
        } catch (_: Exception) {
            return
        }
        when (type) {
            "state" -> emit("state", d)
            "photo" -> {
                lastPhotoId = d.optString("id")
                val out = JSONObject().put("id", d.optString("id")).put("kind", d.optString("kind", "photo"))
                val img = d.optString("thumb").takeIf { it.isNotEmpty() && it != "null" } ?: d.optString("url")
                if (d.optString("kind", "photo") != "video" && img.isNotEmpty()) out.put("image", base + img)
                emit("photo", out)
            }
            "print" -> {
                val job = d.optJSONObject("job")
                emit("print", JSONObject().put("status", job?.optString("status")).put("error", job?.optString("error"))
                    .put("queued", d.optInt("queued")).put("paperLeft", d.optInt("paperLeft", -1)).put("enabled", d.optBoolean("enabled")))
            }
            "health" -> emit("health", compactHealth(d))
        }
    }

    private fun compactHealth(h: JSONObject): JSONObject {
        val cam = h.optJSONObject("camera")
        return JSONObject()
            .put("alerts", h.optJSONArray("alerts") ?: JSONArray())
            .put("battery", if (cam != null && !cam.isNull("battery")) cam.optInt("battery") else JSONObject.NULL)
            .put("camera", cam?.optBoolean("available") ?: JSONObject.NULL)
            .put("freeGB", h.optJSONObject("disk")?.optDouble("freeGB") ?: JSONObject.NULL)
            .put("paperLeft", h.optJSONObject("print")?.let { if (it.optBoolean("enabled")) it.optInt("paperLeft", -1) else null } ?: JSONObject.NULL)
            .put("photos", h.optInt("photos"))
    }

    override fun close() {
        closed = true
        pool.execute { events?.disconnect() }
        pool.shutdown()
    }
}
