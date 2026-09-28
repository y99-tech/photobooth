# 📸 Photobooth

A light but powerful photobooth for weddings and events.

- **Cameras:** a DSLR or mirrorless camera over USB (with live view), or any webcam
- **Runs on:** Raspberry Pi, Linux, Windows (macOS works too)
- **Screens:** built for big touch screens, with large buttons, an on-screen keyboard and kiosk mode. It scales from a phone up to a 4K TV.
- **Control:** tap the screen, press a **Bluetooth** shutter button or clicker, or use the **phone remote over Wi-Fi**
- **Greetings:** guests pick or type a greeting and their name. It's printed on the photo in a choice of frames, or on your own PNG frame.
- **Sharing:**
  - **Wi-Fi QR code:** guests download the photo to their phone. This works with no internet.
  - Email
  - **Google Drive**
  - **Your own hosting** (FTP/FTPS)
  - **Digital wedding platforms**, or any HTTP API
  - **Facebook Page**, **Instagram**, **Telegram**
  - The guest's own share sheet (WhatsApp, Instagram and more)
- **Modes:** single photo, 4-shot collage, animated **GIF** (4 poses) and **boomerang** video (a short burst that plays forward and back, saved as MP4). Greetings and frames go on all of them.
- **Green screen:** removes a green or blue backdrop and puts guests on a background they choose. They see it live while posing. It comes with 4 built-in backgrounds, and you can upload your own.
- **Printing:** a Print button with copies on the share screen, or auto-print every photo. Works on Pi/Linux (CUPS) and Windows. Includes a paper counter and per-guest limits.
- **Reliable:** every upload is queued on disk and retried, so photos survive a flaky venue Wi-Fi or a reboot
- **Light:** 5 small npm dependencies, no build step, no database and no native modules. It runs on a Pi 3B+ and up.

