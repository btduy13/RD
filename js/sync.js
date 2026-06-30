// ==========================================================================
// HỆ THỐNG ĐỒNG BỘ CƠ SỞ DỮ LIỆU ĐÁM MÂY (SUPABASE CLOUD DATABASE SYNC)
// ==========================================================================

let supabaseClient = null;
let cloudSyncActive = false;
let isStartupPullCompleted = false;
let realtimeChannel = null;
let lastSyncState = null;
function updateLastSyncState(newState) {
  if (!newState) {
    lastSyncState = null;
    try {
      localStorage.removeItem("rd_accounting_last_sync_cache");
    } catch (e) {}
    return;
  }
  lastSyncState = JSON.parse(JSON.stringify(newState));
  try {
    localStorage.setItem("rd_accounting_last_sync_cache", JSON.stringify(lastSyncState));
  } catch (err) {
    console.error("[Cache] Lỗi ghi cache đồng bộ:", err);
  }
}

function initCloudSync() {
  if (!cloudSyncSettings.enabled) {
    updateCloudSyncBadge(false, "Mây: Tắt", "#64748b");
    return;
  }

  if (!cloudSyncSettings.supabaseUrl || !cloudSyncSettings.supabaseAnonKey) {
    updateCloudSyncBadge(false, "Mây: Chưa cấu hình", "#ef4444");
    return;
  }

  try {
    updateCloudSyncBadge(false, "Mây: Đang kết nối...", "#f59e0b");

    if (typeof supabase === "undefined" || !supabase.createClient) {
      if (typeof addErrorLog === "function") {
        addErrorLog("initCloudSync", "Thư viện Supabase chưa được tải. Vui lòng kiểm tra Internet.");
      }
      updateCloudSyncBadge(false, "Mây: Không có mạng", "#ef4444");
      return;
    }

    startSupabaseClient();
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("initCloudSync", err.message, err);
    }
    updateCloudSyncBadge(false, "Mây: Lỗi kết nối", "#ef4444");
  }
}

async function startSupabaseClient() {
  try {
    // Đóng kênh realtime cũ nếu có
    if (realtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    supabaseClient = supabase.createClient(
      cloudSyncSettings.supabaseUrl,
      cloudSyncSettings.supabaseAnonKey
    );

    cloudSyncActive = true;

    // Kiểm tra kết nối bằng cách đọc bản ghi metadata chính
    const { data, error } = await supabaseClient
      .from("rd_accounting_data")
      .select("id")
      .eq("id", "metadata")
      .maybeSingle();

    if (error) {
      throw new Error("Lỗi kết nối Supabase: " + error.message);
    }

    if (!data) {
      // Bản ghi chưa tồn tại → tạo mới bản ghi metadata
      const { error: insertError } = await supabaseClient
        .from("rd_accounting_data")
        .upsert({ id: "metadata", data: {}, last_modified: 0, is_syncing: false });

      if (insertError) {
        throw new Error("Không thể tạo bản ghi metadata: " + insertError.message);
      }
    }

    updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    showToast("Đã kết nối Supabase đám mây thành công!", "success");

    // Kéo dữ liệu khi khởi động
    await pullFromCloudOnStartup();

    // Đăng ký lắng nghe thay đổi realtime
    listenToCloudChanges();

    const forcePullBtn = document.getElementById("btn-force-pull");
    if (forcePullBtn) forcePullBtn.style.display = "inline-block";
    const forcePushBtn = document.getElementById("btn-force-push");
    if (forcePushBtn) forcePushBtn.style.display = "inline-block";
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("startSupabaseClient", err.message, err);
    }
    updateCloudSyncBadge(false, "Mây: Lỗi khởi tạo", "#ef4444");
    cloudSyncActive = false;
  }
}

function logToDebugFile(msg) {
  console.log(msg);
  if (window.electronAPI && typeof window.electronAPI.writeLog === "function") {
    window.electronAPI.writeLog(msg).catch(err => console.error("logToDebugFile error:", err));
  }
}

