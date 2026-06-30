

// ==========================================================================
// BỘ ĐIỀU KHIỂN CHUỘT VÀ CONTEXT MENU TÙY BIẾN TOÀN CỤC
// ==========================================================================
function initMouseInteractions() {
  const contextMenu = document.getElementById("custom-context-menu");
  if (!contextMenu) {
    console.warn("custom-context-menu element not found!");
  }

  // 1. Nhấp đơn -> Highlight dòng được chọn
  document.addEventListener("click", function (e) {
    const row = e.target.closest("tr");
    if (row && row.hasAttribute("data-type")) {
      document.querySelectorAll("tr.active-row").forEach(r => r.classList.remove("active-row"));
      row.classList.add("active-row");
    }
  });

  // Ẩn context menu khi click chuột (trái, phải, giữa) bất kỳ đâu ngoài menu
  document.addEventListener("mousedown", function (e) {
    if (contextMenu && !e.target.closest("#custom-context-menu")) {
      contextMenu.style.display = "none";
    }
  });

  // Ẩn context menu ngay lập tức khi click chọn một chức năng bên trong nó
  if (contextMenu) {
    contextMenu.addEventListener("click", function () {
      contextMenu.style.display = "none";
    });
  }


  // 2. Nhấp đúp -> Kích hoạt hành động chính
  document.addEventListener("dblclick", function (e) {
    const row = e.target.closest("tr");
    if (!row) return;

    const type = row.getAttribute("data-type");
    const id = row.getAttribute("data-id");
    if (!type || !id) return;

    if (type === "voucher") {
      if (typeof viewVoucher === "function") {
        viewVoucher(id);
      }
    } else if (type === "product") {
      if (typeof promptEditProductPrice === "function") {
        promptEditProductPrice(id);
      }
    } else if (type === "partner") {
      if (typeof viewPartnerLedger === "function") {
        viewPartnerLedger(id);
      }
    }
  });

  // 3. Nhấp chuột phải -> Context Menu tùy biến
  document.addEventListener("contextmenu", function (e) {
    const row = e.target.closest("tr");
    if (!row || !row.hasAttribute("data-type")) {
      if (contextMenu) contextMenu.style.display = "none";
      return;
    }

    // Ngăn chặn menu chuột phải mặc định của trình duyệt
    e.preventDefault();

    const type = row.getAttribute("data-type");
    const subtype = row.getAttribute("data-subtype") || "";
    const id = row.getAttribute("data-id");

    if (!contextMenu) return;

    // Thiết lập nội dung menu động dựa trên đối tượng
    let menuHTML = "";
    const escapedId = escapeHtmlAttr(id);

    if (type === "voucher") {
      menuHTML = `
        <button class="context-menu-item" onclick="viewVoucher('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
          Xem và In chứng từ (${escapedId})
        </button>
      `;

      if (subtype === "sales") {
        menuHTML += `
          <button class="context-menu-item" onclick="editSalesVoucher('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Chỉnh sửa hóa đơn bán hàng
          </button>
        `;
      } else if (subtype === "purchase") {
        menuHTML += `
          <button class="context-menu-item" onclick="editPurchaseVoucher('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Chỉnh sửa hóa đơn mua hàng
          </button>
        `;
      } else if (subtype === "purchase_return") {
        menuHTML += `
          <button class="context-menu-item" onclick="editPurchaseReturnVoucher('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Chỉnh sửa trả lại hàng
          </button>
        `;
      } else if (subtype === "sales_return") {
        menuHTML += `
          <button class="context-menu-item" onclick="editSalesReturnVoucher('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Chỉnh sửa trả lại hàng bán
          </button>
        `;
      } else if (subtype === "purchase_order") {
        menuHTML += `
          <button class="context-menu-item" onclick="editPurchaseOrderVoucher('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Chỉnh sửa đơn đặt hàng
          </button>
        `;
      } else if (subtype === "sales_quotation") {
        menuHTML += `
          <button class="context-menu-item" onclick="convertQuotationToOrder('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px; color: var(--color-warning);"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            Chuyển thành Đơn bán hàng
          </button>
          <button class="context-menu-item" onclick="editQuotationVoucher('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Chỉnh sửa báo giá
          </button>
        `;
      }
      menuHTML += `
        <div class="context-menu-divider"></div>
        <button class="context-menu-item item-danger" onclick="deleteVoucher('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Xóa chứng từ này
        </button>
      `;
    } else if (type === "product") {
      menuHTML = `
        <button class="context-menu-item" onclick="viewStockLedgerForProduct('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
          Xem sổ thẻ kho (${escapedId})
        </button>
        <button class="context-menu-item" onclick="promptQuickImport('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
          Nhập kho nhanh (${escapedId})
        </button>
        <button class="context-menu-item" onclick="promptEditProductPrice('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          Chỉnh sửa mặt hàng
        </button>
        <div class="context-menu-divider"></div>
        <button class="context-menu-item item-danger" onclick="deleteProduct('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Xóa mặt hàng này
        </button>
      `;
    } else if (type === "partner") {
      menuHTML = `
        <button class="context-menu-item" onclick="viewPartnerLedger('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          Xem sổ chi tiết (${escapedId})
        </button>
        <button class="context-menu-item" onclick="openEditPartnerModal('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          Chỉnh sửa đối tác
         </button>
        <button class="context-menu-item" onclick="promptEditPartnerOpeningDebt('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Chỉnh sửa công nợ đầu kỳ
        </button>
        <div class="context-menu-divider"></div>
        <button class="context-menu-item item-danger" onclick="deletePartner('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Xóa đối tác này
        </button>
      `;
    }

    contextMenu.innerHTML = menuHTML;

    // Xác định vị trí hiển thị Menu để không bị tràn màn hình
    contextMenu.style.display = "block";

    const menuWidth = contextMenu.offsetWidth || 190;
    const menuHeight = contextMenu.offsetHeight || 150;

    let x = e.pageX;
    let y = e.pageY;

    if (x + menuWidth > window.innerWidth + window.scrollX) {
      x = window.innerWidth + window.scrollX - menuWidth - 10;
    }

    if (y + menuHeight > window.innerHeight + window.scrollY) {
      y = window.innerHeight + window.scrollY - menuHeight - 10;
    }

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
  });

  // 4. Nhấn nút ESC để đóng cửa sổ/modal đang mở (Ưu tiên đóng modal trên cùng)
  //    Nhấn nút F4 để thêm dòng mới, F8 để xóa dòng trong form Mua hàng/Bán hàng đang mở
  //    Nhấn tổ hợp Ctrl + S để ghi sổ/lưu chứng từ đang mở
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      const visibleOverlays = Array.from(document.querySelectorAll(".modal-overlay")).filter(
        el => el.style.display === "flex" || window.getComputedStyle(el).display === "flex"
      );

      if (visibleOverlays.length > 0) {
        visibleOverlays.sort((a, b) => {
          const zA = parseInt(window.getComputedStyle(a).zIndex) || 1000;
          const zB = parseInt(window.getComputedStyle(b).zIndex) || 1000;
          return zB - zA;
        });

        const form = visibleOverlays[0].querySelector("form");
        if (form) {
          e.preventDefault();
          if (typeof form.requestSubmit === "function") {
            form.requestSubmit();
          } else {
            const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('input[type="submit"]');
            if (submitBtn) {
              submitBtn.click();
            } else {
              form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
          }
        }
      }
    } else if (e.key === "F3") {
      const activeEl = document.activeElement;
      const type = getActiveLookupType(activeEl);
      if (type) {
        e.preventDefault();
        showF3LookupModal(activeEl, type);
      }
    } else if (e.key === "Escape") {
      const visibleOverlays = Array.from(document.querySelectorAll(".modal-overlay")).filter(
        el => el.style.display === "flex" || window.getComputedStyle(el).display === "flex"
      );

      if (visibleOverlays.length > 0) {
        // Sắp xếp theo z-index giảm dần để ưu tiên đóng modal phụ mở sau (như quick-add-partner)
        visibleOverlays.sort((a, b) => {
          const zA = parseInt(window.getComputedStyle(a).zIndex) || 1000;
          const zB = parseInt(window.getComputedStyle(b).zIndex) || 1000;
          return zB - zA;
        });

        if (typeof closeModal === "function") {
          closeModal(visibleOverlays[0].id);
        }
        e.preventDefault();
      }
    } else if (e.key === "F4") {
      const salesModal = document.getElementById("modal-add-sales");
      const isSalesVisible = salesModal && (salesModal.style.display === "flex" || window.getComputedStyle(salesModal).display === "flex");
      const purchaseModal = document.getElementById("modal-add-purchase");
      const isPurchaseVisible = purchaseModal && (purchaseModal.style.display === "flex" || window.getComputedStyle(purchaseModal).display === "flex");
      const purchaseOrderModal = document.getElementById("modal-add-purchase-order");
      const isPurchaseOrderVisible = purchaseOrderModal && (purchaseOrderModal.style.display === "flex" || window.getComputedStyle(purchaseOrderModal).display === "flex");
      const purchaseReturnModal = document.getElementById("modal-add-purchase-return");
      const isPurchaseReturnVisible = purchaseReturnModal && (purchaseReturnModal.style.display === "flex" || window.getComputedStyle(purchaseReturnModal).display === "flex");
      const salesReturnModal = document.getElementById("modal-add-sales-return");
      const isSalesReturnVisible = salesReturnModal && (salesReturnModal.style.display === "flex" || window.getComputedStyle(salesReturnModal).display === "flex");
      const salesQuotationModal = document.getElementById("modal-add-sales-quotation");
      const isSalesQuotationVisible = salesQuotationModal && (salesQuotationModal.style.display === "flex" || window.getComputedStyle(salesQuotationModal).display === "flex");

      if (isSalesVisible) {
        if (typeof addSalesFormRow === "function") {
          addSalesFormRow();
        }
        e.preventDefault();
      } else if (isPurchaseVisible) {
        if (typeof addPurchaseFormRow === "function") {
          addPurchaseFormRow();
        }
        e.preventDefault();
      } else if (isPurchaseOrderVisible) {
        if (typeof addPurchaseOrderFormRow === "function") {
          addPurchaseOrderFormRow();
        }
        e.preventDefault();
      } else if (isPurchaseReturnVisible) {
        if (typeof addPurchaseReturnFormRow === "function") {
          addPurchaseReturnFormRow();
        }
        e.preventDefault();
      } else if (isSalesReturnVisible) {
        if (typeof addSalesReturnFormRow === "function") {
          addSalesReturnFormRow();
        }
        e.preventDefault();
      } else if (isSalesQuotationVisible) {
        if (typeof addQuotationFormRow === "function") {
          addQuotationFormRow();
        }
        e.preventDefault();
      }
    } else if (e.key === "F8") {
      const salesModal = document.getElementById("modal-add-sales");
      const isSalesVisible = salesModal && (salesModal.style.display === "flex" || window.getComputedStyle(salesModal).display === "flex");
      const purchaseModal = document.getElementById("modal-add-purchase");
      const isPurchaseVisible = purchaseModal && (purchaseModal.style.display === "flex" || window.getComputedStyle(purchaseModal).display === "flex");
      const purchaseOrderModal = document.getElementById("modal-add-purchase-order");
      const isPurchaseOrderVisible = purchaseOrderModal && (purchaseOrderModal.style.display === "flex" || window.getComputedStyle(purchaseOrderModal).display === "flex");
      const purchaseReturnModal = document.getElementById("modal-add-purchase-return");
      const isPurchaseReturnVisible = purchaseReturnModal && (purchaseReturnModal.style.display === "flex" || window.getComputedStyle(purchaseReturnModal).display === "flex");
      const salesReturnModal = document.getElementById("modal-add-sales-return");
      const isSalesReturnVisible = salesReturnModal && (salesReturnModal.style.display === "flex" || window.getComputedStyle(salesReturnModal).display === "flex");
      const salesQuotationModal = document.getElementById("modal-add-sales-quotation");
      const isSalesQuotationVisible = salesQuotationModal && (salesQuotationModal.style.display === "flex" || window.getComputedStyle(salesQuotationModal).display === "flex");

      if (isSalesVisible) {
        const activeEl = document.activeElement;
        const itemsBody = document.getElementById("sales-form-items-body");
        if (itemsBody) {
          let trToDelete = null;
          if (activeEl && itemsBody.contains(activeEl)) {
            trToDelete = activeEl.closest("tr");
          } else {
            trToDelete = itemsBody.querySelector("tr:last-child");
          }
          if (trToDelete) {
            trToDelete.remove();
            if (typeof recalculateSalesTotals === "function") {
              recalculateSalesTotals();
            }
          }
        }
        e.preventDefault();
      } else if (isPurchaseVisible) {
        const activeEl = document.activeElement;
        const itemsBody = document.getElementById("purchase-form-items-body");
        if (itemsBody) {
          let trToDelete = null;
          if (activeEl && itemsBody.contains(activeEl)) {
            trToDelete = activeEl.closest("tr");
          } else {
            trToDelete = itemsBody.querySelector("tr:last-child");
          }
          if (trToDelete) {
            trToDelete.remove();
            if (typeof recalculatePurchaseTotals === "function") {
              recalculatePurchaseTotals();
            }
          }
        }
        e.preventDefault();
      } else if (isPurchaseOrderVisible) {
        const activeEl = document.activeElement;
        const itemsBody = document.getElementById("purchase-order-form-items-body");
        if (itemsBody) {
          let trToDelete = null;
          if (activeEl && itemsBody.contains(activeEl)) {
            trToDelete = activeEl.closest("tr");
          } else {
            trToDelete = itemsBody.querySelector("tr:last-child");
          }
          if (trToDelete) {
            trToDelete.remove();
            if (typeof recalculatePurchaseOrderTotals === "function") {
              recalculatePurchaseOrderTotals();
            }
          }
        }
        e.preventDefault();
      } else if (isPurchaseReturnVisible) {
        const activeEl = document.activeElement;
        const itemsBody = document.getElementById("purchase-return-form-items-body");
        if (itemsBody) {
          let trToDelete = null;
          if (activeEl && itemsBody.contains(activeEl)) {
            trToDelete = activeEl.closest("tr");
          } else {
            trToDelete = itemsBody.querySelector("tr:last-child");
          }
          if (trToDelete) {
            trToDelete.remove();
            if (typeof recalculatePurchaseReturnTotals === "function") {
              recalculatePurchaseReturnTotals();
            }
          }
        }
        e.preventDefault();
      } else if (isSalesReturnVisible) {
        const activeEl = document.activeElement;
        const itemsBody = document.getElementById("sales-return-form-items-body");
        if (itemsBody) {
          let trToDelete = null;
          if (activeEl && itemsBody.contains(activeEl)) {
            trToDelete = activeEl.closest("tr");
          } else {
            trToDelete = itemsBody.querySelector("tr:last-child");
          }
          if (trToDelete) {
            trToDelete.remove();
            if (typeof recalculateSalesReturnTotals === "function") {
              recalculateSalesReturnTotals();
            }
          }
        }
        e.preventDefault();
      } else if (isSalesQuotationVisible) {
        const activeEl = document.activeElement;
        const itemsBody = document.getElementById("quotation-form-items-body");
        if (itemsBody) {
          let trToDelete = null;
          if (activeEl && itemsBody.contains(activeEl)) {
            trToDelete = activeEl.closest("tr");
          } else {
            trToDelete = itemsBody.querySelector("tr:last-child");
          }
          if (trToDelete) {
            trToDelete.remove();
            if (typeof recalculateQuotationTotals === "function") {
              recalculateQuotationTotals();
            }
          }
        }
        e.preventDefault();
      }
    }
  });

  // 5. Nhấp chuột vào phần nền đen (backdrop) của modal để tự động đóng cửa sổ
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("modal-overlay")) {
      if (typeof closeModal === "function") {
        closeModal(e.target.id);
      }
    }
  });
}

