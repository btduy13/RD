const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const syncSource = fs.readFileSync(path.join(root, 'js', 'cloud-sync.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const gateSource = fs.readFileSync(path.join(root, 'js', 'core', 'online-write-gate.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase_online_v3_migration.sql'), 'utf8');
const packageJson = require(path.join(root, 'package.json'));
assert.match(packageJson.scripts.postinstall, /electron-rebuild.+better-sqlite3/);
assert.doesNotMatch(stateSource, /cloudCommitted = await pushToCloud\(\)/);
assert.match(stateSource, /const saved = await enqueueSave\(\);[\s\S]*queueBackgroundCloudPush\(pendingToken\)/);
assert.match(gateSource, /root\.localPersistenceHealthy !== false/);
assert.doesNotMatch(gateSource, /status === "ready" \|\| status === "syncing"/);
assert.match(stateSource, /executeSaveState\(true, \{ skipCloudPush: true \}\)/);
assert.match(stateSource, /if \(sync\) \{\s*return await saveThenQueueCloud\(\);/);
assert.match(stateSource, /void Promise\.resolve\(pushToCloud\(\{ pendingToken \}\)\)/);
assert.doesNotMatch(stateSource, /await initCloudSync\(\)/);
assert.match(stateSource, /window\.cloudStartupPromise = Promise\.resolve\(\)[\s\S]*\.then\(\(\) => initCloudSync\(\)\)/);
assert.match(syncSource, /CLOUD_SYNC_PENDING_WRITE_KEY/);
assert.match(syncSource, /Pending local cloud write detected/);
assert.match(syncSource, /cloudSyncWriteQueue\.then/);
assert.match(syncSource, /"cloud upsert",\s*\{ timeoutMs: 20000 \}/);
assert.match(gateSource, /data-role-required/);
assert.match(syncSource, /rd_apply_sync_transaction/);
assert.match(syncSource, /p_expected_sync_version: cloudSyncVersion/);
assert.match(syncSource, /reason: "version-conflict"/);
assert.match(migration, /for update;/i);
assert.match(migration, /on conflict\s*\(workspace_id,\s*id\)/i);
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
console.log('online sync contract tests passed');
