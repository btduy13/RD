; Giữ dữ liệu người dùng trong AppData khi cài đặt/cập nhật phiên bản.
; Dữ liệu kế toán nằm tại: %APPDATA%\rd-accounting\data\rd_local.db

!macro customInit
  DetailPrint "Giu nguyen du lieu nguoi dung tai AppData\rd-accounting..."
!macroend

!macro customUnInstall
  DetailPrint "Go bo ung dung — du lieu ke toan van duoc giu tai AppData\rd-accounting."
  DetailPrint "Neu can xoa du lieu, hay xoa thu muc AppData\rd-accounting thu cong."
!macroend