window.initMouseInteractions = initMouseInteractions;

// ==========================================================================
// PHÍM TẮT CTRL+F — TÌM KIẾM NHANH TRONG TAB ĐANG HIỂN THỊ
// ==========================================================================
/**
 * Ánh xạ tab/subtab → ID của ô tìm kiếm văn bản chính của trang đó.
 * Với tab "inventory", cần kiểm tra thêm subtab đang active.
 */
function getActiveSearchInputId() {
  const activeMenuItem = document.querySelector(".sidebar-menu .menu-item.active");
  if (!activeMenuItem) return null;
  const tabId = activeMenuItem.getAttribute("data-tab");

  const tabSearchMap = {
    purchase: "search-purchase",
    sales: "search-sales",
    partners: "partner-search-input",
    debts: "debt-search-input",
    cash: "cash-search-input"
  };

  if (tabId === "inventory") {
    // Kiểm tra subtab kho hàng đang hiển thị
    const panelLedger = document.getElementById("inventory-subtab-ledger");
    if (panelLedger && panelLedger.style.display !== "none") {
      return "search-ledger-products"; // Subtab: Sổ thẻ kho chi tiết
    }
    return "search-inventory"; // Subtab: Tồn kho tổng hợp (mặc định)
  }

  return tabSearchMap[tabId] || null;
}

