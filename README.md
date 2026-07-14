# 🌟 RD Accounting - Phần Mềm Kế Toán Rạng Đông (Desktop Standalone)

Chào mừng bạn đến với **RD Accounting**, phần mềm kế toán chuyên dụng thiết kế riêng cho **Công ty Cổ phần Bóng đèn Phích nước Rạng Đông**.

Ứng dụng đã được nâng cấp toàn diện và đóng gói thành một **Ứng dụng Desktop chạy độc lập (Standalone Desktop Application)** trên hệ điều hành Windows bằng công nghệ **Electron**. 

---

## 🏛️ Giao diện Chuyên nghiệp & Độc lập
*   Không còn chạy chung trên các tab trình duyệt lộn xộn. Phần mềm hoạt động trong một **cửa sổ Desktop riêng biệt** có thanh tiêu đề riêng và biểu tượng ứng dụng riêng.
*   Trải nghiệm giống hệt các phiên bản SaaS cao cấp của **MISA** với Slate Theme sang trọng và các chỉ số biểu đồ tương tác thời gian thực.
*   Dữ liệu kế toán được lưu trong **SQLite cục bộ** tại `%APPDATA%\rd-accounting\data\rd_local.db` (Electron userData). Bản sao lưu JSON tự động nằm tại `%APPDATA%\rd-accounting\backup\`. Cập nhật phiên bản **không xóa** dữ liệu người dùng.

---

## 🚀 Các Phân hệ Tính năng đã Tích hợp
1.  **Mua hàng (Purchasing):** Lập hóa đơn mua hàng nhập kho, hạch toán tự động công nợ (`TK 331`) và thuế GTGT đầu vào (`TK 1331`), xuất bản **Phiếu nhập kho (Mẫu 01-VT)** và **Phiếu chi (Mẫu 02-TT)**.
2.  **Bán hàng (Sales):** Lập hóa đơn bán hàng xuất kho, hạch toán doanh thu (`TK 511`), thuế GTGT đầu ra (`TK 3331`) và tự động trích xuất giá vốn hàng bán (`TK 632`), xuất bản **Phiếu xuất kho kiêm Hóa đơn (Mẫu 02-VT)** và **Phiếu thu (Mẫu 01-TT)**.
3.  **Kho hàng (Inventory):** Quản lý tồn kho theo thời gian thực và thẻ kho chi tiết theo phương pháp **Bình quân gia quyền liên hoàn**.
4.  **Ký quỹ, Ký cược (Escrow):** Theo dõi các khoản đặt cọc mang đi (`TK 244 / 1386`) và nhận đặt cọc từ đại lý (`TK 344 / 3386`) kèm chức năng tất toán khi hết thời hạn.
5.  **Báo cáo kế toán động:** Sổ Nhật ký chung, Sổ Cái chi tiết từng tài khoản và Bảng Cân đối Phát sinh (đảm bảo tự động cân đối Tổng Nợ = Tổng Có).

---

## 💻 Hướng dẫn Khởi chạy Ứng dụng Desktop

### Bước 1: Khởi chạy nhanh (Khuyên dùng)
Bạn chỉ cần mở thư mục `f:\Ke Toan RD` và nhấp đúp chuột vào tệp tin:
👉 **`Chạy_Phần_Mềm_Kế_Toán.bat`**

*   *Lưu ý ở lần chạy đầu tiên:* Hệ thống dòng lệnh sẽ tự động phát hiện và cài đặt thư viện Electron (khoảng 70-80MB) từ internet. Bạn chỉ cần giữ kết nối internet và chờ khoảng 1 phút. Các lần chạy sau đó ứng dụng sẽ mở lên ngay lập tức mà không cần kết nối mạng.

### Bước 2: Chạy thủ công bằng dòng lệnh
Nếu bạn muốn khởi động ứng dụng bằng PowerShell hoặc Command Prompt:
1.  Di chuyển vào thư mục dự án:
    ```powershell
    cd "f:\Ke Toan RD"
    ```
2.  Cài đặt thư viện (chỉ cần chạy một lần duy nhất):
    ```powershell
    npm install
    ```
3.  Khởi chạy ứng dụng:
    ```powershell
    npm start
    ```

---

## 🖨️ Tính năng In ấn & Sao lưu Dữ liệu
*   **In chứng từ:** Nhấn nút **Xem/In** trên bất kỳ hóa đơn hoặc phiếu thu/chi nào để mở biểu mẫu kế toán. Số tiền sẽ được thuật toán tự động chuyển đổi thành chữ Tiếng Việt (ví dụ: *Năm triệu năm trăm ngàn đồng chẵn.*). Nhấn **In (Print)** để in trực tiếp ra máy in giấy hoặc xuất PDF.
*   **Sao lưu:** Tại mục **Thiết lập**, bạn có thể bấm **Xuất dữ liệu (JSON)** để lưu bản sao lưu kế toán về máy tính bất cứ lúc nào. Hệ thống cũng tự động sao lưu JSON khi đóng ứng dụng (tối đa 30 bản gần nhất trong thư mục `backup/`).

## 🧪 Kiểm thử trước khi build

```powershell
npm run test
```

Bao gồm: đồng bộ cloud (`test:cloud-sync`), core diff/accounting (`test:core`), persistence (`test:persistence`).
