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

module.exports = {
  isAllowedExternalUrl,
  isAllowedUpdateRequestUrl,
  isAllowedUpdateRedirectUrl
};
