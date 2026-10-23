; Extra steps for the Windows installer (electron-builder picks this file up by itself).

; Installing over a running My Pet: close it without asking, so a new version just replaces
; the old one. (Without this the installer stops to ask you to click OK first.) The same
; goes for the uninstaller.
!macro customCheckAppRunning
  ; Asked politely first, it closes its window and quits, saving its settings on the way out.
  nsExec::Exec `"$SYSDIR\taskkill.exe" /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  Sleep 1500
  ; Then anything left of it (an old copy that didn't listen) is stopped outright.
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  Sleep 500
!macroend
