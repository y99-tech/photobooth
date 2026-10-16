import CoreBluetooth
import SwiftUI
import UIKit

/// Everything the screens show, and the one connection to the booth.
final class BoothModel: ObservableObject {
    // connect screen
    @Published var pin: String = UserDefaults.standard.string(forKey: "pin") ?? ""
    @Published var wifiBooths: [FoundBooth] = []
    @Published var bluetoothBooths: [FoundBooth] = []
    @Published var searchingBluetooth = false
    @Published var status: String?
    @Published var statusIsError = false
    @Published var connecting = false

    // control screen
    @Published var connected = false
    @Published var online = true
    @Published var boothName = "Photobooth"
    @Published var linkKind: LinkKind = .wifi
    @Published var screen = ""
    @Published var mode: String?
    @Published var template: String?
    @Published var camera: String?
    @Published var printMessage = ""
    @Published var photoURL: URL?
    @Published var lastPhotoId: String?
    @Published var alerts: [JSON] = []
    @Published var health: JSON = [:]
    @Published var toast: String?

    var lastURL: String? { UserDefaults.standard.string(forKey: "lastUrl") }
    var lastName: String? { UserDefaults.standard.string(forKey: "lastName") }

    private var link: BoothLink?
    private var hello: JSON = [:]
    private let bonjour = BonjourBrowser()
    private let nfc = NFCReader()

    init() {
        bonjour.onChange = { [weak self] list in self?.wifiBooths = list }
        BLECentral.shared.onFound = { [weak self] p, name in
            guard let self else { return }
            let b = FoundBooth(id: "ble:" + p.identifier.uuidString, name: name, via: .bluetooth, peripheral: p)
            if !self.bluetoothBooths.contains(where: { $0.id == b.id }) { self.bluetoothBooths.append(b) }
        }
        BLECentral.shared.onStateProblem = { [weak self] msg in
            self?.searchingBluetooth = false
            self?.show(msg, error: true)
        }
    }

    // MARK: finding booths
    func startWifiSearch() { bonjour.start() }

    func searchBluetooth() {
        searchingBluetooth = true
        BLECentral.shared.scan()
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in self?.searchingBluetooth = false }
    }

    var nfcAvailable: Bool { NFCReader.available }

    func readNFC() {
        nfc.read { [weak self] r in
            switch r {
            case .success(let url): self?.connect(address: url)
            case .failure(let e): self?.show(e.message, error: true)
            }
        }
    }

    private func show(_ s: String?, error: Bool = false) {
        status = s
        statusIsError = error
    }

    // MARK: connecting
    func connect(address: String) {
        guard let url = normalizeAddress(address) else { return show(L("Type the address"), error: true) }
        // A ".local" name from the sticker: use the address found on the Wi-Fi when we have it.
        let host = URL(string: url)?.host?.lowercased()
        if let match = wifiBooths.first(where: { $0.host?.lowercased() == host }) { return connect(match) }
        connect(FoundBooth(id: "url:" + url, name: host ?? url, via: .wifi, url: url))
    }

    func connect(_ booth: FoundBooth) {
        let p = pin.trimmingCharacters(in: .whitespaces)
        guard !p.isEmpty else { return show(L("Enter the PIN first"), error: true) }
        UserDefaults.standard.set(p, forKey: "pin")
        link?.close()
        BLECentral.shared.stopScan()
        searchingBluetooth = false
        connecting = true
        show(L("Connecting…"))

        let l: BoothLink
        if booth.via == .bluetooth, let p = booth.peripheral as? CBPeripheral {
            l = BLELink(peripheral: p)
        } else {
            l = WiFiLink(base: booth.url ?? "")
        }
        link = l
        let fail: (BoothError) -> Void = { [weak self] e in
            guard let self, self.link === l else { return }
            l.close()
            self.link = nil
            self.connecting = false
            self.show("⚠️ " + (e.wrongPin ? L("Wrong PIN") : e.message), error: true)
        }
        l.hello { [weak self] h in
            guard let self else { return }
            switch h {
            case .failure(let e): fail(e)
            case .success(let info):
                self.hello = info
                l.connect(pin: p) { r in
                    switch r {
                    case .failure(let e): fail(e)
                    case .success: self.didConnect(l, booth: booth)
                    }
                }
            }
        }
    }

    private func didConnect(_ l: BoothLink, booth: FoundBooth) {
        connecting = false
        show(nil)
        boothName = hello["name"] as? String ?? booth.name
        linkKind = l.kind
        if let w = l as? WiFiLink {
            UserDefaults.standard.set(w.base, forKey: "lastUrl")
            UserDefaults.standard.set(boothName, forKey: "lastName")
        }
        l.onEvent = { [weak self] type, d in self?.onEvent(type, d) }
        l.onOnline = { [weak self] on in self?.online = on }
        online = true
        connected = true
        bonjour.stop()
        UIApplication.shared.isIdleTimerDisabled = true
    }

    func disconnect() {
        link?.close()
        link = nil
        connected = false
        screen = ""
        photoURL = nil
        alerts = []
        health = [:]
        UIApplication.shared.isIdleTimerDisabled = false
        bonjour.start()
    }

    // MARK: commands
    func command(_ cmd: String, _ value: Any? = nil, onDone: (() -> Void)? = nil) {
        UIImpactFeedbackGenerator(style: cmd == "shoot" ? .heavy : .light).impactOccurred()
        link?.send(cmd, value: value) { [weak self] r in
            switch r {
            case .success: onDone?()
            case .failure(let e):
                if e.wrongPin {
                    self?.disconnect()
                    self?.show(L("Wrong PIN"), error: true)
                } else {
                    self?.toast = "⚠️ " + e.message
                }
            }
        }
    }

    func print(_ copies: Int) {
        link?.print(copies: copies, photoId: lastPhotoId) { [weak self] r in
            if case .failure(let e) = r { self?.printMessage = "⚠️ " + e.message }
        }
    }

    /// Address to write on an NFC sticker for this booth (stays the same at every venue).
    var stickerAddress: String {
        let url = URL(string: hello["url"] as? String ?? "")
        let host = hello["host"] as? String ?? url?.host ?? "photobooth.local"
        let port = hello["port"] as? Int ?? url?.port ?? 8080
        return "http://\(host):\(port)/remote"
    }

    // MARK: live events
    private func onEvent(_ type: String, _ d: JSON) {
        switch type {
        case "state":
            screen = d["screen"] as? String ?? ""
            mode = d["mode"] as? String
            template = d["template"] as? String
            camera = d["camera"] as? String
        case "print":
            let status = d["status"] as? String
            let word: String? = switch status {
            case "queued": L("queued")
            case "printing": L("printing…")
            case "done": L("sent ✓")
            case "failed": L("failed") + ": " + (d["error"] as? String ?? "")
            default: nil
            }
            var parts: [String] = []
            if let word { parts.append("🖨️ " + word) }
            if let paper = d["paperLeft"] as? Int, paper >= 0, d["enabled"] as? Bool ?? true {
                parts.append("🧻 \(paper) " + L("prints of paper left"))
            }
            printMessage = parts.joined(separator: " · ")
        case "photo":
            lastPhotoId = d["id"] as? String
            if let img = d["image"] as? String { photoURL = URL(string: img) }
        case "health":
            health = d
            let newAlerts = d["alerts"] as? [JSON] ?? []
            if !newAlerts.isEmpty && newAlerts.count != alerts.count {
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
            }
            alerts = newAlerts
        default:
            break
        }
    }
}