function initCtrlFShortcut() {
  document.addEventListener("keydown", function (e) {
    // Ctrl+F hoặc Cmd+F (macOS)
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      // Bỏ qua nếu đang focus vào input/textarea/select để không gây xung đột
      const tag = document.activeElement ? document.activeElement.tagName : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Bỏ qua nếu có modal đang mở
      const anyModalOpen = Array.from(document.querySelectorAll(".modal-overlay")).some(
        m => m.style.display === "flex" || m.style.display === "block"
      );
      if (anyModalOpen) return;

      const inputId = getActiveSearchInputId();
      if (!inputId) return;

      const input = document.getElementById(inputId);
      if (!input) return;

      e.preventDefault(); // Chặn hộp tìm kiếm trình duyệt mặc định
      input.focus();
      input.select(); // Chọn toàn bộ nội dung cũ để gõ đè ngay
    }
  });
}

window.initCtrlFShortcut = initCtrlFShortcut;
window.getActiveSearchInputId = getActiveSearchInputId;

// ==========================================================================
// ĐIỀU HƯỚNG BẢNG ĐƠN HÀNG BẰNG BÀN PHÍM (TAB / F1 / F2)
// ==========================================================================

/**
 * Lấy tất cả phần tử có thể focus trong một modal đang hiển thị,
 * theo đúng thứ tự xuất hiện trên giao diện (DOM order).
 * Bỏ qua: disabled, hidden, nút xóa dòng, các ô chỉ hiển thị (item-total-display).
 */
function getFocusableFieldsInModal(modalEl) {
  return Array.from(
    modalEl.querySelectorAll(
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
    )
  ).filter(el => {
    // Bỏ qua ô thành tiền chỉ hiển thị
    if (el.classList.contains('item-total-display')) return false;
    // Bỏ qua các ô ẩn (bởi style hoặc parent ẩn)
    if (el.offsetParent === null) return false;
    return true;
  });
}

/**
 * Helper: Lấy tất cả input/select có thể focus trong một dòng <tr> của bảng đơn hàng.
 */
function getEditableCellsInRow(tr) {
  return Array.from(tr.querySelectorAll(
    'input:not([disabled]):not([type="hidden"]), select:not([disabled])'
  )).filter(el => !el.classList.contains('item-total-display') && el.offsetParent !== null);
}

/**
 * Lấy tbody của bảng đơn hàng nếu el đang nằm bên trong.
 */
function getOrderTableRows(currentEl) {
  const tbodyId = currentEl.closest('#purchase-form-items-body')
    ? 'purchase-form-items-body'
    : currentEl.closest('#sales-form-items-body')
      ? 'sales-form-items-body'
      : currentEl.closest('#purchase-order-form-items-body')
        ? 'purchase-order-form-items-body'
        : currentEl.closest('#purchase-return-form-items-body')
          ? 'purchase-return-form-items-body'
          : null;
  if (!tbodyId) return null;
  const tbody = document.getElementById(tbodyId);
  return { tbody, rows: Array.from(tbody.querySelectorAll('tr')), tbodyId };
}

/**
 * Focus vào ô đầu tiên (item-productId) của một dòng.
 */
function focusRowFirstCell(tr) {
  const cell = tr.querySelector('.item-productId');
  if (cell) { cell.focus(); cell.select && cell.select(); }
}

/**
 * Khởi tạo điều hướng bàn phím cho form đơn hàng (Mua + Bán).
 *
 * F1 = di chuyển tới ô TIẾP THEO trong toàn bộ modal đang mở
 * F2 = di chuyển tới ô TRƯỚC ĐÓ trong toàn bộ modal đang mở
 * Tab ở ô cuối dòng bảng → nhảy sang dòng tiếp hoặc thêm dòng mới
 * Shift+Tab ở ô đầu dòng → lên dòng trước
 */
