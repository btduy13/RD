// Generic in-memory fake of the versioned Supabase RPCs plus a multi-station vm harness.
// Loads the REAL js/cloud-sync.js into one vm context per station. Test-only; no network.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(REPO, 'js', 'cloud-sync.js'), 'utf8');
const clone = v => JSON.parse(JSON.stringify(v));

class FakeServer {
  constructor() { this.version = 0; this.rows = new Map(); this.log = []; this.hooks = {}; }
  sorted() { return [...this.rows.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
  async rpc(station, name, p) {
    if (this.hooks[name]) { const h = this.hooks[name]; await h(station, p); }
    switch (name) {
      case 'rd_cloud_status': return { data: [{ workspace_id: p.p_workspace_id, sync_version: this.version }], error: null };
      case 'rd_sync_snapshot': {
        const rows = this.sorted().filter(r => !r.id.startsWith('lock_') && (!p.p_after_id || r.id > p.p_after_id)).slice(0, p.p_limit);
        return { data: clone(rows), error: null };
      }
      case 'rd_sync_delta': {
        const after = Number(p.p_after_version) || 0;
        const rows = [...this.rows.values()].filter(r => !r.id.startsWith('lock_') && (r.sync_version > after || (r.sync_version === after && p.p_after_id && r.id > p.p_after_id)))
          .sort((a, b) => a.sync_version - b.sync_version || (a.id < b.id ? -1 : 1)).slice(0, p.p_limit);
        return { data: clone(rows), error: null };
      }
      case 'rd_find_ids': return { data: p.p_ids.filter(id => this.rows.has(id)).map(id => ({ id })), error: null };
      case 'rd_rows_by_ids': return { data: clone(p.p_ids.filter(id => this.rows.has(id)).map(id => this.rows.get(id))), error: null };
      case 'rd_apply_sync_transaction': {
        if ((p.p_expected_sync_version || 0) !== this.version) return { data: { ok: false, conflict: true, sync_version: this.version }, error: null };
        const next = this.version + 1;
        for (const row of p.p_rows) {
          let data = clone(row.data || {});
          if (row.id === 'metadata') { delete data.actionLogs; delete data.deletedIds; delete data.deletedCloudKeys; }
          this.rows.set(row.id, { id: row.id, data, last_modified: row.last_modified, sync_version: next, updated_by: p.p_updated_by });
        }
        this.version = next;
        this.log.push({ station, version: next, ids: p.p_rows.map(r => r.id) });
        return { data: { ok: true, conflict: false, sync_version: next }, error: null };
      }
      case 'rd_reserve_voucher_id': {
        const next = this.version + 1;
        if (this.rows.has(p.p_lock_id)) return { data: { reserved: false, sync_version: this.version }, error: null };
        this.rows.set(p.p_lock_id, { id: p.p_lock_id, data: p.p_data, last_modified: Date.now(), sync_version: next });
        this.version = next;
        return { data: { reserved: true, sync_version: next }, error: null };
      }
      case 'rd_ids_by_prefix': {
        const rows = this.sorted().filter(r => r.id.startsWith(p.p_prefix) && (!p.p_after_id || r.id > p.p_after_id)).slice(0, p.p_limit);
        return { data: rows.map(r => ({ id: r.id, last_modified: r.last_modified })), error: null };
      }
    }
    throw new Error('unexpected rpc ' + name);
  }
}

function makeStation(name, server, initialState = {}, opts = {}) {
  const skew = opts.clockOffsetMs || 0;
  class SkewDate extends Date { constructor(...a) { if (a.length) super(...a); else super(Date.now() + skew); } static now() { return Date.now() + skew; } }
  const store = new Map();
  const localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };
  const client = { rpc: (n, p) => server.rpc(name, n, p) };
  const sandbox = {
    console: { log() {}, warn() {}, error: (...a) => sandbox.__errors.push(a.map(String).join(' ')), info() {} },
    __errors: [],
    setTimeout: (fn, ms) => { if (ms === 250 || ms === 300 || ms > 1500) { sandbox.__skippedTimers.push(ms); return 0; } return setTimeout(fn, ms); }, clearTimeout,
    __skippedTimers: [],
    Promise, Date: SkewDate, JSON, Number, Map, Set, Error, Math, Object, Array, String,
    localStorage,
    document: { getElementById() { return null; } },
    state: Object.assign({ companyName: 'Co', vouchers: [], products: [], partners: [], cashEntries: [], escrowItems: [],
      initialBalances: {}, partnerOpeningBalances: {}, partnerOpeningBalanceTs: {}, deletedIds: [], deletedCloudKeys: [], _lastModified: 0 }, clone(initialState)),
    __client: client, cloudSyncSettings: { enabled: true, supabaseUrl: "https://fake.local" },
    __logs: []
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`var lastSyncedCloudTs = 0; var clientSessionId = "session-${name}";\n${SRC}\n
    cloudSyncActive = true; isStartupPullCompleted = true; cloudUsesVersionedRpc = true; supabaseClient = __client;
    function __eval(code) { return eval(code); }`, sandbox, { filename: 'cloud-sync.js' });
  const st = {
    name, sandbox, store,
    run: code => vm.runInContext(code, sandbox),
    get state() { return sandbox.state; },
    async pull(opts = {}) { return vm.runInContext(`pullAndMergeFromCloud(${JSON.stringify(Object.assign({ reason: 'test', force: true }, opts))})`, sandbox); },
    async push() { return vm.runInContext(`cloudSyncPushNow()`, sandbox); },
    async startup() { return vm.runInContext(`pullAndMergeFromCloud({ reason: 'startup', force: true, forceFull: true, startup: true })`, sandbox); }
  };
  return st;
}

module.exports = { FakeServer, makeStation, clone, REPO };
