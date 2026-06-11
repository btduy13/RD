
let quickAddPartnerType = "customer";

function openQuickAddPartnerModal(type = "customer") {
  quickAddPartnerType = type;
  const modalTitle = document.querySelector("#modal-quick-add-partner .card-title");
  if (modalTitle) {
    modalTitle.innerHTML = type === "customer"
      ? `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> Thêm nhanh Khách hàng mới`
      : `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> Thêm nhanh Nhà cung cấp mới`;
  }
  const labelName = document.getElementById("quick-partner-label-name");
  if (labelName) {
    labelName.innerHTML = type === "customer"
      ? `Tên khách hàng <span style="color:var(--color-danger)">*</span>`
      : `Tên nhà cung cấp <span style="color:var(--color-danger)">*</span>`;
  }

  const nameEl = document.getElementById("quick-partner-name");
  const phoneEl = document.getElementById("quick-partner-phone");
  const addressEl = document.getElementById("quick-partner-address");
  if (nameEl) nameEl.value = "";
  if (phoneEl) phoneEl.value = "";
  if (addressEl) addressEl.value = "";

  openModal("modal-quick-add-partner");
}

function handleQuickAddPartnerSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-quick-add-partner");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const name = document.getElementById("quick-partner-name").value.trim();
  const phone = document.getElementById("quick-partner-phone").value.trim();
  const address = document.getElementById("quick-partner-address").value.trim();

  const isSupplier = (quickAddPartnerType === "supplier");
  const typeLabel = isSupplier ? "nhà cung cấp" : "khách hàng";
  const typeNameCap = isSupplier ? "Nhà cung cấp" : "Khách hàng";

  if (!name) {
    showToast(`Vui lòng nhập tên ${typeLabel}!`, "danger");
    return;
  }

  let partner = state.partners.find(p => p.name.toLowerCase() === name.toLowerCase());

  if (!partner) {
    const nextNum = (state.partners.filter(p => p.type === (isSupplier ? "supplier" : "customer")).length + 1).toString().padStart(3, '0');
    const id = isSupplier ? `NCC${nextNum}` : `KH${nextNum}`;

    partner = {
      id,
      name,
      type: isSupplier ? "supplier" : "customer",
      phone,
      email: "",
      address,
      taxCode: "",
      inactive: false
    };

    state.partners.push(partner);
    saveState();

    // Nạp lại datalist đối tác
    const datalist = document.getElementById("datalist-partners");
    if (datalist && state.partners) {
      datalist.innerHTML = state.partners.map(p =>
        `<option value="${p.name} (${p.id})">[${p.type === 'supplier' ? 'NCC' : 'KH'}]</option>`
      ).join("");
    }

    showToast(`Đã thêm thành công ${typeLabel} "${name}" với mã ${id}!`, "success");
  } else {
    showToast(`${typeNameCap} "${name}" đã tồn tại trên hệ thống!`, "info");
  }

  const inputEl = document.getElementById(isSupplier ? "pur-partner" : "sale-partner");
  if (inputEl) {
    inputEl.value = `${partner.name} (${partner.id})`;
  }

  closeModal("modal-quick-add-partner");
}

// ==========================================================
// CÁC PHÂN HỆ NÂNG CẤP: KHÁCH HÀNG, CÔNG NỢ & QUỸ TIỀN
// ==========================================================

let partnersPage = 1;
let debtsPage = 1;
let cashPage = 1;
const itemsPerPage = 50;

let filteredPartnersList = [];

