#!/usr/bin/env bash
# Open the booth full-screen on Linux / Raspberry Pi (touch screen friendly).
# Starts the server too if it is not already running (e.g. no systemd service).
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8080}"
if ! curl -s "http://localhost:$PORT/api/config" >/dev/null; then
  (cd "$DIR" && nohup node server/index.js >"$DIR/photobooth.log" 2>&1 &)
  for _ in $(seq 1 30); do curl -s "http://localhost:$PORT/api/config" >/dev/null && break; sleep 1; done
fi
xset s off -dpms s noblank 2>/dev/null || true   # never blank the screen
command -v unclutter >/dev/null && unclutter -idle 3 &   # hide mouse cursor on touch screens
BROWSER="$(command -v chromium-browser || command -v chromium || command -v google-chrome)"
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --no-first-run \
  --disable-pinch --overscroll-history-navigation=0 --touch-events=enabled \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --check-for-update-interval=31536000 \
  "http://localhost:$PORT/"