async function fetchCloudDelta(localTs) {
  logToDebugFile(`[fetchCloudDelta] Bắt đầu. localTs = ${localTs}`);
  
  // 1. Tải dòng metadata trước để lấy last_modified mới nhất trên đám mây
  const { data: metadataRow, error: metaError } = await supabaseClient
    .from("rd_accounting_data")
    .select("data, last_modified")
    .eq("id", "metadata")
    .single();
    
  if (metaError) {
    logToDebugFile(`[fetchCloudDelta] LỖI khi tải metadata: ${JSON.stringify(metaError)}`);
    throw metaError;
  }
  if (!metadataRow) {
    logToDebugFile(`[fetchCloudDelta] Không tìm thấy dòng metadata trên Cloud.`);
    return null;
  }

  const cloudTs = metadataRow.last_modified || 0;
  logToDebugFile(`[fetchCloudDelta] Tải metadata thành công. cloudTs = ${cloudTs}, localTs = ${localTs}`);
  
  if (localTs > 0 && cloudTs <= localTs) {
    console.log(`[Supabase] Dữ liệu cục bộ đã mới nhất hoặc trùng khớp. (Cloud: ${cloudTs}, Local: ${localTs})`);
    logToDebugFile(`[fetchCloudDelta] Kết thúc sớm: Dữ liệu đã mới nhất.`);
    return null; // Không cần tải thêm
  }

  // 2. TỐI ƯU HÓA TẢI MỚI TOÀN BỘ (localTs === 0): Tải dữ liệu trực tiếp theo trang dùng Keyset Pagination
  if (localTs === 0) {
    logToDebugFile(`[fetchCloudDelta] Chế độ TẢI MỚI TOÀN BỘ (localTs === 0)`);
    let changedRows = [];
    let lastSeenId = "";
    const step = 500;
    const MAX_PAGES = 100; // Cho phép tải tối đa 50.000 dòng dữ liệu
    let page = 0;
    
    while (page < MAX_PAGES) {
      if (typeof updateCloudSyncBadge === "function") {
        updateCloudSyncBadge(false, `Mây: Tải dữ liệu trang (${page + 1})...`, "#f59e0b");
      }
      
      logToDebugFile(`[fetchCloudDelta] Tải mới toàn bộ: Bắt đầu tải trang ${page + 1}, lastSeenId = ${lastSeenId}`);
      let data = null, error = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.warn(`[fetchCloudDelta] Thử lại trang ${page + 1} (lần ${attempt + 1})...`);
          logToDebugFile(`[fetchCloudDelta] Thử lại trang ${page + 1} (lần ${attempt + 1})...`);
        }
        let query = supabaseClient
          .from("rd_accounting_data")
          .select("id, data, last_modified")
          .order("id")
          .limit(step);
        if (lastSeenId) {
          query = query.gt("id", lastSeenId);
        }
        const res = await query;
        data = res.data;
        error = res.error;
        if (!error) break;
      }
      
      if (error) {
        logToDebugFile(`[fetchCloudDelta] LỖI khi tải trang ${page + 1}: ${JSON.stringify(error)}`);
        throw error;
      }
      
      if (!data || data.length === 0) {
        logToDebugFile(`[fetchCloudDelta] Tải mới toàn bộ: Trang ${page + 1} không có dữ liệu (kết thúc danh sách).`);
        break;
      }
      
      logToDebugFile(`[fetchCloudDelta] Tải mới toàn bộ: Trang ${page + 1} thành công. Lấy được ${data.length} dòng.`);
      changedRows = changedRows.concat(data);
      if (data.length < step) {
        logToDebugFile(`[fetchCloudDelta] Tải mới toàn bộ: Đã chạm trang cuối cùng (dữ liệu tải về < ${step}).`);
        break;
      }
      lastSeenId = data[data.length - 1].id;
      page++;
    }
    
    // Luôn đảm bảo có hàng metadata trong changedRows để cập nhật deletedIds
    if (!changedRows.some(r => r.id === "metadata")) {
      changedRows.push({
        id: "metadata",
        data: metadataRow.data,
        last_modified: cloudTs
      });
    }
    
    logToDebugFile(`[fetchCloudDelta] Kết thúc tải mới toàn bộ. Tổng số dòng thay đổi: ${changedRows.length}`);
    return { changedRows, cloudTs };
  }

  // 3. TẢI INCREMENTAL DELTA (localTs > 0): Dùng Keyset Pagination để quét danh sách thay đổi
  logToDebugFile(`[fetchCloudDelta] Chế độ TẢI INCREMENTAL (localTs = ${localTs})`);
  let allItems = [];
  let lastSeenId = "";
  const step = 500;
  const MAX_PAGES = 40; // Giới hạn an toàn: tối đa 40 trang × 500 = 20.000 rows
  let page = 0;

  while (page < MAX_PAGES) {
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(false, `Mây: Quét danh sách (${page + 1})...`, "#f59e0b");
    }
    
    logToDebugFile(`[fetchCloudDelta] Quét danh sách incremental: Trang ${page + 1}, lastSeenId = ${lastSeenId}`);
    let query = supabaseClient
      .from("rd_accounting_data")
      .select("id, last_modified");
      
    if (localTs > 0) {
      query = query.gt("last_modified", localTs);
    }
    if (lastSeenId) {
      query = query.gt("id", lastSeenId);
    }

    // Thử tải trang hiện tại, tự thử lại 1 lần nếu bị timeout
    let data = null, error = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        // Chờ 2 giây trước khi thử lại
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.warn(`[fetchCloudDelta] Thử lại trang ${page + 1} (lần ${attempt + 1})...`);
        logToDebugFile(`[fetchCloudDelta] Thử lại trang ${page + 1} (lần ${attempt + 1})...`);
      }
      const res = await query.order("id").limit(step);
      data = res.data;
      error = res.error;
      if (!error) break; // Thành công → thoát retry loop
      if (!error.message || !error.message.includes("timeout")) break; // Lỗi khác → không retry
      console.error(`[fetchCloudDelta] Timeout tại trang ${page + 1}, thử lại...`, error.message);
      logToDebugFile(`[fetchCloudDelta] Timeout tại trang ${page + 1}, thử lại... ${error.message}`);
    }

    if (error) {
      logToDebugFile(`[fetchCloudDelta] LỖI khi quét trang ${page + 1}: ${JSON.stringify(error)}`);
      throw error;
    }
    if (!data || data.length === 0) {
      logToDebugFile(`[fetchCloudDelta] Quét danh sách incremental: Trang ${page + 1} không có dữ liệu mới.`);
      break;
    }
    
    logToDebugFile(`[fetchCloudDelta] Quét danh sách incremental: Trang ${page + 1} lấy được ${data.length} dòng.`);
    allItems = allItems.concat(data);
    if (data.length < step) break;
    lastSeenId = data[data.length - 1].id;
    page++;
  }

  logToDebugFile(`[fetchCloudDelta] Kết thúc quét danh sách. Tổng số dòng có thay đổi (allItems): ${allItems.length}`);

  if (allItems.length === 0) {
    return {
      changedRows: [{
        id: "metadata",
        data: metadataRow.data,
        last_modified: cloudTs
      }],
      cloudTs
    };
  }

  // Phân chia danh sách ID thành các lô 200 ID để tải dữ liệu chi tiết
  const ids = allItems.map(item => item.id);
  const batches = [];
  const BATCH_SIZE = 200;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    batches.push(ids.slice(i, i + BATCH_SIZE));
  }

  // Tải song song với mức độ đồng thời (concurrency) = 4
  let changedRows = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    const totalBatches = Math.ceil(batches.length / CONCURRENCY);
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(false, `Mây: Tải dữ liệu (${batchNum}/${totalBatches})...`, "#f59e0b");
    }

    logToDebugFile(`[fetchCloudDelta] Bắt đầu tải lô chi tiết ${batchNum}/${totalBatches}`);
    const slice = batches.slice(i, i + CONCURRENCY);
    slice.forEach((b, idx) => {
      logToDebugFile(`[fetchCloudDelta]   - Lô con ${idx + 1}: gồm ${b.length} phần tử (từ ${b[0]} đến ${b[b.length-1]})`);
    });

    const promises = slice.map(batch =>
      supabaseClient
        .from("rd_accounting_data")
        .select("id, data, last_modified")
        .in("id", batch)
    );
    
    logToDebugFile(`[fetchCloudDelta] Gửi truy vấn Promise.all cho lô chi tiết ${batchNum}/${totalBatches}...`);
    const responses = await Promise.all(promises);
    logToDebugFile(`[fetchCloudDelta] Đã nhận phản hồi từ Supabase cho lô chi tiết ${batchNum}/${totalBatches}`);
    
    for (const res of responses) {
      if (res.error) {
        logToDebugFile(`[fetchCloudDelta] LỖI khi tải chi tiết cho lô ${batchNum}/${totalBatches}: ${JSON.stringify(res.error)}`);
        throw res.error;
      }
      if (res.data) {
        changedRows = changedRows.concat(res.data);
      }
    }
    logToDebugFile(`[fetchCloudDelta] Lô chi tiết ${batchNum}/${totalBatches} xử lý xong. Lũy kế changedRows: ${changedRows.length} dòng.`);
  }

  // Luôn đảm bảo có hàng metadata trong changedRows để cập nhật deletedIds
  if (!changedRows.some(r => r.id === "metadata")) {
    changedRows.push({
      id: "metadata",
      data: metadataRow.data,
      last_modified: cloudTs
    });
  }

  logToDebugFile(`[fetchCloudDelta] Kết thúc tải incremental. Tổng số dòng dữ liệu trả về: ${changedRows.length}`);
  return { changedRows, cloudTs };
}