// --- Phân hệ Khách hàng ---
function renderPartnersTable() {
  const tbody = document.getElementById("partners-table-body");
  if (!tbody) return;

  const total = filteredPartnersList.length;
  const totalPages = Math.ceil(total / itemsPerPage) || 1;

  if (partnersPage > totalPages) partnersPage = totalPages;
  if (partnersPage < 1) partnersPage = 1;

  const startIdx = (partnersPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filteredPartnersList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy đối tác nào</td></tr>`;
  } else {
    pageItems.forEach(p => {
      const tr = document.createElement("tr");
      const escapedId = escapeHtmlAttr(p.id);
      tr.className = "clickable-row";
      tr.setAttribute("data-type", "partner");
      tr.setAttribute("data-id", escapedId);
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="partner-checkbox" value="${escapedId}" onchange="updateBatchPartnersUI()">
        </td>
        <td style="font-weight:bold; color:var(--color-primary);">${p.id}</td>
        <td style="font-weight:600;"><a href="#" onclick="viewPartnerLedger('${escapedId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${p.name}</a></td>
        <td>
          <span class="badge ${p.type === 'supplier' ? 'badge-warning' : 'badge-info'}">
            ${p.type === 'supplier' ? 'Nhà cung cấp' : 'Khách hàng'}
          </span>
        </td>
        <td class="font-numeric">${p.phone || "-"}</td>
        <td>${p.address || "-"}</td>
        <td>
          <span class="badge ${p.inactive ? 'badge-danger' : 'badge-success'}">
            ${p.inactive ? 'Ngừng theo dõi' : 'Đang theo dõi'}
          </span>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-secondary btn-sm" onclick="openEditPartnerModal('${escapedId}')" style="padding: 2px 6px; margin-right: 4px;">Sửa</button>
          <button class="btn btn-secondary btn-sm" onclick="deletePartner('${escapedId}')" style="padding: 2px 6px; color:var(--color-danger); border-color:rgba(239, 68, 68, 0.2);">Xóa</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const paginationInfo = document.getElementById("partners-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = total > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} trong số ${total} đối tác (Trang ${partnersPage}/${totalPages})`
      : `Hiển thị 0 - 0 trong số 0 đối tác`;
  }

  // Reset check-all-partners checkbox
  const checkAll = document.getElementById("check-all-partners");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchPartnersUI === "function") updateBatchPartnersUI();

  // Render pagination controls
  const paginationControls = document.getElementById("partners-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePartnersPage(1)" ${partnersPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changePartnersPage(${partnersPage - 1})" ${partnersPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, partnersPage - 2);
      let endPage = Math.min(totalPages, partnersPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === partnersPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changePartnersPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === partnersPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePartnersPage(${partnersPage + 1})" ${partnersPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changePartnersPage(${totalPages})" ${partnersPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} của ${total} đối tác
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }
}

function changePartnersPage(p) {
  partnersPage = p;
  renderPartnersTable();
}

function filterPartners() {
  const query = document.getElementById("partner-search-input") ? document.getElementById("partner-search-input").value : "";
  const filterType = document.getElementById("partner-type-filter") ? document.getElementById("partner-type-filter").value : "all";

  filteredPartnersList = state.partners.filter(p => {
    const combined = `${p.id || ""} ${p.name || ""} ${p.phone || ""} ${p.address || ""}`;
    const matchesQuery = matchAdvancedQuery(combined, query);
    const matchesType = filterType === "all" || p.type === filterType;
    return matchesQuery && matchesType;
  });

  partnersPage = 1;
  renderPartnersTable();
}

function openAddPartnerModal() {
  document.getElementById("edit-partner-index").value = "-1";
  document.getElementById("form-partner").reset();
  document.getElementById("partner-id").disabled = false;
  document.getElementById("modal-partner-title").innerText = "Khai báo Đối tác mới";
  openModal("modal-add-partner");
}

function openEditPartnerModal(id) {
  const p = state.partners.find(item => item.id === id);
  if (!p) return;

  document.getElementById("edit-partner-index").value = p.id;
  document.getElementById("partner-id").value = p.id;
  document.getElementById("partner-id").disabled = false; // Mở khóa mã đối tác cho phép chỉnh sửa
  document.getElementById("partner-name").value = p.name;
  document.getElementById("partner-type").value = p.type;
  document.getElementById("partner-phone").value = p.phone || "";
  document.getElementById("partner-address").value = p.address || "";
  document.getElementById("partner-taxcode").value = p.taxCode || "";
  document.getElementById("partner-inactive").checked = !!p.inactive;

  document.getElementById("modal-partner-title").innerText = "Chỉnh sửa Đối tác";
  openModal("modal-add-partner");
}

function handlePartnerSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-partner");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const editIndex = document.getElementById("edit-partner-index").value;
  const idEl = document.getElementById("partner-id");
  const idVal = idEl ? idEl.value.trim() : "";
  const name = document.getElementById("partner-name").value.trim();
  const type = document.getElementById("partner-type").value;
  const phone = document.getElementById("partner-phone").value.trim();
  const address = document.getElementById("partner-address").value.trim();
  const taxCode = document.getElementById("partner-taxcode").value.trim();
  const inactive = document.getElementById("partner-inactive").checked;

  if (editIndex !== "-1") {
    const idx = state.partners.findIndex(p => String(p.id) === String(editIndex));
    if (idx !== -1) {
      const newId = idVal.toUpperCase();
      if (String(newId) !== String(editIndex) && state.partners.some(p => String(p.id) === String(newId))) {
        showToast(`Mã đối tác "${newId}" đã tồn tại!`, "danger");
        return;
      }

      // Cập nhật tất cả các tham chiếu liên quan nếu Mã đối tác bị thay đổi
      if (newId !== editIndex) {
        state.vouchers.forEach(v => {
          if (String(v.partnerId) === String(editIndex)) {
            v.partnerId = newId;
            v.partnerName = name;
          }
        });
        if (state.partnerOpeningBalances && state.partnerOpeningBalances[editIndex]) {
          state.partnerOpeningBalances[newId] = state.partnerOpeningBalances[editIndex];
          delete state.partnerOpeningBalances[editIndex];
        }
      }

      state.partners[idx] = { id: newId, name, type, phone, email: "", address, taxCode, inactive };
      showToast("Cập nhật đối tác thành công!", "success");
    }
  } else {
    let id = idVal.toUpperCase();
    if (!id) {
      const prefix = type === "supplier" ? "NCC" : "KH";
      const nextNum = (state.partners.filter(p => p.type === type).length + 1).toString().padStart(3, '0');
      id = `${prefix}${nextNum}`;
      if (idEl) idEl.value = id;
    }

    if (state.partners.some(p => String(p.id) === String(id))) {
      showToast(`Mã đối tác "${id}" đã tồn tại!`, "danger");
      return;
    }

    state.partners.push({ id, name, type, phone, email: "", address, taxCode, inactive });
    showToast("Thêm đối tác mới thành công!", "success");
  }

  saveState();
  initExcelIntegration();
  closeModal("modal-add-partner");
  document.getElementById("form-partner").reset();
  filterPartners();
}

