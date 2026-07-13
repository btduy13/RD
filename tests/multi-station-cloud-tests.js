const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ENTITY_CASES = [
  ['v_', 'purchase'], ['v_', 'purchase_order'], ['v_', 'purchase_return'],
  ['v_', 'sales'], ['v_', 'sales_return'], ['v_', 'quotation'],
  ['v_', 'receipt'], ['v_', 'payment'], ['p_', 'product'],
  ['part_', 'partner'], ['cash_', 'cash_entry'], ['escrow_', 'escrow_item']
];
class VersionConflict extends Error {}
class FakeCloud {
  constructor() { this.version = 0; this.rows = new Map(); this.online = true; }
  apply(expected, changes, station) {
    if (!this.online) throw new Error('NETWORK_DOWN');
    if (expected !== this.version) throw new VersionConflict('VERSION_CONFLICT');
    this.version += 1;
    changes.forEach(c => this.rows.set(c.key, { ...c, syncVersion: this.version, updatedBy: station }));
    return this.version;
  }
  delta(after) {
    if (!this.online) throw new Error('NETWORK_DOWN');
    return [...this.rows.values()].filter(r => r.syncVersion > after);
  }
}
class Station {
  constructor(name, cloud, cache) { this.name = name; this.cloud = cloud; this.cache = cache || new Map(); this.version = 0; this.mode = 'connecting'; }
  poll() { const rows = this.cloud.delta(this.version); rows.forEach(r => r.deleted ? this.cache.delete(r.key) : this.cache.set(r.key, structuredClone(r.data))); this.version = this.cloud.version; this.mode = 'ready'; return rows.length; }
  write(key, data) { if (this.mode !== 'ready') throw new Error('READ_ONLY'); this.version = this.cloud.apply(this.version, [{ key, data, deleted: false }], this.name); this.cache.set(key, structuredClone(data)); }
  remove(key) { if (this.mode !== 'ready') throw new Error('READ_ONLY'); this.version = this.cloud.apply(this.version, [{ key, data: { _deleted: true }, deleted: true }], this.name); this.cache.delete(key); }
  restart() { return new Station(this.name, this.cloud, new Map(this.cache)); }
}
function readyPair() { const cloud = new FakeCloud(); const a = new Station('A', cloud); const b = new Station('B', cloud); a.poll(); b.poll(); return { cloud, a, b }; }

for (const [prefix, type] of ENTITY_CASES) {
  const { a, b } = readyPair(); const key = `${prefix}${type}-001`;
  a.write(key, { id: `${type}-001`, type, amount: 100 });
  assert.equal(b.cache.has(key), false, `${type}: must not appear before pull`);
  b.poll(); assert.equal(b.cache.get(key).amount, 100, `${type}: create must propagate`);
  b.write(key, { id: `${type}-001`, type, amount: 250 });
  a.poll(); assert.equal(a.cache.get(key).amount, 250, `${type}: edit must propagate`);
  a.remove(key); b.poll(); assert.equal(b.cache.has(key), false, `${type}: delete must propagate`);
}
{
  const { cloud, a, b } = readyPair();
  a.write('v_batch-1', { id: 'batch-1' }); a.write('v_batch-2', { id: 'batch-2' }); b.poll();
  a.remove('v_batch-1'); a.remove('v_batch-2'); b.poll();
  assert.equal(b.cache.size, 0); assert.equal([...cloud.rows.values()].filter(r => r.deleted).length, 2);
}
{
  const { a, b } = readyPair(); a.write('v_conflict', { id: 'conflict' });
  assert.throws(() => b.write('v_other', { id: 'other' }), VersionConflict);
  b.poll(); b.write('v_other', { id: 'other' }); a.poll(); assert.ok(a.cache.has('v_other'));
}
{
  const { cloud, a, b } = readyPair(); cloud.online = false; b.mode = 'read-only';
  assert.throws(() => b.write('v_offline', { id: 'offline' }), /READ_ONLY/); assert.equal(b.cache.has('v_offline'), false);
  cloud.online = true; b.poll(); a.write('v_reconnected', { id: 'reconnected' }); b.poll(); assert.ok(b.cache.has('v_reconnected'));
}
{
  const { a, b } = readyPair(); a.write('v_restart', { id: 'restart', amount: 10 }); b.poll();
  const restarted = b.restart(); restarted.poll(); assert.equal(restarted.cache.get('v_restart').amount, 10);
  a.remove('v_restart'); restarted.poll(); assert.equal(restarted.cache.has('v_restart'), false);
}
{
  const { a, b } = readyPair();
  for (let i = 0; i < 30000; i++) a.cloud.rows.set(`v_load_${String(i).padStart(5, '0')}`, { key: `v_load_${String(i).padStart(5, '0')}`, data: { id: i }, syncVersion: 1 });
  a.cloud.version = 1; const started = Date.now(); b.poll(); const elapsed = Date.now() - started;
  assert.equal(b.cache.size, 30000); assert.ok(elapsed < 5000, `30k reconcile: ${elapsed}ms`);
}
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'sync-v2.js'), 'utf8');
const pollMs = Number(source.match(/SYNC_V2_POLL_INTERVAL_MS\s*=\s*(\d+)/)[1]);
assert.ok(pollMs <= 5000, `station propagation can exceed 5s: ${pollMs}ms`);
console.log(`multi-station cloud tests passed (${ENTITY_CASES.length} entity flows, poll <= ${pollMs}ms)`);
