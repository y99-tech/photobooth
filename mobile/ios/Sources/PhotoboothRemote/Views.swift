import SwiftUI
import UIKit

enum Palette {
    static let bg = Color(red: 0.06, green: 0.05, blue: 0.04)
    static let panel = Color(red: 0.11, green: 0.10, blue: 0.09)
    static let panel2 = Color(red: 0.16, green: 0.15, blue: 0.13)
    static let accent = Color(red: 0.79, green: 0.64, blue: 0.42)
    static let ink = Color(red: 0.95, green: 0.93, blue: 0.89)
    static let muted = Color(red: 0.66, green: 0.61, blue: 0.55)
    static let ok = Color.green
    static let err = Color(red: 0.94, green: 0.33, blue: 0.31)
}

struct Card<Content: View>: View {
    var title: String?
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title { Text(title).font(.headline).foregroundStyle(Palette.ink) }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.panel, in: RoundedRectangle(cornerRadius: 18))
    }
}

struct BoothButton: View {
    let label: String
    var primary = false
    var selected = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 50)
                .foregroundStyle(primary ? Color(red: 0.11, green: 0.08, blue: 0.04) : Palette.ink)
                .background(primary ? Palette.accent : Palette.panel2, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(selected ? Palette.accent : .clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
    }
}

