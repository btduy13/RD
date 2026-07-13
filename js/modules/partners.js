
let isPartnerIdManuallyEdited = false;

function getPartnerTypeLabel(type) {
  const labels = {
    enterprise: "Doanh nghiệp",
    project: "Công trình",
    retail: "Khách lẻ",
    supplier: "Nhà cung cấp"
  };
  return labels[type] || type;
}

function getPartnerTypeBadgeHtml(type) {
  const styles = {
    enterprise: 'background-color: #6366f1; color: white;',
    project: 'background-color: #f59e0b; color: white;',
    retail: 'background-color: #10b981; color: white;',
    supplier: 'background-color: #3b82f6; color: white;'
  };
  const style = styles[type] || '';
  return `<span class="badge" style="${style}">${getPartnerTypeLabel(type)}</span>`;
}

const PARTNER_TABLE_ICONS = {
  edit: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>',
  assignProject: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>',
  delete: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>',
  first: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>',
  prev: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>',
  next: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>',
  last: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>'
};

function buildPartnerTableActions(p) {
  const escapedId = escapeHtmlAttr(p.id);
  let html = `<div class="table-actions">`;
  html += `<button class="edit-btn" onclick="openEditPartnerModal('${escapedId}')" title="Sửa thông tin">${PARTNER_TABLE_ICONS.edit}</button>`;
  if (p.type === "retail" && !p.inactive) {
    html += `<button class="convert-btn" onclick="openAssignToProjectModal('${escapedId}')" title="Chuyển sang Công trình và gán doanh nghiệp mẹ">${PARTNER_TABLE_ICONS.assignProject}</button>`;
  }
  html += `<button class="trash-btn" onclick="deletePartner('${escapedId}')" title="Xóa đối tác">${PARTNER_TABLE_ICONS.delete}</button>`;
  html += `</div>`;
  return html;
}

function getPartnerParentName(partner) {
  if (!partner || partner.type !== "project" || !partner.parentId) return "";
  const parent = state.partners.find(item => item.id === partner.parentId);
  return parent ? parent.name : partner.parentId;
}

function populateEnterpriseDatalist(datalistId = "partner-parent-datalist") {
  const datalist = document.getElementById(datalistId);
  if (!datalist) return;
  const enterprises = state.partners.filter(p => p.type === "enterprise" && !p.inactive);
  datalist.innerHTML = enterprises.map(e => `<option value="${e.name} (${e.id})"></option>`).join("");
}

function resolveEnterpriseParent(inputVal) {
  const trimmed = (inputVal || "").trim();
  if (!trimmed) return null;
  const resolved = findExistingPartner(trimmed);
  return resolved && resolved.type === "enterprise" ? resolved : null;
}

function propagatePartnerIdChange(oldId, newId, newName) {
  if (!oldId || !newId || String(oldId) === String(newId)) return;
  state.vouchers.forEach(v => {
    if (String(v.partnerId) === String(oldId)) {
      v.partnerId = newId;
      if (newName) v.partnerName = newName;
    }
  });
  state.partners.forEach(p => {
    if (p.parentId === oldId) p.parentId = newId;
  });
  if (state.partnerOpeningBalances && state.partnerOpeningBalances[oldId]) {
    state.partnerOpeningBalances[newId] = state.partnerOpeningBalances[oldId];
    delete state.partnerOpeningBalances[oldId];
  }
  if (state.partnerOpeningBalanceTs && state.partnerOpeningBalanceTs[oldId]) {
    state.partnerOpeningBalanceTs[newId] = state.partnerOpeningBalanceTs[oldId];
    delete state.partnerOpeningBalanceTs[oldId];
  }
}

function generatePartnerIdClean(name, type) {
  if (!name) return "";
  let clean = removeAccents(name).toUpperCase();
  
  // Loại bỏ các từ khóa chung chung
  clean = clean.replace(/^(CONG TY TNHH SX TM DV|CONG TY TNHH SX TM|CONG TY TNHH TM DV|CONG TY TNHH DV|CONG TY TNHH TM|CONG TY TNHH|CONG TY CO PHAN|CONG TY CP|CONG TY|CTY TNHH SX TM DV|CTY TNHH SX TM|CTY TNHH TM DV|CTY TNHH DV|CTY TNHH TM|CTY TNHH|CTY CP|CTY|DOANH NGHIEP|DN|CHI NHANH)\s+/g, "");
  clean = clean.replace(/\s+(TNHH|CO PHAN|CP|SX|TM|DV)$/g, "");
  
  // Chỉ giữ lại chữ và số
  clean = clean.replace(/[^A-Z0-9/]/g, " ");
  // Thay thế nhiều khoảng trắng thành 1 khoảng trắng
  clean = clean.trim().replace(/\s+/g, " ");
  
  const words = clean.split(" ");
  let baseId = words.join("");
  
  if (type === "enterprise") {
    return "DN_" + baseId;
  } else if (type === "project") {
    if (!baseId.endsWith("CH")) {
      return baseId + "(CH)";
    }
    return baseId;
  } else if (type === "supplier") {
    return "NCC_" + baseId;
  } else if (type === "retail") {
    return "KL_" + baseId;
  }
  return baseId;
}

function getUniquePartnerId(name, type, excludeId = "") {
  let base = generatePartnerIdClean(name, type);
  if (!base) return "";
  
  let uniqueId = base;
  let counter = 1;
  while (state.partners.some(p => p.id === uniqueId && p.id !== excludeId)) {
    if (type === "project" && base.endsWith("(CH)")) {
      const baseWithoutCH = base.substring(0, base.length - 4);
      uniqueId = `${baseWithoutCH}_${counter}(CH)`;
    } else {
      uniqueId = `${base}_${counter}`;
    }
    counter++;
  }
  return uniqueId;
}

