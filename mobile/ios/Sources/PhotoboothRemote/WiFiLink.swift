import Foundation

/// Talks to the booth over the venue Wi-Fi: the same HTTP API as the web remote.
final class WiFiLink: BoothLink {
    let kind = LinkKind.wifi
    let base: String
    var onEvent: ((String, JSON) -> Void)?
    var onOnline: ((Bool) -> Void)?

    private var pin = ""
    private var closed = false
    private var lastPhotoId: String?
    private var eventsTask: Task<Void, Never>?

    init(base: String) {
        var b = base
        while b.hasSuffix("/") { b.removeLast() }
        self.base = b
    }

    private func request(_ method: String, _ path: String, body: JSON? = nil, timeout: TimeInterval = 6,
                         _ done: @escaping (Result<JSON, BoothError>) -> Void) {
        guard let url = URL(string: base + path) else { return done(.failure(BoothError(message: "Bad address"))) }
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.httpMethod = method
        req.setValue(pin, forHTTPHeaderField: "x-pin")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        URLSession.shared.dataTask(with: req) { data, resp, err in
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let obj = data.flatMap { try? JSONSerialization.jsonObject(with: $0) }
            let json: JSON = (obj as? JSON) ?? ["list": obj as? [JSON] ?? []]
            let result: Result<JSON, BoothError>
            if let err {
                result = .failure(BoothError(message: err.localizedDescription))
            } else if code == 401 {
                result = .failure(BoothError(message: "Wrong PIN", wrongPin: true))
            } else if code >= 400 || code == 0 {
                result = .failure(BoothError(message: json["error"] as? String ?? "HTTP \(code)"))
            } else {
                result = .success(json)
            }
            DispatchQueue.main.async { done(result) }
        }.resume()
    }

    func hello(_ done: @escaping (Result<JSON, BoothError>) -> Void) {
        request("GET", "/api/remote/hello", timeout: 4) { r in
            if case .success(let h) = r, h["app"] as? String != "photobooth" {
                return done(.failure(BoothError(message: "That address is not a photobooth")))
            }
            done(r)
        }
    }

    func connect(pin: String, _ done: @escaping (Result<JSON, BoothError>) -> Void) {
        self.pin = pin
        request("GET", "/api/remote/check") { [weak self] r in
            done(r)
            guard let self, case .success(let j) = r else { return }
            if let state = j["state"] as? JSON { self.onEvent?("state", state) }
            self.startEvents()
            self.refreshHealth()
        }
    }

    func send(_ cmd: String, value: Any?, _ done: @escaping (Result<JSON, BoothError>) -> Void) {
        request("POST", "/api/remote", body: ["cmd": cmd, "value": value ?? NSNull()], done)
    }

    func print(copies: Int, photoId: String?, _ done: @escaping (Result<JSON, BoothError>) -> Void) {
        if let id = photoId ?? lastPhotoId {
            return request("POST", "/api/remote/print/\(id)", body: ["copies": copies], done)
        }
        request("GET", "/api/photos?limit=1&kind=photo") { [weak self] r in
            guard case .success(let j) = r, let id = (j["list"] as? [JSON])?.first?["id"] as? String else {
                return done(.failure(BoothError(message: "No photo to print yet")))
            }
            self?.request("POST", "/api/remote/print/\(id)", body: ["copies": copies], done)
        }
    }

    private func refreshHealth() {
        request("GET", "/api/health", timeout: 10) { [weak self] r in
            if case .success(let h) = r { self?.onEvent?("health", compactHealth(h)) }
        }
    }

    /// Server-Sent Events; reconnects by itself until close().
    private func startEvents() {
        eventsTask?.cancel()
        guard let url = URL(string: base + "/api/events") else { return }
        eventsTask = Task { [weak self] in
            var failures = 0
            while !Task.isCancelled {
                do {
                    var req = URLRequest(url: url, timeoutInterval: 45) // the booth pings every 20 s
                    req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let (bytes, _) = try await URLSession.shared.bytes(for: req)
                    await MainActor.run { self?.onOnline?(true) }
                    if failures > 0 { await MainActor.run { self?.refreshHealth() } }
                    failures = 0
                    var type = "message"
                    for try await line in bytes.lines {
                        if line.hasPrefix("event:") {
                            type = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                        } else if line.hasPrefix("data:") {
                            // The booth sends one data line per event, so handle it right away.
                            let raw = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                            let t = type
                            await MainActor.run { self?.handle(t, raw) }
                            type = "message"
                        }
                    }
                } catch {}
                if Task.isCancelled { break }
                await MainActor.run { self?.onOnline?(false) }
                failures += 1
                try? await Task.sleep(nanoseconds: failures < 5 ? 1_500_000_000 : 4_000_000_000)
            }
        }
    }

    private func handle(_ type: String, _ raw: String) {
        guard !closed, let d = (try? JSONSerialization.jsonObject(with: Data(raw.utf8))) as? JSON else { return }
        switch type {
        case "state":
            onEvent?("state", d)
        case "photo":
            let id = d["id"] as? String
            lastPhotoId = id
            let kind = d["kind"] as? String ?? "photo"
            var out: JSON = ["id": id ?? "", "kind": kind]
            if kind != "video", let img = (d["thumb"] as? String) ?? (d["url"] as? String) { out["image"] = base + img }
            onEvent?("photo", out)
        case "print":
            let job = d["job"] as? JSON
            var out: JSON = ["queued": d["queued"] as? Int ?? 0, "enabled": d["enabled"] as? Bool ?? false]
            out["status"] = job?["status"] as? String
            out["error"] = job?["error"] as? String
            out["paperLeft"] = d["paperLeft"] as? Int
            onEvent?("print", out)
        case "health":
            onEvent?("health", compactHealth(d))
        default:
            break
        }
    }

    func close() {
        closed = true
        eventsTask?.cancel()
        eventsTask = nil
    }
}
