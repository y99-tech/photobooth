#!/usr/bin/env bash
# One-shot installer for Raspberry Pi OS (Bookworm) / Debian / Ubuntu.
# Installs gphoto2 + Chromium + Node.js, registers the booth as a service and
# opens it full-screen (kiosk mode) on the touch screen at login.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"

echo "==> Installing packages"
sudo apt-get update
sudo apt-get install -y gphoto2 curl unclutter
# Printing: CUPS + Gutenprint (Canon SELPHY, DNP, Mitsubishi, Epson, many dye-sub photo printers)
sudo apt-get install -y cups printer-driver-gutenprint
sudo usermod -aG lpadmin "$USER_NAME"
sudo apt-get install -y chromium-browser 2>/dev/null || sudo apt-get install -y chromium
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> Installing app"
cd "$DIR" && npm install --omit=dev

# The desktop auto-mounts cameras and blocks gphoto2 ("Could not claim the USB device").
echo "==> Stopping desktop camera auto-mount"
sudo chmod -x /usr/lib/gvfs/gvfs-gphoto2-volume-monitor 2>/dev/null || true

echo "==> Registering systemd service"
sudo tee /etc/systemd/system/photobooth.service >/dev/null <<UNIT
[Unit]
Description=Photobooth server
After=network-online.target

[Service]
User=$USER_NAME
WorkingDirectory=$DIR
ExecStart=$(command -v node) server/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now photobooth

echo "==> Kiosk autostart"
AUTOSTART="/home/$USER_NAME/.config/autostart"
mkdir -p "$AUTOSTART"
cat > "$AUTOSTART/photobooth-kiosk.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Photobooth Kiosk
Exec=$DIR/scripts/kiosk.sh
DESK
chmod +x "$DIR/scripts/kiosk.sh"

echo
echo "Done! Reboot, or run: $DIR/scripts/kiosk.sh"
echo "Admin: http://localhost:8080/admin (PIN 1234 — change it)"
echo "Add your photo printer at http://localhost:631 (Administration → Add Printer)"
