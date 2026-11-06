!macro HUSHIO_OFFER EXT
  WriteRegNone HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Hushio.Audio"
  WriteRegStr HKCU "Software\Classes\Applications\Hushio.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro HUSHIO_WITHDRAW EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Hushio.Audio"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Hushio.Audio" "" "Audio file"
  WriteRegStr HKCU "Software\Classes\Hushio.Audio\DefaultIcon" "" "$INSTDIR\Hushio.exe,0"
  WriteRegStr HKCU "Software\Classes\Hushio.Audio\shell\open" "" "Play with Hushio"
  WriteRegStr HKCU "Software\Classes\Hushio.Audio\shell\open\command" "" '"$INSTDIR\Hushio.exe" "%1"'
  !insertmacro HUSHIO_OFFER "mp3"
  !insertmacro HUSHIO_OFFER "m4a"
  !insertmacro HUSHIO_OFFER "aac"
  !insertmacro HUSHIO_OFFER "flac"
  !insertmacro HUSHIO_OFFER "ogg"
  !insertmacro HUSHIO_OFFER "oga"
  !insertmacro HUSHIO_OFFER "opus"
  !insertmacro HUSHIO_OFFER "wav"
  !insertmacro HUSHIO_OFFER "webm"
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro HUSHIO_WITHDRAW "mp3"
  !insertmacro HUSHIO_WITHDRAW "m4a"
  !insertmacro HUSHIO_WITHDRAW "aac"
  !insertmacro HUSHIO_WITHDRAW "flac"
  !insertmacro HUSHIO_WITHDRAW "ogg"
  !insertmacro HUSHIO_WITHDRAW "oga"
  !insertmacro HUSHIO_WITHDRAW "opus"
  !insertmacro HUSHIO_WITHDRAW "wav"
  !insertmacro HUSHIO_WITHDRAW "webm"
  DeleteRegKey HKCU "Software\Classes\Hushio.Audio"
  DeleteRegKey HKCU "Software\Classes\Applications\Hushio.exe"
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend
