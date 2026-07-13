'use strict';

window.__rdAuditErrors = [];
window.addEventListener('error', event => {
  const target = event && event.target;
  if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) return;
  window.__rdAuditErrors.push(String(event.message || event.error || 'window error'));
});
window.addEventListener('unhandledrejection', event => {
  window.__rdAuditErrors.push(`Unhandled rejection: ${String(event.reason && event.reason.message || event.reason)}`);
});

localStorage.setItem('rd_accounting_cloud_settings', JSON.stringify({
  enabled: false,
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'test-key'
}));
localStorage.setItem('rd_migrations_279_done', 'true');