function applyDeltaToState(changedRows, cloudTs) {
  let baseState;
  const rescuedVouchers = []; // Các voucher cục bộ bị cloud ghi đè do trùng ID
  
  if (lastSyncState) {
    // Nhân bản local state làm gốc để hợp nhất delta
    baseState = JSON.parse(JSON.stringify(state));
  } else {
    // Tải mới hoàn toàn
    baseState = {
      companyName: "",
      address: "",
      taxCode: "",
      accountingStandard: "TT200",
      products: [],
      partners: [],
      initialBalances: {},
      vouchers: []
    };
  }

  const vouchersChunks = [];
  const partnersChunks = [];
  foundOldChunkIds = [];

  // Khởi tạo các Map để tra cứu nhanh (Tránh độ phức tạp O(N^2))
  const partnerIndexMap = new Map();
  (baseState.partners || []).forEach((p, index) => {
    if (p && p.id) partnerIndexMap.set(p.id, index);
  });

  const voucherIndexMap = new Map();
  (baseState.vouchers || []).forEach((v, index) => {
    if (v && v.id) voucherIndexMap.set(v.id, index);
  });

  const productIndexMap = new Map();
  (baseState.products || []).forEach((p, index) => {
    if (p && p.id) productIndexMap.set(p.id, index);
  });

  // 1. Hợp nhất các dòng thay đổi
  changedRows.forEach(row => {
    if (!row) return;
    
    if (row.id === "metadata") {
      // Cloud luôn là nguồn sự thật cho metadata (bao gồm partnerOpeningBalances)
      Object.assign(baseState, row.data);
    } else if (row.id === "products") {
      baseState.products = row.data || [];
      foundOldChunkIds.push(row.id);
      productIndexMap.clear();
      baseState.products.forEach((p, index) => {
        if (p && p.id) productIndexMap.set(p.id, index);
      });
    } else if (row.id.startsWith("partners_")) {
      const idx = parseInt(row.id.split("_")[1]) || 0;
      partnersChunks[idx] = row.data || [];
      foundOldChunkIds.push(row.id);
    } else if (row.id.startsWith("vouchers_")) {
      const idx = parseInt(row.id.split("_")[1]) || 0;
      vouchersChunks[idx] = row.data || [];
      foundOldChunkIds.push(row.id);
    } else if (row.id.startsWith("v_")) {
      const cloudVoucher = row.data;
      if (cloudVoucher && cloudVoucher.id) {
        // Nếu voucher tồn tại rõ ràng trên cloud (do máy khác tạo lại),
        // tự động xóa nó khỏi deletedIds để Safety Net không lọc ra nhầm
        if (Array.isArray(baseState.deletedIds) && baseState.deletedIds.includes(cloudVoucher.id)) {
          baseState.deletedIds = baseState.deletedIds.filter(id => id !== cloudVoucher.id);
          console.log(`[applyDelta] Voucher ${cloudVoucher.id} được khôi phục: xóa khỏi deletedIds vì có trên cloud.`);
        }
        const idx = voucherIndexMap.has(cloudVoucher.id) ? voucherIndexMap.get(cloudVoucher.id) : -1;
        if (idx !== -1) {
          const localVoucher = baseState.vouchers[idx];
          // === PHÁT HIỆN XUNG ĐỘT ID SONG SONG ===
          // Cả hai bên đều có _sessionId, khác nhau, và bản cục bộ là của máy này
          if (
            localVoucher &&
            localVoucher._sessionId &&
            cloudVoucher._sessionId &&
            localVoucher._sessionId !== cloudVoucher._sessionId &&
            localVoucher._sessionId === clientSessionId
          ) {
            console.warn(`[ConflictDetect] Xung đột ID "${cloudVoucher.id}": máy này và máy khác cùng tạo. Đang cứu bản cục bộ...`);
            rescuedVouchers.push({ ...localVoucher }); // lưu bản cục bộ bị đẩy ra
          }
          baseState.vouchers[idx] = cloudVoucher; // cloud thắng
        } else {
          baseState.vouchers.push(cloudVoucher);
          voucherIndexMap.set(cloudVoucher.id, baseState.vouchers.length - 1);
        }
      }
    } else if (row.id.startsWith("p_")) {
      const product = row.data;
      if (product && product.id) {
        // Nếu sản phẩm tồn tại rõ ràng trên cloud (do máy khác tạo lại),
        // tự động xóa nó khỏi deletedIds để Safety Net không lọc ra nhầm
        if (Array.isArray(baseState.deletedIds) && baseState.deletedIds.includes(product.id)) {
          baseState.deletedIds = baseState.deletedIds.filter(id => id !== product.id);
          console.log(`[applyDelta] Sản phẩm ${product.id} được khôi phục: xóa khỏi deletedIds vì có trên cloud.`);
        }
        const idx = productIndexMap.has(product.id) ? productIndexMap.get(product.id) : -1;
        if (idx !== -1) {
          baseState.products[idx] = product;
        } else {
          baseState.products.push(product);
          productIndexMap.set(product.id, baseState.products.length - 1);
        }
      }
    } else if (row.id.startsWith("part_")) {
      const partner = row.data;
      if (partner && partner.id) {
        // Nếu đối tác tồn tại rõ ràng trên cloud (do máy khác tạo lại),
        // tự động xóa nó khỏi deletedIds để Safety Net không lọc ra nhầm
        if (Array.isArray(baseState.deletedIds) && baseState.deletedIds.includes(partner.id)) {
          baseState.deletedIds = baseState.deletedIds.filter(id => id !== partner.id);
          console.log(`[applyDelta] Đối tác ${partner.id} được khôi phục: xóa khỏi deletedIds vì có trên cloud.`);
        }
        const idx = partnerIndexMap.has(partner.id) ? partnerIndexMap.get(partner.id) : -1;
        if (idx !== -1) {
          baseState.partners[idx] = partner;
        } else {
          baseState.partners.push(partner);
          partnerIndexMap.set(partner.id, baseState.partners.length - 1);
        }
      }
    }
  });

  // 2. Xử lý các chunk cũ (nếu có lúc di chuyển)
  if (partnersChunks.length > 0) {
    const tempPartners = [];
    partnersChunks.forEach(chunk => {
      if (chunk) tempPartners.push(...chunk);
    });
    tempPartners.forEach(part => {
      if (part && part.id && !partnerIndexMap.has(part.id)) {
        baseState.partners.push(part);
        partnerIndexMap.set(part.id, baseState.partners.length - 1);
      }
    });
  }

  if (vouchersChunks.length > 0) {
    const tempVouchers = [];
    vouchersChunks.forEach(chunk => {
      if (chunk) tempVouchers.push(...chunk);
    });
    tempVouchers.forEach(v => {
      if (v && v.id && !voucherIndexMap.has(v.id)) {
        baseState.vouchers.push(v);
        voucherIndexMap.set(v.id, baseState.vouchers.length - 1);
      }
    });
  }

  baseState._lastModified = cloudTs;

  // === SAFETY NET 1: Lọc bỏ các ID đã xóa (deletedIds) ===
  if (baseState.deletedIds && baseState.deletedIds.length > 0) {
    const deletedSet = new Set(baseState.deletedIds);
    baseState.vouchers = (baseState.vouchers || []).filter(v => v && !deletedSet.has(v.id));
    baseState.products = (baseState.products || []).filter(p => p && !deletedSet.has(p.id));
    baseState.partners = (baseState.partners || []).filter(part => part && !deletedSet.has(part.id));
    if (baseState.cashEntries) {
      baseState.cashEntries = baseState.cashEntries.filter(e => e && !deletedSet.has(e.id));
    }
    if (baseState.escrowItems) {
      baseState.escrowItems = baseState.escrowItems.filter(e => e && !deletedSet.has(e.id));
    }
  }

  // === SAFETY NET 2: Khử trùng lặp ID voucher ===
  const voucherMap = new Map();
  (baseState.vouchers || []).forEach(v => {
    if (v && v.id) {
      if (!voucherMap.has(v.id)) {
        voucherMap.set(v.id, v);
      } else {
        const existing = voucherMap.get(v.id);
        if ((v._updatedAt || 0) > (existing._updatedAt || 0)) {
          voucherMap.set(v.id, v);
        }
      }
    }
  });
  baseState.vouchers = Array.from(voucherMap.values());

  // === SAFETY NET 3: Khử trùng lặp ID đối tác ===
  const partnerMap = new Map();
  (baseState.partners || []).forEach(p => {
    if (p && p.id) {
      if (!partnerMap.has(p.id)) {
        partnerMap.set(p.id, p);
      } else {
        const existing = partnerMap.get(p.id);
        // Ưu tiên đối tác có thông tin phong phú hơn (đã điền SĐT hoặc địa chỉ)
        const score = (p.phone && p.phone !== "-" ? 1 : 0) + (p.address && p.address !== "-" ? 1 : 0);
        const existingScore = (existing.phone && existing.phone !== "-" ? 1 : 0) + (existing.address && existing.address !== "-" ? 1 : 0);
        if (score > existingScore) {
          partnerMap.set(p.id, p);
        }
      }
    }
  });
  baseState.partners = Array.from(partnerMap.values());

  // === SAFETY NET 4: Khử trùng lặp ID sản phẩm ===
  const productMap = new Map();
  (baseState.products || []).forEach(p => {
    if (p && p.id) {
      if (!productMap.has(p.id)) {
        productMap.set(p.id, p);
      } else {
        const existing = productMap.get(p.id);
        const score = (p.name ? 1 : 0) + (p.unit ? 1 : 0);
        const existingScore = (existing.name ? 1 : 0) + (existing.unit ? 1 : 0);
        if (score > existingScore) {
          productMap.set(p.id, p);
        }
      }
    }
  });
  baseState.products = Array.from(productMap.values());

  if (foundOldChunkIds.length > 0) {
    console.log(`[Migration] Phát hiện ${foundOldChunkIds.length} chunks cũ. Đặt cờ di chuyển dữ liệu...`);
    migrationPending = true;
  }

  return { newState: baseState, rescuedVouchers };
}

