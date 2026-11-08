'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readLatestValidJsonBackup,
  validateSerializedState,
  writeJsonBackup
} = require('../js/core/backup-store');
const {
  normalizePackagedExcelFilename,
  resolvePackagedExcelFile
} = require('../js/core/platform-paths');
const {
  archiveLegacyStateFile,
  databaseHasPersistedState
} = require('../js/core/sqlite-migration-guard');

function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-platform-test-'));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testBackupStore() {
  assert.deepEqual(validateSerializedState('{"vouchers":[]}'), { vouchers: [] });
  assert.throws(() => validateSerializedState('[]'), /JSON object/);
  assert.throws(() => validateSerializedState('{broken'), /JSON/);
  assert.throws(() => validateSerializedState('{"x":"12345"}', 5), /too large/);

  withTempDir(dir => {
    const now = new Date('2026-07-12T12:00:00.000Z');
    const first = writeJsonBackup(dir, '{"vouchers":[{"id":"BH1"}]}', { now });
    const second = writeJsonBackup(dir, '{"vouchers":[{"id":"BH2"}]}', { now });
    assert.notEqual(first, second, 'same-millisecond backups must not overwrite each other');
    assert.equal(fs.readdirSync(dir).some(name => name.endsWith('.tmp')), false, 'atomic backup temp files must be cleaned');

    const invalid = path.join(dir, 'RD_Backup_99999999_999999_999_deadbeef.json');
    fs.writeFileSync(invalid, '{invalid', 'utf8');
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(invalid, future, future);

    const latest = readLatestValidJsonBackup(dir);
    assert.equal(latest.ok, true, 'a corrupt newest backup must fall back to the next valid file');
    assert.equal(JSON.parse(latest.data).vouchers.length, 1);
    assert.equal(latest.invalidFiles[0].filename, path.basename(invalid));
  });
}

function testPackagedExcelPaths() {
  assert.equal(normalizePackagedExcelFilename('MẪU.XLSX'), 'MẪU.XLSX');
  assert.throws(() => normalizePackagedExcelFilename('../secret.xlsx'), /Invalid/);
  assert.throws(() => normalizePackagedExcelFilename('folder\\secret.xlsx'), /Invalid/);
  assert.throws(() => normalizePackagedExcelFilename('notes.txt'), /Unsupported/);

  withTempDir(dir => {
    const excelDir = path.join(dir, 'excel');
    const templateDir = path.join(excelDir, 'phieu mau');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(excelDir, 'root.xlsx'), 'root');
    fs.writeFileSync(path.join(templateDir, 'template.xls'), 'template');
    assert.equal(resolvePackagedExcelFile(dir, 'root.xlsx'), path.join(excelDir, 'root.xlsx'));
    assert.equal(resolvePackagedExcelFile(dir, 'template.xls'), path.join(templateDir, 'template.xls'));
    assert.throws(() => resolvePackagedExcelFile(dir, 'missing.xlsx'), /does not exist/);
  });
}

function testSqliteMigrationGuard() {
  const counts = { vouchers: 0, products: 0, partners: 0, metadata: 0 };
  const db = {
    prepare(sql) {
      const tableMatch = sql.match(/FROM\s+(vouchers|products|partners|metadata)/i);
      return { get: () => ({ count: counts[tableMatch[1].toLowerCase()] }) };
    }
  };
  assert.equal(databaseHasPersistedState(db), false, 'schema metadata alone is not user data');
  counts.metadata = 1;
  assert.equal(databaseHasPersistedState(db), true);
  counts.metadata = 0;
  counts.vouchers = 1;
  assert.equal(databaseHasPersistedState(db), true);

  withTempDir(dir => {
    const legacy = path.join(dir, 'rd_state.json');
    fs.writeFileSync(legacy, '{}');
    fs.writeFileSync(`${legacy}.bak_migrated`, 'older');
    const archived = archiveLegacyStateFile(legacy, 'bak_migrated');
    assert.equal(archived, `${legacy}.bak_migrated.1`, 'existing migration archives must never be overwritten');
    assert.equal(fs.existsSync(archived), true);
  });
}

