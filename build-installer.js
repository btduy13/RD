const electronInstaller = require('electron-winstaller');
const path = require('path');

async function build() {
  console.log('Bắt đầu tạo bộ cài đặt Windows chuyên nghiệp (Squirrel)...');
  try {
    await electronInstaller.createWindowsInstaller({
      appDirectory: path.join(__dirname, 'dist', 'rd-accounting-win32-x64'),
      outputDirectory: path.join(__dirname, 'dist', 'installer'),
      authors: 'Công ty Cổ phần Rạng Đông',
      exe: 'rd-accounting.exe',
      setupExe: 'Cai_Dat_Ke_Toan_Rang_Dong.exe',
      noMsi: true,
      title: 'Kế toán Rạng Đông',
      description: 'Phần mềm kế toán độc lập Công ty Cổ phần Rạng Đông',
      setupIcon: path.join(__dirname, 'logo.jpg') // Dùng logo làm biểu tượng cài đặt (hoặc bỏ qua nếu lỗi)
    });
    console.log('===================================================');
    console.log('TẠO BỘ CÀI ĐẶT THÀNH CÔNG!');
    console.log('Bộ cài đặt được lưu tại: dist/installer/Cai_Dat_Ke_Toan_Rang_Dong.exe');
    console.log('===================================================');
  } catch (e) {
    console.error('Lỗi khi tạo bộ cài đặt:', e.message);
    
    // Nếu lỗi do icon không phải định dạng .ico, thử lại không dùng icon
    if (e.message.includes('icon') || e.message.includes('rcedit')) {
      console.log('Thử lại việc tạo bộ cài đặt không sử dụng icon tùy chỉnh...');
      try {
        await electronInstaller.createWindowsInstaller({
          appDirectory: path.join(__dirname, 'dist', 'rd-accounting-win32-x64'),
          outputDirectory: path.join(__dirname, 'dist', 'installer'),
          authors: 'Công ty Cổ phần Rạng Đông',
          exe: 'rd-accounting.exe',
          setupExe: 'Cai_Dat_Ke_Toan_Rang_Dong.exe',
          noMsi: true,
          title: 'Kế toán Rạng Đông',
          description: 'Phần mềm kế toán độc lập Công ty Cổ phần Rạng Đông'
        });
        console.log('===================================================');
        console.log('TẠO BỘ CÀI ĐẶT THÀNH CÔNG (Không icon)!');
        console.log('Bộ cài đặt được lưu tại: dist/installer/Cai_Dat_Ke_Toan_Rang_Dong.exe');
        console.log('===================================================');
      } catch (err) {
        console.error('Lỗi nghiêm trọng khi tạo bộ cài đặt:', err.message);
      }
    }
  }
}

build();
