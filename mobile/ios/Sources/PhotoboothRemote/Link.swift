import CoreBluetooth
import Foundation

/// Bluetooth protocol shared with the booth (server/link.js) and the Android app.
enum BoothProtocol {
    static let service = CBUUID(string: "7b9a0001-3c4e-4f5a-9b1d-2f6e8c0d1a70")
    static let command = CBUUID(string: "7b9a0002-3c4e-4f5a-9b1d-2f6e8c0d1a70")
    static let events = CBUUID(string: "7b9a0003-3c4e-4f5a-9b1d-2f6e8c0d1a70")
    static let bonjourType = "_photobooth._tcp"

    /// Splits a message into packets; the first byte is 1 when more packets follow, 0 on the last.
    static func frame(_ json: [String: Any], max: Int) -> [Data] {
        let data = (try? JSONSerialization.data(withJSONObject: json)) ?? Data("{}".utf8)
        let size = Swift.max(19, max - 1)
        var out: [Data] = []
        var i = 0
        repeat {
            let end = min(data.count, i + size)
            var pkt = Data([end < data.count ? 1 : 0])
            pkt.append(data.subdata(in: i..<end))
            out.append(pkt)
            i = end
        } while i < data.count
        return out
    }
}

typealias JSON = [String: Any]

struct BoothError: LocalizedError {
    let message: String
    var wrongPin = false
    var errorDescription: String? { message }
}

/// One connection to a booth (Wi-Fi or Bluetooth). Every callback runs on the main thread.
protocol BoothLink: AnyObject {
    var kind: LinkKind { get }
    var onEvent: ((String, JSON) -> Void)? { get set }
    var onOnline: ((Bool) -> Void)? { get set }
    func hello(_ done: @escaping (Result<JSON, BoothError>) -> Void)
    /// Checks the PIN and starts live updates.
    func connect(pin: String, _ done: @escaping (Result<JSON, BoothError>) -> Void)
    func send(_ cmd: String, value: Any?, _ done: @escaping (Result<JSON, BoothError>) -> Void)
    func print(copies: Int, photoId: String?, _ done: @escaping (Result<JSON, BoothError>) -> Void)
    func close()
}

enum LinkKind { case wifi, bluetooth }

/// Turns the booth's full health report into the small shape both links use.
func compactHealth(_ h: JSON) -> JSON {
    let cam = h["camera"] as? JSON
    let print = h["print"] as? JSON
    var out: JSON = [
        "alerts": h["alerts"] as? [JSON] ?? [],
        "photos": h["photos"] as? Int ?? 0,
    ]
    out["battery"] = cam?["battery"] as? Int
    out["camera"] = cam?["available"] as? Bool
    out["freeGB"] = (h["disk"] as? JSON)?["freeGB"] as? Double
    if let print, print["enabled"] as? Bool == true { out["paperLeft"] = print["paperLeft"] as? Int }
    return out
}
