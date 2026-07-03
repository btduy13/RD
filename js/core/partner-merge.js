/* ==========================================================================
   PARTNER MERGE — Gộp hai mã đối tác trùng công ty về một mã chính
   ========================================================================== */

function mergePartnerOpeningBalance(sourceId, targetId) {
  if (!state.partnerOpeningBalances) state.partnerOpeningBalances = {};
  if (!state.partnerOpeningBalanceTs) state.partnerOpeningBalanceTs = {};

  const src = state.partnerOpeningBalances[sourceId] || { debit: 0, credit: 0 };
  const tgt = state.partnerOpeningBalances[targetId] || { debit: 0, credit: 0 };

  state.partnerOpeningBalances[targetId] = {
    debit: (tgt.debit || 0) + (src.debit || 0),
    credit: (tgt.credit || 0) + (src.credit || 0)
  };

  const srcTs = Number(state.partnerOpeningBalanceTs[sourceId]) || 0;
  const tgtTs = Number(state.partnerOpeningBalanceTs[targetId]) || 0;
  state.partnerOpeningBalanceTs[targetId] = Math.max(srcTs, tgtTs);

  delete state.partnerOpeningBalances[sourceId];
  delete state.partnerOpeningBalanceTs[sourceId];
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

  let voucherCount = 0;
  (state.vouchers || []).forEach((v) => {
    if (!v) return;
    if (String(v.partnerId) === String(sourceId)) {
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

  if (typeof invalidatePartnerCache === "function") invalidatePartnerCache();
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
