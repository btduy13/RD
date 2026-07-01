// ==========================================================================
// HỆ THỐNG TỰ ĐỘNG LƯU NHÁP PHIẾU ĐANG SOẠN THẢO (VOUCHER AUTO-SAVE DRAFT)
// Ngăn ngừa mất mát dữ liệu khi ứng dụng bị tắt đột ngột hoặc tải lại trang
// ==========================================================================

(function() {
  let draftSaveTimeouts = {};

  // Debounce lưu nháp 1 giây sau khi ngừng gõ
  function debounceSaveDraft(formId) {
    if (draftSaveTimeouts[formId]) {
      clearTimeout(draftSaveTimeouts[formId]);
    }
    draftSaveTimeouts[formId] = setTimeout(() => {
      saveFormDraftDirect(formId);
    }, 1000);
  }

  // Thực hiện lưu nháp trực tiếp vào localStorage
  function saveFormDraftDirect(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const draft = {
      formId: formId,
      timestamp: Date.now(),
      fields: {},
      items: [],
      editingId: null
    };

    if (formId === 'form-sales') {
      draft.editingId = window.editingSalesId || null;
      draft.fields = {
        id: document.getElementById("sale-id")?.value || "",
        partner: document.getElementById("sale-partner")?.value || "",
        date: document.getElementById("sale-date")?.value || "",
        payment: document.getElementById("sale-payment")?.value || "",
        desc: document.getElementById("sale-desc")?.value || "",
        note: document.getElementById("sale-note")?.value || "",
        taxRate: document.getElementById("sale-tax-rate")?.value || "0"
      };
      const rows = document.querySelectorAll("#sales-form-items-body tr");
      rows.forEach(row => {
        draft.items.push({
          productId: row.querySelector(".item-productId")?.value || "",
          desc: row.querySelector(".item-desc")?.value || "",
          qty: row.querySelector(".item-qty")?.value || "",
          price: row.querySelector(".item-price")?.value || "",
          discount: row.querySelector(".item-discount")?.value || ""
        });
      });
    } else if (formId === 'form-purchase') {
      draft.editingId = window.editingPurchaseId || null;
      draft.fields = {
        id: document.getElementById("purchase-id")?.value || "",
        partner: document.getElementById("purchase-partner")?.value || "",
        date: document.getElementById("purchase-date")?.value || "",
        payment: document.getElementById("purchase-payment")?.value || "",
        desc: document.getElementById("purchase-desc")?.value || "",
        note: document.getElementById("purchase-note")?.value || "",
        taxRate: document.getElementById("purchase-tax-rate")?.value || "0"
      };
      const rows = document.querySelectorAll("#purchase-form-items-body tr");
      rows.forEach(row => {
        draft.items.push({
          productId: row.querySelector(".item-productId")?.value || "",
          desc: row.querySelector(".item-desc")?.value || "",
          qty: row.querySelector(".item-qty")?.value || "",
          price: row.querySelector(".item-price")?.value || "",
          discount: row.querySelector(".item-discount")?.value || ""
        });
      });
    } else if (formId === 'form-purchase-order') {
      draft.editingId = window.editingPurchaseOrderId || null;
      draft.fields = {
        id: document.getElementById("purchase-order-id")?.value || "",
        partner: document.getElementById("purchase-order-partner")?.value || "",
        date: document.getElementById("purchase-order-date")?.value || "",
        desc: document.getElementById("purchase-order-desc")?.value || "",
        note: document.getElementById("purchase-order-note")?.value || ""
      };
      const rows = document.querySelectorAll("#purchase-order-form-items-body tr");
      rows.forEach(row => {
        draft.items.push({
          productId: row.querySelector(".item-productId")?.value || "",
          desc: row.querySelector(".item-desc")?.value || "",
          qty: row.querySelector(".item-qty")?.value || "",
          price: row.querySelector(".item-price")?.value || "",
          discount: row.querySelector(".item-discount")?.value || ""
        });
      });
    } else if (formId === 'form-purchase-return') {
      draft.editingId = window.editingPurchaseReturnId || null;
      draft.fields = {
        id: document.getElementById("purchase-return-id")?.value || "",
        partner: document.getElementById("purchase-return-partner")?.value || "",
        date: document.getElementById("purchase-return-date")?.value || "",
        payment: document.getElementById("purchase-return-payment")?.value || "",
        desc: document.getElementById("purchase-return-desc")?.value || "",
        note: document.getElementById("purchase-return-note")?.value || "",
        taxRate: document.getElementById("purchase-return-tax-rate")?.value || "0"
      };
      const rows = document.querySelectorAll("#purchase-return-form-items-body tr");
      rows.forEach(row => {
        draft.items.push({
          productId: row.querySelector(".item-productId")?.value || "",
          desc: row.querySelector(".item-desc")?.value || "",
          qty: row.querySelector(".item-qty")?.value || "",
          price: row.querySelector(".item-price")?.value || "",
          discount: row.querySelector(".item-discount")?.value || ""
        });
      });
    } else if (formId === 'form-sales-return') {
      draft.editingId = window.editingSalesReturnId || null;
      draft.fields = {
        id: document.getElementById("sales-return-id")?.value || "",
        partner: document.getElementById("sales-return-partner")?.value || "",
        date: document.getElementById("sales-return-date")?.value || "",
        payment: document.getElementById("sales-return-payment")?.value || "",
        desc: document.getElementById("sales-return-desc")?.value || "",
        note: document.getElementById("sales-return-note")?.value || "",
        taxRate: document.getElementById("sales-return-tax-rate")?.value || "0"
      };
      const rows = document.querySelectorAll("#sales-return-form-items-body tr");
      rows.forEach(row => {
        draft.items.push({
          productId: row.querySelector(".item-productId")?.value || "",
          desc: row.querySelector(".item-desc")?.value || "",
          qty: row.querySelector(".item-qty")?.value || "",
          price: row.querySelector(".item-price")?.value || "",
          discount: row.querySelector(".item-discount")?.value || ""
        });
      });
    } else if (formId === 'form-quotation') {
      draft.editingId = window.editingQuotationId || null;
      draft.fields = {
        id: document.getElementById("quotation-id")?.value || "",
        partner: document.getElementById("quotation-partner")?.value || "",
        date: document.getElementById("quotation-date")?.value || "",
        desc: document.getElementById("quotation-desc")?.value || "",
        note: document.getElementById("quotation-note")?.value || ""
      };
      const rows = document.querySelectorAll("#quotation-form-items-body tr");
      rows.forEach(row => {
        draft.items.push({
          productId: row.querySelector(".item-productId")?.value || "",
          desc: row.querySelector(".item-desc")?.value || "",
          qty: row.querySelector(".item-qty")?.value || "",
          price: row.querySelector(".item-price")?.value || "",
          discount: row.querySelector(".item-discount")?.value || ""
        });
      });
    }

    // Chỉ lưu nháp nếu thực sự có nội dung
    const hasContent = draft.fields.partner || draft.items.length > 0;
    if (hasContent) {
      localStorage.setItem(`rd_draft_${formId}`, JSON.stringify(draft));
    } else {
      localStorage.removeItem(`rd_draft_${formId}`);
    }
  }

  // Khôi phục phiếu nháp
  function restoreFormDraft(formId) {
    const draftStr = localStorage.getItem(`rd_draft_${formId}`);
    if (!draftStr) return;

    try {
      const draft = JSON.parse(draftStr);

      if (formId === 'form-sales') {
        window.editingSalesId = draft.editingId;
        const idEl = document.getElementById("sale-id");
        const partnerEl = document.getElementById("sale-partner");
        const dateEl = document.getElementById("sale-date");
        const paymentEl = document.getElementById("sale-payment");
        const descEl = document.getElementById("sale-desc");
        const noteEl = document.getElementById("sale-note");
        const taxRateEl = document.getElementById("sale-tax-rate");

        if (idEl) idEl.value = draft.fields.id || "";
        if (partnerEl) partnerEl.value = draft.fields.partner || "";
        if (dateEl) dateEl.value = draft.fields.date || "";
        if (paymentEl) paymentEl.value = draft.fields.payment || "131";
        if (descEl) descEl.value = draft.fields.desc || "Bán hàng xuất kho";
        if (noteEl) noteEl.value = draft.fields.note || "";
        if (taxRateEl) taxRateEl.value = draft.fields.taxRate || "0";

        const tbody = document.getElementById("sales-form-items-body");
        if (tbody) {
          tbody.innerHTML = "";
          draft.items.forEach(item => {
            if (typeof window.addSalesFormRow === "function") {
              window.addSalesFormRow(
                item.productId,
                item.desc,
                parseFloat(item.qty.replace(",", ".")) || 1,
                parseInt(item.price.replace(/\D/g, "")) || 0,
                parseFloat(item.discount) || 0
              );
            }
          });
        }
        if (typeof window.recalculateSalesTotals === "function") {
          window.recalculateSalesTotals();
        }
      } else if (formId === 'form-purchase') {
        window.editingPurchaseId = draft.editingId;
        const idEl = document.getElementById("purchase-id");
        const partnerEl = document.getElementById("purchase-partner");
        const dateEl = document.getElementById("purchase-date");
        const paymentEl = document.getElementById("purchase-payment");
        const descEl = document.getElementById("purchase-desc");
        const noteEl = document.getElementById("purchase-note");
        const taxRateEl = document.getElementById("purchase-tax-rate");

        if (idEl) idEl.value = draft.fields.id || "";
        if (partnerEl) partnerEl.value = draft.fields.partner || "";
        if (dateEl) dateEl.value = draft.fields.date || "";
        if (paymentEl) paymentEl.value = draft.fields.payment || "331";
        if (descEl) descEl.value = draft.fields.desc || "Mua hàng nhập kho";
        if (noteEl) noteEl.value = draft.fields.note || "";
        if (taxRateEl) taxRateEl.value = draft.fields.taxRate || "0";

        const tbody = document.getElementById("purchase-form-items-body");
        if (tbody) {
          tbody.innerHTML = "";
          draft.items.forEach(item => {
            if (typeof window.addPurchaseFormRow === "function") {
              window.addPurchaseFormRow(
                item.productId,
                parseFloat(item.qty.replace(",", ".")) || 1,
                parseInt(item.price.replace(/\D/g, "")) || 0,
                parseFloat(item.discount) || 0
              );
            }
          });
        }
        if (typeof window.recalculatePurchaseTotals === "function") {
          window.recalculatePurchaseTotals();
        }
      } else if (formId === 'form-purchase-order') {
        window.editingPurchaseOrderId = draft.editingId;
        const idEl = document.getElementById("purchase-order-id");
        const partnerEl = document.getElementById("purchase-order-partner");
        const dateEl = document.getElementById("purchase-order-date");
        const descEl = document.getElementById("purchase-order-desc");
        const noteEl = document.getElementById("purchase-order-note");

        if (idEl) idEl.value = draft.fields.id || "";
        if (partnerEl) partnerEl.value = draft.fields.partner || "";
        if (dateEl) dateEl.value = draft.fields.date || "";
        if (descEl) descEl.value = draft.fields.desc || "";
        if (noteEl) noteEl.value = draft.fields.note || "";

        const tbody = document.getElementById("purchase-order-form-items-body");
        if (tbody) {
          tbody.innerHTML = "";
          draft.items.forEach(item => {
            if (typeof window.addPurchaseOrderFormRow === "function") {
              window.addPurchaseOrderFormRow(
                item.productId,
                parseFloat(item.qty.replace(",", ".")) || 1,
                parseInt(item.price.replace(/\D/g, "")) || 0,
                parseFloat(item.discount) || 0
              );
            }
          });
        }
        if (typeof window.recalculatePurchaseOrderTotals === "function") {
          window.recalculatePurchaseOrderTotals();
        }
      } else if (formId === 'form-purchase-return') {
        window.editingPurchaseReturnId = draft.editingId;
        const idEl = document.getElementById("purchase-return-id");
        const partnerEl = document.getElementById("purchase-return-partner");
        const dateEl = document.getElementById("purchase-return-date");
        const paymentEl = document.getElementById("purchase-return-payment");
        const descEl = document.getElementById("purchase-return-desc");
        const noteEl = document.getElementById("purchase-return-note");
        const taxRateEl = document.getElementById("purchase-return-tax-rate");

        if (idEl) idEl.value = draft.fields.id || "";
        if (partnerEl) partnerEl.value = draft.fields.partner || "";
        if (dateEl) dateEl.value = draft.fields.date || "";
        if (paymentEl) paymentEl.value = draft.fields.payment || "331";
        if (descEl) descEl.value = draft.fields.desc || "";
        if (noteEl) noteEl.value = draft.fields.note || "";
        if (taxRateEl) taxRateEl.value = draft.fields.taxRate || "0";

        const tbody = document.getElementById("purchase-return-form-items-body");
        if (tbody) {
          tbody.innerHTML = "";
          draft.items.forEach(item => {
            if (typeof window.addPurchaseReturnFormRow === "function") {
              window.addPurchaseReturnFormRow(
                item.productId,
                parseFloat(item.qty.replace(",", ".")) || 1,
                parseInt(item.price.replace(/\D/g, "")) || 0,
                parseFloat(item.discount) || 0
              );
            }
          });
        }
        if (typeof window.recalculatePurchaseReturnTotals === "function") {
          window.recalculatePurchaseReturnTotals();
        }
      } else if (formId === 'form-sales-return') {
        window.editingSalesReturnId = draft.editingId;
        const idEl = document.getElementById("sales-return-id");
        const partnerEl = document.getElementById("sales-return-partner");
        const dateEl = document.getElementById("sales-return-date");
        const paymentEl = document.getElementById("sales-return-payment");
        const descEl = document.getElementById("sales-return-desc");
        const noteEl = document.getElementById("sales-return-note");
        const taxRateEl = document.getElementById("sales-return-tax-rate");

        if (idEl) idEl.value = draft.fields.id || "";
        if (partnerEl) partnerEl.value = draft.fields.partner || "";
        if (dateEl) dateEl.value = draft.fields.date || "";
        if (paymentEl) paymentEl.value = draft.fields.payment || "131";
        if (descEl) descEl.value = draft.fields.desc || "";
        if (noteEl) noteEl.value = draft.fields.note || "";
        if (taxRateEl) taxRateEl.value = draft.fields.taxRate || "0";

        const tbody = document.getElementById("sales-return-form-items-body");
        if (tbody) {
          tbody.innerHTML = "";
          draft.items.forEach(item => {
            if (typeof window.addSalesReturnFormRow === "function") {
              window.addSalesReturnFormRow(
                item.productId,
                parseFloat(item.qty.replace(",", ".")) || 1,
                parseInt(item.price.replace(/\D/g, "")) || 0,
                parseFloat(item.discount) || 0
              );
            }
          });
        }
        if (typeof window.recalculateSalesReturnTotals === "function") {
          window.recalculateSalesReturnTotals();
        }
      } else if (formId === 'form-quotation') {
        window.editingQuotationId = draft.editingId;
        const idEl = document.getElementById("quotation-id");
        const partnerEl = document.getElementById("quotation-partner");
        const dateEl = document.getElementById("quotation-date");
        const descEl = document.getElementById("quotation-desc");
        const noteEl = document.getElementById("quotation-note");

        if (idEl) idEl.value = draft.fields.id || "";
        if (partnerEl) partnerEl.value = draft.fields.partner || "";
        if (dateEl) dateEl.value = draft.fields.date || "";
        if (descEl) descEl.value = draft.fields.desc || "";
        if (noteEl) noteEl.value = draft.fields.note || "";

        const tbody = document.getElementById("quotation-form-items-body");
        if (tbody) {
          tbody.innerHTML = "";
          draft.items.forEach(item => {
            if (typeof window.addQuotationFormRow === "function") {
              window.addQuotationFormRow(
                item.productId,
                item.desc,
                parseFloat(item.qty.replace(",", ".")) || 1,
                parseInt(item.price.replace(/\D/g, "")) || 0,
                parseFloat(item.discount) || 0
              );
            }
          });
        }
        if (typeof window.recalculateQuotationTotals === "function") {
          window.recalculateQuotationTotals();
        }
      }

      if (typeof showToast === "function") {
        showToast("Đã khôi phục thành công phiếu nháp từ phiên làm việc trước!", "success");
      }
    } catch (err) {
      console.error("[Autosave] Lỗi khôi phục phiếu nháp:", err);
    }
  }

  // Kiểm tra và hỏi khôi phục khi mở modal
  function checkAndRestoreDraft(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const form = modal.querySelector('form');
    if (!form) return;

    const draftStr = localStorage.getItem(`rd_draft_${form.id}`);
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        const hasItems = draft.items && draft.items.length > 0;
        const hasPartner = draft.fields && draft.fields.partner;

        if (hasItems || hasPartner) {
          // Hỏi người dùng bằng confirm tiếng Việt rõ ràng
          setTimeout(() => {
            const confirmRestore = confirm("Phần mềm phát hiện một phiếu nháp chưa lưu từ phiên làm việc trước. Bạn có muốn khôi phục lại không?");
            if (confirmRestore) {
              restoreFormDraft(form.id);
            } else {
              localStorage.removeItem(`rd_draft_${form.id}`);
            }
          }, 150); // Delay nhẹ để form hoàn tất reset mặc định
        }
      } catch (err) {
        console.error("[Autosave] Lỗi parse JSON nháp:", err);
      }
    }
  }

  // Tự động xóa nháp khi lưu phiếu thành công
  function clearActiveFormDraft() {
    const activeModal = document.querySelector('#modal-add-sales, #modal-add-purchase, #modal-add-purchase-order, #modal-add-purchase-return, #modal-add-sales-return, #modal-add-quotation');
    if (activeModal && (activeModal.style.display === 'flex' || window.getComputedStyle(activeModal).display === 'flex')) {
      const form = activeModal.querySelector('form');
      if (form) {
        localStorage.removeItem(`rd_draft_${form.id}`);
        console.log(`[Autosave] Đã xóa nháp cho form: ${form.id}`);
      }
    }
  }

  // Đăng ký các sự kiện theo dõi input của người dùng
  document.addEventListener('input', (e) => {
    const form = e.target.closest('#form-sales, #form-purchase, #form-purchase-order, #form-purchase-return, #form-sales-return, #form-quotation');
    if (form) {
      debounceSaveDraft(form.id);
    }
  });

  document.addEventListener('change', (e) => {
    const form = e.target.closest('#form-sales, #form-purchase, #form-purchase-order, #form-purchase-return, #form-sales-return, #form-quotation');
    if (form) {
      debounceSaveDraft(form.id);
    }
  });

  // Xuất các hàm ra phạm vi window để sử dụng chung
  window.checkAndRestoreDraft = checkAndRestoreDraft;
  window.clearActiveFormDraft = clearActiveFormDraft;
  window.restoreFormDraft = restoreFormDraft;
})();
