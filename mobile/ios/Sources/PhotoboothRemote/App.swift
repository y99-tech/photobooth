import SwiftUI

@main
struct PhotoboothRemoteApp: App {
    @StateObject private var model = BoothModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                // photobooth://connect?url=… (the "Open in app" link on the booth's web remote,
                // e.g. after an iPhone read the NFC sticker on the booth)
                .onOpenURL { url in
                    if let base = boothURL(from: url) { model.connect(address: base) }
                }
        }
    }
}
