/* ==========================================================================
   RÀ SOÁT DANH MỤC ĐỐI TÁC — lỗi dữ liệu làm nhập Excel/công nợ khớp sai
   - Trùng tên: luồng nhập Excel khớp đối tác theo TÊN; hai mã cùng tên (không khác địa chỉ/SĐT)
     làm mọi dòng của tên đó không khớp được → gộp mã ít dùng vào mã chính (mergePartnerRecords).
   - Tên trùng mã: tên đối tác là chính mã (vd. "BANLET07/2026(CH)") → không khớp tên trong file.
   - Đối tác thử: tên "test"/chỉ có số, không chứng từ, không số dư, không công trình con.
   Chỉ gợi ý; mỗi thao tác cần kế toán xác nhận, được đồng bộ cloud và ghi nhật ký.
   ========================================================================== */

function partnerAuditFold(text) {
  return String(text || "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}

function partnerAuditPhones(text) {
  return String(text || "").split(/[,;/]|\s-\s/).map(s => s.replace(/\D/g, "")).filter(s => s.length >= 9).sort().join(",");
}

// "BANLET07/2026(CH)" → "Bán Lẻ T07/2026"; mã khác → "".
function suggestPartnerNameFromCode(id) {
  const m = /^BANLET(\d{1,2})\/(\d{4})\s*\(CH\)\.?$/i.exec(String(id || "").trim());
  return m ? `Bán Lẻ T${m[1].padStart(2, "0")}/${m[2]}` : "";
}

function computePartnerAuditIssues() {
  const partners = state.partners || [];
  const openings = state.partnerOpeningBalances || {};
  const voucherCount = new Map();
  (state.vouchers || []).forEach(v => {
    if (!v || v.partnerId === undefined || v.partnerId === null || v.partnerId === "") return;
    const key = String(v.partnerId).trim().toUpperCase();
    voucherCount.set(key, (voucherCount.get(key) || 0) + 1);
  });
  const countOf = p => voucherCount.get(String(p.id).trim().toUpperCase()) || 0;
  const hasOpening = p => {
    const o = openings[p.id];
    return !!o && ((Number(o.debit) || 0) !== 0 || (Number(o.credit) || 0) !== 0);
  };
  const hasChildren = new Set(partners.filter(p => p && p.parentId).map(p => String(p.parentId)));

  // 1. Trùng tên, cùng phía 131/331, không mâu thuẫn địa chỉ/SĐT, không phải doanh nghiệp mẹ.
  const groups = new Map();
  partners.forEach(p => {
    if (!p || p.type === "enterprise") return;
    const key = partnerAuditFold(p.name);
    if (!key) return;
    const side = p.type === "supplier" ? "S" : "C";
    const k = `${side}\u0001${key}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  });
  const duplicates = [];
  groups.forEach(list => {
    if (list.length < 2) return;
    // Chỉ coi là cùng một đối tác khi địa chỉ và SĐT giống hệt (kể cả cùng để trống):
    // "Anh An" ở hai địa chỉ, hoặc một bên có địa chỉ một bên không, vẫn có thể là hai người.
    const addresses = new Set(list.map(p => partnerAuditFold(p.address)));
    const phones = new Set(list.map(p => partnerAuditPhones(p.phone)));
    if (addresses.size > 1 || phones.size > 1) return;
    const ranked = list.slice().sort((a, b) => countOf(b) - countOf(a) ||
      Number(hasOpening(b)) - Number(hasOpening(a)) || String(a.id).localeCompare(String(b.id)));
    const target = ranked[0];
    ranked.slice(1).forEach(source => {
      if (hasChildren.has(String(source.id))) return;
      duplicates.push({
        sourceId: source.id, targetId: target.id, name: target.name || "",
        sourceVouchers: countOf(source), targetVouchers: countOf(target)
      });
    });
  });

  // 2. Đối tác thử/rác.
  const isJunkName = name => /^(test\w*|\d{1,3})$/i.test(String(name || "").trim());
  const junk = partners
    .filter(p => p && isJunkName(p.name) && countOf(p) === 0 && !hasOpening(p) && !hasChildren.has(String(p.id)))
    .map(p => ({ id: p.id, name: p.name }));

  // 3. Tên là mã dạng mã (không khoảng trắng, vd. "BANLET07/2026(CH)"); tên thật viết hoa trùng mã
  //    như "CHỊ PHƯỢNG (KH8101T07/2026)" vẫn khớp tên được nên không báo.
  const nameIsCode = partners
    .filter(p => p && !isJunkName(p.name) && String(p.name || "").trim() &&
      String(p.name).trim().toUpperCase() === String(p.id).trim().toUpperCase() && !/\s/.test(String(p.id).trim()))
    .map(p => ({ id: p.id, suggestedName: suggestPartnerNameFromCode(p.id), vouchers: countOf(p) }));

  return { duplicates, nameIsCode, junk };
}

function partnerAuditCanWrite() {
  if (window.currentUser && window.currentUser.role === "viewer") {
    showToast("Tài khoản chỉ xem không được sửa danh mục đối tác.", "error");
    return false;
  }
  return true;
}

async function partnerAuditCommit(action, detail, toast) {
  try {
    if (typeof saveStateAndSyncVoucher === "function") await saveStateAndSyncVoucher();
    else saveState();
  } catch (err) {
    console.error("[PartnerAudit] Lưu thất bại:", err);
    showToast("Không lưu được thay đổi: " + err.message, "error");
    return false;
  }
  if (typeof logUserAction === "function") logUserAction(action, detail);
  showToast(toast, "success");
  if (typeof filterPartners === "function") filterPartners();
  return true;
}

async function mergeDuplicatePartner(sourceId, targetId) {
  if (!partnerAuditCanWrite()) return;
  const issue = computePartnerAuditIssues().duplicates.find(d => String(d.sourceId) === String(sourceId) && String(d.targetId) === String(targetId));
  if (!issue) { showToast("Cặp đối tác này không còn trùng.", "info"); return; }
  const ok = typeof showConfirmModal === "function" ? await showConfirmModal({
    title: "Gộp đối tác trùng tên",
    message: `Gộp "${sourceId}" (${issue.sourceVouchers} chứng từ) vào "${targetId}" (${issue.targetVouchers} chứng từ)? Chứng từ và số dư đầu kỳ chuyển sang "${targetId}", mã "${sourceId}" bị xóa.`,
    confirmText: "Gộp",
    cancelText: "Hủy bỏ",
    type: "warning"
  }) : true;
  if (!ok) return;
  const result = mergePartnerRecords(sourceId, targetId, { keepPartnerNameOnVoucher: true, recalculate: true });
  if (!result || !result.ok) {
    showToast((result && result.error) || "Không gộp được đối tác.", "error");
    return;
  }
  await partnerAuditCommit("Gộp đối tác", result.message, result.message);
}

async function renamePartnerFromCode(id) {
  if (!partnerAuditCanWrite()) return;
  const p = (state.partners || []).find(x => String(x.id) === String(id));
  const name = suggestPartnerNameFromCode(id);
  if (!p || !name) return;
  const ok = typeof showConfirmModal === "function" ? await showConfirmModal({
    title: "Đặt tên đối tác",
    message: `Đổi tên đối tác "${id}" thành "${name}"?`,
    confirmText: "Đổi tên",
    cancelText: "Hủy bỏ",
    type: "info"
  }) : true;
  if (!ok) return;
  const old = p.name;
  p.name = name;
  stampPartnerSyncFields(p);
  if (typeof invalidatePartnerCache === "function") invalidatePartnerCache();
  await partnerAuditCommit("Sửa đối tác", `Đổi tên ${id}: "${old}" → "${name}"`, `Đã đổi tên ${id} thành "${name}".`);
}

async function deleteJunkPartners() {
  if (!partnerAuditCanWrite()) return;
  const ids = computePartnerAuditIssues().junk.map(j => j.id);
  if (!ids.length) return;
  const ok = typeof showConfirmModal === "function" ? await showConfirmModal({
    title: "Xóa đối tác thử",
    message: `Xóa ${ids.length} đối tác thử (${ids.join(", ")})? Các mã này không có chứng từ, số dư đầu kỳ hay công trình con.`,
    confirmText: "Xóa",
    cancelText: "Hủy bỏ",
    type: "danger"
  }) : true;
  if (!ok) return;
  // Kiểm tra lại ngay trước khi xóa (dữ liệu có thể vừa đồng bộ về).
  const still = new Set(computePartnerAuditIssues().junk.map(j => String(j.id)));
  const toDelete = ids.filter(id => still.has(String(id)));
  if (!toDelete.length) return;
  trackDeletedIds(toDelete, "partner");
  state.partners = state.partners.filter(p => !toDelete.includes(p.id));
  toDelete.forEach(id => recordPartnerOpeningDeletion(id));
  if (typeof invalidatePartnerCache === "function") invalidatePartnerCache();
  await partnerAuditCommit("Xóa đối tác", `Xóa đối tác thử: ${toDelete.join(", ")}`, `Đã xóa ${toDelete.length} đối tác thử.`);
}

function renderPartnerAuditPanel() {
  const el = document.getElementById("partner-audit-panel");
  if (!el) return;
  const { duplicates, nameIsCode, junk } = computePartnerAuditIssues();
  const total = duplicates.length + nameIsCode.length + junk.length;
  if (!total) { el.innerHTML = ""; el.style.display = "none"; return; }
  const esc = escapePartnerText;
  const arg = v => esc(JSON.stringify(String(v)));
  const dupRows = duplicates.map(d => `<tr>
      <td>${esc(d.name)}</td>
      <td>${esc(d.sourceId)} <span class="text-muted">(${d.sourceVouchers} CT)</span></td>
      <td><strong>${esc(d.targetId)}</strong> <span class="text-muted">(${d.targetVouchers} CT)</span></td>
      <td><button type="button" class="btn btn-secondary btn-sm" data-role-required="write" onclick="mergeDuplicatePartner(${arg(d.sourceId)}, ${arg(d.targetId)})">Gộp</button></td>
    </tr>`).join("");
  const codeRows = nameIsCode.map(n => `<tr>
      <td>${esc(n.id)}</td>
      <td>${n.vouchers} chứng từ</td>
      <td>${n.suggestedName ? esc(n.suggestedName) : '<span class="text-muted">Sửa tay trong form đối tác</span>'}</td>
      <td>${n.suggestedName
        ? `<button type="button" class="btn btn-secondary btn-sm" data-role-required="write" onclick="renamePartnerFromCode(${arg(n.id)})">Đổi tên</button>`
        : `<button type="button" class="btn btn-secondary btn-sm" data-role-required="write" onclick="openEditPartnerModal(${arg(n.id)})">Sửa</button>`}</td>
    </tr>`).join("");
  el.style.display = "";
  el.innerHTML = `
    <details class="debt-alert-warning">
      <summary class="debt-alert-warning-header">
        <span>Rà soát danh mục đối tác</span>
        <span class="badge badge-danger">${total} mục</span>
      </summary>
      <div class="debt-alert-warning-body">
        <p class="debt-alert-warning-note">Nhập Excel khớp đối tác theo tên: tên trùng nhau hoặc tên là mã làm chứng từ không khớp đối tác.</p>
        ${duplicates.length ? `<h4>Trùng tên (${duplicates.length})</h4>
        <div class="table-responsive"><table class="data-table" style="font-size:12px;width:100%;">
          <thead><tr><th>Tên</th><th>Mã gộp đi</th><th>Gộp vào</th><th></th></tr></thead><tbody>${dupRows}</tbody></table></div>` : ""}
        ${nameIsCode.length ? `<h4>Tên đối tác là mã (${nameIsCode.length})</h4>
        <div class="table-responsive"><table class="data-table" style="font-size:12px;width:100%;">
          <thead><tr><th>Mã</th><th>Chứng từ</th><th>Tên đề xuất</th><th></th></tr></thead><tbody>${codeRows}</tbody></table></div>` : ""}
        ${junk.length ? `<h4>Đối tác thử (${junk.length})</h4>
        <p>${junk.map(j => `${esc(j.id)} "${esc(j.name)}"`).join(", ")}</p>
        <button type="button" class="btn btn-danger btn-sm" data-role-required="write" onclick="deleteJunkPartners()">Xóa ${junk.length} đối tác thử</button>` : ""}
      </div>
    </details>`;
}

window.computePartnerAuditIssues = computePartnerAuditIssues;
window.renderPartnerAuditPanel = renderPartnerAuditPanel;
window.mergeDuplicatePartner = mergeDuplicatePartner;
window.renamePartnerFromCode = renamePartnerFromCode;
window.deleteJunkPartners = deleteJunkPartners;
window.suggestPartnerNameFromCode = suggestPartnerNameFromCode;
