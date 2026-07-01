// ==========================================================================
// HỆ THỐNG ĐỒNG BỘ CƠ SỞ DỮ LIỆU ĐÁM MÂY (SUPABASE CLOUD DATABASE SYNC)
// ==========================================================================

let supabaseClient = null;
let cloudSyncActive = false;
let isStartupPullCompleted = false;
let realtimeChannel = null;
let lastSyncState = window.lastSyncState || null;
let isPulling = false;
let pullPending = false;
let deferredCloudPull = false;
let deferredCloudPullReason = "";
const LAST_PULLED_CLOUD_TS_KEY = "rd_accounting_last_pulled_cloud_ts";

function getStoredLastPulledCloudTs() {
  try {
    const raw = localStorage.getItem(LAST_PULLED_CLOUD_TS_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (err) {
    return 0;
  }
}

function persistLastPulledCloudTs(ts) {
  const safeTs = Number(ts) || 0;
  lastSyncedCloudTs = safeTs;
  try {
    if (safeTs > 0) {
      localStorage.setItem(LAST_PULLED_CLOUD_TS_KEY, String(safeTs));
    } else {
      localStorage.removeItem(LAST_PULLED_CLOUD_TS_KEY);
    }
  } catch (err) {
    console.warn("[CloudSync] Khong the luu checkpoint pull cloud:", err);
  }
}

function getPullCheckpointTs() {
  const storedTs = getStoredLastPulledCloudTs();
  if (storedTs > 0) {
    lastSyncedCloudTs = storedTs;
    return storedTs;
  }
  return Number(lastSyncedCloudTs) || 0;
}

function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  return el.style.display === "flex" || el.style.display === "block" || (style && (style.display === "flex" || style.display === "block"));
}

function isVoucherEntryModalOpen() {
  const entryModalIds = [
    "modal-add-sales",
    "modal-add-purchase",
    "modal-add-purchase-order",
    "modal-add-purchase-return",
    "modal-add-sales-return",
    "modal-add-sales-quotation",
    "modal-add-receipt",
    "modal-add-payment",
    "modal-add-escrow",
    "modal-edit-debt"
  ];
  return entryModalIds.some(id => isElementVisible(document.getElementById(id)));
}

function deferCloudPull(reason) {
  deferredCloudPull = true;
  deferredCloudPullReason = reason || "editing";
  if (typeof updateCloudSyncBadge === "function") {
    updateCloudSyncBadge(false, "May: Cho luu phieu de dong bo", "#f59e0b");
  }
}

function scheduleCloudPull(reason) {
  if (isVoucherEntryModalOpen()) {
    deferCloudPull(reason);
    return;
  }
  pullAndMergeFromCloud();
}

async function flushDeferredCloudSync() {
  if (!deferredCloudPull || isVoucherEntryModalOpen()) return;
  deferredCloudPull = false;
  const reason = deferredCloudPullReason;
  deferredCloudPullReason = "";
  console.log(`[CloudSync] Thuc hien pull bi hoan sau khi ket thuc nhap lieu (${reason}).`);
  await pullAndMergeFromCloud({ force: true });
}

function updateLastSyncState(newState) {
  if (!newState) {
    lastSyncState = null;
    window.lastSyncState = null;
    try {
      localStorage.removeItem("rd_accounting_last_sync_cache");
    } catch (e) {}
    return;
  }
  lastSyncState = JSON.parse(JSON.stringify(newState));
  window.lastSyncState = lastSyncState;
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

    if (page >= MAX_PAGES) {
      throw new Error("Cloud full pull reached pagination safety limit; refusing to use partial data.");
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

  if (page >= MAX_PAGES) {
    throw new Error("Cloud incremental pull reached pagination safety limit; refusing to advance checkpoint with partial data.");
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
  // Sync local variable with shared window state to prevent empty state overrides
  lastSyncState = window.lastSyncState || lastSyncState;
  
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
        // Kiểm tra xem voucher này có trong danh sách đã xóa cục bộ không.
        // CHỈ khôi phục (xóa khỏi deletedIds) nếu bản ghi cloud mới hơn timestamp
        // của state cục bộ tại thời điểm xóa — tức là máy khác đã tạo lại sau khi xóa.
        // Không tự động khôi phục chỉ vì cloud vẫn còn bản ghi (đó là tình huống delete chưa sync).
        if (Array.isArray(baseState.deletedIds) && baseState.deletedIds.includes(cloudVoucher.id)) {
          const localStateTs = (baseState._lastModified || 0);
          const cloudItemTs = cloudVoucher._updatedAt || cloudTs;
          if (cloudItemTs > localStateTs) {
            // Cloud có bản ghi MỚI HƠN local state → máy khác đã tạo lại sau khi xóa → khôi phục
            baseState.deletedIds = baseState.deletedIds.filter(id => id !== cloudVoucher.id);
            if (Array.isArray(baseState.deletedCloudKeys)) {
              baseState.deletedCloudKeys = baseState.deletedCloudKeys.filter(k => k !== `v_${cloudVoucher.id}`);
            }
            console.log(`[applyDelta] Voucher ${cloudVoucher.id} được khôi phục từ cloud (cloud mới hơn local: ${cloudItemTs} > ${localStateTs}).`);
          } else {
            // Cloud có bản cũ chưa bị xóa → bỏ qua (deletion của local sẽ được push lên cloud)
            console.log(`[applyDelta] Bỏ qua voucher ${cloudVoucher.id} từ cloud: đã bị xóa cục bộ và cloud không có bản mới hơn.`);
            return;
          }
        }
        const idx = voucherIndexMap.has(cloudVoucher.id) ? voucherIndexMap.get(cloudVoucher.id) : -1;
        if (idx !== -1) {
          const localVoucher = baseState.vouchers[idx];
          // === PHÁT HIỆN XUNG ĐỘT ID SONG SONG ===
          const wasNeverSynced = !lastSyncState ||
                                 !Array.isArray(lastSyncState.vouchers) ||
                                 !lastSyncState.vouchers.some(v => v && v.id === localVoucher.id);
          if (
            localVoucher &&
            localVoucher._sessionId &&
            cloudVoucher._sessionId &&
            localVoucher._sessionId !== cloudVoucher._sessionId &&
            wasNeverSynced
          ) {
            console.warn(`[ConflictDetect] Xung đột ID "${cloudVoucher.id}": máy này và máy khác cùng tạo. Đang cứu bản cục bộ...`);
            rescuedVouchers.push({ ...localVoucher });
          }
          // Cloud thắng chỉ khi cloud mới hơn (hoặc bằng timestamp)
          const localTs2 = localVoucher._updatedAt || 0;
          const cloudTs2 = cloudVoucher._updatedAt || cloudTs;
          if (cloudTs2 >= localTs2) {
            baseState.vouchers[idx] = cloudVoucher;
          }
        } else {
          baseState.vouchers.push(cloudVoucher);
          voucherIndexMap.set(cloudVoucher.id, baseState.vouchers.length - 1);
        }
      }
    } else if (row.id.startsWith("p_")) {
      const product = row.data;
      if (product && product.id) {
        if (Array.isArray(baseState.deletedIds) && baseState.deletedIds.includes(product.id)) {
          const localStateTs = (baseState._lastModified || 0);
          const cloudItemTs = product._updatedAt || cloudTs;
          if (cloudItemTs > localStateTs) {
            baseState.deletedIds = baseState.deletedIds.filter(id => id !== product.id);
            if (Array.isArray(baseState.deletedCloudKeys)) {
              baseState.deletedCloudKeys = baseState.deletedCloudKeys.filter(k => k !== `p_${product.id}`);
            }
          } else {
            return; // bỏ qua - deletion local chưa kịp sync lên cloud
          }
        }
        const idx = productIndexMap.has(product.id) ? productIndexMap.get(product.id) : -1;
        if (idx !== -1) {
          const localProd = baseState.products[idx];
          const localTs2 = localProd._updatedAt || 0;
          const cloudTs2 = product._updatedAt || cloudTs;
          if (cloudTs2 >= localTs2) baseState.products[idx] = product;
        } else {
          baseState.products.push(product);
          productIndexMap.set(product.id, baseState.products.length - 1);
        }
      }
    } else if (row.id.startsWith("part_")) {
      const partner = row.data;
      if (partner && partner.id) {
        if (Array.isArray(baseState.deletedIds) && baseState.deletedIds.includes(partner.id)) {
          const localStateTs = (baseState._lastModified || 0);
          const cloudItemTs = partner._updatedAt || cloudTs;
          if (cloudItemTs > localStateTs) {
            baseState.deletedIds = baseState.deletedIds.filter(id => id !== partner.id);
            if (Array.isArray(baseState.deletedCloudKeys)) {
              baseState.deletedCloudKeys = baseState.deletedCloudKeys.filter(k => k !== `part_${partner.id}`);
            }
          } else {
            return; // bỏ qua - deletion local chưa kịp sync lên cloud
          }
        }
        const idx = partnerIndexMap.has(partner.id) ? partnerIndexMap.get(partner.id) : -1;
        if (idx !== -1) {
          const localPart = baseState.partners[idx];
          const localTs2 = localPart._updatedAt || 0;
          const cloudTs2 = partner._updatedAt || cloudTs;
          if (cloudTs2 >= localTs2) baseState.partners[idx] = partner;
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
    // === TỐI ƯU HÓA KHỞI ĐỘNG: Kiểm tra metadata trước để tránh tải dữ liệu không cần thiết ===
    // Lấy timestamp của cloud từ bản ghi metadata (chỉ 1 row, cực nhanh)
    const localTs = getPullCheckpointTs();

    if (localTs > 0) {
      // Đã có cache cục bộ → Kiểm tra nhanh xem cloud có gì mới hơn không
      const { data: metaCheck, error: metaErr } = await supabaseClient
        .from("rd_accounting_data")
        .select("last_modified, is_syncing")
        .eq("id", "metadata")
        .single();

      if (!metaErr && metaCheck) {
        const cloudTs = metaCheck.last_modified || 0;

        // CHỐNG ĐỒNG BỘ NGƯỢC: Nếu local MỚI HƠN cloud, bỏ qua pull hoàn toàn
        // (Tình huống: máy vừa push, hoặc cloud chứa dữ liệu cũ hơn)
        if (cloudTs <= localTs) {
          console.log(`[Startup] Dữ liệu cục bộ đã mới nhất hoặc mới hơn cloud. (Local: ${localTs}, Cloud: ${cloudTs}) → Bỏ qua tải về.`);
          logToDebugFile(`[pullFromCloudOnStartup] Bỏ qua pull: local (${localTs}) >= cloud (${cloudTs})`);
          updateLastSyncState(state);
          persistLastPulledCloudTs(localTs);
          if (typeof rescueLocalOnlyItems === "function") {
            await rescueLocalOnlyItems();
          }
          isStartupPullCompleted = true;
          if (typeof recalculateAccounting === "function") recalculateAccounting(false);
          if (typeof filterDebts === "function") filterDebts();
          if (typeof filterPartners === "function") filterPartners();
          if (typeof filterCash === "function") filterCash();
          updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
          console.log("[CloudSync] Khởi chạy hoàn tất (dữ liệu local đã mới nhất). Đã bật quyền pushToCloud.");
          return;
        }

        // Nếu máy khác đang trong quá trình push (is_syncing = true), chờ 3 giây rồi thử lại
        if (metaCheck.is_syncing) {
          console.log("[Startup] Máy khác đang đồng bộ (is_syncing=true), chờ 3 giây...");
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        logToDebugFile(`[pullFromCloudOnStartup] Cloud mới hơn local (${cloudTs} > ${localTs}). Tiến hành tải incremental.`);
      }
    }

    // Tải dữ liệu thay đổi (incremental) kể từ lần đồng bộ cuối cùng của cache cục bộ.
    // Nếu chưa có cache cục bộ (localTs = 0), sẽ tự động thực hiện full pull.
    const result = await fetchCloudData(localTs);
    if (!result) {
      // fetchCloudData trả về null → dữ liệu đã mới nhất (cloudTs <= localTs)
      updateLastSyncState(state);
      persistLastPulledCloudTs(localTs);
      if (typeof rescueLocalOnlyItems === "function") {
        await rescueLocalOnlyItems();
      }
      isStartupPullCompleted = true;
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
      console.log("[CloudSync] Khởi chạy hoàn tất (không cần tải thêm). Đã bật quyền pushToCloud.");
      return;
    }
    const { newState: cloudData, rescuedVouchers } = result;
    const hasCloudProducts = cloudData && cloudData.products && cloudData.products.length > 0;

    if (cloudData && hasCloudProducts) {
      const cloudVoucherCount = (cloudData.vouchers || []).length;
      state = cloudData;
      updateLastSyncState(state);
      persistLastPulledCloudTs(state._lastModified || 0);
      console.log(`[Supabase] Tải dữ liệu đám mây thành công! (${cloudVoucherCount} chứng từ)`);

      // Ghi cache cục bộ
      try {
        const saveFn = typeof saveStateSync === "function" ? saveStateSync : (typeof window.saveStateSync === "function" ? window.saveStateSync : null);
        if (saveFn) {
          saveFn();
        } else {
          localStorage.setItem("rd_accounting_online_cache", JSON.stringify(state));
        }
      } catch (cacheErr) {
        console.error("[Cache] Lỗi ghi cache cục bộ:", cacheErr);
      }

      // Thực hiện dọn dẹp các đơn hàng có ID dạng số tự sinh
      cleanNumericVouchers();

      // Nếu cleanNumericVouchers đã dọn dẹp voucher rác/test → đẩy ngay lên cloud
      const stateVoucherCount = (state.vouchers || []).length;
      if (stateVoucherCount < cloudVoucherCount) {
        console.log(`[Supabase] Đã dọn dẹp ${cloudVoucherCount - stateVoucherCount} chứng từ rác/test cũ → cập nhật lên cloud...`);
        setTimeout(() => {
          state._lastModified = Date.now();
          pushToCloud().then(() => {
            showToast(`Đã tự động dọn dẹp ${cloudVoucherCount - stateVoucherCount} chứng từ rác/test cũ lúc khởi động!`, "success");
          }).catch(err => console.error("[Supabase] Lỗi tự sửa rác:", err));
        }, 3000);
      } else if (migrationPending) {
        console.log("[Migration] Kích hoạt tự động đẩy dữ liệu sang định dạng mới...");
        setTimeout(() => {
          pushToCloud().then(() => {
            showToast("Đã tự động chuyển đổi cấu trúc dữ liệu sang dòng đơn lẻ!", "success");
          }).catch(err => console.error("[Migration] Lỗi tự động chuyển đổi cấu trúc:", err));
        }, 5000);
      }

      if (rescuedVouchers.length > 0) {
        setTimeout(() => resolveConflictedVouchers(rescuedVouchers), 2000);
      }

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
      persistLastPulledCloudTs(state._lastModified || 0);
      recalculateAccounting(false);
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    }
    if (typeof rescueLocalOnlyItems === "function") {
      await rescueLocalOnlyItems();
    }
    isStartupPullCompleted = true;
    console.log("[CloudSync] Khởi chạy hoàn tất. Đã bật quyền pushToCloud.");
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("pullFromCloudOnStartup", err.message, err);
    }
    showToast("Không thể tải dữ liệu đám mây khi khởi động. Hãy kiểm tra Internet hoặc máy chủ.", "danger");
    updateCloudSyncBadge(false, "Mây: Lỗi kết nối", "#ef4444");
    // Vẫn bật isStartupPullCompleted để cho phép push hoạt động (dùng dữ liệu local)
    isStartupPullCompleted = true;
  }
}

function forcePushToCloud() {
  if (!cloudSyncActive || !supabaseClient) {
    showToast("Ứng dụng chưa kết nối đám mây!", "danger");
    return;
  }

  if (isVoucherEntryModalOpen()) {
    showToast("Hay luu hoac dong phieu dang nhap truoc khi day du lieu len cloud.", "warning");
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

  if (isVoucherEntryModalOpen()) {
    deferCloudPull("manual-force-pull");
    showToast("Dang co phieu mo. Hay luu hoac dong phieu truoc khi tai lai cloud.", "warning");
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
        persistLastPulledCloudTs(state._lastModified || 0);
        
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
 * Ghi nhận các ID vừa bị xóa vào state.deletedIds (raw ID) VÀ
 * state.deletedCloudKeys (prefixed cloud row ID như v_NK001, part_NCC01, p_SP001).
 * @param {string[]} ids - Mảng các ID raw cần xóa
 * @param {'voucher'|'product'|'partner'|'cashEntry'|'escrowItem'} entityType - Loại thực thể
 */
function trackDeletedIds(ids, entityType = 'voucher') {
  if (!ids || ids.length === 0) return;
  const prefix = entityType === 'product' ? 'p_'
               : entityType === 'partner' ? 'part_'
               : entityType === 'cashEntry' ? 'cash_'
               : entityType === 'escrowItem' ? 'escrow_'
               : 'v_'; // voucher (mặc định)

  if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
  if (!Array.isArray(state.deletedCloudKeys)) state.deletedCloudKeys = [];

  const now = Date.now();
  ids.forEach(id => {
    if (!state.deletedIds.includes(id)) {
      state.deletedIds.push(id);
    }
    const cloudKey = `${prefix}${id}`;
    if (!state.deletedCloudKeys.includes(cloudKey)) {
      state.deletedCloudKeys.push(cloudKey);
    }
  });

  state._lastModified = now;

  if (typeof logUserAction === "function") {
    const typeLabel = entityType === 'product' ? 'vật tư hàng hóa'
                    : entityType === 'partner' ? 'đối tác'
                    : entityType === 'cashEntry' ? 'phiếu thu/chi'
                    : entityType === 'escrowItem' ? 'khoản ký quỹ'
                    : 'chứng từ';
    logUserAction(`Xóa ${typeLabel}`, `Đã xóa danh sách ${typeLabel} ID: ${ids.join(', ')}`);
  }
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
/**
 * Hợp nhất metadata (partnerOpeningBalances, initialBalances, scalar fields)
 * giữa local và cloud một cách thông minh, tránh đè mất các key được chỉnh sửa độc lập.
 */
function mergeMetadata(localMeta, cloudMeta, localTs, cloudTs) {
  const merged = { ...cloudMeta, ...localMeta }; // fallback mặc định

  // 1. Hợp nhất partnerOpeningBalances (số dư công nợ đầu kỳ đối tác)
  const localOP = localMeta.partnerOpeningBalances || {};
  const cloudOP = cloudMeta.partnerOpeningBalances || {};
  const mergedOP = { ...cloudOP };
  
  const allPartnerIds = new Set([...Object.keys(localOP), ...Object.keys(cloudOP)]);
  allPartnerIds.forEach(id => {
    const locVal = localOP[id];
    const cldVal = cloudOP[id];
    if (locVal && cldVal) {
      // Nếu khác nhau, bên nào có state timestamp mới hơn sẽ thắng
      if (JSON.stringify(locVal) !== JSON.stringify(cldVal)) {
        mergedOP[id] = localTs >= cloudTs ? locVal : cldVal;
      } else {
        mergedOP[id] = locVal;
      }
    } else if (locVal) {
      mergedOP[id] = locVal;
    } else if (cldVal) {
      mergedOP[id] = cldVal;
    }
  });
  merged.partnerOpeningBalances = mergedOP;

  // 2. Hợp nhất initialBalances (số dư đầu kỳ các tài khoản kế toán)
  const localIB = localMeta.initialBalances || {};
  const cloudIB = cloudMeta.initialBalances || {};
  const mergedIB = { ...cloudIB };
  
  const allAccountCodes = new Set([...Object.keys(localIB), ...Object.keys(cloudIB)]);
  allAccountCodes.forEach(code => {
    const locVal = localIB[code];
    const cldVal = cloudIB[code];
    if (locVal && cldVal) {
      if (JSON.stringify(locVal) !== JSON.stringify(cldVal)) {
        mergedIB[code] = localTs >= cloudTs ? locVal : cldVal;
      } else {
        mergedIB[code] = locVal;
      }
    } else if (locVal) {
      mergedIB[code] = locVal;
    } else if (cldVal) {
      mergedIB[code] = cldVal;
    }
  });
  merged.initialBalances = mergedIB;

  // 3. Hợp nhất các trường cấu hình đơn giản
  const scalarKeys = ['companyName', 'address', 'taxCode', 'accountingStandard'];
  scalarKeys.forEach(key => {
    if (localMeta[key] !== undefined && cloudMeta[key] !== undefined) {
      merged[key] = localTs >= cloudTs ? localMeta[key] : cloudMeta[key];
    }
  });

  return merged;
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

  // Tách metadata và các mảng thực thể
  const { vouchers: lV, cashEntries: lC, partners: lP, escrowItems: lE, products: lPr, ...localMeta } = localState;
  const { vouchers: cV, cashEntries: cC, partners: cP, escrowItems: cE, products: cPr, ...cloudMeta } = cloudState;

  // Gộp metadata một cách thông minh
  const mergedMeta = mergeMetadata(localMeta, cloudMeta, localTs, cloudTs);

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

  // === LỌC LƯỢT 2: So sánh nhãn thời gian hoạt động của các đối tượng để tránh xóa nhầm ID tái sử dụng ===
  const finalDeleted = new Set();
  const CLOCK_TOLERANCE = 2000; // 2 giây dung sai đồng hồ

  // Helper để tìm phần tử hoạt động trong một state theo ID
  function findActiveItem(s, id) {
    if (!s) return null;
    let found = null;
    if (Array.isArray(s.vouchers)) found = s.vouchers.find(v => v && v.id === id);
    if (!found && Array.isArray(s.products)) found = s.products.find(p => p && p.id === id);
    if (!found && Array.isArray(s.partners)) found = s.partners.find(pt => pt && pt.id === id);
    if (!found && Array.isArray(s.cashEntries)) found = s.cashEntries.find(c => c && c.id === id);
    if (!found && Array.isArray(s.escrowItems)) found = s.escrowItems.find(e => e && e.id === id);
    return found;
  }

  // Lọc localDeleted: Máy này đã xóa trước đó, nhưng máy khác có bản hoạt động mới hơn bản lưu của máy này
  localDeleted.forEach(id => {
    const cloudItem = findActiveItem(cloudState, id);
    if (cloudItem) {
      const itemTs = cloudItem._updatedAt || cloudTs;
      if (itemTs > localTs - CLOCK_TOLERANCE) {
        console.log(`[SmartMerge] Bỏ qua local deletion của ID "${id}" vì có đối tượng cloud mới hơn (${itemTs} vs local state ${localTs})`);
        return; // Bỏ qua deletion
      }
    }
    finalDeleted.add(id);
  });

  // Lọc cloudDeleted: Máy khác đã xóa trước đó, nhưng máy này có bản hoạt động mới hơn bản lưu của cloud
  cloudDeleted.forEach(id => {
    const localItem = findActiveItem(localState, id);
    if (localItem) {
      const itemTs = localItem._updatedAt || localTs;
      if (itemTs > cloudTs - CLOCK_TOLERANCE) {
        console.log(`[SmartMerge] Bỏ qua cloud deletion của ID "${id}" vì có đối tượng local mới hơn (${itemTs} vs cloud state ${cloudTs})`);
        return; // Bỏ qua deletion
      }
    }
    finalDeleted.add(id);
  });

  const mergedDeletedIds = Array.from(finalDeleted);

  const merged = {
    ...mergedMeta,

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

function stableStringifyForSync(value) {
  if (value === undefined) return "__undefined__";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringifyForSync).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringifyForSync(value[key])}`).join(",")}}`;
}

function areObjectsDeepEqual(o1, o2) {
  return stableStringifyForSync(o1) === stableStringifyForSync(o2);
}

function areVouchersEqual(v1, v2) {
  return areObjectsDeepEqual(v1, v2);
}

function areProductsEqual(p1, p2) {
  return areObjectsDeepEqual(p1, p2);
}

function arePartnersEqual(pa1, pa2) {
  return areObjectsDeepEqual(pa1, pa2);
}

function computeDelta() {
  // Sync local variable with shared window state to prevent empty state overrides
  lastSyncState = window.lastSyncState || lastSyncState;

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
    // Khi không có lastSyncState: dùng _updatedAt để chỉ push các item
    // thực sự thay đổi kể từ lần đồng bộ thành công cuối cùng (lastSyncedCloudTs).
    // Nếu lastSyncedCloudTs = 0 (lần đầu tiên), push toàn bộ.
    const threshold = (typeof lastSyncedCloudTs !== 'undefined') ? (lastSyncedCloudTs || 0) : 0;
    const pushAll = threshold === 0 || migrationPending;
    (state.vouchers || []).forEach(v => {
      if (v && v.id) {
        // Push nếu không có threshold, hoặc item được cập nhật sau threshold,
        // hoặc item chưa có _updatedAt (legacy data chưa từng sync)
        if (pushAll || !v._updatedAt || v._updatedAt >= threshold) {
          rowsToUpsert.push(makeRow(`v_${v.id}`, v));
        }
      }
    });
    (state.products || []).forEach(p => {
      if (p && p.id) {
        if (pushAll || !p._updatedAt || p._updatedAt >= threshold) {
          rowsToUpsert.push(makeRow(`p_${p.id}`, p));
        }
      }
    });
    (state.partners || []).forEach(part => {
      if (part && part.id) {
        if (pushAll || !part._updatedAt || part._updatedAt >= threshold) {
          rowsToUpsert.push(makeRow(`part_${part.id}`, part));
        }
      }
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

  // === DELETION PUSH: Ưu tiên dùng deletedCloudKeys (có prefix chính xác);
  // fallback sang deletedIds (chỉ push prefix voucher v_) nếu dữ liệu cũ chưa có deletedCloudKeys.
  if (Array.isArray(state.deletedCloudKeys) && state.deletedCloudKeys.length > 0) {
    state.deletedCloudKeys.forEach(cloudKey => {
      if (cloudKey && !idsToDelete.includes(cloudKey)) {
        idsToDelete.push(cloudKey);
      }
    });
  } else if (Array.isArray(state.deletedIds) && state.deletedIds.length > 0) {
    // Dữ liệu cũ: chỉ có deletedIds không có prefix → giả định là voucher
    state.deletedIds.forEach(id => {
      if (id) {
        const vKey = `v_${id}`;
        if (!idsToDelete.includes(vKey)) idsToDelete.push(vKey);
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

    const { products, partners, vouchers, ...localMeta } = state;
    localMeta.lastModifiedBy = clientSessionId;

    // Lấy metadata hiện tại trên cloud để gộp tránh ghi đè các thay đổi song song
    let finalMetadata = localMeta;
    try {
      const { data: cloudMetaRow, error: cloudMetaErr } = await supabaseClient
        .from("rd_accounting_data")
        .select("data, last_modified")
        .eq("id", "metadata")
        .single();
      
      if (!cloudMetaErr && cloudMetaRow && cloudMetaRow.data) {
        const cloudMeta = cloudMetaRow.data;
        const cloudTs = cloudMetaRow.last_modified || 0;
        const localTs = state._lastModified || Date.now();
        finalMetadata = mergeMetadata(localMeta, cloudMeta, localTs, cloudTs);
        
        // Cập nhật lại vào state cục bộ để đồng nhất và ghi vào SQLite
        if (finalMetadata.partnerOpeningBalances) {
          state.partnerOpeningBalances = finalMetadata.partnerOpeningBalances;
        }
        if (finalMetadata.initialBalances) {
          state.initialBalances = finalMetadata.initialBalances;
        }
        ['companyName', 'address', 'taxCode', 'accountingStandard'].forEach(key => {
          if (finalMetadata[key] !== undefined) state[key] = finalMetadata[key];
        });
      }
    } catch (metaFetchErr) {
      console.warn("[pushToCloud] Không thể đọc/gộp metadata từ cloud, sẽ ghi đè trực tiếp:", metaFetchErr);
    }

    // 1. Đẩy cờ is_syncing = true lên metadata trước
    await supabaseClient
      .from("rd_accounting_data")
      .upsert({
        id: "metadata",
        data: finalMetadata,
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
    const BATCH_SIZE = 100;
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
        data: finalMetadata,
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

async function pullAndMergeFromCloud(options = {}) {
  if (!cloudSyncActive || !supabaseClient) return;

  if (!options.force && isVoucherEntryModalOpen()) {
    deferCloudPull(options.reason || "editing");
    return;
  }

  if (isPulling) {
    pullPending = true;
    return;
  }

  isPulling = true;
  pullPending = false;

  try {
    const checkpointTs = getPullCheckpointTs();
    const result = await fetchCloudData(checkpointTs);
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
        persistLastPulledCloudTs(cloudTs);
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
        return;
      }

      console.log("[Supabase] Nhận được thay đổi mới từ cloud, đang tải về và merge...");

      // QUAN TRỌNG: Không ghi đè thẳng state = cloudData vì sẽ mất các chứng từ
      // mới tạo chưa kịp push lên cloud (do saveState có 2s debounce).
      // Thay vào đó, dùng mergeStates() để gộp an toàn.
      const mergedState = mergeStates(state, cloudData);
      const newLastSyncState = mergeStates(lastSyncState || state, cloudData);
      state = mergedState;
      updateLastSyncState(newLastSyncState);
      persistLastPulledCloudTs(cloudData._lastModified || checkpointTs);

      // Ghi cache cục bộ (cập nhật SQLite cache qua Electron IPC)
      try {
        const saveFn = typeof saveStateSync === "function" ? saveStateSync : (typeof window.saveStateSync === "function" ? window.saveStateSync : null);
        if (saveFn) {
          saveFn();
        } else {
          localStorage.setItem("rd_accounting_online_cache", JSON.stringify(state));
        }
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
  } finally {
    isPulling = false;
    if (pullPending) {
      pullPending = false;
      setTimeout(() => {
        if (isVoucherEntryModalOpen()) {
          deferCloudPull("pending");
        } else {
          pullAndMergeFromCloud({ reason: "pending" });
        }
      }, 250);
    }
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
        const localTs = getPullCheckpointTs();
        const CLOCK_TOLERANCE_MS = 2000; // 2 giây dung sai đồng hồ giữa các máy
        if (cloudTs > 0 && localTs > 0 && cloudTs < localTs - CLOCK_TOLERANCE_MS) {
          // Cloud thực sự cũ hơn local rõ ràng (cách nhau > 2s), bỏ qua
          return;
        }

        // Kéo toàn bộ dữ liệu mới từ cloud về để merge
        scheduleCloudPull("realtime");
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

async function fetchExistingCloudIdsByKeysFromClient(client, keys) {
  const existing = new Set();
  const uniqueKeys = Array.from(new Set((keys || []).filter(Boolean)));
  const BATCH_SIZE = 200;

  for (let i = 0; i < uniqueKeys.length; i += BATCH_SIZE) {
    const batch = uniqueKeys.slice(i, i + BATCH_SIZE);
    const { data, error } = await client
      .from("rd_accounting_data")
      .select("id")
      .in("id", batch);

    if (error) throw error;
    (data || []).forEach(row => {
      if (row && row.id) existing.add(row.id);
    });
  }

  return existing;
}

async function fetchExistingCloudIdsByKeys(keys) {
  if (!supabaseClient) return new Set();
  return fetchExistingCloudIdsByKeysFromClient(supabaseClient, keys);
}

window.initCloudSync = initCloudSync;
window.forcePullFromCloud = forcePullFromCloud;
window.manualIncrementalSync = manualIncrementalSync;
window.updateCloudSyncBadge = updateCloudSyncBadge;
window.flushDeferredCloudSync = flushDeferredCloudSync;
window.isVoucherEntryModalOpen = isVoucherEntryModalOpen;
window.__syncInternals__ = {
  stableStringifyForSync,
  areVouchersEqual,
  areProductsEqual,
  arePartnersEqual,
  getStoredLastPulledCloudTs,
  persistLastPulledCloudTs,
  getPullCheckpointTs,
  isVoucherEntryModalOpen,
  fetchExistingCloudIdsByKeysFromClient
};

async function rescueLocalOnlyItems() {
  if (!cloudSyncActive || !supabaseClient) return;
  console.log("[Rescue] Đang quét tìm các chứng từ/vật tư/đối tác bị kẹt cục bộ chưa đẩy lên đám mây...");
  try {
    const localKeys = [
      ...(state.vouchers || []).filter(v => v && v.id).map(v => `v_${v.id}`),
      ...(state.products || []).filter(p => p && p.id).map(p => `p_${p.id}`),
      ...(state.partners || []).filter(pt => pt && pt.id).map(pt => `part_${pt.id}`)
    ];
    const cloudIds = await fetchExistingCloudIdsByKeys(localKeys);

    /* obsolete unpaginated rescue query removed
      console.error("[Rescue] Lỗi tải ID từ đám mây:", error);
      return;
    */

    // Cloud IDs are fetched by exact local keys above to avoid unpaginated full-table reads.
    let changed = false;

    // Vouchers
    (state.vouchers || []).forEach(v => {
      if (v && v.id) {
        const cloudKey = `v_${v.id}`;
        if (!cloudIds.has(cloudKey)) {
          v._updatedAt = Date.now();
          console.warn(`[Rescue] Phát hiện chứng từ chỉ có cục bộ (chưa có trên mây): ${v.id}. Đang đánh dấu để đẩy lên...`);
          changed = true;
          if (lastSyncState && Array.isArray(lastSyncState.vouchers)) {
            lastSyncState.vouchers = lastSyncState.vouchers.filter(x => x.id !== v.id);
          }
        }
      }
    });

    // Products
    (state.products || []).forEach(p => {
      if (p && p.id) {
        const cloudKey = `p_${p.id}`;
        if (!cloudIds.has(cloudKey)) {
          p._updatedAt = Date.now();
          console.warn(`[Rescue] Phát hiện hàng hóa chỉ có cục bộ (chưa có trên mây): ${p.id}. Đang đánh dấu để đẩy lên...`);
          changed = true;
          if (lastSyncState && Array.isArray(lastSyncState.products)) {
            lastSyncState.products = lastSyncState.products.filter(x => x.id !== p.id);
          }
        }
      }
    });

    // Partners
    (state.partners || []).forEach(pt => {
      if (pt && pt.id) {
        const cloudKey = `part_${pt.id}`;
        if (!cloudIds.has(cloudKey)) {
          pt._updatedAt = Date.now();
          console.warn(`[Rescue] Phát hiện đối tác chỉ có cục bộ (chưa có trên mây): ${pt.id}. Đang đánh dấu để đẩy lên...`);
          changed = true;
          if (lastSyncState && Array.isArray(lastSyncState.partners)) {
            lastSyncState.partners = lastSyncState.partners.filter(x => x.id !== pt.id);
          }
        }
      }
    });

    if (changed) {
      console.log("[Rescue] Đang lưu trữ và kích hoạt đẩy dữ liệu lên đám mây...");
      state._lastModified = Date.now();
      const saveFn = typeof saveStateSync === "function" ? saveStateSync : (typeof window.saveStateSync === "function" ? window.saveStateSync : null);
      if (saveFn) {
        saveFn();
      } else {
        localStorage.setItem("rd_accounting_online_cache", JSON.stringify(state));
      }
      setTimeout(() => pushToCloud(), 1000);
    } else {
      console.log("[Rescue] Không phát hiện đối tượng nào bị kẹt cục bộ.");
    }
  } catch (err) {
    console.error("[Rescue] Lỗi trong quá trình cứu hộ dữ liệu kẹt cục bộ:", err);
  }
}
