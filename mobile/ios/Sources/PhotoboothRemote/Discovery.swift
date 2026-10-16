import CoreNFC
import Foundation
import Network

/// A booth found on the Wi-Fi, over Bluetooth, from an NFC sticker or typed by hand.
struct FoundBooth: Identifiable {
    enum Via { case wifi, bluetooth }
    let id: String
    let name: String
    let via: Via
    var url: String? = nil
    var host: String? = nil
    var peripheral: AnyObject? = nil // CBPeripheral
}

/// Finds booths on the Wi-Fi with Bonjour ("_photobooth._tcp" — see server/link.js).
final class BonjourBrowser {
    private var browser: NWBrowser?
    var onChange: (([FoundBooth]) -> Void)?

    func start() {
        guard browser == nil else { return }
        let b = NWBrowser(for: .bonjourWithTXTRecord(type: BoothProtocol.bonjourType, domain: nil), using: .tcp)
        b.browseResultsChangedHandler = { [weak self] results, _ in
            var list: [FoundBooth] = []
            for r in results {
                guard case .service(let serviceName, _, _, _) = r.endpoint else { continue }
                var txt: [String: String] = [:]
                if case .bonjour(let record) = r.metadata { txt = record.dictionary }
                let port = txt["port"] ?? "8080"
                // The IP from the TXT record avoids depending on ".local" names; the host is the fallback.
                let address = txt["ip"].map { "http://\($0):\(port)" } ?? txt["host"].map { "http://\($0):\(port)" }
                guard let address else { continue }
                list.append(FoundBooth(id: "wifi:" + (txt["id"] ?? serviceName), name: txt["name"] ?? serviceName,
                                       via: .wifi, url: address, host: txt["host"]))
            }
            DispatchQueue.main.async { self?.onChange?(list) }
        }
        b.start(queue: .main)
        browser = b
    }

    func stop() {
        browser?.cancel()
        browser = nil
    }
}

/// Reads the NFC sticker on the booth inside the app. Needs the NFC entitlement (paid Apple
/// developer account, see README); without it iPhones still read the sticker from the lock
/// screen / Control Center and open the booth's web page, which has an "Open in app" button.
final class NFCReader: NSObject, NFCNDEFReaderSessionDelegate {
    private var session: NFCNDEFReaderSession?
    private var done: ((Result<String, BoothError>) -> Void)?

    static var available: Bool { NFCNDEFReaderSession.readingAvailable }

    func read(_ done: @escaping (Result<String, BoothError>) -> Void) {
        self.done = done
        let s = NFCNDEFReaderSession(delegate: self, queue: .main, invalidateAfterFirstRead: true)
        s.alertMessage = L("Hold the top of the iPhone near the sticker on the booth.")
        s.begin()
        session = s
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        for m in messages {
            for r in m.records {
                if let url = r.wellKnownTypeURIPayload(), let base = boothURL(from: url) {
                    finish(.success(base))
                    return
                }
            }
        }
        finish(.failure(BoothError(message: L("This sticker has no booth address"))))
    }

    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        let code = (error as? NFCReaderError)?.code
        if code == .readerSessionInvalidationErrorFirstNDEFTagRead || code == .readerSessionInvalidationErrorUserCanceled {
            finish(nil)
        } else {
            finish(.failure(BoothError(message: L("NFC in the app needs a paid Apple developer account. Close the app and hold the iPhone near the sticker instead."))))
        }
    }

    private func finish(_ r: Result<String, BoothError>?) {
        if let r, let d = done { d(r) }
        done = nil
        session = nil
    }
}

/// "http://photobooth.local:8080/remote" or "photobooth://connect?url=…" → "http://photobooth.local:8080"
func boothURL(from url: URL) -> String? {
    if url.scheme == "photobooth" {
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "url" })?.value
    }
    guard let scheme = url.scheme, scheme == "http" || scheme == "https", let host = url.host else { return nil }
    return "\(scheme)://\(host):\(url.port ?? 8080)"
}

/// Whatever the user typed → base URL, e.g. "photobooth.local:8080" → "http://photobooth.local:8080"
func normalizeAddress(_ input: String) -> String? {
    var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.isEmpty { return nil }
    if !s.contains("://") { s = "http://" + s }
    guard let url = URL(string: s) else { return nil }
    return boothURL(from: url)
}