/**
 * Giải quyết xung đột ID: đổi tên các voucher bị đẩy ra bởởi cloud đang có cùng ID tạo bởi máy khác.
 * Mỗi voucher được gán ID mới tiếp theo rồi push lên cloud và thông báo người dùng.
 */
async function resolveConflictedVouchers(rescuedVouchers) {
  if (!rescuedVouchers || rescuedVouchers.length === 0) return;

  for (const rescued of rescuedVouchers) {
    const oldId = rescued.id;
    // Sinh ID mới dựa trên type của voucher
    let newId;
    if (rescued.type === "sales") {
      newId = generateNextSalesVoucherId(rescued.paymentMethod);
    } else if (rescued.type === "sales_return") {
      newId = typeof generateNextSalesReturnVoucherId === "function" ? generateNextSalesReturnVoucherId() : `BTL${Date.now()}`;
    } else if (rescued.type === "sales_quotation") {
      newId = typeof generateNextQuotationVoucherId === "function" ? generateNextQuotationVoucherId() : `BG${Date.now()}`;
    } else if (rescued.type === "purchase" || rescued.type === "purchase_order" || rescued.type === "purchase_return") {
      newId = rescued.type === "purchase"
        ? (typeof generateNextPurchaseVoucherId === "function" ? generateNextPurchaseVoucherId(rescued.paymentMethod) : `NK${Date.now()}`)
        : rescued.type === "purchase_order"
          ? (typeof generateNextPurchaseOrderVoucherId === "function" ? generateNextPurchaseOrderVoucherId() : `ĐMH${Date.now()}`)
          : (typeof generateNextPurchaseReturnVoucherId === "function" ? generateNextPurchaseReturnVoucherId() : `MTL${Date.now()}`);
    } else {
      // receipt, payment, escrow — dùng timestamp để tránh trùng
      const prefix = rescued.type === "receipt" ? "PT" : rescued.type === "payment" ? "PC" : "KQ";
      newId = `${prefix}-CONFLICT-${Date.now()}`;
    }

    rescued.id = newId;
    rescued._sessionId = clientSessionId; // Cập nhật lại session của máy này

    // Cập nhật vào state hiện tại (nếu vẫn còn bản cũ thì xóa đi)
    state.vouchers = state.vouchers.filter(v => v.id !== oldId);
    state.vouchers.push(rescued);

    console.warn(`[ConflictResolve] Đã đổi "${oldId}" → "${newId}" do xung đột với máy khác.`);
    showToast(`⚠️ Đơn ${oldId} bị trùng với máy khác — đã tự động đổi thành ${newId}`, "warning");
  }

  // Push tất cả các voucher được đổi tên lên cloud
  state._lastModified = Date.now();
  saveState();
  try {
    await pushToCloud();
    console.log(`[ConflictResolve] Đã push ${rescuedVouchers.length} voucher xung đột lên cloud với ID mới.`);
  } catch (err) {
    console.error("[ConflictResolve] Lỗi push sau conflict:", err);
  }
}

async function fetchCloudData(localTs = 0) {
  const delta = await fetchCloudDelta(localTs);
  if (!delta) {
    return null; // null = không có gì mới
  }
  return applyDeltaToState(delta.changedRows, delta.cloudTs);
}