function initOrderFormKeyboardNavigation() {
  document.addEventListener('keydown', function (e) {
    // ── F5: Reset đơn giá bán hàng theo giá kho (chặn load lại trang) ─────
    if (e.key === 'F5') {
      const salesModal = document.getElementById('modal-add-sales');
      const isSalesOpen = salesModal && (salesModal.style.display === 'flex' || window.getComputedStyle(salesModal).display === 'flex');
      
      if (isSalesOpen) {
        e.preventDefault();
        const salesRows = salesModal.querySelectorAll("#sales-form-items-body tr");
        if (salesRows.length > 0) {
          let count = 0;
          salesRows.forEach(row => {
            const selectEl = row.querySelector(".item-productId");
            if (!selectEl) return;
            const prodVal = selectEl.value;
            const prod = resolveProduct(prodVal);
            if (prod) {
              ensureProductExcelRow(prod);
              const salePriceVal = prod.salePrice1 !== undefined && prod.salePrice1 > 0
                ? prod.salePrice1
                : (prod.excelRow && prod.excelRow[21] !== undefined && Number(prod.excelRow[21]) > 0
                  ? Number(prod.excelRow[21])
                  : (Math.round(prod.avgCost * 1.35 / 1000) * 1000 || 50000));
              
              row.querySelector(".item-price").value = Number(salePriceVal).toLocaleString("vi-VN");
              count++;
            }
          });
          recalculateSalesTotals();
          if (typeof showToast === "function") {
            showToast(`Đã khôi phục đơn giá gốc của ${count} mặt hàng từ kho!`, "success");
          }
        }
        return;
      }

      const purchaseModal = document.getElementById('modal-add-purchase');
      const isPurchaseOpen = purchaseModal && (purchaseModal.style.display === 'flex' || window.getComputedStyle(purchaseModal).display === 'flex');
      if (isPurchaseOpen) {
        e.preventDefault();
        const purchaseRows = purchaseModal.querySelectorAll("#purchase-form-items-body tr");
        if (purchaseRows.length > 0) {
          let count = 0;
          purchaseRows.forEach(row => {
            const selectEl = row.querySelector(".item-productId");
            if (!selectEl) return;
            const prodVal = selectEl.value;
            const prod = resolveProduct(prodVal);
            if (prod) {
              ensureProductExcelRow(prod);
              const purchasePriceVal = prod.lastPurchasePrice !== undefined && prod.lastPurchasePrice > 0
                ? prod.lastPurchasePrice
                : (prod.excelRow && prod.excelRow[20] !== undefined && Number(prod.excelRow[20]) > 0
                  ? Number(prod.excelRow[20])
                  : (prod.avgCost || prod.initialCost || 10000));
              
              row.querySelector(".item-price").value = Number(purchasePriceVal).toLocaleString("vi-VN");
              count++;
            }
          });
          recalculatePurchaseTotals();
          if (typeof showToast === "function") {
            showToast(`Đã khôi phục đơn giá gốc của ${count} mặt hàng từ kho!`, "success");
          }
        }
        return;
      }

      const purchaseOrderModal = document.getElementById('modal-add-purchase-order');
      const isPurchaseOrderOpen = purchaseOrderModal && (purchaseOrderModal.style.display === 'flex' || window.getComputedStyle(purchaseOrderModal).display === 'flex');
      if (isPurchaseOrderOpen) {
        e.preventDefault();
        const purchaseOrderRows = purchaseOrderModal.querySelectorAll("#purchase-order-form-items-body tr");
        if (purchaseOrderRows.length > 0) {
          let count = 0;
          purchaseOrderRows.forEach(row => {
            const selectEl = row.querySelector(".item-productId");
            if (!selectEl) return;
            const prodVal = selectEl.value;
            const prod = resolveProduct(prodVal);
            if (prod) {
              ensureProductExcelRow(prod);
              const purchasePriceVal = prod.lastPurchasePrice !== undefined && prod.lastPurchasePrice > 0
                ? prod.lastPurchasePrice
                : (prod.excelRow && prod.excelRow[20] !== undefined && Number(prod.excelRow[20]) > 0
                  ? Number(prod.excelRow[20])
                  : (prod.avgCost || prod.initialCost || 10000));
              
              row.querySelector(".item-price").value = Number(purchasePriceVal).toLocaleString("vi-VN");
              count++;
            }
          });
          recalculatePurchaseOrderTotals();
          if (typeof showToast === "function") {
            showToast("Đã khôi phục đơn giá gốc của " + count + " mặt hàng từ kho!", "success");
          }
        }
        return;
      }

      const purchaseReturnModal = document.getElementById('modal-add-purchase-return');
      const isPurchaseReturnOpen = purchaseReturnModal && (purchaseReturnModal.style.display === 'flex' || window.getComputedStyle(purchaseReturnModal).display === 'flex');
      if (isPurchaseReturnOpen) {
        e.preventDefault();
        const purchaseReturnRows = purchaseReturnModal.querySelectorAll("#purchase-return-form-items-body tr");
        if (purchaseReturnRows.length > 0) {
          let count = 0;
          purchaseReturnRows.forEach(row => {
            const selectEl = row.querySelector(".item-productId");
            if (!selectEl) return;
            const prodVal = selectEl.value;
            const prod = resolveProduct(prodVal);
            if (prod) {
              ensureProductExcelRow(prod);
              const purchasePriceVal = prod.lastPurchasePrice !== undefined && prod.lastPurchasePrice > 0
                ? prod.lastPurchasePrice
                : (prod.excelRow && prod.excelRow[20] !== undefined && Number(prod.excelRow[20]) > 0
                  ? Number(prod.excelRow[20])
                  : (prod.avgCost || prod.initialCost || 10000));
              
              row.querySelector(".item-price").value = Number(purchasePriceVal).toLocaleString("vi-VN");
              count++;
            }
          });
          recalculatePurchaseReturnTotals();
          if (typeof showToast === "function") {
            showToast("Đã khôi phục đơn giá gốc của " + count + " mặt hàng từ kho!", "success");
          }
        }
        return;
      }
    }

    const el = document.activeElement;
    if (!el) return;

    // Xác định modal đang mở chứa el hiện tại
    const activeModal = el.closest('#modal-add-purchase, #modal-add-sales, #modal-add-purchase-order, #modal-add-purchase-return');
    if (!activeModal) return;

    // ── F1: chuyển sang ô tiếp theo trong toàn bộ modal ──────────────────
    if (e.key === 'F1') {
      e.preventDefault();
      const fields = getFocusableFieldsInModal(activeModal);
      const idx = fields.indexOf(el);
      if (idx === -1) return;
      if (idx < fields.length - 1) {
        fields[idx + 1].focus();
        fields[idx + 1].select && fields[idx + 1].select();
      } else {
        // Đang ở ô cuối cùng của modal → thêm dòng mới nếu đang trong bảng
        const info = getOrderTableRows(el);
        if (info) {
          if (info.tbodyId === 'purchase-form-items-body') addPurchaseFormRow();
          else if (info.tbodyId === 'purchase-order-form-items-body') addPurchaseOrderFormRow();
          else if (info.tbodyId === 'purchase-return-form-items-body') addPurchaseReturnFormRow();
          else addSalesFormRow();
        }
      }
      return;
    }

    // ── F2: quay lại ô trước đó trong toàn bộ modal ────────────────────
    if (e.key === 'F2') {
      e.preventDefault();
      const fields = getFocusableFieldsInModal(activeModal);
      const idx = fields.indexOf(el);
      if (idx > 0) {
        fields[idx - 1].focus();
        fields[idx - 1].select && fields[idx - 1].select();
      }
      return;
    }

    // ── F6: di chuyển tới ô cùng cột ở dòng dưới ──────────────────────
    if (e.key === 'F6') {
      const info = getOrderTableRows(el);
      if (info) {
        const { rows } = info;
        const currentRow = el.closest('tr');
        if (currentRow) {
          const rowIdx = rows.indexOf(currentRow);
          if (rowIdx < rows.length - 1) {
            const cells = getEditableCellsInRow(currentRow);
            const cellIdx = cells.indexOf(el);
            if (cellIdx !== -1) {
              e.preventDefault();
              const nextRow = rows[rowIdx + 1];
              const nextCells = getEditableCellsInRow(nextRow);
              const targetEl = nextCells[Math.min(cellIdx, nextCells.length - 1)];
              if (targetEl) {
                targetEl.focus();
                targetEl.select && targetEl.select();
              }
            }
          }
        }
      }
      return;
    }

    // ── F7: di chuyển tới ô cùng cột ở dòng trên ──────────────────────
    if (e.key === 'F7') {
      const info = getOrderTableRows(el);
      if (info) {
        const { rows } = info;
        const currentRow = el.closest('tr');
        if (currentRow) {
          const rowIdx = rows.indexOf(currentRow);
          if (rowIdx > 0) {
            const cells = getEditableCellsInRow(currentRow);
            const cellIdx = cells.indexOf(el);
            if (cellIdx !== -1) {
              e.preventDefault();
              const prevRow = rows[rowIdx - 1];
              const prevCells = getEditableCellsInRow(prevRow);
              const targetEl = prevCells[Math.min(cellIdx, prevCells.length - 1)];
              if (targetEl) {
                targetEl.focus();
                targetEl.select && targetEl.select();
              }
            }
          }
        }
      }
      return;
    }

    // ── Tab: chuyển dòng trong bảng đơn hàng ─────────────────────────────
    const info = getOrderTableRows(el);
    if (!info) return;
    const { rows, tbodyId } = info;
    if (rows.length === 0) return;
    const isPurchase = tbodyId === 'purchase-form-items-body';
    const isPurchaseOrder = tbodyId === 'purchase-order-form-items-body';
    const isPurchaseReturn = tbodyId === 'purchase-return-form-items-body';
    const currentRow = el.closest('tr');
    if (!currentRow) return;
    const rowIdx = rows.indexOf(currentRow);

    if (e.key === 'Tab' && !e.shiftKey) {
      const cells = getEditableCellsInRow(currentRow);
      const cellIdx = cells.indexOf(el);
      if (cellIdx === -1 || cellIdx < cells.length - 1) return; // Chưa ở ô cuối

      e.preventDefault();
      if (rowIdx < rows.length - 1) {
        focusRowFirstCell(rows[rowIdx + 1]);
      } else {
        if (isPurchase) addPurchaseFormRow();
        else if (isPurchaseOrder) addPurchaseOrderFormRow();
        else if (isPurchaseReturn) addPurchaseReturnFormRow();
        else addSalesFormRow();
      }
      return;
    }

    if (e.key === 'Tab' && e.shiftKey) {
      const cells = getEditableCellsInRow(currentRow);
      const cellIdx = cells.indexOf(el);
      if (cellIdx !== 0 || rowIdx === 0) return;

      e.preventDefault();
      const prevRow = rows[rowIdx - 1];
      const prevCells = getEditableCellsInRow(prevRow);
      if (prevCells.length > 0) {
        const lastCell = prevCells[prevCells.length - 1];
        lastCell.focus();
        lastCell.select && lastCell.select();
      }
      return;
    }
  });
}
window.getFocusableFieldsInModal = getFocusableFieldsInModal;
window.getEditableCellsInRow = getEditableCellsInRow;
window.getOrderTableRows = getOrderTableRows;
window.focusRowFirstCell = focusRowFirstCell;
window.initOrderFormKeyboardNavigation = initOrderFormKeyboardNavigation;

// ── Dropdown phím tắt và lọc nâng cao ───────────────────────────────────────
function toggleShortcutDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("shortcut-dropdown-menu");
  if (!menu) return;
  if (menu.style.display === "none" || menu.style.display === "") {
    menu.style.display = "block";
  } else {
    menu.style.display = "none";
  }
}

document.addEventListener("click", function (e) {
  const menu = document.getElementById("shortcut-dropdown-menu");
  if (menu && menu.style.display === "block") {
    if (!e.target.closest(".dropdown")) {
      menu.style.display = "none";
    }
  }

  // Close export dropdowns
  const pDrop = document.getElementById("purchase-export-dropdown");
  if (pDrop && pDrop.style.display === "block") {
    if (!e.target.closest("#purchase-export-dropdown-wrap")) {
      pDrop.style.display = "none";
    }
  }
  const sDrop = document.getElementById("sales-export-dropdown");
  if (sDrop && sDrop.style.display === "block") {
    if (!e.target.closest("#sales-export-dropdown-wrap")) {
      sDrop.style.display = "none";
    }
  }
  const dDrop = document.getElementById("debts-export-dropdown");
  if (dDrop && dDrop.style.display === "block") {
    if (!e.target.closest("#debts-export-dropdown-wrap")) {
      dDrop.style.display = "none";
    }
  }
  const vpDrop = document.getElementById("voucher-print-dropdown");
  if (vpDrop && vpDrop.style.display === "block") {
    if (!e.target.closest("#voucher-print-dropdown-wrap")) {
      vpDrop.style.display = "none";
    }
  }
});

function toggleAdvancedFilter(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (panel.style.display === "none" || panel.style.display === "") {
    panel.style.display = "block";
  } else {
    panel.style.display = "none";
  }
}

function clearAdvancedSalesFilters() {
  const el = document.getElementById("adv-filter-sales-payment");
  if (el) el.value = "";
  if (typeof filterSalesTable === "function") filterSalesTable();
}

function clearAdvancedPurchaseFilters() {
  const el = document.getElementById("adv-filter-purchase-payment");
  if (el) el.value = "";
  if (typeof filterPurchaseTable === "function") filterPurchaseTable();
}

