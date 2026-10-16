# 📱 Booth Remote: phone app for iPhone & Android

Control the photobooth from your phone. Works in English and Arabic.

- **Shooting:** shoot, retake, accept and go home. On Android the **volume buttons** and Bluetooth selfie buttons also shoot.
- **Settings:** switch the mode (single, 4-shot, GIF, boomerang, video message), the frame and the camera.
- **Greetings:** send a greeting to the screen.
- **Printing:** print or reprint the latest photo, and see the print queue and paper count.
- **Health:** alerts for camera battery, paper, disk space and failed uploads.

## Three ways to connect

| | How | Good for |
|---|---|---|
| 📶 **Wi-Fi** | The app finds the booth on the network by itself (Bonjour). You can also type `photobooth.local:8080` or the IP shown in Admin. | Normal use. Also shows the latest photo. |
| 🔵 **Bluetooth** | Tap **Search over Bluetooth** and pick the booth. | Venues with **no Wi-Fi** or bad Wi-Fi. Range is about 10 m. |
| 🏷️ **NFC** | Touch the sticker on the booth with the phone. | Connecting in one second. |

All three ask for the **remote PIN**: `booth.remotePin`, or the admin PIN if that's empty.

## Install

### Android
1. Download **`PhotoboothRemote-Android-….apk`** from the [latest release](https://github.com/y99-tech/photobooth/releases/latest) on the phone.
2. Open it. Android asks once to allow installing apps from your browser.

### iPhone (with xtool, no Mac needed)
The iPhone app is built with [xtool](https://xtool.sh), a free tool that builds and installs iPhone apps from **Windows (WSL), Linux or a Mac** with a normal **Apple ID**. You don't need a paid developer account.

**Option A: install the ready-made app**
1. Install xtool: [Windows / Linux](https://xtool.sh/documentation/xtooldocs/installation-linux) or [Mac](https://xtool.sh/documentation/xtooldocs/installation-macos).
2. Sign in once with `xtool auth login`.
3. Download **`PhotoboothRemote-iPhone-…-unsigned.ipa`** from the [latest release](https://github.com/y99-tech/photobooth/releases/latest).
4. Plug the iPhone in with a cable and run:
   ```bash
   xtool install PhotoboothRemote-iPhone-1.2.0-unsigned.ipa
   ```
   xtool signs it with your Apple ID.
5. On the iPhone, open *Settings → General → VPN & Device Management* and trust your Apple ID.

**Option B: build it yourself**
```bash
xtool setup                 # once: sign in and install the iOS SDK
cd mobile/ios
xtool dev                   # builds, installs and opens the app on the plugged-in iPhone
```

> With a **free Apple ID**, iPhone apps installed this way stop opening after **7 days**. Run `xtool install` (or `xtool dev`) again before your next event. A paid Apple Developer account ($99/year) makes it last a year.

## NFC sticker
Buy **NTAG213** or **NTAG215** stickers. They're cheap and sold in Egypt on Amazon, Jumia and in electronics shops. Stick one on the booth near the screen.

**Write it (once):**
- **Android app:** connect to the booth, tap **Write this booth on an NFC sticker**, then touch the sticker.
- **Or any phone:** use a free app such as *NFC Tools*. Write a **URL** record with the address shown in **Admin → Phone app**, for example `http://photobooth.local:8080/remote`.

**What happens when a phone touches it:**
- **Android with the app:** the app opens and connects. The sticker also stores the app's name.
- **iPhone:** iPhones XS and newer read the sticker by themselves, with no app open. A notification opens the booth's web remote, and its **📲 Open in app** link hands over to the app. This needs no paid account.
- **Reading the sticker inside the iPhone app** ("Read the NFC sticker" button) needs Apple's NFC permission, which requires a **paid** developer account. With one, uncomment `entitlementsPath: NFC.entitlements` in `mobile/ios/xtool.yml`. The free route above works without it.
- **Any phone without the app:** opens the web remote in the browser.

The address `photobooth.local` stays the same at every venue, so you write the sticker once. If you run two booths, give each its own name in **Admin → Phone app → host**, for example `booth2`.

## Bluetooth on the booth computer
- **Windows 10/11 and Mac:** on by default (`link.bluetooth: auto`). The computer's Bluetooth must support the "LE peripheral" role. Most laptops and USB Bluetooth 4.0+ adapters made in the last 10 years do. **Admin → Phone app** shows whether it's working.
- **Raspberry Pi / Linux:** off by default. To turn it on:
  ```bash
  sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev
  sudo setcap cap_net_raw+eip $(eval readlink -f $(which node))
  sudo systemctl stop bluetooth && sudo systemctl disable bluetooth
  ```
  Then set `link.bluetooth: true` in Admin.

  > Stopping the system Bluetooth service also disconnects Bluetooth keyboards and selfie buttons paired with the Pi. Use either the phone app's Bluetooth or a paired shutter button, not both.

## For developers
Both apps use the booth's normal HTTP API over Wi-Fi: `/api/remote/hello`, `/api/remote/check`, `/api/remote`, `/api/remote/print/:id`, `/api/events` and `/api/health`.

Over Bluetooth they use a small GATT service, documented at the top of `server/link.js`:
- **Service:** `7b9a0001-3c4e-4f5a-9b1d-2f6e8c0d1a70`
- **Messages:** JSON split into packets with a 1-byte "more follows" header

**Android** (`mobile/android`):
- Kotlin with no libraries.
- Build with `./gradlew assembleRelease` (needs the Android SDK).
- CI signs it with the `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` secrets when they're set, and otherwise with a debug key.
- Set them before you share the app widely, so later versions can update over earlier ones.

**iOS** (`mobile/ios`):
- SwiftUI with no libraries.
- `Package.swift` and `xtool.yml` instead of an Xcode project.

---

## بالعربي

**ريموت البوث** تطبيق للآيفون والأندرويد تتحكم بيه في الفوتو بوث:
- تصوّر وتعيد وتغيّر الوضع والإطار
- تبعت تهنئة للشاشة وتطبع الصورة
- تشوف تنبيهات البطارية والورق

**طرق الاتصال:**
- **واي فاي:** التطبيق بيلاقي البوث لوحده.
- **بلوتوث:** شغال من غير واي فاي خالص.
- **استيكر NFC:** تلزقه على البوث وتلمسه بالموبايل.

**التثبيت:**
- **الأندرويد:** نزّل ملف APK من صفحة الإصدارات وافتحه.
- **الآيفون:** بنثبته بأداة xtool المجانية من ويندوز أو لينكس أو ماك بحساب أبل العادي. لازم تعيد التثبيت كل ٧ أيام لو الحساب مجاني.

**استيكر NFC:** اشتري NTAG213 أو NTAG215. من تطبيق الأندرويد دوس **اكتب البوث ده على استيكر NFC** ولمّس الاستيكر. بعد كده أي موبايل يلمسه هيفتح البوث.
