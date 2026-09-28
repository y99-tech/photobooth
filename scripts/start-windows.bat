@echo off
REM Start the photobooth on Windows and open it full-screen (touch screens supported).
REM DSLR on Windows: install digiCamControl (https://digicamcontrol.com) and enable its
REM web server (Settings > Webserver) for live view. Or use the camera's USB webcam utility.
REM Boomerang videos: install ffmpeg (winget install ffmpeg) so they are saved as MP4.
cd /d "%~dp0\.."
if not exist node_modules (call npm install --omit=dev)
start "Photobooth server" /min cmd /c "node server\index.js"
timeout /t 3 /nobreak >nul
set EDGE="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist %EDGE% (
  start "" %EDGE% --kiosk http://localhost:8080/ --edge-kiosk-type=fullscreen --no-first-run --use-fake-ui-for-media-stream
) else (
  start "" chrome --kiosk --use-fake-ui-for-media-stream http://localhost:8080/
)
