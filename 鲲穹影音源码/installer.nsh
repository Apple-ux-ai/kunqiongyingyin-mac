!macro customInstall
  DetailPrint "正在注册鲲穹影音到 Windows 默认应用列表..."
  
  ; 1. 注册 ProgID
  WriteRegStr HKCU "Software\Classes\com.kunqiong.aiplayer" "" "鲲穹影音 视频文件"
  WriteRegStr HKCU "Software\Classes\com.kunqiong.aiplayer" "AppUserModelID" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\Classes\com.kunqiong.aiplayer\DefaultIcon" "" "$INSTDIR\鲲穹影音.exe,0"
  WriteRegStr HKCU "Software\Classes\com.kunqiong.aiplayer\shell\open\command" "" '"$INSTDIR\鲲穹影音.exe" "%1"'

  ; 2. 注册 Capabilities (关键：让它出现在“默认应用”候选项)
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities" "ApplicationDescription" "鲲穹影音 - 智能视频播放器"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities" "ApplicationName" "鲲穹影音"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities" "ApplicationIcon" "$INSTDIR\鲲穹影音.exe,0"

  ; 注册文件关联能力
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".mp4" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".mkv" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".avi" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".mov" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".flv" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".wmv" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".rmvb" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".webm" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".ts" "com.kunqiong.aiplayer"
  WriteRegStr HKCU "Software\鲲穹影音\Capabilities\FileAssociations" ".3gp" "com.kunqiong.aiplayer"

  ; 3. 注册到全局 RegisteredApplications
  WriteRegStr HKCU "Software\RegisteredApplications" "鲲穹影音" "Software\鲲穹影音\Capabilities"
  
  DetailPrint "注册完成。"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\com.kunqiong.aiplayer"
  DeleteRegKey HKCU "Software\鲲穹影音"
  DeleteRegValue HKCU "Software\RegisteredApplications" "鲲穹影音"
!macroend
