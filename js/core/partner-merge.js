/* ==========================================================================
   PARTNER MERGE — Gộp hai mã đối tác trùng công ty về một mã chính
   ========================================================================== */

function mergePartnerOpeningBalance(sourceId, targetId) {
  if (!state.partnerOpeningBalances) state.partnerOpeningBalances = {};
  if (!state.partnerOpeningBalanceTs) state.partnerOpeningBalanceTs = {};

  const src = state.partnerOpeningBalances[sourceId] || { debit: 0, credit: 0 };
  const tgt = state.partnerOpeningBalances[targetId] || { debit: 0, credit: 0 };

  state.partnerOpeningBalances[targetId] = {
    debit: (Number(tgt.debit) || 0) + (Number(src.debit) || 0),
    credit: (Number(tgt.credit) || 0) + (Number(src.credit) || 0)
  };

  const srcTs = Number(state.partnerOpeningBalanceTs[sourceId]) || 0;
  const tgtTs = Number(state.partnerOpeningBalanceTs[targetId]) || 0;
  const mergedAt = Math.max(Date.now(), srcTs + 1, tgtTs + 1);
  state.partnerOpeningBalanceTs[targetId] = mergedAt;

  delete state.partnerOpeningBalances[sourceId];
  // Preserve a deletion version so an older cloud opening cannot reappear.
  state.partnerOpeningBalanceTs[sourceId] = mergedAt;
}

function mergePartnerRecords(sourceId, targetId, options) {
  const opts = options || {};
  if (!sourceId || !targetId || String(sourceId) === String(targetId)) {
    return { ok: false, error: "Mã nguồn và mã đích phải khác nhau." };
  }

  const source = (state.partners || []).find((p) => String(p.id) === String(sourceId));
  const target = (state.partners || []).find((p) => String(p.id) === String(targetId));
  if (!source) return { ok: false, error: `Không tìm thấy đối tác nguồn: ${sourceId}` };
  if (!target) return { ok: false, error: `Không tìm thấy đối tác đích: ${targetId}` };

  // Công trình con chỉ được chuyển sang một doanh nghiệp khác (không lồng công trình, không treo vào khách lẻ).
  const hasChildren = (state.partners || []).some(p => String(p.parentId || "") === String(sourceId) && String(p.id) !== String(targetId));
  if (hasChildren && target.type !== "enterprise") {
    return { ok: false, error: `"${sourceId}" còn công trình con: chỉ gộp được vào một Doanh nghiệp.` };
  }
  // Số dư đầu kỳ của NCC nằm bên 331, của khách nằm bên 131: cộng thẳng sẽ sai tài khoản.
  const srcOpening = (state.partnerOpeningBalances || {})[sourceId] || {};
  const srcHasOpening = (Number(srcOpening.debit) || 0) !== 0 || (Number(srcOpening.credit) || 0) !== 0;
  if (srcHasOpening && (source.type === "supplier") !== (target.type === "supplier")) {
    return { ok: false, error: "Hai mã khác phía 131/331 (khách và NCC) và mã nguồn còn số dư đầu kỳ: hãy xử lý số dư trước khi gộp." };
  }

  let voucherCount = 0;
  (state.vouchers || []).forEach((v) => {
    if (!v) return;
    // Khớp cả mã có khoảng trắng thừa (nhập Excel) — giống bộ phân giải mã của sổ công nợ
    if (String(v.partnerId == null ? "" : v.partnerId).trim() === String(sourceId).trim()) {
      v.partnerId = targetId;
      if (!opts.keepPartnerNameOnVoucher) {
        v.partnerName = target.name;
      }
      if (typeof touchEntityUpdatedAt === "function") touchEntityUpdatedAt(v);
      else v._updatedAt = Date.now();
      voucherCount++;
    }
  });

  mergePartnerOpeningBalance(sourceId, targetId);

  if (typeof trackDeletedIds === "function") {
    trackDeletedIds([sourceId], "partner");
  }

  state.partners = (state.partners || []).filter((p) => String(p.id) !== String(sourceId));
  state.partners.forEach(p => {
    if (String(p.parentId) !== String(sourceId)) return;
    p.parentId = String(p.id) === String(targetId)
      ? (String(source.parentId || '') === String(targetId) ? '' : (source.parentId || ''))
      : targetId;
    p._updatedAt = Date.now();
  });

  if (typeof invalidatePartnerCache === "function") invalidatePartnerCache();
  if (typeof syncPartnerOpeningAccounts === "function") syncPartnerOpeningAccounts();
  if (typeof invalidateAccounting === "function") invalidateAccounting(state);

  if (opts.recalculate !== false && typeof recalculateAccounting === "function") {
    recalculateAccounting(true);
  } else if (typeof saveState === "function") {
    saveState();
  }

  return {
    ok: true,
    sourceId,
    targetId,
    voucherCount,
    message: `Đã gộp ${sourceId} → ${targetId} (${voucherCount} chứng từ).`
  };
}

window.mergePartnerRecords = mergePartnerRecords;