function clearAdvancedPurchaseOrderFilters() {
  const el = document.getElementById("adv-filter-purchase-order-payment");
  if (el) el.value = "";
  if (typeof filterPurchaseOrderTable === "function") filterPurchaseOrderTable();
}

function clearAdvancedPurchaseReturnFilters() {
  const el = document.getElementById("adv-filter-purchase-return-payment");
  if (el) el.value = "";
  if (typeof filterPurchaseReturnTable === "function") filterPurchaseReturnTable();
}

window.toggleShortcutDropdown = toggleShortcutDropdown;
window.toggleAdvancedFilter = toggleAdvancedFilter;
window.clearAdvancedSalesFilters = clearAdvancedSalesFilters;
window.clearAdvancedPurchaseFilters = clearAdvancedPurchaseFilters;
window.clearAdvancedPurchaseOrderFilters = clearAdvancedPurchaseOrderFilters;
window.clearAdvancedPurchaseReturnFilters = clearAdvancedPurchaseReturnFilters;

// ==========================================================================
// SIDEBAR TOGGLE, BREADCRUMB, DATE PRESETS & NOTIFICATION BADGES
// ==========================================================================

// Sidebar collapse/expand with localStorage persistence
function toggleSidebar() {
  var sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  var isCollapsed = sidebar.classList.contains('collapsed');
  localStorage.setItem('sidebar-collapsed', isCollapsed);
  // Update modal offsets
  document.querySelectorAll('.modal-overlay').forEach(function(m) {
    if (isCollapsed) {
      m.style.left = '68px';
      m.style.width = 'calc(100% - 68px)';
    } else {
      m.style.left = '260px';
      m.style.width = 'calc(100% - 260px)';
    }
  });
}

// Restore sidebar state on load
(function restoreSidebarState() {
  if (localStorage.getItem('sidebar-collapsed') === 'true') {
    var sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.add('collapsed');
  }
})();

// Breadcrumb updater
function updateBreadcrumb(tabId, subTabId) {
  var bc = document.getElementById('header-breadcrumb');
  if (!bc) return;
  var tabNames = {
    dashboard: 'Tổng quan', purchase: 'Mua hàng', sales: 'Bán hàng',
    inventory: 'Kho hàng', partners: 'Khách hàng & NCC', debts: 'Công nợ',
    cash: 'Quỹ tiền', reports: 'Báo cáo', 'excel-hub': 'Tích hợp Excel',
    settings: 'Thiết lập', escrow: 'Ký quỹ & Ký cược'
  };
  var subTabNames = {
    invoice: 'Hóa đơn mua', order: 'Đơn đặt hàng', 'return': 'Hàng trả lại',
    'inventory-list': 'Danh sách kho', 'inventory-ledger': 'Thẻ kho',
    'sales-invoice': 'Hóa đơn bán', 'sales-return': 'Hàng trả lại (bán)'
  };
  var html = '<span class="breadcrumb-item" onclick="switchTab(\'dashboard\')">Trang chủ</span>';
  html += '<span class="breadcrumb-separator">›</span>';
  if (subTabId && subTabNames[subTabId]) {
    html += '<span class="breadcrumb-item" onclick="switchTab(\'' + tabId + '\')">' + (tabNames[tabId] || tabId) + '</span>';
    html += '<span class="breadcrumb-separator">›</span>';
    html += '<span class="breadcrumb-item active">' + subTabNames[subTabId] + '</span>';
  } else {
    html += '<span class="breadcrumb-item active">' + (tabNames[tabId] || tabId) + '</span>';
  }
  bc.innerHTML = html;
}

// Date preset controller
function setDatePreset(preset, fromId, toId, filterFnName, btnEl) {
  var now = new Date();
  var from, to;
  const tzOffset = now.getTimezoneOffset() * 60000;
  to = new Date(now.getTime() - tzOffset).toISOString().split('T')[0];
  switch (preset) {
    case 'today':
      from = to;
      break;
    case 'week':
      // Tính thứ 2 đầu tuần theo giờ địa phương
      var dayOfWeek = now.getDay();
      var distance = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      var d = new Date(now.getTime() + distance * 86400000);
      from = new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
      break;
    case 'month':
      from = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
      break;
    case 'quarter':
      var qm = Math.floor(now.getMonth() / 3) * 3;
      from = now.getFullYear() + '-' + String(qm + 1).padStart(2, '0') + '-01';
      break;
    case 'year':
      from = now.getFullYear() + '-01-01';
      break;
    default:
      from = '';
      to = '';
  }
  document.getElementById(fromId).value = from;
  document.getElementById(toId).value = to;
  // Highlight active preset
  if (btnEl) {
    var parent = btnEl.closest('.date-presets');
    if (parent) parent.querySelectorAll('.date-preset-btn').forEach(function (b) { b.classList.remove('active'); });
    btnEl.classList.add('active');
  }
  if (filterFnName && window[filterFnName]) window[filterFnName]();
}

// Sidebar notification badges
function updateSidebarBadges() {
  document.querySelectorAll('.nav-badge').forEach(function (b) { b.remove(); });
  try {
    var vouchers = (window.state && window.state.vouchers) ? window.state.vouchers : [];
    var products = (window.state && window.state.products) ? window.state.products : [];
    // Count unsettled debts
    var unsettledCount = vouchers.filter(function (v) {
      return v.type === 'sales' && v.paymentMethod && v.paymentMethod.indexOf('131') !== -1 && (v.remainingBalance > 0);
    }).length;
    if (unsettledCount > 0) {
      var debtsMenuItem = document.querySelector('.menu-item[data-tab="debts"]');
      if (debtsMenuItem) {
        var badge = document.createElement('span');
        badge.className = 'nav-badge badge-amber';
        badge.textContent = unsettledCount > 99 ? '99+' : unsettledCount;
        debtsMenuItem.appendChild(badge);
      }
    }
    // Count negative stock
    var negativeStock = products.filter(function (p) { return p.stock < 0; }).length;
    if (negativeStock > 0) {
      var invMenuItem = document.querySelector('.menu-item[data-tab="inventory"]');
      if (invMenuItem) {
        var badge2 = document.createElement('span');
        badge2.className = 'nav-badge';
        badge2.textContent = negativeStock > 99 ? '99+' : negativeStock;
        invMenuItem.appendChild(badge2);
      }
    }
  } catch (e) { /* silently ignore badge errors */ }
}

// ==========================================================================
// HỆ THỐNG CUSTOM AUTOCOMPLETE / COMBOBOX GỢI Ý MẶT HÀNG & ĐỐI TÁC
// ==========================================================================

let activeInput = null;
let activeDropdown = null;
let highlightedIndex = -1;
let filteredOptions = [];

// Event delegation cho các ô input sử dụng autocomplete datalist gợi ý
document.addEventListener('focusin', function(e) {
  const input = e.target;
  if (input && input.tagName === 'INPUT' && (input.hasAttribute('list') || input.hasAttribute('data-list'))) {
    initCustomAutocompleteForInput(input);
  }
});

function initCustomAutocompleteForInput(input) {
  if (input.dataset.customAutocompleteInit) {
    showCustomDropdown(input);
    return;
  }
  input.dataset.customAutocompleteInit = "true";
  input.autocomplete = "off";

  const listId = input.getAttribute('list') || input.getAttribute('data-list');
  if (listId) {
    input.setAttribute('data-list', listId);
    input.removeAttribute('list');
  }

  input.addEventListener('input', function() {
    showCustomDropdown(input);
  });

  input.addEventListener('focus', function() {
    showCustomDropdown(input);
  });

  input.addEventListener('keydown', function(e) {
    handleAutocompleteKeydown(e, input);
  });
  
  // Hiển thị dropdown gợi ý ngay lập tức
  showCustomDropdown(input);
}

function repositionDropdown(input, dropdown) {
  // Nếu input bị ẩn đi (ví dụ chuyển tab), tự động đóng dropdown
  if (input.offsetWidth === 0 || input.offsetHeight === 0) {
    closeCustomDropdown();
    return;
  }
  const rect = input.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = rect.bottom + 'px';
  dropdown.style.left = rect.left + 'px';
  dropdown.style.width = Math.max(rect.width, 480) + 'px';
  dropdown.style.zIndex = '999999';
}

