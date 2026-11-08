const UPDATE_REPOSITORY_PREFIX = "/btduy13/rd/releases/";
const UPDATE_ASSET_HOSTS = new Set([
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com"
]);

function parseSafeUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 4096) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function isAllowedExternalUrl(rawUrl) {
  const parsed = parseSafeUrl(rawUrl);
  return !!parsed && (parsed.protocol === "https:" || parsed.protocol === "http:");
}

function isAllowedUpdateRequestUrl(rawUrl) {
  const parsed = parseSafeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com") return false;
  return parsed.pathname.toLowerCase().startsWith(UPDATE_REPOSITORY_PREFIX);
}

function isAllowedUpdateRedirectUrl(rawUrl) {
  if (isAllowedUpdateRequestUrl(rawUrl)) return true;
  const parsed = parseSafeUrl(rawUrl);
  return !!parsed && parsed.protocol === "https:" && UPDATE_ASSET_HOSTS.has(parsed.hostname.toLowerCase());
}

// https://github.com/btduy13/RD/releases/download/<tag>/<asset> -> { tag, name }
function parseReleaseAssetUrl(rawUrl) {
  if (!isAllowedUpdateRequestUrl(rawUrl)) return null;
  const match = /^\/btduy13\/rd\/releases\/download\/([^/]+)\/([^/]+)$/i.exec(parseSafeUrl(rawUrl).pathname);
  return match ? { tag: decodeURIComponent(match[1]), name: decodeURIComponent(match[2]) } : null;
}

// GitHub release JSON lists assets with digest "sha256:<hex>".
function expectedSha256FromRelease(release, assetName) {
  const asset = (release && Array.isArray(release.assets) ? release.assets : []).find(a => a && a.name === assetName);
  const match = asset && /^sha256:([a-f0-9]{64})$/i.exec(String(asset.digest || ""));
  return match ? match[1].toLowerCase() : null;
}

function sha256File(filePath) {
  const crypto = require("crypto");
  const fs = require("fs");
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("error", reject)
      .on("data", chunk => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

module.exports = {
  isAllowedExternalUrl,
  isAllowedUpdateRequestUrl,
  isAllowedUpdateRedirectUrl,
  parseReleaseAssetUrl,
  expectedSha256FromRelease,
  sha256File
};