**Enjoying the photobooth?** [☕ Buy me a coffee via PayPal](https://www.paypal.com/donate/?business=mohamed2000youssry%40gmail.com&item_name=Buy+me+a+coffee+-+Photobooth&currency_code=USD). It keeps the project going. Thank you!

| Screen | URL |
|---|---|
| Booth (kiosk) | `http://localhost:8080/` |
| Phone remote | `http://<booth-ip>:8080/remote` |
| Guest gallery | `http://<booth-ip>:8080/gallery` |
| Slideshow for a 2nd TV or projector | `http://<booth-ip>:8080/gallery?slideshow=1` |
| Admin / settings | `http://localhost:8080/admin` (PIN `1234`, **change it**) |

---

## Quick start (any OS)

You need **Node.js 18+**.

```bash
npm install
npm start
```

Open `http://localhost:8080/`, then go to `/admin` to set the couple's names, greetings and sharing.

### Raspberry Pi / Linux

Download **`Photobooth-RaspberryPi-Linux-….zip`** from [Releases](../../releases/latest) and unzip it. You can also clone the repo. Then run:

```bash
cd photobooth
./scripts/install-pi.sh      # gphoto2 + Chromium + Node, service, kiosk autostart
sudo reboot
```

After the reboot the Pi starts straight into the booth, full-screen on the touch screen.
To start it by hand, run `./scripts/kiosk.sh`.

- **Hardware:** a Pi 4 or 5 with 2 GB+ of RAM is recommended. Use a powered USB hub if the camera draws power over USB.
- **"Could not claim the USB device"?** The desktop auto-mounted the camera. The installer turns that off. To fix it on the spot, run `pkill -f gvfs-gphoto2`.

### Windows 10 / 11: the easy way

1. Go to the repository's **[Releases](../../releases/latest)** page and download **`Photobooth-Setup-….exe`**.
2. Double-click it.
   - If SmartScreen appears, click **More info → Run anyway**. The app isn't code-signed yet.
   - Click **Yes** when Windows asks for permission. The installer uses it to let guests' phones through the firewall.
3. Photobooth opens full-screen and adds a Start-menu shortcut and a desktop shortcut.

The app includes everything it needs, so there's no Node.js to install. Photos and settings are saved in **Documents\Photobooth**. `Photobooth-Portable-….exe` runs without installing.

| In the app | |
|---|---|
| **Ctrl + Shift + A** | Admin and settings |
| **Ctrl + Shift + F** | Full screen on/off |
| **Ctrl + Shift + Q** | Quit |
| **Tray icon 📷** | Photos folder, slideshow, *Start with Windows*, and the address phones use |

- **DSLR on Windows:** install [digiCamControl](https://digicamcontrol.com) (Canon, Nikon, Sony) and turn on its web server (*Settings → Webserver*) for live view. The booth finds it automatically. You can also use your camera's own webcam utility and choose the **Webcam** camera.
- **Running from source:** double-click `scripts\start-windows.bat` (needs [Node.js](https://nodejs.org)).

**How releases are built:** the `Build & release` GitHub Action builds the installer on a Windows machine and checks that the packaged app starts. It then publishes the release, with the Raspberry Pi/Linux zip alongside.
- **Every push:** the release for the current version is refreshed.
- **New version:** raise `version` in `desktop/package.json` to publish a new release.
- **Changing the server's npm packages:** run `npm run sync-deps` in `desktop/`.

## Cameras

| | Linux / Pi / macOS | Windows |
|---|---|---|
| DSLR / mirrorless | `gphoto2` ([2,500+ models](http://www.gphoto.org/proj/libgphoto2/support.php)), live view + full-res capture | digiCamControl, live view + capture |
| Webcam / capture card | ✅ | ✅ |

With `booth.camera: auto`, the booth uses the DSLR when one is connected and the webcam otherwise.
If the DSLR fails in the middle of an event, the booth falls back to the webcam so the party goes on.

Set the camera to **JPEG** (or RAW+JPEG). **Turn auto power-off off** on the camera.

## Controlling the booth

- **Touch:** tap to start → countdown → review (frame, greeting, name) → share (QR, email, social).
- **Bluetooth shutter button:** pair a cheap BT selfie remote or presenter clicker with the booth computer. One button runs the whole flow: *shoot → accept → done*. It works because these devices send keys (Volume Up, Enter, Page Down…). You can change which keys count under **Booth → triggerKeys**. A USB arcade button or foot pedal also works.
- **Phone remote over Wi-Fi:** scan the "Phone remote" QR code in the admin page and enter the PIN (`booth.remotePin`, or the admin PIN if that's empty). From your phone you can:
  - shoot, retake, accept and go home
  - switch between single and 4-shot mode
  - change the frame
  - send a greeting to the screen
  - see the latest photo and its upload status

  A Bluetooth selfie button paired with the *phone* also triggers the shot while the remote page is open.
- **Keyboard:** Esc goes back to the start screen.

## Greetings & frames

- **Greetings:** set preset greetings under **Event → greetings**. Guests tap one or type their own on the on-screen keyboard, and add their name.
- **Frame templates:**
  - **Elegant:** gradient band with a script greeting
  - **Polaroid:** white card
  - **Minimal:** small text in the corner
  - **None**
- **Custom frame:** upload a transparent PNG in admin, for example one made in Canva. It's drawn over every photo.
- **Modes:** *Single* photo, or a *4-shot* 2×2 collage.
- **Offline:** fonts are bundled (Great Vibes, Playfair Display), so it all works without internet.

## GIF & boomerang

Guests choose a mode on the start screen: **📷 Single**, **🎞️ 4-shot**, **✨ GIF** or **🔁 Boomerang**. You can also switch modes from the phone remote.

- **GIF:** the booth takes 4 quick poses, about 1 second apart, and turns them into a looping animated GIF.
- **Boomerang:** after the countdown the booth records a 1.5-second burst, then plays it forward and backward on a loop. It's saved as a video.
- **Greetings and frames:** the greeting, name, frame template and custom PNG frame are added to every frame of the animation. Guests see the animation playing on the review screen.
- **Sharing:** GIFs and boomerangs work everywhere a photo does: the QR guest page (Save, and Share to WhatsApp or Instagram), the gallery and slideshow, Google Drive, FTP, the wedding platform, email and Telegram (as a looping animation). Facebook gets boomerangs as a Page video, and Instagram gets them as a Reel. Instagram doesn't accept GIFs.
- **Green screen:** removes a green or blue backdrop and puts guests on a background they choose. They see it live while posing. It comes with 4 built-in backgrounds, and you can upload your own.
- **Printing:** GIFs and boomerangs can't be printed, so the Print button is hidden for them.
- **Install ffmpeg (recommended):**
  - The kiosk browser records the boomerang as MP4 if it can. Otherwise it records WebM.
  - With `ffmpeg` installed, the booth converts WebM to H.264 MP4 in under a second. H.264 MP4 plays on iPhones, WhatsApp and Instagram.
  - The Pi installer adds ffmpeg. On Windows, run `winget install ffmpeg`.
- **DSLR:** GIF mode uses full captures from the camera. Boomerang uses the live view, so `dslr.livePreview` must be on.

| Setting (Admin → GIF & Boomerang) | What it does |
|---|---|
| `booth.modes` | Which modes guests can pick (Booth tab) |
| `size` | The long edge of GIFs and videos in pixels (default 720) |
| `gifFrames`, `gifFrameMs` | The number of poses, and how long each one shows |
| `boomerangSeconds`, `boomerangFps` | The length and smoothness of the burst |
| `boomerangFormat` | `video` (small and sharp, the default) or `gif` |
| `videoLoops` | How many back-and-forth loops go into the saved video. Recording takes that long (about 3 s per loop). |

## Green screen

1. **Set up the backdrop:** hang a green (or blue) cloth behind guests. Light it evenly, with no creases or shadows if you can, and keep guests 1–2 m in front of it.
2. **Turn it on:** go to **Admin → Green screen** and set `enabled`.
3. **Add backgrounds:** under **Green screen backgrounds**, upload your own (JPEG/PNG, landscape) as well as the 4 built-in ones: Golden lights, Blush & bloom, Starry night and Classic ivory. Uploaded backgrounds are listed first.
4. **What guests see:** the new background appears live while they pose. On the review screen they can tap a thumbnail to swap it.
5. **All modes work:** single, 4-shot, GIF and boomerang, together with frames and greetings.

How it works:
- **It runs on the graphics chip** (WebGL), so it's fast even on a Raspberry Pi 4. If WebGL isn't available, a slower method that uses the main processor takes over.
- **Screen colour:** `keyColor: auto` samples the backdrop colour from the top corners each session. You can also set a colour yourself, e.g. `#00b140` for green or `#0047bb` for blue.
- **Tuning:**
  - Green left behind → raise `similarity`.
  - People turning see-through → lower `similarity`.
  - Harsh edges → raise `smoothness`.
  - Green tint on skin → raise `spill`.
  - These settings adapt to how vivid your backdrop is. Skin, black suits and white dresses are never removed.
- **Avoid green clothes!** Anything the same colour as the backdrop becomes see-through.

## Printing

Turn it on in **Admin → Printing**. Then add the printer in the **Printer** card and press **Test print**.

- **Raspberry Pi / Linux / macOS:** printing goes through CUPS.
  - The Pi installer adds CUPS and Gutenprint drivers.
  - Add the printer at `http://localhost:631` → *Administration → Add Printer*.
  - Popular event printers: Canon SELPHY CP1300/CP1500, DNP DS620/DS-RX1, Mitsubishi, HiTi. Any office photo inkjet also works.
- **Windows:** any installed printer works through the built-in print system (`scripts/print-windows.ps1`). There's nothing extra to install. Just install the printer's own driver.

| Setting | What it does |
|---|---|
| `printer` | The printer to use. Leave empty for the system default. Admin lists the printers it finds. |
| `auto` / `autoCopies` | Print every photo automatically. Handy with a Bluetooth one-button setup. |
| `maxCopies` | The most copies a guest can pick with the − / + buttons |
| `maxPrintsPerPhoto` | Stops guests reprinting the same photo again and again |
| `scaling` | `fill` prints edge to edge (trims a little). `fit` shows the whole photo (may leave a border). |
| `media` | Paper size for CUPS, e.g. `4x6`, `w288h432` (4×6 in), `A6`, `Postcard`. Leave empty for the printer default. |
| `borderless`, `extraOptions` | Driver options for CUPS, e.g. `-o` options for your printer |
| `marginMm` | Windows only: a white border around the photo |

**Paper counter:** in admin, enter how many prints the paper and ink pack holds.
- Each print counts down.
- Guests see "out of paper" instead of printing into an empty tray.
- A failed print gives its paper back to the count.

**Printing as the host:**
- From the **phone remote**, use **Print** or **Print ×2** on the latest photo.
- From **admin**, use the 🖨️ button on any photo. This isn't limited like guest prints.

## Sharing setup

Turn on each service in **Admin → Sharing** and press **Save & test**.
`autoShare` lists the services that run automatically for every photo. Facebook, Instagram and Telegram can instead be posted by the guest with a button on the share screen.

| Target | What you need |
|---|---|
| **Wi-Fi QR** | Nothing. Guests join the same Wi-Fi as the booth. Tip: turn the Pi into a hotspot (`nmcli dev wifi hotspot ssid Photobooth password 12345678`) and guests connect to it directly. |
| **Email** | SMTP details. For Gmail, use an [app password](https://myaccount.google.com/apppasswords). |
| **Google Drive** | **Either** an OAuth client ID/secret + refresh token (normal Google account; get the token from [OAuth Playground](https://developers.google.com/oauthplayground) with scope `https://www.googleapis.com/auth/drive.file` and "use your own credentials"), **or** a service-account JSON plus a folder on a *Shared Drive*. `makePublic` gives every photo a public link. |
| **Hosting (FTP)** | Host, user, password, `remoteDir` and `publicUrlPrefix` (the web address of that folder). |
| **Digital wedding platform** | The platform's upload URL, the file field name, headers (e.g. an API token), extra fields (event ID, `{greeting}`, `{guest}`, `{caption}`), and `urlPath`, the place in the JSON reply that holds the photo link. This works with any platform or guestbook that accepts a multipart upload, including your own API. |
| **Facebook** | Page ID + a Page access token with `pages_manage_posts`. |
| **Instagram** | A Business/Creator account ID + access token. Instagram pulls the image from a public URL, so also turn on FTP, the wedding platform or public Drive. |
| **Telegram** | Bot token ([@BotFather](https://t.me/BotFather)) + chat ID. This gives a live feed for the couple's family group. |

**Placeholders you can use in captions, email text and wedding fields:**
`{greeting} {guest} {title} {subtitle} {date} {hashtag} {url} {caption} {id}`

**The QR code:** by default it points to the booth's own guest page, which works offline over Wi-Fi.
Set `qrTarget: remote` to point it at the public copy once the upload finishes. If a guest page is reached from outside, set `publicBaseUrl`.

The guest page has:
- **Save photo**
- **Share…**, the phone's native share sheet (WhatsApp, Instagram Stories, AirDrop…)
- WhatsApp, Facebook and X links

## Files & data

```
server/            Node server (Express), camera drivers, upload queue
  share/           one small module per destination
public/            kiosk, phone remote, guest page, gallery, admin (plain HTML/JS)
data/photos/       final photos (JPEG), GIFs and boomerang videos   ← back this up
data/photos.json   photo list + upload status
config.json        your settings (created on first save; holds secrets, git-ignored)
```

Environment variables:
- `PORT`: overrides the port
- `PHOTOBOOTH_CONFIG`: path to the config file
- `PHOTOBOOTH_DATA`: data folder (e.g. a USB stick)

## Security notes

- Change the admin PIN, and set a separate `booth.remotePin` for the phone remote.
- Keep the booth on a private or event Wi-Fi network. Guest photo links use random IDs.
- API tokens stay on the booth, in `config.json`. They are never sent to the kiosk or to guests' browsers.

## ☕ Support

If this photobooth made your event better, you can [**buy me a coffee via PayPal**](https://www.paypal.com/donate/?business=mohamed2000youssry%40gmail.com&item_name=Buy+me+a+coffee+-+Photobooth&currency_code=USD) (mohamed2000youssry@gmail.com). Thank you! ❤️
