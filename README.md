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
- **Reliable:** every upload is queued on disk and retried, so photos survive a flaky venue Wi-Fi or a reboot
- **Light:** 4 npm dependencies, no build step, no database and no native modules. It runs on a Pi 3B+ and up.

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

```bash
git clone <this repo> photobooth && cd photobooth
./scripts/install-pi.sh      # gphoto2 + Chromium + Node, service, kiosk autostart
sudo reboot
```

After the reboot the Pi starts straight into the booth, full-screen on the touch screen.
To start it by hand, run `./scripts/kiosk.sh`.

- **Hardware:** a Pi 4 or 5 with 2 GB+ of RAM is recommended. Use a powered USB hub if the camera draws power over USB.
- **"Could not claim the USB device"?** The desktop auto-mounted the camera. The installer turns that off. To fix it on the spot, run `pkill -f gvfs-gphoto2`.

### Windows

1. Install [Node.js](https://nodejs.org).
2. Double-click `scripts\start-windows.bat`. It opens Edge full-screen in kiosk mode.
3. **DSLR on Windows:** install [digiCamControl](https://digicamcontrol.com) (Canon, Nikon, Sony) and turn on its web server (*Settings → Webserver*) for live view. The booth finds it automatically (`dslr.driver: auto`).
   Alternatively, run your camera's own webcam utility (Canon EOS Webcam Utility, Sony Imaging Edge Webcam and so on) and choose the **Webcam** camera.

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
data/photos/       final photos (JPEG)       ← back this up
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