async function pullFromCloudOnStartup() {
  if (!cloudSyncActive || !supabaseClient) return;

  try {
    // Tải dữ liệu thay đổi (incremental) kể từ lần đồng bộ cuối cùng của cache cục bộ.
    // Nếu chưa có cache cục bộ (state rỗng) hoặc không có timestamp, sẽ tự động thực hiện full pull (truyền 0).
    const localTs = (state && state._lastModified) ? state._lastModified : 0;
    const result = await fetchCloudData(localTs);
    if (!result) return;
    const { newState: cloudData, rescuedVouchers } = result;
    const hasCloudProducts = cloudData && cloudData.products && cloudData.products.length > 0;

    if (cloudData && hasCloudProducts) {
      const cloudVoucherCount = (cloudData.vouchers || []).length;
      state = cloudData;
      updateLastSyncState(state);
      lastSyncedCloudTs = state._lastModified || 0;
      console.log(`[Supabase] Tải dữ liệu đám mây thành công! (${cloudVoucherCount} chứng từ)`);

      // Ghi cache cục bộ (localStorage fallback + file-based primary)
      try {
        const stateJson = JSON.stringify(state);
        // Ghi ra file (Electron IPC) - không giới hạn kích thước
        if (window.electronAPI && typeof window.electronAPI.writeStateFile === 'function') {
          window.electronAPI.writeStateFile(stateJson).catch(err => console.error('[StateFile] Lỗi ghi sau cloud pull:', err));
        }
        // Fallback localStorage (chỉ nếu < 4MB)
        if (!window.electronAPI) {
          try { localStorage.setItem("rd_accounting_online_cache", stateJson); } catch(e) {}
        }
      } catch (cacheErr) {
        console.error("[Cache] Lỗi ghi cache cục bộ:", cacheErr);
      }

      // Thực hiện dọn dẹp các đơn hàng có ID dạng số tự sinh
      cleanNumericVouchers();

      // Nếu deduplication đã loại bỏ voucher trùng lặp → đẩy ngay lên cloud để sửa dữ liệu
      const stateVoucherCount = (state.vouchers || []).length;
      if (stateVoucherCount < cloudVoucherCount) {
        console.warn(`[Supabase] Phát hiện ${cloudVoucherCount - stateVoucherCount} voucher trùng lặp → tự động sửa và đẩy lên cloud...`);
        setTimeout(() => {
          state._lastModified = Date.now();
          pushToCloud().then(() => {
            showToast(`Đã tự động dọn dẹp ${cloudVoucherCount - stateVoucherCount} chứng từ bị trùng lặp trên cloud!`, "success");
          }).catch(err => console.error("[Supabase] Lỗi tự sửa dedup:", err));
        }, 3000);
      } else if (migrationPending) {
        console.log("[Migration] Kích hoạt tự động đẩy dữ liệu sang định dạng mới...");
        setTimeout(() => {
          pushToCloud().then(() => {
            showToast("Đã tự động chuyển đổi cấu trúc dữ liệu sang dòng đơn lẻ!", "success");
          }).catch(err => console.error("[Migration] Lỗi tự động chuyển đổi cấu trúc:", err));
        }, 5000);
      }

      // Giải quyết xung đột ID nếu có
      if (rescuedVouchers.length > 0) {
        setTimeout(() => resolveConflictedVouchers(rescuedVouchers), 2000);
      }

      // Cập nhật giao diện
      if (typeof recalculateAccounting === "function") recalculateAccounting(false);
      if (typeof filterDebts === "function") filterDebts();
      if (typeof filterPartners === "function") filterPartners();
      if (typeof filterCash === "function") filterCash();
      if (typeof initExcelIntegration === "function") initExcelIntegration();
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    } else {
      console.log("Cơ sở dữ liệu đám mây trống hoặc chưa có sản phẩm. Khởi tạo dữ liệu trắng ban đầu.");
      if (cloudData) {
        state = cloudData;
      } else {
        state = {
          companyName: "",
          address: "",
          taxCode: "",
          accountingStandard: "TT200",
          products: [],
          partners: [],
          initialBalances: JSON.parse(JSON.stringify(DEFAULT_DATA.initialBalances)),
          vouchers: []
        };
      }
      updateLastSyncState(state);
      lastSyncedCloudTs = state._lastModified || 0;
      recalculateAccounting(false);
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    }
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("pullFromCloudOnStartup", err.message, err);
    }
    showToast("Không thể tải dữ liệu đám mây khi khởi động. Hãy kiểm tra Internet hoặc máy chủ.", "danger");
    updateCloudSyncBadge(false, "Mây: Lỗi kết nối", "#ef4444");
  } finally {
    isStartupPullCompleted = true;
    console.log("[CloudSync] Khởi chạy hoàn tất. Đã bật quyền pushToCloud.");
  }
}

function forcePushToCloud() {
  if (!cloudSyncActive || !supabaseClient) {
    showToast("Ứng dụng chưa kết nối đám mây!", "danger");
    return;
  }

  if (confirm("Bạn có chắc chắn muốn ĐẨY toàn bộ dữ liệu cục bộ hiện tại (bao gồm lịch sử bán hàng) và GHI ĐÈ dữ liệu trên đám mây?")) {
    updateCloudSyncBadge(false, "Mây: Đang đẩy...", "#f59e0b");

    // Đảm bảo cập nhật timestamp sửa đổi cục bộ trước khi đẩy
    state._lastModified = Date.now();
    saveState();

    pushToCloud()
      .then(() => {
        showToast("Đã đồng bộ hóa ngược lên đám mây thành công!", "success");
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
      })
      .catch((err) => {
        if (typeof addErrorLog === "function") {
          addErrorLog("forcePushToCloud", err.message, err);
        }
        showToast("Lỗi đồng bộ đám mây: " + err.message, "danger");
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
      });
  }
}


function forcePullFromCloud() {
  if (!cloudSyncActive || !supabaseClient) {
    showToast("Ứng dụng chưa kết nối Đám mây!", "danger");
    return;
  }

  updateCloudSyncBadge(false, "Mây: Đang tải...", "#f59e0b");

  fetchCloudData(0)
    .then((result) => {
      if (!result) {
        showToast("Không tìm thấy dữ liệu trên Đám mây để tải về!", "warning");
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
        return;
      }
      const { newState: cloudData, rescuedVouchers } = result;
      if (cloudData) {
        state = cloudData;
        updateLastSyncState(state);
        lastSyncedCloudTs = state._lastModified || 0;
        
        // Ghi cache cục bộ
        try {
          localStorage.setItem("rd_accounting_online_cache", JSON.stringify(state));
        } catch (cacheErr) {
          console.error("[Cache] Lỗi ghi cache cục bộ:", cacheErr);
        }

        // Giải quyết xung đột ID nếu có
        if (rescuedVouchers.length > 0) {
          setTimeout(() => resolveConflictedVouchers(rescuedVouchers), 1000);
        }

        if (typeof recalculateAccounting === "function") recalculateAccounting();
        if (typeof filterDebts === "function") filterDebts();
        if (typeof filterPartners === "function") filterPartners();
        if (typeof filterCash === "function") filterCash();
        if (typeof initExcelIntegration === "function") initExcelIntegration();
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
        showToast("Tải dữ liệu từ Đám mây về máy này thành công!", "success");
      } else {
        showToast("Không tìm thấy dữ liệu trên Đám mây để tải về!", "warning");
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
      }
    })
    .catch((err) => {
      if (typeof addErrorLog === "function") {
        addErrorLog("forcePullFromCloud", err.message, err);
      }
      showToast("Lỗi khi tải dữ liệu đám mây: " + err.message, "danger");
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    });
}

function manualIncrementalSync() {
  if (!cloudSyncActive || !supabaseClient) {
    showToast("Ứng dụng chưa kết nối Đám mây!", "danger");
    return;
  }

  updateCloudSyncBadge(false, "Mây: Đang tải...", "#f59e0b");

  pullAndMergeFromCloud()
    .then(() => {
      showToast("Đồng bộ dữ liệu mới thành công!", "success");
    })
    .catch((err) => {
      if (typeof addErrorLog === "function") {
        addErrorLog("manualIncrementalSync", err.message, err);
      }
      showToast("Lỗi đồng bộ: " + err.message, "danger");
    });
}


// ==========================================================================
// SMART MERGE — Gộp dữ liệu từ 2 máy, tránh mất dữ liệu khi ghi đồng thời
// ==========================================================================

/**
 * Ghi nhận các ID vừa bị xóa vào state.deletedIds
 * để cơ chế Smart Merge không kéo lại dữ liệu đã xóa từ máy khác.
 */
