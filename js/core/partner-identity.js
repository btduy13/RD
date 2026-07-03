/* ==========================================================================
   PARTNER IDENTITY — Nhận diện cùng một thương hiệu/công ty qua nhiều tên mã
   ========================================================================== */

const PARTNER_IDENTITY_RULES = [
  {
    id: "green-home-khong-gian-xanh",
    displayName: "Green Home / Không Gian Xanh",
    test(nameNorm) {
      return (
        /\bgreen\s*home\b/.test(nameNorm) ||
        /\bgreenhome\b/.test(nameNorm) ||
        /\bkhong\s*gian\s*xanh\b/.test(nameNorm)
      );
    }
  }
];

function normalizePartnerNameForIdentity(name) {
  let s = String(name || "").trim().toLowerCase();
  if (typeof removeAccents === "function") {
    s = removeAccents(s);
  }
  return s.replace(/\s+/g, " ");
}

function getPartnerIdentityRule(name) {
  const norm = normalizePartnerNameForIdentity(name);
  if (!norm) return null;
  for (const rule of PARTNER_IDENTITY_RULES) {
    if (rule.test(norm)) return rule;
  }
  return null;
}

function getPartnerIdentityKey(name) {
  const rule = getPartnerIdentityRule(name);
  return rule ? rule.id : null;
}

function getPartnerIdentityDisplayName(name, fallback) {
  const rule = getPartnerIdentityRule(name);
  return rule ? rule.displayName : (fallback || name || "");
}

function stripPartnerSuffixForGroupKey(name) {
  let key = String(name || "").trim().toLowerCase();
  if (typeof removeAccents === "function") {
    key = removeAccents(key);
  }
  key = key.replace(/\s+/g, " ");
  key = key.replace(/^(cong ty tnhh sx tm dv|cong ty tnhh sx tm|cong ty tnhh tm dv|cong ty tnhh dv|cong ty tnhh|cong ty co phan|cong ty cp|cong ty|cty tnhh sx tm dv|cty tnhh sx tm|cty tnhh tm dv|cty tnhh dv|cty tnhh|cty cp|cty|doanh nghiep|dn)\s+/i, "");
  key = key.replace(/\s*\([^)]*(?:kh|kht|ncc|dt|t\d|\d{2}\/\d{2}|\d{4})[^)]*\)$/i, "");
  return key.trim();
}

function getPartnerGroupKey(name) {
  const identityKey = getPartnerIdentityKey(name);
  if (identityKey) return identityKey;
  return stripPartnerSuffixForGroupKey(name);
}

function getPartnerGroupDisplayName(name) {
  const identityName = getPartnerIdentityDisplayName(name, null);
  if (identityName) return identityName;
  return String(name || "").trim().replace(/\s*\([^)]*(?:kh|kht|ncc|dt|t\d|\d{2}\/\d{2}|\d{4})[^)]*\)$/i, "").trim();
}

function findPartnerByIdentity(name, partners) {
  const identityKey = getPartnerIdentityKey(name);
  if (!identityKey) return null;

  const list = (partners || []).filter((p) => getPartnerIdentityKey(p.name) === identityKey);
  if (list.length === 0) return null;

  const combined = list.find((p) => {
    const norm = normalizePartnerNameForIdentity(p.name);
    return (
      (/\bgreen\s*home\b/.test(norm) || /\bgreenhome\b/.test(norm)) &&
      /\bkhong\s*gian\s*xanh\b/.test(norm)
    );
  });
  if (combined) return combined;

  const enterprise = list.find((p) => p.type === "enterprise");
  if (enterprise) return enterprise;

  return list[0];
}

window.PARTNER_IDENTITY_RULES = PARTNER_IDENTITY_RULES;
window.getPartnerIdentityKey = getPartnerIdentityKey;
window.getPartnerIdentityDisplayName = getPartnerIdentityDisplayName;
window.getPartnerGroupKey = getPartnerGroupKey;
window.getPartnerGroupDisplayName = getPartnerGroupDisplayName;
window.findPartnerByIdentity = findPartnerByIdentity;