function validatePartnerIdInput(id) {
  const badge = document.getElementById("partner-id-validation-badge");
  const warning = document.getElementById("partner-id-change-warning");
  if (!badge) return;
  
  const editIndex = document.getElementById("edit-partner-index").value;
  const idVal = (id || "").trim().toUpperCase();
  
  if (!idVal) {
    badge.style.display = "none";
    if (warning) warning.style.display = "none";
    return;
  }
  
  // Kiểm tra cảnh báo đổi mã đối tác đang sửa
  if (editIndex !== "-1") {
    if (idVal !== editIndex.toUpperCase()) {
      if (warning) warning.style.display = "block";
    } else {
      if (warning) warning.style.display = "none";
    }
  } else {
    if (warning) warning.style.display = "none";
  }
  
  // Kiểm tra tính duy nhất (trừ đối tác đang sửa)
  const isDuplicate = state.partners.some(p => p.id.toUpperCase() === idVal && p.id !== editIndex);
  
  badge.style.display = "inline-block";
  if (isDuplicate) {
    badge.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
    badge.style.color = "var(--color-danger)";
    badge.style.border = "1px solid rgba(239, 68, 68, 0.2)";
    badge.innerText = "Mã đã tồn tại!";
  } else {
    badge.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
    badge.style.color = "var(--color-success)";
    badge.style.border = "1px solid rgba(16, 185, 129, 0.2)";
    badge.innerText = "Mã hợp lệ!";
  }
}

function updateSuggestedPartnerId() {
  const editIndex = document.getElementById("edit-partner-index").value;
  if (editIndex !== "-1" || isPartnerIdManuallyEdited) return;
  
  let type = document.getElementById('partner-modal-type').value;
  if (type === 'enterprise') {
    const radio = document.querySelector('input[name="enterprise-option"]:checked');
    const option = radio ? radio.value : 'new';
    if (option === 'existing') {
      type = 'project';
    }
  }
  
  const name = document.getElementById("partner-name").value.trim();
  const suggestedId = getUniquePartnerId(name, type);
  
  const partnerIdEl = document.getElementById("partner-id");
  if (partnerIdEl) {
    partnerIdEl.value = suggestedId;
    validatePartnerIdInput(suggestedId);
  }
}

window.generatePartnerIdFromForm = function() {
  let type = document.getElementById('partner-modal-type').value;
  if (type === 'enterprise') {
    const radio = document.querySelector('input[name="enterprise-option"]:checked');
    const option = radio ? radio.value : 'new';
    if (option === 'existing') {
      type = 'project';
    }
  }
  
  const name = document.getElementById("partner-name").value.trim();
  if (!name) {
    showToast("Vui lòng nhập tên đối tác trước để sinh mã!", "warning");
    return;
  }
  
  const editIndex = document.getElementById("edit-partner-index").value;
  const suggestedId = getUniquePartnerId(name, type, editIndex !== "-1" ? editIndex : "");
  
  const partnerIdEl = document.getElementById("partner-id");
  if (partnerIdEl) {
    partnerIdEl.value = suggestedId;
    validatePartnerIdInput(suggestedId);
    isPartnerIdManuallyEdited = false;
    showToast("Sinh mã thành công!", "success");
  }
};

window.selectEnterpriseOption = function(option) {
  const radio = document.querySelector(`input[name="enterprise-option"][value="${option}"]`);
  if (radio) {
    radio.checked = true;
    
    // Cập nhật class active cho các card tương ứng
    const cardNew = document.getElementById('card-option-new');
    const cardExist = document.getElementById('card-option-existing');
    if (option === 'new') {
      if (cardNew) cardNew.classList.add('active');
      if (cardExist) cardExist.classList.remove('active');
    } else {
      if (cardNew) cardNew.classList.remove('active');
      if (cardExist) cardExist.classList.add('active');
    }
    
    toggleEnterpriseOption(option);
  }
};

// Đăng ký event listeners
document.addEventListener("DOMContentLoaded", () => {
  const partnerIdEl = document.getElementById("partner-id");
  const partnerNameEl = document.getElementById("partner-name");
  
  if (partnerIdEl) {
    partnerIdEl.addEventListener("input", (e) => {
      isPartnerIdManuallyEdited = true;
      let val = e.target.value.toUpperCase().replace(/\s+/g, "");
      val = val.replace(/[^A-Z0-9_()/-]/g, "");
      e.target.value = val;
      validatePartnerIdInput(val);
    });
  }
  
  if (partnerNameEl) {
    partnerNameEl.addEventListener("input", () => {
      updateSuggestedPartnerId();
    });
  }
});

let quickAddPartnerType = "retail";

function openQuickAddPartnerModal(type = "retail") {
  quickAddPartnerType = type;
  const modalTitle = document.querySelector("#modal-quick-add-partner .card-title");
  if (modalTitle) {
    modalTitle.innerHTML = type === "retail"
      ? `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> Thêm nhanh Khách hàng mới`
      : `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> Thêm nhanh Nhà cung cấp mới`;
  }
  const labelName = document.getElementById("quick-partner-label-name");
  if (labelName) {
    labelName.innerHTML = type === "retail"
      ? `Tên đối tác (Khách hàng) <span style="color:var(--color-danger)">*</span>`
      : `Tên đối tác (Nhà cung cấp) <span style="color:var(--color-danger)">*</span>`;
  }

  // Clear inputs
  const idEl = document.getElementById("quick-partner-id");
  const nameEl = document.getElementById("quick-partner-name");
  const typeSelect = document.getElementById("quick-partner-type");
  const phoneEl = document.getElementById("quick-partner-phone");
  const addressEl = document.getElementById("quick-partner-address");
  const taxEl = document.getElementById("quick-partner-taxcode");
  const inactiveEl = document.getElementById("quick-partner-inactive");

  if (idEl) idEl.value = "";
  if (nameEl) nameEl.value = "";
  if (typeSelect) typeSelect.value = type;
  if (phoneEl) phoneEl.value = "";
  if (addressEl) addressEl.value = "";
  if (taxEl) taxEl.value = "";
  if (inactiveEl) inactiveEl.checked = false;

  openModal("modal-quick-add-partner");
}

function handleQuickAddPartnerSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-quick-add-partner");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const idVal = document.getElementById("quick-partner-id").value.trim();
  const name = document.getElementById("quick-partner-name").value.trim();
  const type = document.getElementById("quick-partner-type").value;
  const phone = document.getElementById("quick-partner-phone").value.trim();
  const address = document.getElementById("quick-partner-address").value.trim();
  const taxCode = document.getElementById("quick-partner-taxcode").value.trim();
  const inactive = document.getElementById("quick-partner-inactive").checked;

  const isSupplier = (type === "supplier");
  const typeLabel = isSupplier ? "nhà cung cấp" : "khách hàng";
  const typeNameCap = isSupplier ? "Nhà cung cấp" : "Khách hàng";

  if (!name) {
    showToast(`Vui lòng nhập tên ${typeLabel}!`, "danger");
    return;
  }

  let partner = state.partners.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!partner && typeof findPartnerByIdentity === "function") {
    partner = findPartnerByIdentity(name, state.partners);
  }

  if (!partner) {
    let finalId = idVal;
    if (!finalId) {
      const nextNum = (state.partners.filter(p => p.type === type).length + 1).toString().padStart(3, '0');
      finalId = isSupplier ? `NCC${nextNum}` : `KH${nextNum}`;
    } else {
      // Check duplicate ID
      const duplicateId = state.partners.find(p => p.id.toLowerCase() === finalId.toLowerCase());
      if (duplicateId) {
        showToast(`Mã đối tác "${finalId}" đã tồn tại! Vui lòng chọn mã khác.`, "danger");
        return;
      }
    }

    partner = {
      id: finalId,
      name,
      type,
      phone,
      email: "",
      address,
      taxCode,
      inactive
    };

    state.partners.push(partner);
    saveState();

    // Nạp lại datalist đối tác
    const datalist = document.getElementById("datalist-partners");
    if (datalist && state.partners) {
      datalist.innerHTML = state.partners.map(p => {
        const typeLabel = p.type === 'supplier' ? 'NCC' : (p.type === 'enterprise' ? 'DN' : (p.type === 'project' ? 'CT' : 'KL'));
        let parentInfo = "";
        if (p.type === 'project' && p.parentId) {
          const parent = state.partners.find(parent => parent.id === p.parentId);
          if (parent) parentInfo = ` - Thuộc: ${parent.name}`;
        }
        return `<option value="${p.name} (${p.id})">[${typeLabel}${parentInfo}]</option>`;
      }).join("");
    }

    // Refresh partner table if active
    if (typeof filterPartners === "function") {
      filterPartners();
    }

    showToast(`Đã thêm thành công ${typeLabel} "${name}" với mã ${finalId}!`, "success");
  } else {
    showToast(`${typeNameCap} "${name}" đã tồn tại trên hệ thống!`, "info");
  }

  const inputEl = document.getElementById(isSupplier ? "pur-partner" : "sale-partner");
  if (inputEl) {
    inputEl.value = `${partner.name} (${partner.id})`;
    // Trigger input event to resolve partner correctly in forms
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
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
function applyPartnerFormLabels(type) {
  const lblName = document.getElementById('label-partner-name');
  const lblAddress = document.getElementById('label-partner-address');
  const lblId = document.getElementById('label-partner-id');
  const groupTaxcode = document.getElementById('group-partner-taxcode');
  const titleEl = document.getElementById('modal-partner-title');

  if (type === 'enterprise') {
    if (titleEl) titleEl.innerText = "Chỉnh sửa Doanh nghiệp";
    if (lblName) lblName.innerHTML = `Tên Doanh nghiệp <span style="color:var(--color-danger)">*</span>`;
    if (lblAddress) lblAddress.innerText = 'Địa chỉ trụ sở';
    if (lblId) lblId.innerText = 'Mã Doanh nghiệp';
    if (groupTaxcode) groupTaxcode.style.display = 'block';
  } else if (type === 'project') {
    if (titleEl) titleEl.innerText = "Chỉnh sửa Công trình";
    if (lblName) lblName.innerHTML = `Tên Công trình <span style="color:var(--color-danger)">*</span>`;
    if (lblAddress) lblAddress.innerText = 'Địa chỉ công trình';
    if (lblId) lblId.innerText = 'Mã Công trình';
    if (groupTaxcode) groupTaxcode.style.display = 'none';
  } else if (type === 'retail') {
    if (titleEl) titleEl.innerText = "Chỉnh sửa Khách lẻ";
    if (lblName) lblName.innerHTML = `Tên Khách lẻ <span style="color:var(--color-danger)">*</span>`;
    if (lblAddress) lblAddress.innerText = 'Địa chỉ liên hệ';
    if (lblId) lblId.innerText = 'Mã Khách lẻ';
    if (groupTaxcode) groupTaxcode.style.display = 'none';
  } else if (type === 'supplier') {
    if (titleEl) titleEl.innerText = "Chỉnh sửa Nhà cung cấp";
    if (lblName) lblName.innerHTML = `Tên Nhà cung cấp <span style="color:var(--color-danger)">*</span>`;
    if (lblAddress) lblAddress.innerText = 'Địa chỉ trụ sở';
    if (lblId) lblId.innerText = 'Mã Nhà cung cấp';
    if (groupTaxcode) groupTaxcode.style.display = 'block';
  }
}

function getPartnerTypeChangeHint(fromType, toType) {
  if (fromType === toType) return "";
  const from = getPartnerTypeLabel(fromType);
  const to = getPartnerTypeLabel(toType);
  if (toType === "project") {
    return `Đang chuyển từ "${from}" sang "${to}". Vui lòng chọn Doanh nghiệp mẹ. Có thể bấm "Sinh mã" để đổi mã theo quy tắc công trình.`;
  }
  if (fromType === "project") {
    return `Đang chuyển từ "${from}" sang "${to}". Liên kết doanh nghiệp mẹ sẽ được gỡ bỏ.`;
  }
  if (fromType === "enterprise" && toType !== "enterprise") {
    return `Đang chuyển từ "${from}" sang "${to}". Nếu doanh nghiệp còn công trình con thì cần xử lý các công trình con trước.`;
  }
  return `Đang chuyển phân loại từ "${from}" sang "${to}".`;
}

window.switchPartnerEditType = function(type) {
  document.getElementById('partner-modal-type').value = type;

  const groupParent = document.getElementById('group-partner-parent');
  const labelParent = document.getElementById('label-partner-parent');
  const originalTypeEl = document.getElementById('partner-edit-original-type');
  const hintEl = document.getElementById('partner-type-change-hint');
  const originalType = originalTypeEl ? originalTypeEl.value : type;

  applyPartnerFormLabels(type);

  if (groupParent) {
    if (type === 'project') {
      groupParent.style.display = 'block';
      if (labelParent) labelParent.innerHTML = 'Doanh nghiệp mẹ <span style="color:var(--color-danger)">*</span>';
      populateEnterpriseDatalist();
    } else {
      groupParent.style.display = 'none';
      const searchInput = document.getElementById('partner-parent-search');
      if (searchInput) searchInput.value = '';
    }
  }

  if (hintEl) {
    const hint = getPartnerTypeChangeHint(originalType, type);
    if (hint && originalType && originalType !== type) {
      hintEl.innerText = hint;
      hintEl.style.display = 'block';
    } else {
      hintEl.style.display = 'none';
    }
  }
};

window.switchPartnerModalTab = function(type) {
  const tabs = ['enterprise', 'retail', 'supplier'];
  tabs.forEach(t => {
    const btn = document.getElementById(`partner-tab-${t}`);
    if (btn) {
      if (t === type) {
        btn.classList.add('active');
        btn.style.background = 'var(--color-primary)';
        btn.style.color = '#ffffff';
        btn.style.boxShadow = '0 4px 10px rgba(2, 132, 199, 0.25)';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-secondary)';
        btn.style.boxShadow = 'none';
      }
    }
  });

  document.getElementById('partner-modal-type').value = type;

  // Show / hide B2B specific options
  const groupEnterpriseOptions = document.getElementById('group-enterprise-options');
  const groupProjectName = document.getElementById('group-partner-project-name');
  const groupParent = document.getElementById('group-partner-parent');
  const groupTaxcode = document.getElementById('group-partner-taxcode');

  const lblName = document.getElementById('label-partner-name');
  const lblAddress = document.getElementById('label-partner-address');
  const lblId = document.getElementById('label-partner-id');

  if (type === 'enterprise') {
    if (groupEnterpriseOptions) groupEnterpriseOptions.style.display = 'flex';
    const radio = document.querySelector('input[name="enterprise-option"]:checked');
    const option = radio ? radio.value : 'new';
    toggleEnterpriseOption(option);
  } else {
    if (groupEnterpriseOptions) groupEnterpriseOptions.style.display = 'none';
    if (groupProjectName) groupProjectName.style.display = 'none';
    if (groupParent) groupParent.style.display = 'none';
    
    if (type === 'retail') {
      if (groupTaxcode) groupTaxcode.style.display = 'none';
      if (lblName) lblName.innerHTML = `Tên Khách lẻ <span style="color:var(--color-danger)">*</span>`;
      if (lblAddress) lblAddress.innerText = 'Địa chỉ liên hệ';
      if (lblId) lblId.innerText = 'Mã Khách lẻ';
    } else if (type === 'supplier') {
      if (groupTaxcode) groupTaxcode.style.display = 'block';
      if (lblName) lblName.innerHTML = `Tên Nhà cung cấp <span style="color:var(--color-danger)">*</span>`;
      if (lblAddress) lblAddress.innerText = 'Địa chỉ trụ sở';
      if (lblId) lblId.innerText = 'Mã Nhà cung cấp';
    }
  }

  // Tự động cập nhật lại gợi ý mã đối tác khi đổi Tab phân loại
  updateSuggestedPartnerId();
};