function deletePartner(id) {
  if (confirm(`Bạn có chắc chắn muốn xóa đối tác "${id}" không?`)) {
    trackDeletedIds([id]);
    state.partners = state.partners.filter(p => p.id !== id);
    if (state.partnerOpeningBalances && state.partnerOpeningBalances[id]) {
      delete state.partnerOpeningBalances[id];
    }
    saveState();
    initExcelIntegration();
    filterPartners();
    showToast(`Đã xóa đối tác "${id}"!`, "success");
  }
}

function autoExtractPhonesAndCleanAddresses() {
  let count = 0;
  if (!state.partners) return 0;

  state.partners.forEach(p => {
    const addr = p.address || "";
    const currentPhone = (p.phone || "").trim();

    // Thực hiện nếu chưa có số điện thoại (hoặc số điện thoại trống, null, hoặc chỉ là dấu gạch ngang)
    if (!currentPhone || currentPhone === "-" || currentPhone === "null" || currentPhone === "") {
      // Tìm số điện thoại (9-11 số, bắt đầu bằng 0, có thể chứa cách, chấm, gạch ngang)
      const phoneRegex = /(0[1-9][\s.-]?\d(?:[\s.-]?\d){7,9})/g;
      const matches = addr.match(phoneRegex);

      if (matches && matches.length > 0) {
        // Gán số điện thoại tìm được
        p.phone = matches.join(" / ");

        // Làm sạch địa chỉ: Loại bỏ số điện thoại và các ký tự phân tách thừa
        let cleanAddr = addr;
        matches.forEach(m => {
          cleanAddr = cleanAddr.replace(m, "");
        });

        // Dọn dẹp khoảng trắng, dấu gạch ngang thừa ở đầu, cuối hoặc giữa địa chỉ
        cleanAddr = cleanAddr
          .replace(/\s*-\s*-\s*/g, " - ") // Tránh double dash
          .replace(/\s*-\s*$/g, "")        // Bỏ gạch ngang ở cuối
          .replace(/^\s*-\s*/g, "")        // Bỏ gạch ngang ở đầu
          .replace(/\s+/g, " ")            // Thu gọn khoảng trắng
          .trim();

        p.address = cleanAddr;
        count++;
      }
    }
  });

  if (count > 0) {
    saveState();
    if (typeof filterPartners === "function") filterPartners();
  }
  return count;
}

function triggerAutoExtractPhones() {
  const count = autoExtractPhonesAndCleanAddresses();
  if (count > 0) {
    showToast(`Đã tự động tách thành công số điện thoại cho ${count} đối tác!`, "success");
  } else {
    showToast("Không tìm thấy đối tác nào cần tách số điện thoại từ địa chỉ.", "info");
  }
}