function showCustomDropdown(input) {
  const listId = input.getAttribute('data-list');
  if (!listId) return;
  const datalist = document.getElementById(listId);
  if (!datalist) return;

  const query = input.value.trim().toLowerCase();
  if (query === '') {
    closeCustomDropdown();
    return;
  }
  filteredOptions = [];

  const options = datalist.querySelectorAll('option');
  options.forEach(opt => {
    const val = opt.value || '';
    const text = opt.textContent || '';
    if (!query || val.toLowerCase().includes(query) || text.toLowerCase().includes(query)) {
      filteredOptions.push({ value: val, label: text });
    }
  });

  if (filteredOptions.length === 0) {
    closeCustomDropdown();
    return;
  }

  if (!activeDropdown) {
    activeDropdown = document.createElement('div');
    activeDropdown.className = 'custom-autocomplete-dropdown';
    document.body.appendChild(activeDropdown);
  }

  repositionDropdown(input, activeDropdown);

  activeDropdown.innerHTML = '';
  
  // Tự động highlight giá trị đang trùng khớp hoàn toàn, hoặc mặc định dòng đầu tiên
  let exactMatchIdx = filteredOptions.findIndex(opt => opt.value === input.value);
  highlightedIndex = exactMatchIdx !== -1 ? exactMatchIdx : 0;

  filteredOptions.forEach((opt, idx) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-option';
    if (idx === highlightedIndex) {
      item.classList.add('active');
    }

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'option-arrow';
    arrowSpan.innerHTML = '➔'; // Mũi tên trỏ đến lựa chọn

    const leftSpan = document.createElement('span');
    leftSpan.className = 'option-value';
    leftSpan.textContent = opt.value;

    const rightSpan = document.createElement('span');
    rightSpan.className = 'option-label';
    rightSpan.textContent = opt.label;

    item.appendChild(arrowSpan);
    item.appendChild(leftSpan);
    item.appendChild(rightSpan);

    item.addEventListener('mousedown', function(e) {
      e.preventDefault(); // Tránh làm mất focus input
      selectOption(input, opt.value);
    });

    item.addEventListener('mouseenter', function() {
      setHighlightedIndex(idx);
    });

    activeDropdown.appendChild(item);
  });

  // Tự động cuộn đến phần tử đang active đầu tiên
  const activeItem = activeDropdown.querySelector('.autocomplete-option.active');
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' });
  }

  activeInput = input;
}

function setHighlightedIndex(idx) {
  highlightedIndex = idx;
  if (!activeDropdown) return;
  const items = activeDropdown.querySelectorAll('.autocomplete-option');
  items.forEach((item, i) => {
    if (i === highlightedIndex) {
      item.classList.add('active');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
}

function selectOption(input, value) {
  input.value = value;
  
  // Kích hoạt các sự kiện input và change
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  closeCustomDropdown();
}

function closeCustomDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
  activeInput = null;
  highlightedIndex = -1;
  filteredOptions = [];
}

function handleAutocompleteKeydown(e, input) {
  if (!activeDropdown) return;

  const items = activeDropdown.querySelectorAll('.autocomplete-option');
  if (items.length === 0) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      setHighlightedIndex((highlightedIndex + 1) % items.length);
      break;
    case 'ArrowUp':
      e.preventDefault();
      setHighlightedIndex((highlightedIndex - 1 + items.length) % items.length);
      break;
    case 'Enter':
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        e.preventDefault();
        selectOption(input, filteredOptions[highlightedIndex].value);
      }
      break;
    case 'Escape':
      e.preventDefault();
      closeCustomDropdown();
      input.blur();
      break;
    case 'Tab':
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        selectOption(input, filteredOptions[highlightedIndex].value);
      } else {
        closeCustomDropdown();
      }
      break;
  }
}

// Tự động định vị lại khi cuộn màn hình hoặc đổi kích thước cửa sổ
window.addEventListener('resize', function() {
  if (activeInput && activeDropdown) {
    repositionDropdown(activeInput, activeDropdown);
  }
});

document.addEventListener('scroll', function() {
  if (activeInput && activeDropdown) {
    repositionDropdown(activeInput, activeDropdown);
  }
}, { capture: true, passive: true });

// Đóng gợi ý khi nhấp chuột ra ngoài vùng dropdown và input
document.addEventListener('mousedown', function(e) {
  if (activeDropdown && !activeDropdown.contains(e.target) && e.target !== activeInput) {
    closeCustomDropdown();
  }
});

window.toggleSidebar = toggleSidebar;
window.updateBreadcrumb = updateBreadcrumb;
window.setDatePreset = setDatePreset;
window.updateSidebarBadges = updateSidebarBadges;

// Quản lý tỉ lệ cỡ chữ (font size scale) toàn phần mềm thông qua CSS Zoom
let currentFontScale = parseFloat(localStorage.getItem('rd_font_scale')) || 1.0;

function applyFontSizeScale(scale) {
  currentFontScale = scale;
  localStorage.setItem('rd_font_scale', scale);
  document.body.style.zoom = scale;
  document.body.style.height = (100 / scale) + 'vh';
  document.body.style.width = (100 / scale) + 'vw';
  
  // Đồng bộ giá trị với dropdown nếu tồn tại
  const selectEl = document.getElementById("font-scale-select");
  if (selectEl) {
    selectEl.value = scale === 1 ? "1" : scale.toString();
  }
}

// Khởi chạy ngay khi script được nạp để tránh giật lag layout
if (document.body) {
  document.body.style.zoom = currentFontScale;
  document.body.style.height = (100 / currentFontScale) + 'vh';
  document.body.style.width = (100 / currentFontScale) + 'vw';
} else {
  document.addEventListener("DOMContentLoaded", () => {
    document.body.style.zoom = currentFontScale;
    document.body.style.height = (100 / currentFontScale) + 'vh';
    document.body.style.width = (100 / currentFontScale) + 'vw';
  });
}

// Đồng bộ trạng thái dropdown khi DOM hoàn thành tải
document.addEventListener("DOMContentLoaded", () => {
  const selectEl = document.getElementById("font-scale-select");
  if (selectEl) {
    selectEl.value = currentFontScale === 1 ? "1" : currentFontScale.toString();
  }

  // Tự động bọc các bảng dynamic-items-table bằng wrapper cuộn khi quá cao
  document.querySelectorAll('.dynamic-items-table').forEach(table => {
    if (table.parentNode && !table.parentNode.classList.contains('dynamic-items-table-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'dynamic-items-table-wrapper';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
});

window.applyFontSizeScale = applyFontSizeScale;

// ── Excel Export Dropdowns Interactivity ─────────────────────────────────────
function togglePurchaseExportDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("purchase-export-dropdown");
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === "none" || dropdown.style.display === "" ? "block" : "none";
  }
  hideSalesExportDropdown();
  hideDebtsExportDropdown();
}
function hidePurchaseExportDropdown() {
  const dropdown = document.getElementById("purchase-export-dropdown");
  if (dropdown) dropdown.style.display = "none";
}

function toggleSalesExportDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("sales-export-dropdown");
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === "none" || dropdown.style.display === "" ? "block" : "none";
  }
  hidePurchaseExportDropdown();
  hideDebtsExportDropdown();
}
function hideSalesExportDropdown() {
  const dropdown = document.getElementById("sales-export-dropdown");
  if (dropdown) dropdown.style.display = "none";
}

function toggleDebtsExportDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("debts-export-dropdown");
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === "none" || dropdown.style.display === "" ? "block" : "none";
  }
  hidePurchaseExportDropdown();
  hideSalesExportDropdown();
}
function hideDebtsExportDropdown() {
  const dropdown = document.getElementById("debts-export-dropdown");
  if (dropdown) dropdown.style.display = "none";
}

window.togglePurchaseExportDropdown = togglePurchaseExportDropdown;
window.hidePurchaseExportDropdown = hidePurchaseExportDropdown;
window.toggleSalesExportDropdown = toggleSalesExportDropdown;
window.hideSalesExportDropdown = hideSalesExportDropdown;
window.toggleDebtsExportDropdown = toggleDebtsExportDropdown;
window.hideDebtsExportDropdown = hideDebtsExportDropdown;

