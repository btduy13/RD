// Upper-case every partner code (2026-10-09). DRY-RUN by default; --apply writes.
// Usage: node scripts/maintenance/uppercase-partner-codes.js <repoRoot> <outDir> [--apply]
// Run with every station idle; outDir must be outside the repo or git-excluded (backups hold customer data).
// Mirrors the app's own code change (propagatePartnerIdChange): new partner row with the
// upper-case code, vouchers and children re-pointed, opening balance moved with a forward-only
// version and the old key versioned as deleted, old partner row tombstoned.
// Safety: fresh snapshot, refuses on collisions, full backup, batches of 100 chained on
// sync_version (a concurrent write stops the run), read-back verification.
const fs = require('fs'), path = require('path');
const [REPO, OUT] = process.argv.slice(2);
const APPLY = process.argv.includes('--apply');
const src = fs.readFileSync(path.join(REPO, 'js/modules/settings.js'), 'utf8');
const URL_ = src.match(/supabaseUrl: "([^"]+)"/)[1], KEY = src.match(/supabaseAnonKey: "([^"]+)"/)[1];
const WS = '00000000-0000-4000-8000-000000000001';
const UPDATED_BY = 'admin|maintenance_partner_code_upper';
const up = id => String(id == null ? '' : id).trim().toUpperCase();
const rpc = async (name, body) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(`${name} ${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j;
    } catch (e) {
      // Only reads are retried; a write must never be replayed blindly.
      if (name === 'rd_apply_sync_transaction' || attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
};
const snapshot = async () => {
  const rows = []; let after = null;
  for (;;) { const j = await rpc('rd_sync_snapshot', { p_workspace_id: WS, p_after_id: after, p_limit: 500 }); rows.push(...j); if (j.length < 500) break; after = j[j.length - 1].id; }
  return rows;
};

(async () => {
  const st = await rpc('rd_cloud_status', { p_workspace_id: WS });
  let version = Number((Array.isArray(st) ? st[0] : st).sync_version);
  const rows = await snapshot();
  console.log('cloud sync_version', version, 'rows', rows.length, APPLY ? '(APPLY)' : '(dry-run)');
  const live = r => r && r.data && !r.data._deleted;
  const partnerRows = rows.filter(r => r.id.startsWith('part_') && live(r));
  const rename = new Map(partnerRows.filter(r => r.data.id !== up(r.data.id)).map(r => [r.data.id, up(r.data.id)]));
  // Collision checks: two codes becoming one, or a target code already used by another row.
  const seen = new Map();
  for (const r of partnerRows) { const u = up(r.data.id); if (seen.has(u)) throw new Error(`collision: ${seen.get(u)} / ${r.data.id} -> ${u}`); seen.set(u, r.data.id); }
  const byRowId = new Map(rows.map(r => [r.id, r]));
  for (const [, u] of rename) { const existing = byRowId.get('part_' + u); if (existing && live(existing)) throw new Error('target row already live: ' + u); }

  const ts = Date.now();
  const stamp = d => { d._updatedAt = ts; d._lastModified = ts; return d; };
  const newPartners = [], tombstones = [], voucherUpdates = [], childUpdates = [], backup = [];
  for (const r of partnerRows) {
    const oldId = r.data.id;
    const d = JSON.parse(JSON.stringify(r.data));
    let changed = false;
    if (d.parentId && rename.has(d.parentId)) { d.parentId = rename.get(d.parentId); changed = true; }
    if (rename.has(oldId)) {
      d.id = rename.get(oldId);
      newPartners.push({ id: 'part_' + d.id, data: stamp(d), last_modified: ts });
      tombstones.push({ id: r.id, data: { id: oldId, _deleted: true, _deletedCloudKey: r.id, _deletedEntity: 'partner', _deletedAt: ts, lastModifiedBy: UPDATED_BY }, last_modified: ts });
      backup.push(r);
    } else if (changed) {
      childUpdates.push({ id: r.id, data: stamp(d), last_modified: ts }); backup.push(r);
    }
  }
  const renameTrimmed = new Map([...rename].map(([k, v]) => [k.trim(), v]));
  for (const r of rows.filter(r => r.id.startsWith('v_') && live(r))) {
    const pid = String(r.data.partnerId == null ? '' : r.data.partnerId).trim();
    if (!renameTrimmed.has(pid)) continue;
    const d = JSON.parse(JSON.stringify(r.data));
    d.partnerId = renameTrimmed.get(pid);
    voucherUpdates.push({ id: r.id, data: stamp(d), last_modified: ts }); backup.push(r);
  }
  const metaRow = rows.find(r => r.id === 'metadata');
  const meta = JSON.parse(JSON.stringify(metaRow.data));
  const ob = meta.partnerOpeningBalances || {}, obTs = meta.partnerOpeningBalanceTs || (meta.partnerOpeningBalanceTs = {});
  let movedOpenings = 0;
  for (const [oldId, newId] of rename) {
    const oldTs = Number(obTs[oldId]) || 0;
    if (Object.prototype.hasOwnProperty.call(ob, oldId)) {
      const movedAt = Math.max(ts, oldTs + 1, (Number(obTs[newId]) || 0) + 1);
      ob[newId] = ob[oldId]; delete ob[oldId];
      obTs[newId] = movedAt; obTs[oldId] = movedAt; // old key keeps a deletion version
      movedOpenings++;
    } else if (oldTs) {
      obTs[oldId] = Math.max(ts, oldTs + 1);
    }
  }
  meta._lastModified = Math.max(ts, Number(meta._lastModified) || 0);
  meta.lastModifiedBy = UPDATED_BY;
  backup.push(metaRow);
  const metaUpdate = { id: 'metadata', data: meta, last_modified: ts };

  console.log(`rename partners ${rename.size} | vouchers ${voucherUpdates.length} | children ${childUpdates.length} | openings moved ${movedOpenings}`);
  console.log('samples', [...rename].slice(0, 6).map(([a, b]) => `${a} -> ${b}`).join(' | '));
  fs.mkdirSync(OUT, { recursive: true });
  const tag = new Date(ts).toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(OUT, `backup-truoc-chu-hoa-${tag}.json`), JSON.stringify({ takenAt: new Date(ts).toISOString(), syncVersion: version, rows: backup }));
  // Order: new rows first, then references, then metadata, tombstones last (an interruption never
  // leaves vouchers pointing at a code that does not exist).
  const payload = [...newPartners, ...childUpdates, ...voucherUpdates, metaUpdate, ...tombstones];
  fs.writeFileSync(path.join(OUT, `payload-chu-hoa-${tag}.json`), JSON.stringify(payload));
  console.log('rows to write', payload.length, '| backup + payload in', OUT);
  if (!APPLY) { console.log('DRY-RUN: nothing written.'); return; }

  const batches = []; for (let i = 0; i < payload.length; i += 99) batches.push(payload.slice(i, i + 99));
  batches[batches.length - 1].push({ id: 'sync_signal', data: { lastModifiedBy: UPDATED_BY }, last_modified: ts });
  for (let i = 0; i < batches.length; i++) {
    const res = await rpc('rd_apply_sync_transaction', { p_workspace_id: WS, p_expected_sync_version: version, p_rows: batches[i], p_updated_by: UPDATED_BY });
    if (!res || res.ok !== true) { console.log(`STOPPED at batch ${i + 1}/${batches.length}:`, JSON.stringify(res), '— earlier batches are committed; investigate before re-running.'); process.exit(2); }
    version = Number(res.sync_version);
    if ((i + 1) % 20 === 0) console.log(`  batch ${i + 1}/${batches.length} ok, sync_version ${version}`);
  }
  console.log('applied', batches.length, 'batches, final sync_version', version);

  const back = await snapshot();
  const bm = new Map(back.map(r => [r.id, r]));
  const canon = x => Array.isArray(x) ? '[' + x.map(canon).join(',') + ']' : x && typeof x === 'object' ? '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}' : JSON.stringify(x);
  const stripMeta = d => { const c = { ...d }; delete c.actionLogs; delete c.deletedIds; delete c.deletedCloudKeys; return c; };
  const bad = payload.filter(p => { const r = bm.get(p.id); if (!r) return true; return p.id === 'metadata' ? canon(stripMeta(r.data)) !== canon(stripMeta(p.data)) : canon(r.data) !== canon(p.data); });
  console.log(bad.length ? `VERIFY: ${bad.length} rows differ e.g. ${bad.slice(0, 3).map(b => b.id)}` : `VERIFY OK: ${payload.length} rows read back`);
})().catch(e => { console.error('ABORT:', e.message); process.exit(1); });