window.toggleEnterpriseOption = function(option) {
  const groupProjectName = document.getElementById('group-partner-project-name');
  const groupParent = document.getElementById('group-partner-parent');
  const groupTaxcode = document.getElementById('group-partner-taxcode');

  const lblName = document.getElementById('label-partner-name');
  const lblAddress = document.getElementById('label-partner-address');
  const lblId = document.getElementById('label-partner-id');

  if (option === 'new') {
    if (groupProjectName) groupProjectName.style.display = 'block';
    if (groupParent) groupParent.style.display = 'none';
    if (groupTaxcode) groupTaxcode.style.display = 'block';
    if (lblName) lblName.innerHTML = `Tên Doanh nghiệp <span style="color:var(--color-danger)">*</span>`;
    if (lblAddress) lblAddress.innerText = 'Địa chỉ trụ sở';
    if (lblId) lblId.innerText = 'Mã Doanh nghiệp';
  } else {
    if (groupProjectName) groupProjectName.style.display = 'none';
    if (groupParent) groupParent.style.display = 'block';
    if (groupTaxcode) groupTaxcode.style.display = 'none';
    if (lblName) lblName.innerHTML = `Tên Công trình mới <span style="color:var(--color-danger)">*</span>`;
    if (lblAddress) lblAddress.innerText = 'Địa chỉ công trình';
    if (lblId) lblId.innerText = 'Mã Công trình';

    const datalist = document.getElementById('partner-parent-datalist');
    if (datalist) {
      populateEnterpriseDatalist();
    }
    const searchInput = document.getElementById('partner-parent-search');
    if (searchInput) {
      searchInput.value = '';
    }
  }

  // Tự động cập nhật lại gợi ý mã đối tác khi chuyển đổi tùy chọn doanh nghiệp mới / công trình cũ
  updateSuggestedPartnerId();
};