// ── Global Header Search Propagation ─────────────────────────────────────────
function handleHeaderGlobalSearch(value) {
  const activeSearchInputId = getActiveSearchInputId();
  if (activeSearchInputId) {
    const tabSearchInput = document.getElementById(activeSearchInputId);
    if (tabSearchInput) {
      tabSearchInput.value = value;
      // Dispatch input event to trigger filter functions
      tabSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
window.handleHeaderGlobalSearch = handleHeaderGlobalSearch;

// ── F3 FILTER LOOKUP TABLE FOR ACTIVE INPUT CELL ─────────────────────────────────
function getActiveLookupType(activeEl) {
  if (!activeEl || activeEl.tagName !== 'INPUT') return null;
  
  const listAttr = activeEl.getAttribute('list') || '';
  const idAttr = (activeEl.id || '').toLowerCase();
  const nameAttr = (activeEl.name || '').toLowerCase();
  
  if (activeEl.classList.contains('item-productId') || 
      listAttr === 'datalist-sales-products' || 
      listAttr === 'datalist-purchase-products' ||
      idAttr.includes('productid') ||
      idAttr.includes('prodid') ||
      nameAttr.includes('productid') ||
      nameAttr.includes('prodid')) {
    return 'product';
  }
  
  if (listAttr === 'datalist-partners' || 
      listAttr === 'partner-parent-datalist' || 
      idAttr.includes('partner') || 
      idAttr.includes('customer') || 
      idAttr.includes('supplier') ||
      nameAttr.includes('partner') ||
      nameAttr.includes('customer') ||
      nameAttr.includes('supplier')) {
    return 'partner';
  }
  
  return null;
}

function showF3LookupModal(activeInput, type) {
  if (document.getElementById('f3-lookup-overlay')) return;

  if (!document.getElementById('f3-lookup-styles')) {
    const f3Style = document.createElement('style');
    f3Style.id = 'f3-lookup-styles';
    f3Style.textContent = `
      .f3-lookup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999999;
      }
      .f3-lookup-container {
        width: 800px;
        max-height: 80vh;
        background: var(--bg-secondary, #1e293b);
        border: 1px solid var(--border-color, #334155);
        border-radius: var(--radius-lg, 12px);
        box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.3));
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: var(--text-primary, #f8fafc);
      }
      .f3-lookup-header {
        padding: 14px 20px;
        border-bottom: 1px solid var(--border-color, #334155);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--bg-primary, #0f172a);
      }
      .f3-lookup-title {
        font-size: 16px;
        font-weight: 700;
        margin: 0;
        color: var(--color-primary, #0ea5e9);
      }
      .f3-lookup-close-btn {
        background: none;
        border: none;
        color: var(--text-primary, #f8fafc);
        font-size: 24px;
        cursor: pointer;
        line-height: 1;
        padding: 0;
        opacity: 0.8;
      }
      .f3-lookup-close-btn:hover {
        color: var(--color-danger, #ef4444);
        opacity: 1;
      }
      .f3-lookup-search-container {
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color, #334155);
        background: var(--bg-secondary, #1e293b);
      }
      .f3-lookup-search-input {
        width: 100%;
        padding: 10px 14px;
        font-size: 14px;
        border: 1px solid var(--border-color, #334155);
        border-radius: var(--radius-sm, 6px);
        background: var(--bg-primary, #0f172a);
        color: var(--text-primary, #f8fafc);
        outline: none;
      }
      .f3-lookup-search-input:focus {
        border-color: var(--color-primary, #0ea5e9);
        box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
      }
      .f3-lookup-body {
        flex: 1;
        overflow-y: auto;
        padding: 0;
        background: var(--bg-secondary, #1e293b);
      }
      .f3-lookup-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        table-layout: fixed;
      }
      .f3-lookup-table th, .f3-lookup-table td {
        padding: 10px 12px;
        text-align: left;
        border-bottom: 1px solid var(--border-color, #334155);
        word-wrap: break-word;
        word-break: break-word;
        white-space: normal;
      }
      .f3-lookup-table th {
        background: var(--bg-primary, #0f172a);
        font-weight: 700;
        position: sticky;
        top: 0;
        z-index: 1;
        color: var(--text-primary, #f8fafc);
      }
      .f3-lookup-row {
        cursor: pointer;
        transition: background 0.15s ease;
        background: var(--bg-secondary, #1e293b);
        color: var(--text-primary, #f8fafc);
      }
      .f3-lookup-row:hover {
        background: rgba(14, 165, 233, 0.08);
      }
      .f3-lookup-row.selected {
        background: rgba(14, 165, 233, 0.18) !important;
        outline: 1.5px solid var(--color-primary, #0ea5e9);
        color: var(--text-primary, #f8fafc) !important;
      }
      .f3-lookup-footer {
        padding: 12px 20px;
        border-top: 1px solid var(--border-color, #334155);
        background: var(--bg-primary, #0f172a);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: var(--text-secondary, #cbd5e1);
      }
      .f3-lookup-kbd {
        background: var(--bg-secondary, #1e293b);
        border: 1px solid var(--border-color, #334155);
        border-radius: 3px;
        padding: 1px 5px;
        font-family: monospace;
        font-size: 11px;
        margin: 0 2px;
        color: var(--text-primary, #f8fafc);
      }
    `;
    document.head.appendChild(f3Style);
  }

  let items = [];
  let title = '';
  let columnsHTML = '';
  
  if (type === 'product') {
    items = state.products || [];
    title = 'Tra cứu nhanh sản phẩm';
    columnsHTML = `
      <tr>
        <th style="width: 15%;">Mã SP</th>
        <th style="width: 44%;">Tên sản phẩm</th>
        <th style="width: 11%;">ĐVT</th>
        <th style="width: 14%; text-align: right;">Tồn kho</th>
        <th style="width: 16%; text-align: right;">Đơn giá vốn</th>
      </tr>
    `;
  } else {
    items = state.partners || [];
    title = 'Tra cứu nhanh đối tác';
    columnsHTML = `
      <tr>
        <th style="width: 15%;">Mã ĐT</th>
        <th style="width: 28%;">Tên đối tác</th>
        <th style="width: 15%;">Phân loại</th>
        <th style="width: 15%;">Số điện thoại</th>
        <th style="width: 27%;">Địa chỉ</th>
      </tr>
    `;
  }

  let filteredItems = [...items];
  let selectedIndex = 0;

  const overlay = document.createElement('div');
  overlay.id = 'f3-lookup-overlay';
  overlay.className = 'f3-lookup-overlay';
  
  overlay.innerHTML = `
    <div class="f3-lookup-container" onclick="event.stopPropagation()">
      <div class="f3-lookup-header">
        <h3 class="f3-lookup-title">${title}</h3>
        <button class="f3-lookup-close-btn" id="f3-lookup-close">×</button>
      </div>
      <div class="f3-lookup-search-container">
        <input type="text" class="f3-lookup-search-input" id="f3-lookup-search" placeholder="Nhập từ khóa tìm kiếm (AND/OR, viết không dấu...)" autocomplete="off">
      </div>
      <div class="f3-lookup-body">
        <table class="f3-lookup-table">
          <thead>
            ${columnsHTML}
          </thead>
          <tbody id="f3-lookup-tbody">
            <!-- Rows injected dynamically -->
          </tbody>
        </table>
      </div>
      <div class="f3-lookup-footer">
        <div>Dùng phím <span class="f3-lookup-kbd">↑</span> <span class="f3-lookup-kbd">↓</span> để di chuyển, <span class="f3-lookup-kbd">Enter</span> để chọn, <span class="f3-lookup-kbd">Esc</span> để đóng</div>
        <div id="f3-lookup-count">Đang hiển thị 0 dòng</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const searchInput = overlay.querySelector('#f3-lookup-search');
  const tbody = overlay.querySelector('#f3-lookup-tbody');
  const countDisplay = overlay.querySelector('#f3-lookup-count');
  const closeBtn = overlay.querySelector('#f3-lookup-close');

  setTimeout(() => { searchInput.focus(); }, 50);

  function renderTable() {
    tbody.innerHTML = '';
    if (filteredItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Không tìm thấy dữ liệu phù hợp</td></tr>`;
      countDisplay.textContent = 'Đang hiển thị 0 dòng';
      return;
    }

    tbody.innerHTML = filteredItems.map((item, idx) => {
      const isSelected = idx === selectedIndex ? 'selected' : '';
      if (type === 'product') {
        const costStr = typeof formatVND === 'function' ? formatVND(item.avgCost) : item.avgCost.toLocaleString() + ' đ';
        const stockVal = item.actualStock !== undefined ? item.actualStock : (item.stock || 0);
        return `
          <tr class="f3-lookup-row ${isSelected}" data-index="${idx}">
            <td style="font-weight: 600;">${escapeHtmlAttr(item.id)}</td>
            <td>${escapeHtmlAttr(item.name)}</td>
            <td>${escapeHtmlAttr(item.unit || 'Cái')}</td>
            <td style="text-align: right; font-weight: 500;">${stockVal.toLocaleString('vi-VN')}</td>
            <td style="text-align: right; color: var(--text-secondary);">${costStr}</td>
          </tr>
        `;
      } else {
        const typeLabels = {
          enterprise: 'Doanh nghiệp',
          retail: 'Khách lẻ',
          supplier: 'Nhà cung cấp',
          project: 'Công trình'
        };
        const label = typeLabels[item.type] || item.type || 'Khách hàng';
        return `
          <tr class="f3-lookup-row ${isSelected}" data-index="${idx}">
            <td style="font-weight: 600;">${escapeHtmlAttr(item.id)}</td>
            <td>${escapeHtmlAttr(item.name)}</td>
            <td>${label}</td>
            <td>${escapeHtmlAttr(item.phone || '')}</td>
            <td style="color: var(--text-secondary);">${escapeHtmlAttr(item.address || '')}</td>
          </tr>
        `;
      }
    }).join('');

    countDisplay.textContent = `Đang hiển thị ${filteredItems.length} dòng`;

    const selectedRow = tbody.querySelector('.f3-lookup-row.selected');
    if (selectedRow) {
      selectedRow.scrollIntoView({ block: 'nearest' });
    }
  }

  function filterList() {
    const query = searchInput.value.trim();
    if (!query) {
      filteredItems = [...items];
    } else {
      filteredItems = items.filter(item => {
        let searchString = '';
        if (type === 'product') {
          searchString = `${item.id}\t${item.name}\t${item.unit || ''}`;
        } else {
          searchString = `${item.id}\t${item.name}\t${item.phone || ''}\t${item.address || ''}`;
        }
        return typeof matchAdvancedQuery === 'function' 
          ? matchAdvancedQuery(searchString, query)
          : searchString.toLowerCase().includes(query.toLowerCase());
      });
    }
    selectedIndex = 0;
    renderTable();
  }

  renderTable();

  searchInput.addEventListener('input', filterList);

  function confirmSelection() {
    const selectedItem = filteredItems[selectedIndex];
    if (selectedItem) {
      activeInput.value = `${selectedItem.name} (${selectedItem.id})`;
      activeInput.focus();
      
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      activeInput.dispatchEvent(new Event('blur', { bubbles: true }));
      
      closeLookup();
    }
  }

  function closeLookup() {
    overlay.remove();
    document.removeEventListener('keydown', handleGlobalKeydown);
  }

  closeBtn.addEventListener('click', closeLookup);
  overlay.addEventListener('click', closeLookup);

  tbody.addEventListener('click', (e) => {
    const row = e.target.closest('.f3-lookup-row');
    if (row) {
      selectedIndex = parseInt(row.dataset.index);
      tbody.querySelectorAll('.f3-lookup-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      confirmSelection();
    }
  });

  function handleGlobalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLookup();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        selectedIndex = (selectedIndex + 1) % filteredItems.length;
        renderTable();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
        renderTable();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirmSelection();
    } else {
      if (document.activeElement !== searchInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        searchInput.focus();
      }
    }
  }

  document.addEventListener('keydown', handleGlobalKeydown);
}