function autoExtractPhonesFromNamesAndClean() {
  let count = 0;
  if (!state.partners) return 0;

  // 1. Tự động khử trùng lặp các đối tác trùng khớp ID trong bộ nhớ trước
  const partnerMap = new Map();
  const originalLength = state.partners.length;
  state.partners.forEach(p => {
    if (p && p.id) {
      if (!partnerMap.has(p.id)) {
        partnerMap.set(p.id, p);
      } else {
        const existing = partnerMap.get(p.id);
        // Ưu tiên bản ghi có thông tin liên lạc đầy đủ hơn (SĐT, địa chỉ)
        const score = (p.phone && p.phone !== "-" ? 1 : 0) + (p.address && p.address !== "-" ? 1 : 0);
        const existingScore = (existing.phone && existing.phone !== "-" ? 1 : 0) + (existing.address && existing.address !== "-" ? 1 : 0);
        if (score > existingScore) {
          partnerMap.set(p.id, p);
        }
      }
    }
  });
  state.partners = Array.from(partnerMap.values());
  const dedupCount = originalLength - state.partners.length;
  if (dedupCount > 0) {
    console.log(`[Deduplicate] Đã dọn dẹp ${dedupCount} đối tác trùng lặp ID.`);
    count += dedupCount;
  }

  state.partners.forEach(p => {
    const name = p.name || "";
    const currentPhone = (p.phone || "").trim();

    // Các biểu thức chính quy để nhận diện số điện thoại ở cuối tên đối tác
    // Trường hợp 1: Tên chứa (SĐT) ở cuối
    const parenRegex = /\s*\(((?:\+84|84|0)(?:\d[\s\.-]?){7,9}\d)\)\s*$/;
    // Trường hợp 2: Tên chứa ký tự phân tách (-, –, —, :) + SĐT ở cuối
    const dashRegex = /[\s\-\–\—\:]+((?:\+84|84|0)(?:\d[\s\.-]?){7,9}\d)\s*$/;
    // Trường hợp 3: Tên chứa dấu cách + SĐT ở cuối
    const spaceRegex = /\s+((?:\+84|84|0)(?:\d[\s\.-]?){7,9}\d)\s*$/;

    let phone = "";
    let cleanName = "";

    let match = name.match(parenRegex);
    if (match) {
      phone = match[1].trim();
      cleanName = name.replace(parenRegex, "").trim();
    } else {
      match = name.match(dashRegex);
      if (match) {
        phone = match[1].trim();
        cleanName = name.replace(dashRegex, "").trim();
      } else {
        match = name.match(spaceRegex);
        if (match) {
          phone = match[1].trim();
          cleanName = name.replace(spaceRegex, "").trim();
        }
      }
    }

    if (phone && cleanName) {
      // Cập nhật tên đã được loại bỏ SĐT
      p.name = cleanName;

      // Lưu số điện thoại vào đúng trường phone
      if (!currentPhone || currentPhone === "-" || currentPhone === "null" || currentPhone === "") {
        p.phone = phone;
      } else if (!currentPhone.includes(phone)) {
        p.phone = currentPhone + " / " + phone;
      }

      count++;
    }
  });

  if (count > 0) {
    saveState();
    if (typeof filterPartners === "function") filterPartners();
  }
  return count;
}

function triggerAutoExtractPhonesFromNames() {
  const count = autoExtractPhonesFromNamesAndClean();
  if (count > 0) {
    showToast(`Đã tự động tách thành công số điện thoại cho ${count} đối tác từ tên!`, "success");
  } else {
    showToast("Không tìm thấy đối tác nào có số điện thoại đi kèm trong tên.", "info");
  }
}
window.openEditPartnerModal = openEditPartnerModal;
window.triggerAutoExtractPhones = triggerAutoExtractPhones;
window.autoExtractPhonesAndCleanAddresses = autoExtractPhonesAndCleanAddresses;

function toggleSelectAllPartners(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".partner-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchPartnersUI();
}

function updateBatchPartnersUI() {
  const checkboxes = document.querySelectorAll(".partner-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-partners");
  const count = document.getElementById("selected-partners-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-partners");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeletePartners() {
  const checked = Array.from(document.querySelectorAll(".partner-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} đối tác đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    state.partners = state.partners.filter(p => !idsToDelete.includes(p.id));

    saveState();

    const master = document.getElementById("check-all-partners");
    if (master) master.checked = false;

    updateBatchPartnersUI();

    filterPartners();
    if (typeof filterDebts === "function") filterDebts();

    showToast(`Đã xóa thành công ${checked.length} đối tác!`, "success");
  }
}
window.openQuickAddPartnerModal = openQuickAddPartnerModal;
window.handleQuickAddPartnerSubmit = handleQuickAddPartnerSubmit;
// Partners
window.filterPartners = filterPartners;
window.changePartnersPage = changePartnersPage;
window.toggleSelectAllPartners = toggleSelectAllPartners;
window.updateBatchPartnersUI = updateBatchPartnersUI;
window.batchDeletePartners = batchDeletePartners;