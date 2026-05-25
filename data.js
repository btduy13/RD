// Dữ liệu mẫu khởi tạo cho phần mềm Kế toán Rạng Đông (RD Accounting)

const DEFAULT_DATA = {
  companyName: "CÔNG TY CỔ PHẦN BÓNG ĐÈN PHÍCH NƯỚC RẠNG ĐÔNG",
  address: "Số 87-89, Đường Hạ Đình, Phường Thanh Xuân Trung, Quận Thanh Xuân, Hà Nội",
  taxCode: "0100101438",
  accountingStandard: "TT200", // Mặc định dùng Thông tư 200, có thể chuyển sang TT133

  // Danh mục sản phẩm (Kho hàng)
  products: [
    { id: "SP001", name: "Bóng đèn LED Bulb 9W Rạng Đông", unit: "Cái", stock: 150, avgCost: 35000, totalValue: 5250000, minStock: 20 },
    { id: "SP002", name: "Bóng đèn LED Tuýp 1.2m 20W", unit: "Cái", stock: 80, avgCost: 85000, totalValue: 6800000, minStock: 15 },
    { id: "SP003", name: "Phích nước nóng Rạng Đông 2L", unit: "Cái", stock: 50, avgCost: 120000, totalValue: 6000000, minStock: 10 },
    { id: "SP004", name: "Đèn bàn học chống cận thị LED", unit: "Cái", stock: 30, avgCost: 210000, totalValue: 6300000, minStock: 5 },
    { id: "SP005", name: "Công tắc thông minh Rạng Đông Rallismart", unit: "Cái", stock: 40, avgCost: 320000, totalValue: 12800000, minStock: 5 }
  ],

  // Danh mục đối tác (Khách hàng & Nhà cung cấp)
  partners: [
    { id: "KH001", name: "Đại lý Thiết bị Điện Ánh Dương", type: "customer", phone: "0912345678", email: "anhduong@gmail.com", address: "Số 120 Đường Cầu Giấy, Quận Cầu Giấy, Hà Nội" },
    { id: "KH002", name: "Cửa hàng Thiết bị Gia dụng Gia Minh", type: "customer", phone: "0987654321", email: "giaminh@gmail.com", address: "Số 45 Đường Trần Hưng Đạo, Quận Hải Châu, Đà Nẵng" },
    { id: "NCC001", name: "Công ty Cổ phần Nhựa Tiền Phong", type: "supplier", phone: "0243123456", email: "vattu@tienphong.vn", address: "Khu công nghiệp Vĩnh Niệm, Quận Lê Chân, Hải Phòng" },
    { id: "NCC002", name: "Nhà máy Thủy tinh Thống Nhất", type: "supplier", phone: "02253847291", email: "sales@thuytinhthongnhat.com", address: "Phố Đức Giang, Quận Long Biên, Hà Nội" },
    { id: "NCC003", name: "Tổng công ty Bất động sản Hà Nội (Cho thuê xưởng)", type: "supplier", phone: "0905111222", email: "leasing@hanoiland.com", address: "Số 10 Trần Duy Hưng, Quận Cầu Giấy, Hà Nội" }
  ],

  // Số dư đầu kỳ đối tác
  partnerOpeningBalances: {
    "KH001": { debit: 250000000, credit: 0 },
    "NCC001": { debit: 0, credit: 40000000 }
  },

  // Số dư đầu kỳ tài khoản kế toán (Tính đến 01/01/2026)
  // Tổng Nợ phải bằng Tổng Có để cân đối
  initialBalances: {
    "111": { name: "Tiền mặt", type: "debit", balance: 150000000 },
    "112": { name: "Tiền gửi ngân hàng", type: "debit", balance: 500000000 },
    "131": { name: "Phải thu của khách hàng", type: "debit", balance: 250000000 }, // Khách hàng KH001 nợ
    "156": { name: "Hàng hóa", type: "debit", balance: 36350000 }, // Tổng giá trị sản phẩm ở trên
    "244": { name: "Phải thu ký quỹ, ký cược (TK 1386 theo TT133)", type: "debit", balance: 50000000 }, // Ký quỹ thuê xưởng NCC003
    "1331": { name: "Thuế GTGT đầu vào được khấu trừ", type: "debit", balance: 0 },
    "331": { name: "Phải trả cho người bán", type: "credit", balance: 40000000 }, // Nợ NCC001
    "3331": { name: "Thuế GTGT phải nộp", type: "credit", balance: 0 },
    "344": { name: "Phải trả nhận ký quỹ, ký cược (TK 3386 theo TT133)", type: "credit", balance: 30000000 }, // Nhận ký quỹ đại lý từ KH001
    "511": { name: "Doanh thu bán hàng và cung cấp dịch vụ", type: "credit", balance: 0 },
    "632": { name: "Giá vốn hàng bán", type: "debit", balance: 0 },
    "411": { name: "Vốn góp của chủ sở hữu", type: "credit", balance: 911350000 } // Vốn đối ứng tự cân đối
  },

  // Nhật ký chứng từ / Giao dịch mẫu
  vouchers: [
    {
      id: "MH-26-0001",
      type: "purchase", // Mua hàng
      date: "2026-01-05",
      partnerId: "NCC001",
      partnerName: "Công ty Cổ phần Nhựa Tiền Phong",
      paymentMethod: "331", // Chưa thanh toán (Công nợ)
      description: "Mua vật tư thân phích nước nhập kho",
      items: [
        { productId: "SP003", qty: 50, price: 100000, amount: 5000000 }
      ],
      taxRate: 10, // 10% VAT
      taxAmount: 500000,
      totalAmount: 5500000,
      entries: [
        { debit: "156", credit: "331", amount: 5000000, desc: "Giá mua vật tư nhập kho" },
        { debit: "1331", credit: "331", amount: 5000000 * 0.1, desc: "Thuế GTGT đầu vào mua hàng" }
      ]
    },
    {
      id: "BH-26-0001",
      type: "sales", // Bán hàng
      date: "2026-01-10",
      partnerId: "KH001",
      partnerName: "Đại lý Thiết bị Điện Ánh Dương",
      paymentMethod: "112", // Thu tiền gửi ngân hàng
      description: "Xuất bán bóng đèn LED và phích nước cho Đại lý Ánh Dương",
      items: [
        { productId: "SP001", qty: 50, price: 55000, amount: 2750000 },
        { productId: "SP003", qty: 20, price: 180000, amount: 3600000 }
      ],
      taxRate: 10,
      taxAmount: 635000,
      totalAmount: 6985000,
      cogsAmount: 3950000, // Giá vốn xuất kho: 50 x 35.000 (Bulb) + 20 x 110.000 (Phích nước - giá vốn bình quân mới)
      // Giải thích giá vốn phích nước:
      // Tồn đầu kỳ: 50 cái, đơn giá 120.000. Tổng = 6.000.000
      // Nhập ngày 5/1: 50 cái, đơn giá 100.000. Tổng = 5.000.000
      // Đơn giá bình quân sau nhập: (6.000.000 + 5.000.000) / (50 + 50) = 110.000 đ/cái.
      // Xuất ngày 10/1: 20 cái * 110.000 = 2.200.000
      // Giá vốn bóng LED: 50 cái * 35.000 = 1.750.000
      // Tổng Giá vốn = 1.750.000 + 2.200.000 = 3.950.000
      entries: [
        { debit: "112", credit: "511", amount: 6350000, desc: "Doanh thu bán hàng" },
        { debit: "112", credit: "3331", amount: 635000, desc: "Thuế GTGT đầu ra" },
        { debit: "632", credit: "156", amount: 3950000, desc: "Giá vốn hàng bán xuất kho" }
      ]
    },
    {
      id: "KQ-26-0001",
      type: "escrow_pay", // Ký quỹ mang đi
      date: "2026-01-15",
      partnerId: "NCC003",
      partnerName: "Tổng công ty Bất động sản Hà Nội (Cho thuê xưởng)",
      paymentMethod: "112", // Chi từ tiền gửi ngân hàng
      description: "Chi tiền gửi ngân hàng ký quỹ thuê nhà xưởng mới khu B",
      amount: 20000000,
      entries: [
        { debit: "244", credit: "112", amount: 20000000, desc: "Ký quỹ dài hạn thuê nhà xưởng" }
      ]
    },
    {
      id: "KQ-26-0002",
      type: "escrow_receive", // Nhận ký quỹ
      date: "2026-01-20",
      partnerId: "KH002",
      partnerName: "Cửa hàng Thiết bị Gia dụng Gia Minh",
      paymentMethod: "111", // Thu bằng tiền mặt
      description: "Nhận tiền mặt ký quỹ bảo lãnh phân phối đại lý độc quyền miền Trung",
      amount: 15000000,
      entries: [
        { debit: "111", credit: "344", amount: 15000000, desc: "Nhận ký quỹ từ Đại lý miền Trung" }
      ]
    }
  ]
};

// Xuất dữ liệu để dùng ở các file khác nếu cần thiết
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULT_DATA };
}