function trackDeletedIds(ids) {
  if (!ids || ids.length === 0) return;
  if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
  ids.forEach(id => {
    if (!state.deletedIds.includes(id)) {
      state.deletedIds.push(id);
    }
  });
  // Giới hạn deletedIds tối đa 2000 phần tử (FIFO) để tránh đầy localStorage
  if (state.deletedIds.length > 2000) {
    state.deletedIds = state.deletedIds.slice(-2000);
  }
  state._lastModified = Date.now();
}

/**
 * Gộp 2 mảng theo trường `id`, ưu tiên giữ lại TẤT CẢ phần tử từ cả 2 nguồn.
 * Nếu cùng id: giữ phiên bản có _updatedAt mới hơn (hoặc cloud nếu không có).
 * Các id nằm trong deletedIds sẽ bị loại bỏ.
 */
function mergeArrayById(localArr, cloudArr, deletedIds) {
  const deleted = new Set(deletedIds || []);
  const map = new Map();

  // Nạp local trước
  (localArr || []).forEach(item => {
    if (item && item.id && !deleted.has(item.id)) {
      map.set(item.id, item);
    }
  });

  // Merge cloud: nếu id chưa có → thêm vào; nếu đã có → so timestamp giữ cái mới hơn
  (cloudArr || []).forEach(item => {
    if (!item || !item.id || deleted.has(item.id)) return;
    if (!map.has(item.id)) {
      map.set(item.id, item);
    } else {
      const localItem = map.get(item.id);
      const localTs = localItem._updatedAt || 0;
      const cloudTs = item._updatedAt || 0;
      if (cloudTs > localTs) {
        map.set(item.id, item); // cloud mới hơn rõ ràng → thay thế
      }
      // Nếu bằng nhau (cả 2 = 0) → giữ local (đã nạp trước, tránh ghi đè data mới)
    }
  });

  return Array.from(map.values());
}

function getActiveIds(s) {
  const ids = new Set();
  if (!s) return ids;
  if (Array.isArray(s.vouchers)) s.vouchers.forEach(v => v && v.id && ids.add(v.id));
  if (Array.isArray(s.products)) s.products.forEach(p => p && p.id && ids.add(p.id));
  if (Array.isArray(s.partners)) s.partners.forEach(pt => pt && pt.id && ids.add(pt.id));
  if (Array.isArray(s.cashEntries)) s.cashEntries.forEach(c => c && c.id && ids.add(c.id));
  if (Array.isArray(s.escrowItems)) s.escrowItems.forEach(e => e && e.id && ids.add(e.id));
  return ids;
}

/**
 * Merge thông minh: gộp localState và cloudState, giữ lại tất cả dữ liệu.
 * Trả về state đã merge sẵn sàng để lưu và push lên cloud.
 */
function mergeStates(localState, cloudState) {
  if (!localState) return cloudState;
  if (!cloudState) return localState;

  const cloudTs = cloudState._lastModified || 0;
  const localTs = localState._lastModified || 0;

  // Nếu cloud cũ hơn local quá 30 phút → local wins hoàn toàn (tăng từ 5 lên 30 phút để an toàn hơn)
  // Chú ý: KHÔNG shortcircuit khi chênh lệch nhỏ vì local có thể có voucher mới chưa kịp push
  if (localTs - cloudTs > 30 * 60 * 1000) {
    console.log("[SmartMerge] Local mới hơn cloud >30 phút → local wins.");
    return { ...localState };
  }

  let localDeleted = Array.isArray(localState.deletedIds) ? [...localState.deletedIds] : [];
  let cloudDeleted = Array.isArray(cloudState.deletedIds) ? [...cloudState.deletedIds] : [];

  if (localTs > cloudTs) {
    // Local mới hơn: các item active bên local sẽ thắng các deletion bên cloud
    const activeLocal = getActiveIds(localState);
    cloudDeleted = cloudDeleted.filter(id => !activeLocal.has(id));
  } else if (cloudTs > localTs) {
    // Cloud mới hơn: các item active bên cloud sẽ thắng các deletion bên local
    const activeCloud = getActiveIds(cloudState);
    localDeleted = localDeleted.filter(id => !activeCloud.has(id));
  }

  // Gộp deletedIds từ cả 2 nguồn để không tái xuất hiện dữ liệu đã xóa
  const mergedDeletedIds = Array.from(new Set([...localDeleted, ...cloudDeleted]));

  const merged = {
    // Cloud wins cho scalar fields (tên công ty, năm tài chính...)
    ...cloudState,

    // Merge arrays theo ID — giữ tất cả, loại bỏ deletedIds
    vouchers: mergeArrayById(localState.vouchers, cloudState.vouchers, mergedDeletedIds),
    cashEntries: mergeArrayById(localState.cashEntries, cloudState.cashEntries, mergedDeletedIds),
    partners: mergeArrayById(localState.partners, cloudState.partners, mergedDeletedIds),
    escrowItems: mergeArrayById(localState.escrowItems, cloudState.escrowItems, mergedDeletedIds),
    products: mergeArrayById(localState.products, cloudState.products, mergedDeletedIds),

    // Giữ danh sách đã xóa hợp nhất
    deletedIds: mergedDeletedIds,

    // Timestamp của bản merge = max của 2 máy
    _lastModified: Math.max(cloudTs, localTs)
  };

  console.log(`[SmartMerge] Kết quả: ${merged.vouchers.length} vouchers, ${merged.cashEntries ? merged.cashEntries.length : 0} cashEntries, ${merged.partners.length} partners.`);
  return merged;
}

let isPushing = false;
let pushPending = false;
let _isMergePushing = false;
let pushRetryTimeout = null;

function areVouchersEqual(v1, v2) {
  if (v1 === v2) return true;
  if (!v1 || !v2) return false;
  if (v1.id !== v2.id) return false;
  if (v1.date !== v2.date) return false;
  if (v1.partnerId !== v2.partnerId) return false;
  if (v1.amount !== v2.amount) return false;
  if (v1.totalAmount !== v2.totalAmount) return false;
  if (v1.type !== v2.type) return false;
  if (v1.description !== v2.description) return false;
  if (v1.paymentMethod !== v2.paymentMethod) return false;
  if (v1.isManual !== v2.isManual) return false;
  if (v1.isImported !== v2.isImported) return false;
  if (v1.escrowRefId !== v2.escrowRefId) return false;
  
  const items1 = v1.items || [];
  const items2 = v2.items || [];
  if (items1.length !== items2.length) return false;
  for (let i = 0; i < items1.length; i++) {
    const it1 = items1[i];
    const it2 = items2[i];
    if (it1.productId !== it2.productId) return false;
    if (it1.qty !== it2.qty) return false;
    if (it1.price !== it2.price) return false;
    if (it1.amount !== it2.amount) return false;
    if (it1.cogsUnit !== it2.cogsUnit) return false;
    if (it1.cogsAmount !== it2.cogsAmount) return false;
  }

  const ent1 = v1.entries || [];
  const ent2 = v2.entries || [];
  if (ent1.length !== ent2.length) return false;
  for (let i = 0; i < ent1.length; i++) {
    const e1 = ent1[i];
    const e2 = ent2[i];
    if (e1.debit !== e2.debit) return false;
    if (e1.credit !== e2.credit) return false;
    if (e1.amount !== e2.amount) return false;
    if (e1.desc !== e2.desc) return false;
  }

  return true;
}