struct RootView: View {
    @EnvironmentObject var model: BoothModel
    var body: some View {
        ZStack {
            Palette.bg.ignoresSafeArea()
            if model.connected { ControlView() } else { ConnectView() }
        }
        .preferredColorScheme(.dark)
        .environment(\.layoutDirection, isArabic ? .rightToLeft : .leftToRight)
        .alert(model.toast ?? "", isPresented: Binding(get: { model.toast != nil }, set: { if !$0 { model.toast = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }
}

// MARK: - connect screen
struct ConnectView: View {
    @EnvironmentObject var model: BoothModel
    @State private var address = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("📸 " + L("Booth Remote")).font(.largeTitle.bold()).foregroundStyle(Palette.ink)
                Text(L("Control the photobooth over Wi-Fi, Bluetooth or NFC.")).foregroundStyle(Palette.muted)

                SecureField(L("PIN"), text: $model.pin)
                    .keyboardType(.numberPad)
                    .padding(14)
                    .background(Palette.panel2, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(Palette.ink)

                if let s = model.status {
                    Text(s).foregroundStyle(model.statusIsError ? Palette.err : Palette.muted)
                }
                if model.connecting { ProgressView().tint(Palette.accent) }

                if let last = model.lastURL {
                    BoothButton(label: L("Reconnect to") + " " + (model.lastName ?? last), primary: true) { model.connect(address: last) }
                }

                Card(title: "📶 " + L("On this Wi-Fi")) {
                    if model.wifiBooths.isEmpty {
                        Text(L("No booth found yet. Is the phone on the same Wi-Fi as the booth?")).foregroundStyle(Palette.muted)
                    }
                    ForEach(model.wifiBooths) { b in
                        BoothButton(label: "📸 " + b.name, primary: true) { model.connect(b) }
                    }
                }

                Card(title: "🔵 " + L("Bluetooth")) {
                    ForEach(model.bluetoothBooths) { b in
                        BoothButton(label: "🔵 " + b.name, primary: true) { model.connect(b) }
                    }
                    if model.searchingBluetooth && model.bluetoothBooths.isEmpty {
                        Text(L("Searching over Bluetooth…")).foregroundStyle(Palette.muted)
                    }
                    BoothButton(label: L("Search over Bluetooth")) { model.searchBluetooth() }
                }

                if model.nfcAvailable {
                    Card(title: "🏷️ NFC") {
                        BoothButton(label: L("Read the NFC sticker")) { model.readNFC() }
                    }
                }

                Card(title: "⌨️ " + L("Type the address")) {
                    TextField(L("e.g. photobooth.local:8080"), text: $address)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(14)
                        .background(Palette.panel2, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(Palette.ink)
                        .onSubmit { model.connect(address: address) }
                    BoothButton(label: L("Connect")) { model.connect(address: address) }
                }
            }
            .padding(16)
        }
        .onAppear { model.startWifiSearch() }
    }
}

// MARK: - control screen
struct ControlView: View {
    @EnvironmentObject var model: BoothModel
    @State private var greeting = ""

    private var stateText: String {
        if !model.online { return L("Reconnecting…") }
        switch model.screen {
        case "attract": return L("Ready — waiting for guests")
        case "live": return L("📸 Shooting…")
        case "review": return L("✍️ Guest is reviewing")
        case "shareScr": return L("📲 Guest is sharing")
        default: return model.screen
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                HStack {
                    Circle().fill(model.online ? Palette.ok : Palette.err).frame(width: 12, height: 12)
                    Text(model.boothName + "  ·  " + (model.linkKind == .wifi ? "📶 " + L("Wi-Fi") : "🔵 " + L("Bluetooth")))
                        .font(.headline).foregroundStyle(Palette.ink).lineLimit(1)
                    Spacer()
                    Button(L("Disconnect")) { model.disconnect() }
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(Palette.panel2, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(Palette.muted)
                }

                Text(stateText).font(.title3).foregroundStyle(Palette.ink)

                Button { model.command("shoot") } label: {
                    Text(L(model.screen == "review" ? "RESHOOT" : "SHOOT"))
                        .font(.system(size: 28, weight: .heavy))
                        .foregroundStyle(Color(red: 0.11, green: 0.08, blue: 0.04))
                        .frame(width: 210, height: 210)
                        .background(Circle().fill(Palette.accent))
                        .overlay(Circle().stroke(Palette.panel2, lineWidth: 8))
                }
                .buttonStyle(.plain)
                .disabled(model.screen == "live")
                .opacity(model.screen == "live" ? 0.45 : 1)

                HStack {
                    BoothButton(label: L("↺ Retake")) { model.command("retake") }
                    BoothButton(label: L("✓ Accept"), primary: true) { model.command("accept") }
                    BoothButton(label: L("⌂ Home")) { model.command("home") }
                }

                Card {
                    choices(L("Mode"), key: "mode", selected: model.mode,
                            [("single", "Single"), ("strip", "4-shot"), ("gif", "GIF"), ("boomerang", "Boomerang"), ("message", "Message")])
                    choices(L("Frame"), key: "template", selected: model.template,
                            [("elegant", "Elegant"), ("polaroid", "Polaroid"), ("minimal", "Minimal"), ("none", "None")])
                    choices(L("Camera"), key: "camera", selected: model.camera, [("dslr", "DSLR"), ("webcam", "Webcam")])
                }

                Card(title: L("Greeting on the current photo")) {
                    TextField(L("Type a greeting"), text: $greeting, axis: .vertical)
                        .lineLimit(2...4)
                        .padding(14)
                        .background(Palette.panel2, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(Palette.ink)
                    BoothButton(label: L("Send to screen")) { model.command("greeting", greeting) { model.toast = L("Sent") } }
                }

                Card(title: "🖨️ " + L("Print")) {
                    HStack {
                        BoothButton(label: L("Print")) { model.print(1) }
                        BoothButton(label: L("Print ×2")) { model.print(2) }
                    }
                    if !model.printMessage.isEmpty { Text(model.printMessage).foregroundStyle(Palette.muted) }
                    if let url = model.photoURL {
                        AsyncImage(url: url) { img in
                            img.resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 12))
                        } placeholder: {
                            ProgressView().tint(Palette.accent)
                        }
                    }
                }

                Card(title: "🩺 " + L("Booth health")) {
                    ForEach(Array(model.alerts.enumerated()), id: \.offset) { _, a in
                        let error = a["level"] as? String == "error"
                        Text("⚠️ " + (a["text"] as? String ?? ""))
                            .font(.body.weight(.semibold))
                            .foregroundStyle(error ? Color(red: 1, green: 0.54, blue: 0.5) : Color(red: 0.96, green: 0.78, blue: 0.42))
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(error ? Color(red: 0.23, green: 0.09, blue: 0.09) : Color(red: 0.23, green: 0.18, blue: 0.07),
                                        in: RoundedRectangle(cornerRadius: 12))
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())]) {
                        tile("📷 " + L("Battery"), battery)
                        tile("💾 " + L("Free space"), (model.health["freeGB"] as? Double).map { "\($0) GB" } ?? "?")
                        tile("🧻 " + L("Paper"), (model.health["paperLeft"] as? Int).map { $0 < 0 ? "∞" : "\($0)" } ?? "—")
                        tile("📸 " + L("Photos"), "\(model.health["photos"] as? Int ?? 0)")
                    }
                }

                Card(title: "🏷️ " + L("NFC sticker")) {
                    Text(L("Write this address on an NFC sticker (NTAG213/215) with any NFC app, or with the Android app:"))
                        .foregroundStyle(Palette.muted)
                    Text(model.stickerAddress).font(.body.monospaced()).foregroundStyle(Palette.ink).textSelection(.enabled)
                    BoothButton(label: "📋 " + model.stickerAddress) {
                        UIPasteboard.general.string = model.stickerAddress
                        model.toast = L("Copied")
                    }
                }
            }
            .padding(16)
        }
    }

    private var battery: String {
        if let b = model.health["battery"] as? Int { return "🔋 \(b)%" }
        return model.health["camera"] as? Bool == true ? "OK" : "—"
    }

    private func tile(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(Palette.muted)
            Text(value).font(.title3.bold()).foregroundStyle(Palette.ink)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.panel2, in: RoundedRectangle(cornerRadius: 12))
    }

    private func choices(_ title: String, key: String, selected: String?, _ items: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline).foregroundStyle(Palette.ink)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96))], spacing: 8) {
                ForEach(items, id: \.0) { item in
                    BoothButton(label: L(item.1), selected: selected == item.0) { model.command(key, item.0) }
                }
            }
        }
    }
}
