const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const syncSource = fs.readFileSync(path.join(root, 'js', 'cloud-sync.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const gateSource = fs.readFileSync(path.join(root, 'js', 'core', 'online-write-gate.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase_online_v3_migration.sql'), 'utf8');
const egressMigration = fs.readFileSync(path.join(root, 'supabase_online_v4_egress_migration.sql'), 'utf8');
const packageJson = require(path.join(root, 'package.json'));
assert.match(packageJson.scripts.postinstall, /electron-rebuild.+better-sqlite3/);
assert.doesNotMatch(stateSource, /cloudCommitted = await pushToCloud\(\)/);
assert.match(stateSource, /const pendingToken =[\s\S]*markCloudWritePending\(\)[\s\S]*const saved = await enqueueSave\(\);[\s\S]*queueBackgroundCloudPush\(pendingToken\)/);
assert.match(gateSource, /root\.localPersistenceHealthy !== false/);
assert.doesNotMatch(gateSource, /status === "ready" \|\| status === "syncing"/);
assert.match(stateSource, /executeSaveState\(true, \{ skipCloudPush: true \}\)/);
assert.match(stateSource, /if \(sync\) \{\s*return await saveThenQueueCloud\(\);/);
assert.match(stateSource, /void Promise\.resolve\(pushToCloud\(\{ pendingToken \}\)\)/);
const voucherSaveSource = stateSource.slice(
  stateSource.indexOf('async function saveStateAndSyncVoucher()'),
  stateSource.indexOf('window.saveStateAndSyncVoucher = saveStateAndSyncVoucher;')
);
assert.match(voucherSaveSource, /await pushToCloud\(\{ pendingToken \}\)/);
assert.doesNotMatch(voucherSaveSource, /queueBackgroundCloudPush\(/);
assert.match(voucherSaveSource, /await waitForPushToComplete\(7000\)/);
assert.match(voucherSaveSource, /cloudExpected[\s\S]*markCloudWritePending\(\)/);
assert.doesNotMatch(stateSource, /await initCloudSync\(\)/);
assert.match(stateSource, /window\.cloudStartupPromise = Promise\.resolve\(\)[\s\S]*\.then\(\(\) => initCloudSync\(\)\)/);
assert.match(syncSource, /CLOUD_SYNC_PENDING_WRITE_KEY/);
assert.match(syncSource, /Pending local cloud write detected/);
assert.match(syncSource, /state\._pendingCloudWrite = \{ token, manifest, createdAt: Date\.now\(\) \}/);
assert.match(syncSource, /'_lastModified', '_lastPulledCloudTs', '_cloudDatasetIdentity', '_pendingCloudWrite'/);
assert.match(stateSource, /function persistStateLocallyWithoutCloud\(\)/);
assert.match(syncSource, /cloudSyncWriteQueue\.then/);
assert.match(syncSource, /"cloud upsert",\s*\{ timeoutMs: 20000 \}/);
assert.match(gateSource, /data-role-required/);
assert.match(syncSource, /rd_apply_sync_transaction/);
assert.match(syncSource, /p_expected_sync_version: cloudSyncVersion/);
assert.match(syncSource, /reason: "version-conflict"/);
assert.match(syncSource, /CLOUD_SYNC_VERSION_CONFLICT_MAX_RETRIES = 20/);
assert.match(syncSource, /incremental reconcile and retry/);
assert.match(syncSource, /snapshot page \$\{page \+ 1\} read/);
assert.match(syncSource, /\{ attempts: 10, timeoutMs: 20000 \}/);
assert.match(syncSource, /Math\.min\(10000, 350 \* \(2 \*\* \(attempt - 1\)\)\)/);
assert.match(syncSource, /voucher id prefix \$\{lower\} page \$\{page \+ 1\}/);
assert.match(syncSource, /voucher id reservation \$\{voucherId\}/);
assert.match(syncSource, /\.not\("id", "like", "lock_%"\)/);
assert.match(syncSource, /rowPrefix\.startsWith\("lock_"\)[\s\S]*Date\.now\(\) - 15 \* 60 \* 1000/);
assert.doesNotMatch(
  syncSource,
  /reason:\s*"version-conflict"[^\n}]*forceFull:\s*true/,
  'transaction conflicts must reconcile incrementally instead of downloading a full snapshot'
);
assert.match(syncSource, /CLOUD_SYNC_LEGACY_OVERLAP_MS = 2 \* 60 \* 1000/);
assert.match(syncSource, /legacyOverlap: !needFullPull && !cloudUsesVersionedRpc/);
assert.match(syncSource, /scheduleCloudPull\("realtime", \{ legacyOverlap: !cloudUsesVersionedRpc \}\)/);
assert.match(syncSource, /CLOUD_SYNC_PULL_DEBOUNCE_MS = 1500/);
assert.match(syncSource, /CLOUD_SYNC_CONFIRMED_REALTIME_POLL_INTERVAL_MS = 120000/);
assert.match(syncSource, /actionLogs,[\s\S]*deletedIds,[\s\S]*deletedCloudKeys,[\s\S]*\.\.\.metadata/);
assert.match(syncSource, /persistLastPulledCloudTs\(committedCloudWatermark\)/);
assert.match(
  syncSource,
  /"cloud bootstrap",[\s\S]{0,700}\{ attempts: 1, timeoutMs: 12000 \}/,
  'each cold-start cycle must use one bounded probe before the jittered reconnect loop takes over'
);
assert.match(syncSource, /CLOUD_SYNC_STARTUP_RECONNECT_BASE_MS = 30000/);
assert.match(syncSource, /CLOUD_SYNC_PUSH_RETRY_BASE_MS = 30000/);
assert.match(syncSource, /cloudMetadataCheckInFlight \|\| now < cloudMetadataNextAttemptAt/);
assert.doesNotMatch(syncSource, /CLOUD_SYNC_RECONNECT_DELAY_MS = 5000/);
assert.doesNotMatch(syncSource, /pushRetryTimeout = setTimeout\([\s\S]{0,220}, 5000\)/);
assert.match(migration, /for update;/i);
assert.match(migration, /on conflict\s*\(workspace_id,\s*id\)/i);
assert.match(migration, /d\.id not like 'lock\\_%' escape '\\'/i);
assert.match(migration, /delete from public\.rd_accounting_data[\s\S]*id like 'lock\\_%'/i);
assert.match(migration, /alter table public\.rd_workspaces enable row level security/i);
assert.match(migration, /revoke execute on function public\.rd_apply_sync_transaction\(uuid,bigint,jsonb,text\) from public/i);
assert.match(migration, /drop policy if exists "Allow public update"/i);
assert.match(migration, /revoke all on public\.rd_accounting_data from anon/i);
assert.doesNotMatch(migration, /station_key|STATION_FORBIDDEN/i);
assert.doesNotMatch(syncSource, /signInWithPassword|auth\.getSession/);
assert.match(syncSource, /PGRST202/);
assert.match(syncSource, /schema tương thích hiện tại/);
const startClientSource = syncSource.slice(
  syncSource.indexOf('async function startSupabaseClient()'),
  syncSource.indexOf('async function forcePullFromCloud()')
);
assert.doesNotMatch(
  startClientSource,
  /await cloudSyncEnsureMetadataRow\(\);[\s\S]*await pullFromCloudOnStartup\(\)/,
  'startup pull owns the metadata read; startSupabaseClient must not fetch the same 2MB row first'
);
assert.match(migration, /deleted_at timestamptz/i);
assert.equal(
  (egressMigration.match(/d\.data - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys'/g) || []).length,
  2,
  'both snapshot and delta RPCs must strip station-local and derived metadata'
);
assert.match(
  egressMigration,
  /v_data := v_data - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys'/,
  'transactional writes must prevent older clients from restoring the large metadata keys'
);
assert.match(egressMigration, /returns setof public\.rd_accounting_data/i);
assert.match(egressMigration, /revoke execute on function public\.rd_sync_snapshot[\s\S]*from public/i);
console.log('online sync contract tests passed');