function areObjectsShallowEqual(o1, o2) {
  if (o1 === o2) return true;
  if (!o1 || !o2) return false;
  const keys = new Set([...Object.keys(o1), ...Object.keys(o2)]);
  for (const k of keys) {
    const v1 = o1[k];
    const v2 = o2[k];
    const isPrimitive1 = v1 !== Object(v1);
    const isPrimitive2 = v2 !== Object(v2);
    if (isPrimitive1 && isPrimitive2) {
      if (v1 !== v2) return false;
    } else if (isPrimitive1 !== isPrimitive2) {
      return false;
    } else if (Array.isArray(v1) && Array.isArray(v2)) {
      if (v1.length !== v2.length) return false;
      for (let i = 0; i < v1.length; i++) {
        if (v1[i] !== v2[i]) return false;
      }
    }
  }
  return true;
}

function areProductsEqual(p1, p2) {
  return areObjectsShallowEqual(p1, p2);
}

function arePartnersEqual(pa1, pa2) {
  return areObjectsShallowEqual(pa1, pa2);
}

function computeDelta() {
  const rowsToUpsert = [];
  const idsToDelete = [];

  const makeRow = (id, data) => ({
    id,
    data,
    last_modified: state._lastModified || Date.now(),
    is_syncing: false,
    updated_at: new Date().toISOString()
  });

  const forceFullSync = migrationPending || !lastSyncState;

  if (forceFullSync) {
    (state.vouchers || []).forEach(v => {
      if (v && v.id) rowsToUpsert.push(makeRow(`v_${v.id}`, v));
    });
    (state.products || []).forEach(p => {
      if (p && p.id) rowsToUpsert.push(makeRow(`p_${p.id}`, p));
    });
    (state.partners || []).forEach(part => {
      if (part && part.id) rowsToUpsert.push(makeRow(`part_${part.id}`, part));
    });
  } else {
    // 1. Vouchers
    const localVouchers = state.vouchers || [];
    const lastVouchersMap = new Map((lastSyncState.vouchers || []).filter(v => v && v.id).map(v => [v.id, v]));
    const localVouchersMap = new Map(localVouchers.filter(v => v && v.id).map(v => [v.id, v]));

    localVouchers.forEach(v => {
      if (v && v.id) {
        const oldV = lastVouchersMap.get(v.id);
        if (!oldV || !areVouchersEqual(oldV, v)) {
          rowsToUpsert.push(makeRow(`v_${v.id}`, v));
        }
      }
    });

    (lastSyncState.vouchers || []).forEach(v => {
      if (v && v.id && !localVouchersMap.has(v.id)) {
        idsToDelete.push(`v_${v.id}`);
      }
    });

    // 2. Products
    const localProducts = state.products || [];
    const lastProductsMap = new Map((lastSyncState.products || []).filter(p => p && p.id).map(p => [p.id, p]));
    const localProductsMap = new Map(localProducts.filter(p => p && p.id).map(p => [p.id, p]));

    localProducts.forEach(p => {
      if (p && p.id) {
        const oldP = lastProductsMap.get(p.id);
        if (!oldP || !areProductsEqual(oldP, p)) {
          p._updatedAt = Date.now(); // Set updated timestamp so other machines overwrite
          rowsToUpsert.push(makeRow(`p_${p.id}`, p));
        }
      }
    });

    (lastSyncState.products || []).forEach(p => {
      if (p && p.id && !localProductsMap.has(p.id)) {
        idsToDelete.push(`p_${p.id}`);
      }
    });

    // 3. Partners
    const localPartners = state.partners || [];
    const lastPartnersMap = new Map((lastSyncState.partners || []).filter(part => part && part.id).map(part => [part.id, part]));
    const localPartnersMap = new Map(localPartners.filter(part => part && part.id).map(part => [part.id, part]));

    localPartners.forEach(part => {
      if (part && part.id) {
        const oldPart = lastPartnersMap.get(part.id);
        if (!oldPart || !arePartnersEqual(oldPart, part)) {
          part._updatedAt = Date.now(); // Set updated timestamp so other machines overwrite
          rowsToUpsert.push(makeRow(`part_${part.id}`, part));
        }
      }
    });

    (lastSyncState.partners || []).forEach(part => {
      if (part && part.id && !localPartnersMap.has(part.id)) {
        idsToDelete.push(`part_${part.id}`);
      }
    });
  }

  return { rowsToUpsert, idsToDelete };
}

async function pushToCloud() {
  if (!cloudSyncActive || !supabaseClient) return;
  if (!isStartupPullCompleted) {
    console.log("[CloudSync] Bỏ qua pushToCloud vì quá trình startup pull chưa hoàn tất.");
    return;
  }
  if (isPushing) {
    pushPending = true;
    return;
  }
  isPushing = true;
  pushPending = false;
  _isMergePushing = true;

  if (typeof updateCloudSyncBadge === "function") {
    updateCloudSyncBadge(false, "Mây: Đang đẩy...", "#f59e0b");
  }

  try {
    if (!state._lastModified) {
      state._lastModified = Date.now();
    }

    const { products, partners, vouchers, ...metadata } = state;
    metadata.lastModifiedBy = clientSessionId;

    // 1. Đẩy cờ is_syncing = true lên metadata trước
    await supabaseClient
      .from("rd_accounting_data")
      .upsert({
        id: "metadata",
        data: metadata,
        last_modified: state._lastModified,
        is_syncing: true,
        updated_at: new Date().toISOString()
      });

    // 2. Tính toán Delta
    const { rowsToUpsert: rawRowsToUpsert, idsToDelete: rawIdsToDelete } = computeDelta();
    
    // Khử trùng lặp ID để tránh lỗi: ON CONFLICT DO UPDATE command cannot affect row a second time
    const rowsToUpsert = [];
    const seenUpsertIds = new Set();
    for (const r of rawRowsToUpsert) {
      if (r && r.id && !seenUpsertIds.has(r.id)) {
        seenUpsertIds.add(r.id);
        rowsToUpsert.push(r);
      }
    }
    
    const idsToDelete = Array.from(new Set(rawIdsToDelete));

    console.log(`[pushToCloud] Delta: Cần upsert ${rowsToUpsert.length} dòng, delete ${idsToDelete.length} dòng.`);

    // 3. Upsert các dòng mới/thay đổi theo lô 1000 dòng
    const BATCH_SIZE = 1000;
    for (let i = 0; i < rowsToUpsert.length; i += BATCH_SIZE) {
      const batch = rowsToUpsert.slice(i, i + BATCH_SIZE);
      const { error: batchError } = await supabaseClient
        .from("rd_accounting_data")
        .upsert(batch);
      if (batchError) throw batchError;
    }

    // 4. Thực hiện xóa các dòng bị loại bỏ theo lô 1000 dòng
    if (idsToDelete.length > 0) {
      for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const batch = idsToDelete.slice(i, i + BATCH_SIZE);
        const { error: deleteError } = await supabaseClient
          .from("rd_accounting_data")
          .delete()
          .in("id", batch);
        if (deleteError) throw deleteError;
      }
    }

    // 5. Nếu có di chuyển cấu trúc cũ (migrationPending) thì xóa các chunk cũ
    if (migrationPending && foundOldChunkIds.length > 0) {
      console.log(`[Migration] Đang dọn dẹp các chunk cũ khỏi Supabase:`, foundOldChunkIds);
      const { error: deleteOldError } = await supabaseClient
        .from("rd_accounting_data")
        .delete()
        .in("id", foundOldChunkIds);
      if (deleteOldError) {
        console.error("Lỗi khi dọn dẹp chunk cũ:", deleteOldError);
      } else {
        migrationPending = false;
        foundOldChunkIds = [];
      }
    }

    // 6. Cập nhật cờ is_syncing = false lên metadata cuối cùng
    const { error: finalError } = await supabaseClient
      .from("rd_accounting_data")
      .upsert({
        id: "metadata",
        data: metadata,
        last_modified: state._lastModified,
        is_syncing: false,
        updated_at: new Date().toISOString()
      });

    if (finalError) throw finalError;

    // Cập nhật mốc so sánh (KHÔNG cập nhật lastSyncedCloudTs ở đây vì push không có nghĩa là
    // ta đã nhận dữ liệu từ cloud — các máy khác có thể có rows với timestamp CŨ HƠN push của ta
    // mà ta chưa từng pull về. lastSyncedCloudTs chỉ tăng khi ta PULL thành công.)
    updateLastSyncState(state);

    console.log("Đã đồng bộ hóa state lên Supabase thành công theo dòng delta!");
    if (pushRetryTimeout) {
      clearTimeout(pushRetryTimeout);
      pushRetryTimeout = null;
    }
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    }
  } catch (err) {
    console.error("Lỗi khi đồng bộ dữ liệu lên đám mây:", err);
    if (typeof addErrorLog === "function") {
      addErrorLog("pushToCloud", err.message, err);
    }
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(false, "Mây: Lỗi đẩy", "#ef4444");
    }
    if (pushRetryTimeout) {
      clearTimeout(pushRetryTimeout);
    }
    pushRetryTimeout = setTimeout(() => {
      if (cloudSyncActive && supabaseClient && !isPushing) {
        console.log("[CloudSync] Thử lại push sau lỗi...");
        pushPending = false;
        pushToCloud();
      }
    }, 5000);
  } finally {
    isPushing = false;
    _isMergePushing = false;
    if (pushPending) {
      pushPending = false;
      setTimeout(() => pushToCloud(), 100);
    }
  }
}

