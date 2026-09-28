; Extra installer steps: let phones on the Wi-Fi reach the booth (QR download, phone remote,
; gallery) by allowing the app through Windows Defender Firewall, and remove the rule on uninstall.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Photobooth"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Photobooth" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=private,domain,public'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Photobooth"'
!macroend
