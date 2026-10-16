import CoreBluetooth
import Foundation

/// Finds booths over Bluetooth LE. Created only when the user asks to search, so the Bluetooth
/// permission prompt doesn't appear at launch.
final class BLECentral: NSObject, CBCentralManagerDelegate {
    static let shared = BLECentral()

    private(set) var manager: CBCentralManager!
    var onFound: ((CBPeripheral, String) -> Void)?
    var onStateProblem: ((String) -> Void)?
    private var wantScan = false
    /// The link currently connecting / connected (gets the connect & disconnect callbacks).
    weak var link: BLELink?

    func start() {
        if manager == nil { manager = CBCentralManager(delegate: self, queue: .main) }
    }

    func scan() {
        start()
        wantScan = true
        if manager.state == .poweredOn { beginScan() }
    }

    func stopScan() {
        wantScan = false
        if manager?.state == .poweredOn { manager.stopScan() }
    }

    private func beginScan() {
        manager.scanForPeripherals(withServices: [BoothProtocol.service], options: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in self?.stopScan() }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn: if wantScan { beginScan() }
        case .poweredOff: onStateProblem?(L("Turn Bluetooth on first"))
        case .unauthorized: onStateProblem?(L("Bluetooth permission is needed"))
        case .unsupported: onStateProblem?(L("This phone has no Bluetooth LE"))
        default: break
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? "Photobooth"
        onFound?(peripheral, name)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        link?.didConnect()
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        link?.didDisconnect()
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        link?.didDisconnect()
    }
}

/// Talks to the booth over Bluetooth LE — works with no Wi-Fi at all (see server/link.js).
final class BLELink: NSObject, BoothLink, CBPeripheralDelegate {
    let kind = LinkKind.bluetooth
    var onEvent: ((String, JSON) -> Void)?
    var onOnline: ((Bool) -> Void)?

    private let peripheral: CBPeripheral
    private var cmd: CBCharacteristic?
    private var ready = false
    private var closed = false
    private var pin = ""
    private var nextId = 1
    private var pending: [Int: (Result<JSON, BoothError>) -> Void] = [:]
    private var waiting: [() -> Void] = []
    private var queue: [Data] = []
    private var writing = false
    private var incoming = Data()

    init(peripheral: CBPeripheral) {
        self.peripheral = peripheral
        super.init()
        peripheral.delegate = self
        BLECentral.shared.link = self
        BLECentral.shared.stopScan()
        BLECentral.shared.manager.connect(peripheral, options: nil)
        // Give up if the booth doesn't answer.
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self, !self.ready, !self.closed else { return }
            self.failAll("Bluetooth: could not connect to the booth")
        }
    }

    // MARK: connection
    func didConnect() {
        peripheral.discoverServices([BoothProtocol.service])
    }

    func didDisconnect() {
        ready = false
        writing = false
        queue.removeAll()
        failAll("Bluetooth connection lost")
        onOnline?(false)
        guard !closed else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self, !self.closed else { return }
            BLECentral.shared.manager.connect(self.peripheral, options: nil)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let service = peripheral.services?.first(where: { $0.uuid == BoothProtocol.service }) else {
            return failAll("This Bluetooth device is not a photobooth")
        }
        peripheral.discoverCharacteristics([BoothProtocol.command, BoothProtocol.events], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        let chars = service.characteristics ?? []
        guard let c = chars.first(where: { $0.uuid == BoothProtocol.command }),
              let e = chars.first(where: { $0.uuid == BoothProtocol.events }) else {
            return failAll("This Bluetooth device is not a photobooth")
        }
        cmd = c
        peripheral.setNotifyValue(true, for: e)
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard !ready else { return }
        ready = true
        let w = waiting
        waiting.removeAll()
        w.forEach { $0() }
        if !pin.isEmpty {
            // reconnected: log in again so live updates keep coming
            request("check", nil, withPin: true) { [weak self] r in
                if case .success = r { self?.onOnline?(true) }
            }
        }
    }

    // MARK: messages
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let pkt = characteristic.value, !pkt.isEmpty else { return }
        incoming.append(pkt.dropFirst())
        guard pkt.first == 0 else { return }
        let data = incoming
        incoming = Data()
        guard let msg = (try? JSONSerialization.jsonObject(with: data)) as? JSON else { return }
        let t = msg["t"] as? String ?? ""
        if t == "ack" {
            guard let id = msg["id"] as? Int, let cb = pending.removeValue(forKey: id) else { return }
            if msg["ok"] as? Bool == true {
                cb(.success(msg))
            } else {
                let e = msg["e"] as? String ?? "Error"
                cb(.failure(BoothError(message: e, wrongPin: e == "Wrong PIN")))
            }
        } else if !closed {
            onEvent?(t, msg)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        writing = false
        pump()
    }

    private func failAll(_ why: String) {
        let cbs = pending.values
        pending.removeAll()
        cbs.forEach { $0(.failure(BoothError(message: why))) }
        let w = waiting
        waiting.removeAll()
        w.forEach { $0() }
    }

    private func request(_ c: String, _ v: Any?, withPin: Bool, _ done: @escaping (Result<JSON, BoothError>) -> Void) {
        if closed { return done(.failure(BoothError(message: "Disconnected"))) }
        guard ready else {
            waiting.append { [weak self] in
                guard let self, self.ready else { return done(.failure(BoothError(message: "Bluetooth: could not connect to the booth"))) }
                self.request(c, v, withPin: withPin, done)
            }
            return
        }
        let id = nextId
        nextId += 1
        var msg: JSON = ["id": id, "c": c, "v": v ?? NSNull()]
        if withPin { msg["p"] = pin }
        pending[id] = done
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            self?.pending.removeValue(forKey: id)?(.failure(BoothError(message: "The booth did not answer over Bluetooth")))
        }
        // Packets no bigger than one write, so no "long write" is needed.
        let max = peripheral.maximumWriteValueLength(for: .withoutResponse)
        queue.append(contentsOf: BoothProtocol.frame(msg, max: max))
        pump()
    }

    private func pump() {
        guard !writing, let c = cmd, !queue.isEmpty else { return }
        writing = true
        peripheral.writeValue(queue.removeFirst(), for: c, type: .withResponse)
    }

    // MARK: BoothLink
    func hello(_ done: @escaping (Result<JSON, BoothError>) -> Void) {
        request("hello", nil, withPin: false, done)
    }

    func connect(pin: String, _ done: @escaping (Result<JSON, BoothError>) -> Void) {
        self.pin = pin
        request("check", nil, withPin: true) { [weak self] r in
            done(r)
            guard let self, case .success(let j) = r else { return }
            self.onOnline?(true)
            if let s = j["state"] as? JSON { self.onEvent?("state", s) }
            self.request("health", nil, withPin: true) { h in
                if case .success(let hj) = h, let full = hj["health"] as? JSON { self.onEvent?("health", compactHealth(full)) }
            }
        }
    }

    func send(_ cmd: String, value: Any?, _ done: @escaping (Result<JSON, BoothError>) -> Void) {
        request(cmd, value, withPin: true, done)
    }

    func print(copies: Int, photoId: String?, _ done: @escaping (Result<JSON, BoothError>) -> Void) {
        var v: JSON = ["copies": copies]
        if let photoId { v["id"] = photoId }
        request("print", v, withPin: true, done)
    }

    func close() {
        closed = true
        failAll("Disconnected")
        BLECentral.shared.manager.cancelPeripheralConnection(peripheral)
        if BLECentral.shared.link === self { BLECentral.shared.link = nil }
    }
}
