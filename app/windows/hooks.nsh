; Ringpad keeps settings, pads and clips in %APPDATA%\Ringpad, not in the bundle-id
; folder the Tauri uninstaller cleans up. Remove it only when the user ticks
; "Delete the application data", and never during an update.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    SetShellVarContext current
    RmDir /r "$APPDATA\Ringpad"
  ${EndIf}
!macroend
