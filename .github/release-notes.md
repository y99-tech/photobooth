## 📸 Photobooth — download & go

A light but powerful wedding and event photobooth.
- **Cameras:** a DSLR or a webcam
- **Extras:** greetings, green screen, GIF, boomerang and printing
- **Sharing:** Wi-Fi QR code, Google Drive, social media, and digital wedding platforms

### ✨ What's inside
- 📷 Single, 🎞️ **2×6 photo strips** (two per 4×6 print), ✨ GIF, 🔁 boomerang, 🎥 **video guestbook**
- 🟩 Green screen, or 🤖 **AI background removal with no backdrop**
- ✌️ 😁 👍 👏 **hands-free shooting** (offline AI)
- 🎉 Drag-and-drop **props and stickers**, ✨ **beauty filter**, your **logo** on every photo
- 🔊 Spoken countdown, shutter sound and background music
- 🌍 **Arabic (right-to-left)**, English, French and Spanish
- 📱 Guests **upload their own photos** by QR code · 🧩 **live mosaic wall** · 🖨️ printing
- 🎁 **Keepsake pack** for the couple (all files, guestbook album, highlight video)
- 💼 Event profiles · 🩺 health alerts on your phone · 📊 stats and lead capture

### 🪟 Windows 10 / 11 — easiest
1. Download **`Photobooth-Setup-….exe`** below and double-click it.
2. If Windows shows *"Windows protected your PC"*, click **More info → Run anyway**. The app isn't code-signed yet.
3. Click **Yes** when Windows asks for permission. The installer uses it to let guests' phones reach the booth over Wi-Fi.
4. Photobooth opens full-screen.
   - **Ctrl + Shift + A:** settings
   - **Ctrl + Shift + F:** leave full screen
   - Right-click the 📷 tray icon for more options.

**No install?** Use **`Photobooth-Portable-….exe`** instead. Windows may ask to allow network access the first time. Tick **Private networks**.

Photos and settings are saved in **Documents\Photobooth**.

**DSLR on Windows:** install the free [digiCamControl](https://digicamcontrol.com) and turn on its web server (*Settings → Webserver*). The booth finds your Canon, Nikon or Sony automatically.

### 🍓 Raspberry Pi / Linux
1. Download **`Photobooth-RaspberryPi-Linux-….zip`** and unzip it on the Pi.
2. Open a terminal in the folder and run `./scripts/install-pi.sh`.
3. Reboot. The booth then starts by itself, full-screen.

### 📱 Phone app — Booth Remote (new)
Control the booth from your phone over **Wi-Fi**, **Bluetooth** (no Wi-Fi needed) or by touching an **NFC sticker** on the booth. It works in English and Arabic.
- **Android:** download **`PhotoboothRemote-Android-….apk`** below on the phone and open it. Allow *Install unknown apps* for your browser when Android asks.
- **iPhone:** the app is installed with the free tool [xtool](https://xtool.sh) and your Apple ID. You don't need a Mac or a paid account.
  1. Install xtool ([Windows/Linux](https://xtool.sh/documentation/xtooldocs/installation-linux), [Mac](https://xtool.sh/documentation/xtooldocs/installation-macos)) and sign in once with `xtool auth login`.
  2. Plug in the iPhone and run `xtool install PhotoboothRemote-iPhone-….ipa`.
  3. On the iPhone, trust the developer in *Settings → General → VPN & Device Management*.
  4. With a free Apple ID, xtool must reinstall the app every 7 days.
- **NFC sticker:** in the phone app, tap *Write this booth on an NFC sticker* (Android). Any phone that touches the sticker then opens the booth.

### First steps (any system)
1. Open **Admin**: `Ctrl+Shift+A` on Windows, or `http://localhost:8080/admin`. The PIN is **1234**. **Change it.**
2. Set the couple's names and greetings, then turn on the sharing and printing you want. Press **Save & test** for each service.
3. On your phone, scan the **Phone remote** QR code in Admin to control the booth.

---
☕ **Enjoying Photobooth?** [Buy me a coffee via PayPal](https://www.paypal.com/donate/?business=mohamed2000youssry%40gmail.com&item_name=Buy+me+a+coffee+-+Photobooth&currency_code=USD). Thank you! ❤️
