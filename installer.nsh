!macro customInit
  DetailPrint "Dang xoa du lieu phien ban cu..."
  RMDir /r "$APPDATA\rd-accounting"
!macroend

!macro customUnInstall
  DetailPrint "Dang xoa sach du lieu..."
  RMDir /r "$APPDATA\rd-accounting"
!macroend
