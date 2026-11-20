; installer/Setup.nsi | 管理者権限を使わず、補助アプリ・Chrome 拡張機能・日本語ガイドを一緒に導入する。
Unicode true
!include MUI2.nsh
!include LogicLib.nsh
!include x64.nsh
!define APP "法人別 証明書切替"
!define HOSTKEY "Software\Google\Chrome\NativeMessagingHosts\jp.chrome_certificate_changer.host"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ChromeCertificateChanger"
Name "${APP}"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\ChromeCertificateChanger"
RequestExecutionLevel user
ManifestDPIAware true
SetCompressor /SOLID lzma
BrandingText "${APP}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1041 "ProductName" "${APP}"
VIAddVersionKey /LANG=1041 "FileDescription" "${APP} セットアップ"
VIAddVersionKey /LANG=1041 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1041 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1041 "LegalCopyright" "yoshinsk"

!define MUI_WELCOMEPAGE_TITLE "法人別 証明書切替 をインストールします"
!define MUI_WELCOMEPAGE_TEXT "普段の Chrome で、法人ごとに銀行を開くための試用版です。$\r$\n$\r$\n「インストール」を押してください。インストール後、Chrome に追加する手順が開きます。$\r$\n$\r$\nすでにお使いの証明書はそのまま利用できます。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Windows の準備ができました"
!define MUI_FINISHPAGE_TEXT "「完了」を押すと、Chrome への追加手順が開きます。あとからスタートメニューの「法人別 証明書切替 の設定」でも開けます。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\program\Guide.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Chrome への追加手順を開く"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Japanese"

; インストールと削除を同時に開始しても、同じファイルや登録を書き換えない。
!macro LockSetup
  System::Call 'kernel32::CreateMutexW(p0,i0,w "Local\yoshinsk.ChromeCertificateChanger.Setup")p.r0 ?e'
  Pop $1
  ${If} $0 = 0
  ${OrIf} $1 = 183
    MessageBox MB_OK "別のセットアップが動いています。その画面を閉じてからもう一度開いてください。" /SD IDOK
    Abort
  ${EndIf}
  SetShellVarContext current
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}
!macroend
Function .onInit
  !insertmacro LockSetup
FunctionEnd
Function un.onInit
  !insertmacro LockSetup
FunctionEnd

; 製品が配布したファイルだけを対象にする。銀行用プロファイルは別のフォルダーに保存される。
!macro RemoveProgram PATH
  Delete "${PATH}\extension\manifest.json"
  Delete "${PATH}\extension\panel.html"
  Delete "${PATH}\extension\panel.css"
  Delete "${PATH}\extension\panel.js"
  Delete "${PATH}\extension\registration.mjs"
  Delete "${PATH}\extension\current-tab.mjs"
  Delete "${PATH}\host\CertificateHost.exe"
  Delete "${PATH}\host\host.json"
  Delete "${PATH}\Guide.exe"
  RMDir "${PATH}\extension"
  RMDir "${PATH}\host"
  RMDir "${PATH}"
!macroend

Section
  StrCpy $INSTDIR "$LOCALAPPDATA\ChromeCertificateChanger"
  CreateDirectory "$INSTDIR"
  ; 前回がフォルダー切替の途中で途切れた場合、先に旧版を使用可能な状態へ戻す。
  IfFileExists "$INSTDIR\program\Guide.exe" previous_ok
  IfFileExists "$INSTDIR\program-previous\Guide.exe" 0 previous_ok
  ClearErrors
  Rename "$INSTDIR\program-previous" "$INSTDIR\program"
  IfErrors install_error
  previous_ok:
  !insertmacro RemoveProgram "$INSTDIR\program-previous"
  !insertmacro RemoveProgram "$INSTDIR\program-next"
  ClearErrors
  SetOutPath "$INSTDIR\program-next\extension"
  File "${ROOT}\extension\manifest.json"
  File "${ROOT}\extension\panel.html"
  File "${ROOT}\extension\panel.css"
  File "${ROOT}\extension\panel.js"
  File "${ROOT}\extension\registration.mjs"
  File "${ROOT}\extension\current-tab.mjs"
  SetOutPath "$INSTDIR\program-next\host"
  File "${PAYLOAD}\CertificateHost.exe"
  File "${ROOT}\native\host.json"
  SetOutPath "$INSTDIR\program-next"
  File "${PAYLOAD}\Guide.exe"
  SetOutPath "$INSTDIR"
  IfErrors install_error
  ; 全ファイルの展開に成功してから一定の配置先へ切り替える。上書き時も拡張機能のパスを保つ。
  IfFileExists "$INSTDIR\program\*.*" 0 activate
  Rename "$INSTDIR\program" "$INSTDIR\program-previous"
  IfErrors install_error
  activate:
  Rename "$INSTDIR\program-next" "$INSTDIR\program"
  IfErrors restore_previous
  ; ソース版の補助アプリを使っていた人は、削除時に元の有効な登録へ戻せるようにする。
  ReadRegStr $0 HKCU "${HOSTKEY}" ""
  ${If} $0 != ""
  ${AndIf} $0 != "$INSTDIR\program\host\host.json"
    WriteRegStr HKCU "${UNKEY}" "PreviousHost" "$0"
  ${EndIf}
  ClearErrors
  WriteRegStr HKCU "${HOSTKEY}" "" "$INSTDIR\program\host\host.json"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  CreateShortcut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\program\Guide.exe" "--open"
  CreateShortcut "$SMPROGRAMS\${APP} の設定.lnk" "$INSTDIR\program\Guide.exe"
  IfErrors install_error
  !insertmacro RemoveProgram "$INSTDIR\program-previous"
  Goto installed
  restore_previous:
  IfFileExists "$INSTDIR\program-previous\Guide.exe" 0 install_error
  Rename "$INSTDIR\program-previous" "$INSTDIR\program"
  install_error:
  MessageBox MB_OK|MB_ICONSTOP "インストールを完了できませんでした。設定ガイドを閉じ、インストーラーをもう一度開いてください。" /SD IDOK
  SetErrorLevel 1
  Abort
  installed:
SectionEnd

Section "Uninstall"
  StrCpy $INSTDIR "$LOCALAPPDATA\ChromeCertificateChanger"
  ; ほかのインストールが後で登録したホストを解除しない。残すべき旧版がある場合は戻す。
  ReadRegStr $0 HKCU "${HOSTKEY}" ""
  ${If} $0 == "$INSTDIR\program\host\host.json"
    ReadRegStr $1 HKCU "${UNKEY}" "PreviousHost"
    ${If} $1 != ""
    ${AndIf} ${FileExists} "$1"
      WriteRegStr HKCU "${HOSTKEY}" "" "$1"
    ${Else}
      DeleteRegKey HKCU "${HOSTKEY}"
    ${EndIf}
  ${EndIf}
  Delete "$SMPROGRAMS\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP} の設定.lnk"
  !insertmacro RemoveProgram "$INSTDIR\program"
  !insertmacro RemoveProgram "$INSTDIR\program-next"
  !insertmacro RemoveProgram "$INSTDIR\program-previous"
  DeleteRegKey HKCU "${UNKEY}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
