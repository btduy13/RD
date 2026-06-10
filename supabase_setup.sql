-- =====================================================
-- SUPABASE SETUP SCRIPT cho RD Accounting
-- Chạy script này trong Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Tạo bảng chính lưu trữ toàn bộ dữ liệu kế toán
CREATE TABLE IF NOT EXISTS rd_accounting_data (
  id TEXT PRIMARY KEY DEFAULT 'main',
  data JSONB NOT NULL DEFAULT '{}',
  last_modified BIGINT DEFAULT 0,
  is_syncing BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Bật Realtime cho bảng này (để đồng bộ thời gian thực giữa nhiều máy)
ALTER PUBLICATION supabase_realtime ADD TABLE rd_accounting_data;

-- 3. Tạo bản ghi chính đầu tiên (nếu chưa có)
INSERT INTO rd_accounting_data (id, data, last_modified, is_syncing)
VALUES ('main', '{}', 0, false)
ON CONFLICT (id) DO NOTHING;

-- 4. Cấp quyền cho anon user (public access, tương tự Firebase open rules)
-- Lưu ý: Nếu bạn muốn bảo mật hơn, hãy thêm RLS policies sau
ALTER TABLE rd_accounting_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON rd_accounting_data
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert" ON rd_accounting_data
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update" ON rd_accounting_data
  FOR UPDATE USING (true);

-- 5. Tạo index cho last_modified để tối ưu hóa truy vấn delta sync, tránh timeout
CREATE INDEX IF NOT EXISTS idx_rd_accounting_data_last_modified ON rd_accounting_data(last_modified);