function testPlatformWiring() {
  const root = path.join(__dirname, '..');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'js', 'modules', 'settings.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert(preload.includes("openBackupFolder: () => ipcRenderer.invoke('open-backup-folder')"));
  assert(settings.includes('window.electronAPI.openBackupFolder()'));
  assert(!settings.includes('openExternalUrl("file://"'), 'backup folders must not use the web URL IPC');
  assert(main.includes("ipcMain.handle('open-backup-folder'"));
  for (const dead of ['get-backup-dir', 'trigger-auto-update', 'list-template-files', 'read-latest-backup']) {
    assert(!main.includes(`'${dead}'`) && !preload.includes(`'${dead}'`), `IPC ${dead} has no renderer caller and must stay removed`);
  }
  assert(main.includes('.xlsx$/i.test(safeName)'), 'save-excel-and-open must refuse non-.xlsx names before shell.openPath');
  assert(main.includes('await sha256File(destPath) !== expectedSha256'), 'installer must be hash-checked before launch');
  assert(main.includes("app.on('will-quit'"));
  assert(main.includes('app.requestSingleInstanceLock()'), 'desktop app must prevent two processes from writing the same local database');
  assert(main.includes("app.on('second-instance'"), 'a second launch must focus the existing window');
  assert(main.includes('backgroundThrottling: false'), 'cloud polling must keep running while the Electron window is in the background');
  assert(
    main.includes("if (migratedLegacyState && fs.existsSync(oldBackupDir)"),
    'legacy backup files must only be copied when a legacy state/database was actually migrated'
  );
  const { STATE_METADATA_KEYS } = require('../js/core/state-diff');
  for (const key of ['_pendingCloudWrite', '_cloudDatasetIdentity', '_deletedCloudKeyTs', 'taxSettings', 'employees', 'payrolls']) {
    assert(STATE_METADATA_KEYS.includes(key), `${key} must be persisted to SQLite`);
  }
  assert(main.includes('for (const key of STATE_METADATA_KEYS)'), 'main.js must write the shared metadata key list');
  assert(main.includes('STATE_METADATA_KEYS.includes(row.key)'), 'main.js must read the shared metadata key list');
}

async function testInstallerDigest() {
  const { parseReleaseAssetUrl, expectedSha256FromRelease, sha256File } = require('../js/core/url-security');
  assert.deepEqual(
    parseReleaseAssetUrl('https://github.com/btduy13/RD/releases/download/v3.4.22/rd-accounting-setup-3.4.22.exe'),
    { tag: 'v3.4.22', name: 'rd-accounting-setup-3.4.22.exe' }
  );
  assert.equal(parseReleaseAssetUrl('https://github.com/btduy13/RD/releases/latest'), null);
  assert.equal(parseReleaseAssetUrl('https://evil.example/btduy13/RD/releases/download/v1/a.exe'), null);
  const hex = 'ab'.repeat(32);
  const release = { assets: [{ name: 'a.exe', digest: `sha256:${hex.toUpperCase()}` }, { name: 'b.exe', digest: null }] };
  assert.equal(expectedSha256FromRelease(release, 'a.exe'), hex);
  assert.equal(expectedSha256FromRelease(release, 'b.exe'), null, 'missing digest must not verify');
  assert.equal(expectedSha256FromRelease(release, 'c.exe'), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-digest-test-'));
  try {
    const file = path.join(dir, 'x.exe');
    fs.writeFileSync(file, 'abc');
    assert.equal(await sha256File(file), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

testBackupStore();
testPackagedExcelPaths();
testSqliteMigrationGuard();
testPlatformWiring();
testInstallerDigest().then(() => console.log('platform regression tests passed'), err => {
  console.error(err);
  process.exit(1);
});