function renderPartnersTable() {
  const tbody = document.getElementById("partners-table-body");
  if (!tbody) return;

  const displayList = [];
  const rootPartners = state.partners.filter(p => p.type !== 'project');
  const projectPartners = state.partners.filter(p => p.type === 'project');

  const matchesFilter = (p) => {
    return filteredPartnersList.some(f => f.id === p.id);
  };

  rootPartners.forEach(root => {
    const isRootMatch = matchesFilter(root);
    const children = projectPartners.filter(c => c.parentId === root.id);
    const matchingChildren = children.filter(c => matchesFilter(c));

    if (isRootMatch || matchingChildren.length > 0) {
      displayList.push({ partner: root, isChild: false, depth: 0 });
      const childrenToDisplay = isRootMatch ? children : matchingChildren;
      childrenToDisplay.forEach(child => {
        displayList.push({ partner: child, isChild: true, depth: 1 });
      });
    }
  });

  projectPartners.forEach(proj => {
    if (matchesFilter(proj)) {
      const hasParent = rootPartners.some(r => r.id === proj.parentId);
      if (!hasParent) {
        displayList.push({ partner: proj, isChild: false, depth: 0 });
      }
    }
  });

  const total = displayList.length;
  const totalPages = Math.ceil(total / itemsPerPage) || 1;

  if (partnersPage > totalPages) partnersPage = totalPages;
  if (partnersPage < 1) partnersPage = 1;

  const startIdx = (partnersPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = displayList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    renderEmptyState(tbody, 9, 'Không tìm thấy đối tác nào', 'Thử tìm kiếm với từ khóa khác hoặc thêm đối tác mới');
  } else {
    pageItems.forEach(item => {
      const p = item.partner;
      const tr = document.createElement("tr");
      const escapedId = escapeHtmlAttr(p.id);
      tr.className = "clickable-row";
      tr.setAttribute("data-type", "partner");
      tr.setAttribute("data-id", escapedId);

      let nameStyle = "font-weight:600;";
      let namePrefix = "";
      if (item.isChild) {
        nameStyle += " padding-left: 24px; color: var(--text-secondary);";
        namePrefix = `<span style="color: var(--text-muted); margin-right: 6px;">┕</span>`;
      }

      const typeBadge = getPartnerTypeBadgeHtml(p.type);

      let parentCell = "-";
      if (p.type === "project") {
        const parentName = getPartnerParentName(p);
        parentCell = parentName
          ? `<span style="font-size: 12px; color: var(--text-secondary);">${parentName}</span>`
          : `<span style="font-size: 11px; color: var(--color-danger);">Chưa gán DN mẹ</span>`;
      } else if (p.type === "enterprise") {
        const childCount = state.partners.filter(c => c.type === "project" && c.parentId === p.id).length;
        if (childCount > 0) {
          parentCell = `<span style="font-size: 11px; color: var(--text-muted);">${childCount} công trình con</span>`;
        }
      }

      let actionButtons = buildPartnerTableActions(p);

      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="partner-checkbox" value="${escapedId}" onchange="updateBatchPartnersUI()">
        </td>
        <td style="font-weight:bold; color:var(--color-primary);">${p.id}</td>
        <td style="${nameStyle}">${namePrefix}<a href="#" onclick="viewPartnerLedger('${escapedId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${p.name}</a></td>
        <td>${typeBadge}</td>
        <td>${parentCell}</td>
        <td class="font-numeric">${p.phone || "-"}</td>
        <td>${p.address || "-"}</td>
        <td>
          <span class="badge ${p.inactive ? 'badge-danger' : 'badge-success'}">
            ${p.inactive ? 'Ngừng theo dõi' : 'Đang theo dõi'}
          </span>
        </td>
        <td style="text-align:center;">${actionButtons}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  const paginationInfo = document.getElementById("partners-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = total > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} trong số ${total} thực thể (Trang ${partnersPage}/${totalPages})`
      : `Hiển thị 0 - 0 trong số 0 đối tác`;
  }

  const checkAll = document.getElementById("check-all-partners");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchPartnersUI === "function") updateBatchPartnersUI();

  const paginationControls = document.getElementById("partners-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="pagination-icon-btn" onclick="changePartnersPage(1)" ${partnersPage === 1 ? 'disabled' : ''} title="Trang đầu">${PARTNER_TABLE_ICONS.first}</button>
        <button class="pagination-icon-btn" onclick="changePartnersPage(${partnersPage - 1})" ${partnersPage === 1 ? 'disabled' : ''} title="Trang trước">${PARTNER_TABLE_ICONS.prev}</button>
      `;

      let startPage = Math.max(1, partnersPage - 2);
      let endPage = Math.min(totalPages, partnersPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="pagination-page-btn ${p === partnersPage ? 'is-active' : ''}" onclick="changePartnersPage(${p})" title="Trang ${p}">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="pagination-icon-btn" onclick="changePartnersPage(${partnersPage + 1})" ${partnersPage === totalPages ? 'disabled' : ''} title="Trang sau">${PARTNER_TABLE_ICONS.next}</button>
        <button class="pagination-icon-btn" onclick="changePartnersPage(${totalPages})" ${partnersPage === totalPages ? 'disabled' : ''} title="Trang cuối">${PARTNER_TABLE_ICONS.last}</button>
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
    const parentName = getPartnerParentName(p);
    const combined = `${p.id || ""}\t${p.name || ""}\t${p.phone || ""}\t${p.address || ""}\t${parentName}`;
    const matchesQuery = matchAdvancedQuery(combined, query);
    
    let matchesType = false;
    if (filterType === "all") {
      matchesType = true;
    } else if (filterType === "customer") {
      matchesType = (p.type === "retail" || p.type === "enterprise" || p.type === "project");
    } else {
      matchesType = p.type === filterType;
    }
    return matchesQuery && matchesType;
  });

  partnersPage = 1;
  renderPartnersTable();
}

function openAddPartnerModal() {
  isPartnerIdManuallyEdited = false;
  document.getElementById("edit-partner-index").value = "-1";
  document.getElementById("form-partner").reset();
  
  const badge = document.getElementById("partner-id-validation-badge");
  if (badge) badge.style.display = "none";
  const warning = document.getElementById("partner-id-change-warning");
  if (warning) warning.style.display = "none";

  const groupEditType = document.getElementById("group-partner-edit-type");
  if (groupEditType) groupEditType.style.display = "none";
  const hintEl = document.getElementById("partner-type-change-hint");
  if (hintEl) hintEl.style.display = "none";
  const originalTypeEl = document.getElementById("partner-edit-original-type");
  if (originalTypeEl) originalTypeEl.value = "";
  
  const radioNew = document.querySelector('input[name="enterprise-option"][value="new"]');
  if (radioNew) radioNew.checked = true;

  const cardNew = document.getElementById('card-option-new');
  const cardExist = document.getElementById('card-option-existing');
  if (cardNew) cardNew.classList.add('active');
  if (cardExist) cardExist.classList.remove('active');

  document.getElementById("partner-id").disabled = false;
  document.getElementById("modal-partner-title").innerText = "Khai báo Đối tác mới";
  
  const tabContainer = document.querySelector("#modal-add-partner .sub-tabs-bar");
  if (tabContainer) tabContainer.style.display = 'flex';

  const searchInput = document.getElementById('partner-parent-search');
  if (searchInput) searchInput.value = '';

  switchPartnerModalTab('enterprise');
  openModal("modal-add-partner");
}

function openEditPartnerModal(id, options = {}) {
  const p = state.partners.find(item => item.id === id);
  if (!p) {
    showToast("Không tìm thấy đối tác!", "danger");
    return;
  }

  isPartnerIdManuallyEdited = false;
  document.getElementById("edit-partner-index").value = p.id;
  document.getElementById("partner-id").value = p.id;
  document.getElementById("partner-id").disabled = false;
  document.getElementById("partner-name").value = p.name;
  
  const tabContainer = document.querySelector("#modal-add-partner .sub-tabs-bar");
  if (tabContainer) tabContainer.style.display = 'none';

  const groupEnterpriseOptions = document.getElementById('group-enterprise-options');
  if (groupEnterpriseOptions) groupEnterpriseOptions.style.display = 'none';
  const groupProjectName = document.getElementById('group-partner-project-name');
  if (groupProjectName) groupProjectName.style.display = 'none';

  const groupEditType = document.getElementById('group-partner-edit-type');
  const editTypeSelect = document.getElementById('partner-edit-type-select');
  const originalTypeEl = document.getElementById('partner-edit-original-type');
  const presetType = options.presetType || p.type;

  if (groupEditType) groupEditType.style.display = 'block';
  if (originalTypeEl) originalTypeEl.value = p.type;
  if (editTypeSelect) editTypeSelect.value = presetType;

  const groupParent = document.getElementById('group-partner-parent');
  if (groupParent && presetType === 'project') {
    populateEnterpriseDatalist();
    const searchInput = document.getElementById('partner-parent-search');
    if (searchInput) {
      if (p.parentId) {
        const parent = state.partners.find(x => x.id === p.parentId);
        searchInput.value = parent ? `${parent.name} (${parent.id})` : '';
      } else {
        searchInput.value = '';
      }
    }
  } else {
    const searchInput = document.getElementById('partner-parent-search');
    if (searchInput) searchInput.value = '';
  }

  switchPartnerEditType(presetType);

  document.getElementById("partner-phone").value = p.phone || "";
  document.getElementById("partner-address").value = p.address || "";
  document.getElementById("partner-taxcode").value = p.taxCode || "";
  document.getElementById("partner-inactive").checked = !!p.inactive;

  validatePartnerIdInput(p.id);
  openModal("modal-add-partner");

  if (options.focusParent) {
    setTimeout(() => {
      const parentInput = document.getElementById('partner-parent-search');
      if (parentInput) parentInput.focus();
    }, 150);
  }
}

function openAssignToProjectModal(id) {
  const p = state.partners.find(item => item.id === id);
  if (!p) {
    showToast("Không tìm thấy đối tác!", "danger");
    return;
  }
  if (p.inactive) {
    showToast("Đối tác đang ngừng theo dõi. Hãy kích hoạt lại trước khi gán.", "warning");
    return;
  }

  const enterprises = state.partners.filter(x => x.type === "enterprise" && !x.inactive);
  if (enterprises.length === 0) {
    showToast("Chưa có doanh nghiệp nào. Hãy khai báo doanh nghiệp trước!", "warning");
    return;
  }

  openEditPartnerModal(id, { presetType: "project", focusParent: true });
}

window.generateAssignProjectId = function() {
  const partnerId = document.getElementById("assign-partner-id").value;
  const p = state.partners.find(item => item.id === partnerId);
  if (!p) return;
  const suggestedId = getUniquePartnerId(p.name, "project", p.id);
  document.getElementById("assign-new-id").value = suggestedId;
  showToast("Đã sinh mã công trình!", "success");
};

function handleAssignToProjectSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-assign-to-project");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const partnerId = document.getElementById("assign-partner-id").value;
  const p = state.partners.find(item => item.id === partnerId);
  if (!p || p.type !== "retail") {
    showToast("Đối tác không hợp lệ hoặc đã được gán!", "danger");
    return;
  }

  const parentInputVal = document.getElementById("assign-parent-search").value.trim();
  const parentP = resolveEnterpriseParent(parentInputVal);
  if (!parentP) {
    showToast("Vui lòng chọn doanh nghiệp mẹ hợp lệ!", "danger");
    return;
  }

  let newId = document.getElementById("assign-new-id").value.trim().toUpperCase();
  if (!newId) {
    newId = getUniquePartnerId(p.name, "project", p.id);
  }
  if (newId !== p.id && state.partners.some(x => x.id === newId && x.id !== p.id)) {
    showToast(`Mã "${newId}" đã tồn tại!`, "danger");
    return;
  }

  const idx = state.partners.findIndex(x => x.id === p.id);
  if (idx === -1) return;

  if (newId !== p.id) {
    propagatePartnerIdChange(p.id, newId, p.name);
  }

  state.partners[idx] = {
    ...p,
    id: newId,
    type: "project",
    parentId: parentP.id,
    _updatedAt: Date.now()
  };

  saveState();
  initExcelIntegration();
  closeModal("modal-assign-to-project");
  filterPartners();
  showToast(`Đã gán "${p.name}" vào công trình thuộc "${parentP.name}"!`, "success");
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
  const phone = document.getElementById("partner-phone").value.trim();
  const address = document.getElementById("partner-address").value.trim();
  const taxCode = document.getElementById("partner-taxcode").value.trim();
  const inactive = document.getElementById("partner-inactive").checked;

  let type = document.getElementById("partner-modal-type").value;
  let parentId = "";
  let projectName = "";

  if (editIndex === "-1") {
    if (type === "enterprise") {
      const radio = document.querySelector('input[name="enterprise-option"]:checked');
      const option = radio ? radio.value : 'new';
      if (option === 'existing') {
        type = "project";
        const parentInputVal = document.getElementById("partner-parent-search").value.trim();
        if (!parentInputVal) {
          showToast("Vui lòng chọn Doanh nghiệp mẹ!", "danger");
          return;
        }
        const parentP = resolveEnterpriseParent(parentInputVal);
        if (!parentP) {
          showToast("Doanh nghiệp mẹ không hợp lệ hoặc không tồn tại!", "danger");
          return;
        }
        parentId = parentP.id;
      } else {
        projectName = document.getElementById("partner-project-name").value.trim();
      }
    }
  } else {
    const pExist = state.partners.find(item => item.id === editIndex);
    if (!pExist) {
      showToast("Không tìm thấy đối tác đang sửa!", "danger");
      return;
    }

    const editTypeSelect = document.getElementById("partner-edit-type-select");
    type = editTypeSelect ? editTypeSelect.value : pExist.type;
    parentId = "";

    if (type === "project") {
      const parentInputVal = document.getElementById("partner-parent-search").value.trim();
      if (!parentInputVal) {
        showToast("Vui lòng chọn Doanh nghiệp mẹ cho công trình!", "danger");
        return;
      }
      const parentP = resolveEnterpriseParent(parentInputVal);
      if (!parentP) {
        showToast("Doanh nghiệp mẹ không hợp lệ hoặc không tồn tại!", "danger");
        return;
      }
      if (parentP.id === editIndex) {
        showToast("Không thể gán chính đối tác này làm doanh nghiệp mẹ!", "danger");
        return;
      }
      parentId = parentP.id;
    } else if (type === "enterprise") {
      parentId = "";
    } else {
      parentId = "";
    }

    if (pExist.type === "enterprise" && type !== "enterprise") {
      const childCount = state.partners.filter(c => c.type === "project" && c.parentId === pExist.id).length;
      if (childCount > 0) {
        showToast(`Doanh nghiệp này còn ${childCount} công trình con. Hãy chuyển hoặc gỡ các công trình con trước khi đổi phân loại.`, "danger");
        return;
      }
    }
  }

  if (!name) {
    showToast("Vui lòng nhập tên đối tác!", "danger");
    return;
  }

  if (editIndex !== "-1") {
    const idx = state.partners.findIndex(p => String(p.id) === String(editIndex));
    if (idx !== -1) {
      const pExist = state.partners[idx];
      const newId = idVal.toUpperCase();
      if (String(newId) !== String(editIndex) && state.partners.some(p => String(p.id) === String(newId))) {
        showToast(`Mã đối tác "${newId}" đã tồn tại!`, "danger");
        return;
      }

      if (newId !== editIndex) {
        propagatePartnerIdChange(editIndex, newId, name);
      }

      const updatedPartner = {
        id: newId,
        name,
        type,
        phone,
        email: pExist.email || "",
        address,
        taxCode,
        inactive,
        _updatedAt: Date.now()
      };
      if (type === "project" && parentId) {
        updatedPartner.parentId = parentId;
      }

      state.partners[idx] = updatedPartner;

      const typeChanged = pExist.type !== type;
      if (typeChanged) {
        showToast(`Đã đổi phân loại sang "${getPartnerTypeLabel(type)}" và cập nhật đối tác!`, "success");
      } else {
        showToast("Cập nhật đối tác thành công!", "success");
      }
    }
  } else {
    let id = idVal.toUpperCase();
    if (!id) {
      const prefixMap = { enterprise: "DN", project: "CT", retail: "KL", supplier: "NCC" };
      const prefix = prefixMap[type] || "DT";
      const nextNum = (state.partners.filter(p => p.type === type).length + 1).toString().padStart(3, '0');
      id = `${prefix}${nextNum}`;
      if (idEl) idEl.value = id;
    }

    if (state.partners.some(p => String(p.id) === String(id))) {
      showToast(`Mã đối tác "${id}" đã tồn tại!`, "danger");
      return;
    }

    state.partners.push({ id, name, type, parentId, phone, email: "", address, taxCode, inactive, _updatedAt: Date.now() });
    showToast("Thêm đối tác mới thành công!", "success");

    if (type === "enterprise" && projectName) {
      const projPrefix = "CT";
      const projNextNum = (state.partners.filter(p => p.type === "project").length + 1).toString().padStart(3, '0');
      const projId = `${projPrefix}${projNextNum}`;
      state.partners.push({
        id: projId,
        name: projectName,
        type: "project",
        parentId: id,
        phone,
        email: "",
        address,
        taxCode: "",
        inactive,
        _updatedAt: Date.now()
      });
      showToast(`Tạo thành công công trình "${projectName}" thuộc doanh nghiệp này!`, "success");
    }
  }

  saveState();
  initExcelIntegration();
  closeModal("modal-add-partner");
  document.getElementById("form-partner").reset();
  filterPartners();
  if (typeof filterDebts === "function") filterDebts();
}

function deletePartner(id) {
  const linkedCount = (state.vouchers || []).filter(v => v.partnerId === id).length;
  let confirmMsg = `Bạn có chắc chắn muốn xóa đối tác "${id}" không?`;
  if (linkedCount > 0) {
    confirmMsg = `Đối tác "${id}" còn ${linkedCount} chứng từ liên kết. Xóa sẽ làm các chứng từ này rơi vào nhóm "Chưa khớp đối tác" trên tab công nợ. Bạn có chắc muốn xóa?`;
  }
  if (confirm(confirmMsg)) {
    trackDeletedIds([id], 'partner');
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
window.openAssignToProjectModal = openAssignToProjectModal;
window.handleAssignToProjectSubmit = handleAssignToProjectSubmit;
window.triggerAutoExtractPhones = triggerAutoExtractPhones;
window.autoExtractPhonesAndCleanAddresses = autoExtractPhonesAndCleanAddresses;
window.batchSetPartnersInactive = batchSetPartnersInactive;

function toggleSelectAllPartners(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".partner-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchPartnersUI();
}

function updateBatchPartnersUI() {
  const checkboxes = document.querySelectorAll(".partner-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btnDelete = document.getElementById("btn-batch-delete-partners");
  const btnInactive = document.getElementById("btn-batch-inactive-partners");
  const count = document.getElementById("selected-partners-count");
  const countInactive = document.getElementById("selected-partners-count-inactive");

  if (checked.length > 0) {
    if (btnDelete) btnDelete.style.display = "inline-flex";
    if (btnInactive) btnInactive.style.display = "inline-flex";
    if (count) count.innerText = checked.length;
    if (countInactive) countInactive.innerText = checked.length;
  } else {
    if (btnDelete) btnDelete.style.display = "none";
    if (btnInactive) btnInactive.style.display = "none";
    if (count) count.innerText = "0";
    if (countInactive) countInactive.innerText = "0";
  }

  const master = document.getElementById("check-all-partners");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchSetPartnersInactive() {
  const checked = Array.from(document.querySelectorAll(".partner-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (!confirm(`Đặt trạng thái "Ngừng theo dõi" cho ${checked.length} đối tác đã chọn?`)) return;

  const ids = checked.map(cb => cb.value);
  let updated = 0;
  state.partners.forEach(p => {
    if (ids.includes(p.id) && !p.inactive) {
      p.inactive = true;
      p._updatedAt = Date.now();
      updated++;
    }
  });

  saveState();
  initExcelIntegration();
  filterPartners();
  updateBatchPartnersUI();
  showToast(`Đã ngừng theo dõi ${updated} đối tác!`, "success");
}

function batchDeletePartners() {
  const checked = Array.from(document.querySelectorAll(".partner-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} đối tác đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    // Đưa các ID vào danh sách xóa cloud (prefix 'part_') trước khi xóa khỏi state
    trackDeletedIds(idsToDelete, 'partner');
    state.partners = state.partners.filter(p => !idsToDelete.includes(p.id));

    saveState();

    if (typeof resetBatchSelectionUI === "function") {
      resetBatchSelectionUI({
        checkboxSelector: ".partner-checkbox",
        masterId: "check-all-partners",
        buttonId: "btn-batch-delete-partners",
        countId: "selected-partners-count"
      });
    } else {
      const master = document.getElementById("check-all-partners");
      if (master) master.checked = false;
      updateBatchPartnersUI();
    }

    filterPartners();
    if (typeof filterDebts === "function") filterDebts();
    if (typeof resetBatchSelectionUI === "function") {
      resetBatchSelectionUI({
        checkboxSelector: ".partner-checkbox",
        masterId: "check-all-partners",
        buttonId: "btn-batch-delete-partners",
        countId: "selected-partners-count"
      });
    }

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