async function pullAndMergeFromCloud() {
  if (!cloudSyncActive || !supabaseClient) return;

  try {
    const result = await fetchCloudData(lastSyncedCloudTs);
    if (!result) {
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
      return; // không có gì mới
    }
    const { newState: cloudData, rescuedVouchers } = result;
    if (cloudData) {
      const cloudTs = cloudData._lastModified || 0;
      const localTs = state._lastModified || 0;
      if (cloudTs > 0 && localTs > 0 && cloudTs === localTs) {
        console.log("[Supabase] Trùng timestamp, không cần tải lại.");
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
        return;
      }

      console.log("[Supabase] Nhận được thay đổi mới từ cloud, đang tải về và merge...");

      // QUAN TRỌNG: Không ghi đè thẳng state = cloudData vì sẽ mất các chứng từ
      // mới tạo chưa kịp push lên cloud (do saveState có 2s debounce).
      // Thay vào đó, dùng mergeStates() để gộp an toàn.
      const mergedState = mergeStates(state, cloudData);
      state = mergedState;
      updateLastSyncState(state);
      lastSyncedCloudTs = cloudData._lastModified || 0;

      // Ghi cache cục bộ
      try {
        localStorage.setItem("rd_accounting_online_cache", JSON.stringify(state));
      } catch (cacheErr) {
        console.error("[Cache] Lỗi ghi cache cục bộ:", cacheErr);
      }

      // Giải quyết xung đột ID nếu có
      if (rescuedVouchers.length > 0) {
        setTimeout(() => resolveConflictedVouchers(rescuedVouchers), 500);
      }

      if (typeof recalculateAccounting === "function") recalculateAccounting(false);
      if (typeof filterDebts === "function") filterDebts();
      if (typeof filterPartners === "function") filterPartners();
      if (typeof filterCash === "function") filterCash();
      if (typeof initExcelIntegration === "function") initExcelIntegration();
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    } else {
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    }
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("pullAndMergeFromCloud", err.message, err);
    }
    updateCloudSyncBadge(false, "Mây: Lỗi kết nối", "#ef4444");
  }
}

function listenToCloudChanges() {
  if (!cloudSyncActive || !supabaseClient) return;

  // Đóng kênh cũ nếu có
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel("rd-accounting-changes")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rd_accounting_data",
        filter: "id=eq.metadata"
      },
      (payload) => {
        // Bỏ qua event do chính lần push merge của máy này gây ra
        if (_isMergePushing) return;

        const row = payload.new;
        if (!row) return;

        // Bỏ qua nếu là cập nhật do chính máy này gửi lên
        if (row.data && row.data.lastModifiedBy === clientSessionId) {
          return;
        }

        // Bỏ qua nếu máy trạm khác đang đẩy dữ liệu (tránh đọc dữ liệu dở dang)
        if (row.is_syncing) return;

        const cloudTs = row.last_modified || 0;
        const localTs = state._lastModified || 0;
        const CLOCK_TOLERANCE_MS = 2000; // 2 giây dung sai đồng hồ giữa các máy
        if (cloudTs > 0 && localTs > 0 && cloudTs < localTs - CLOCK_TOLERANCE_MS) {
          // Cloud thực sự cũ hơn local rõ ràng (cách nhau > 2s), bỏ qua
          return;
        }

        // Kéo toàn bộ dữ liệu mới từ cloud về để merge
        pullAndMergeFromCloud();
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[Supabase Realtime] Đã đăng ký lắng nghe thay đổi thành công!");
      } else if (status === "CHANNEL_ERROR") {
        console.error("[Supabase Realtime] Lỗi kênh realtime!");
        updateCloudSyncBadge(false, "Mây: Lỗi realtime", "#ef4444");
      }
    });
}

function updateCloudSyncBadge(connected, text, color = "#64748b") {
  const badge = document.getElementById("cloud-sync-badge");
  const indicator = document.getElementById("cloud-sync-indicator");
  const textEl = document.getElementById("cloud-sync-status-text");

  if (badge && indicator && textEl) {
    textEl.innerText = text;
    textEl.style.color = color;
    indicator.style.backgroundColor = color;

    if (connected) {
      indicator.classList.add("pulse-indicator");
    } else {
      indicator.classList.remove("pulse-indicator");
    }

    const refreshIcon = document.getElementById("cloud-sync-refresh-icon");
    if (refreshIcon) {
      if (text.includes("Đang tải") || text.includes("Tải dữ liệu") || text.includes("Quét danh sách") || text.includes("Đang đẩy")) {
        refreshIcon.classList.add("spinning");
      } else {
        refreshIcon.classList.remove("spinning");
      }
    }
  }
}
window.initCloudSync = initCloudSync;
window.forcePullFromCloud = forcePullFromCloud;
window.manualIncrementalSync = manualIncrementalSync;
window.updateCloudSyncBadge = updateCloudSyncBadge;