// ── EXCEL-LIKE CELL NAVIGATION AND BULK EDITING ──────────────────────────────────
let bulkSelectionStartRow = null;
let bulkSelectionColumnIndex = null;
let bulkSelectedInputs = [];

function clearBulkSelection() {
  document.querySelectorAll('.cell-bulk-selected').forEach(el => {
    el.classList.remove('cell-bulk-selected');
  });
  bulkSelectedInputs = [];
}

document.addEventListener('keydown', (e) => {
  const activeEl = document.activeElement;
  if (!activeEl || activeEl.tagName !== 'INPUT') return;
  
  const td = activeEl.closest('td');
  const tr = activeEl.closest('tr');
  const table = activeEl.closest('.dynamic-items-table');
  if (!table || !td || !tr) return;
  
  const tbody = tr.parentNode;
  const rows = Array.from(tbody.rows);
  const rowIndex = rows.indexOf(tr);
  const cellIndex = Array.from(tr.cells).indexOf(td);
  
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault(); // Ngăn cuộn trang web mặc định
    
    let targetRowIndex = e.key === 'ArrowUp' ? rowIndex - 1 : rowIndex + 1;
    if (targetRowIndex < 0 || targetRowIndex >= rows.length) return;
    
    const targetRow = rows[targetRowIndex];
    const targetTd = targetRow.cells[cellIndex];
    if (!targetTd) return;
    
    const targetInput = targetTd.querySelector('input');
    if (!targetInput) return;
    
    if (e.shiftKey) {
      // Bắt đầu bulk selection nếu chưa có
      if (bulkSelectionStartRow === null) {
        bulkSelectionStartRow = rowIndex;
        bulkSelectionColumnIndex = cellIndex;
        activeEl.classList.add('cell-bulk-selected');
        if (!bulkSelectedInputs.includes(activeEl)) {
          bulkSelectedInputs.push(activeEl);
        }
      }
      
      // Focus vào ô đích
      targetInput.focus();
      
      // Tìm tất cả các hàng từ startRowIndex tới targetRowIndex
      clearBulkSelection();
      const minRow = Math.min(bulkSelectionStartRow, targetRowIndex);
      const maxRow = Math.max(bulkSelectionStartRow, targetRowIndex);
      
      for (let r = minRow; r <= maxRow; r++) {
        const inputInRow = rows[r].cells[bulkSelectionColumnIndex].querySelector('input');
        if (inputInRow) {
          inputInRow.classList.add('cell-bulk-selected');
          bulkSelectedInputs.push(inputInRow);
        }
      }
    } else {
      // Di chuyển bình thường không giữ Shift
      clearBulkSelection();
      bulkSelectionStartRow = null;
      bulkSelectionColumnIndex = null;
      targetInput.focus();
      targetInput.select(); // Tiện lợi để bôi đen ghi đè luôn
    }
  } else if (e.key === 'Escape') {
    clearBulkSelection();
    bulkSelectionStartRow = null;
    bulkSelectionColumnIndex = null;
  }
});

document.addEventListener('click', (e) => {
  const activeEl = e.target;
  if (activeEl.tagName === 'INPUT' && activeEl.closest('.dynamic-items-table')) {
    const td = activeEl.closest('td');
    const tr = activeEl.closest('tr');
    if (!td || !tr) return;
    
    const tbody = tr.parentNode;
    const rowIndex = Array.from(tbody.rows).indexOf(tr);
    const cellIndex = Array.from(tr.cells).indexOf(td);
    
    if (e.ctrlKey) {
      e.preventDefault();
      
      // Toggle selection trên ô vừa click
      if (activeEl.classList.contains('cell-bulk-selected')) {
        activeEl.classList.remove('cell-bulk-selected');
        bulkSelectedInputs = bulkSelectedInputs.filter(input => input !== activeEl);
      } else {
        activeEl.classList.add('cell-bulk-selected');
        if (!bulkSelectedInputs.includes(activeEl)) {
          bulkSelectedInputs.push(activeEl);
        }
      }
      
      // Đặt neo (anchor) cho lần bấm Shift sau đó
      bulkSelectionStartRow = rowIndex;
      bulkSelectionColumnIndex = cellIndex;
      activeEl.focus();
    } else if (e.shiftKey) {
      // Shift+Click chọn dải ô liên tiếp từ neo
      if (bulkSelectionStartRow !== null && bulkSelectionColumnIndex === cellIndex) {
        clearBulkSelection();
        const rows = Array.from(tbody.rows);
        const minRow = Math.min(bulkSelectionStartRow, rowIndex);
        const maxRow = Math.max(bulkSelectionStartRow, rowIndex);
        
        for (let r = minRow; r <= maxRow; r++) {
          const inputInRow = rows[r].cells[bulkSelectionColumnIndex].querySelector('input');
          if (inputInRow) {
            inputInRow.classList.add('cell-bulk-selected');
            bulkSelectedInputs.push(inputInRow);
          }
        }
        activeEl.focus();
      }
    } else {
      // Click bình thường không đè Ctrl/Shift
      clearBulkSelection();
      bulkSelectionStartRow = rowIndex;
      bulkSelectionColumnIndex = cellIndex;
    }
  } else {
    // Click ra ngoài bảng
    clearBulkSelection();
    bulkSelectionStartRow = null;
    bulkSelectionColumnIndex = null;
  }
});

document.addEventListener('input', (e) => {
  const activeEl = e.target;
  if (!activeEl || activeEl.tagName !== 'INPUT') return;
  
  const table = activeEl.closest('.dynamic-items-table');
  if (!table) return;
  
  if (activeEl.classList.contains('cell-bulk-selected') && bulkSelectedInputs.length > 0) {
    const val = activeEl.value;
    
    // Lưu các input được chỉnh sửa cùng lúc để tránh vòng lặp đệ quy vô hạn
    if (activeEl._isBulkUpdating) return;
    
    bulkSelectedInputs.forEach(input => {
      if (input !== activeEl) {
        input._isBulkUpdating = true;
        input.value = val;
        
        // Dispatch các sự kiện cần thiết để kích hoạt tính toán tự động
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        
        if (typeof input.oninput === 'function') {
          input.oninput();
        }
        if (typeof input.onblur === 'function') {
          input.onblur();
        }
        
        delete input._isBulkUpdating;
      }
    });
  }
});




