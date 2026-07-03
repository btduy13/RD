'use strict';

/**
 * Dọn mã hàng trùng (khác hoa/thường) trực tiếp trong rd_local.db
 * Usage: node scripts/db-migrate-product-dedupe.js [path-to-rd_local.db]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { dedupeProductCatalogOnState } = require('../js/core/product-case-dedupe.js');

const SCHEMA_VERSION = 4;

function defaultDbPath() {
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'rd-accounting', 'data', 'rd_local.db');
}

function readStateFromDb(db) {
  const stateObj = {
    companyName: '',
    address: '',
    taxCode: '',
    accountingStandard: 'TT200',
    initialBalances: {},
    deletedIds: [],
    products: [],
    partners: [],
    vouchers: [],
    schemaVersion: SCHEMA_VERSION
  };

  const metadataRows = db.prepare('SELECT key, value FROM metadata').all();
  for (const row of metadataRows) {
    try {
      const parsedVal = JSON.parse(row.value);
      if (row.key in stateObj || row.key.startsWith('_') || row.key === 'partnerOpeningBalances' || row.key === 'partnerOpeningBalanceTs' || row.key === 'deletedCloudKeys' || row.key === 'cashEntries' || row.key === 'escrowItems' || row.key === 'salesTemplatesData' || row.key === 'users' || row.key === 'actionLogs') {
        stateObj[row.key] = parsedVal;
      } else if (row.key === 'companyName') stateObj.companyName = parsedVal;
      else if (row.key === 'address') stateObj.address = parsedVal;
      else if (row.key === 'taxCode') stateObj.taxCode = parsedVal;
      else if (row.key === 'accountingStandard') stateObj.accountingStandard = parsedVal;
      else if (row.key === 'initialBalances') stateObj.initialBalances = parsedVal;
      else if (row.key === 'deletedIds') stateObj.deletedIds = parsedVal;
    } catch (e) {
      console.warn('Skip metadata key', row.key, e.message);
    }
  }

  db.prepare('SELECT data FROM vouchers').all().forEach((row) => {
    try { stateObj.vouchers.push(JSON.parse(row.data)); } catch (e) {}
  });
  db.prepare('SELECT data FROM products').all().forEach((row) => {
    try { stateObj.products.push(JSON.parse(row.data)); } catch (e) {}
  });
  db.prepare('SELECT data FROM partners').all().forEach((row) => {
    try { stateObj.partners.push(JSON.parse(row.data)); } catch (e) {}
  });

  return stateObj;
}

function saveStateToDb(db, stateObj) {
  const tx = db.transaction(() => {
    const stmtMetadata = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
    stmtMetadata.run('companyName', JSON.stringify(stateObj.companyName || ''));
    stmtMetadata.run('address', JSON.stringify(stateObj.address || ''));
    stmtMetadata.run('taxCode', JSON.stringify(stateObj.taxCode || ''));
    stmtMetadata.run('accountingStandard', JSON.stringify(stateObj.accountingStandard || 'TT200'));
    stmtMetadata.run('initialBalances', JSON.stringify(stateObj.initialBalances || {}));
    stmtMetadata.run('partnerOpeningBalances', JSON.stringify(stateObj.partnerOpeningBalances || {}));
    stmtMetadata.run('deletedIds', JSON.stringify(stateObj.deletedIds || []));
    stmtMetadata.run('deletedCloudKeys', JSON.stringify(stateObj.deletedCloudKeys || []));
    stmtMetadata.run('_lastModified', JSON.stringify(stateObj._lastModified || Date.now()));
    stmtMetadata.run('_lastPulledCloudTs', JSON.stringify(stateObj._lastPulledCloudTs || 0));
    stmtMetadata.run('schemaVersion', JSON.stringify(stateObj.schemaVersion || SCHEMA_VERSION));
    stmtMetadata.run('_accountingValid', JSON.stringify(!!stateObj._accountingValid));
    stmtMetadata.run('_accountingValidTs', JSON.stringify(stateObj._accountingValidTs || 0));
    stmtMetadata.run('_recalcWatermark', JSON.stringify(stateObj._recalcWatermark || null));
    if (stateObj.partnerOpeningBalanceTs) {
      stmtMetadata.run('partnerOpeningBalanceTs', JSON.stringify(stateObj.partnerOpeningBalanceTs));
    }

    db.prepare('DELETE FROM vouchers').run();
    const stmtVoucher = db.prepare('INSERT OR REPLACE INTO vouchers (id, type, date, data, _updatedAt, _sessionId) VALUES (?, ?, ?, ?, ?, ?)');
    for (const v of stateObj.vouchers || []) {
      stmtVoucher.run(v.id, v.type || '', v.date || '', JSON.stringify(v), v._updatedAt || 0, v._sessionId || '');
    }

    db.prepare('DELETE FROM products').run();
    const stmtProduct = db.prepare('INSERT OR REPLACE INTO products (id, name, unit, stock, avgCost, data, _updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const p of stateObj.products || []) {
      stmtProduct.run(p.id, p.name || '', p.unit || '', p.stock || 0, p.avgCost || 0, JSON.stringify(p), p._updatedAt || 0);
    }

    db.prepare('DELETE FROM partners').run();
    const stmtPartner = db.prepare('INSERT OR REPLACE INTO partners (id, name, type, data, _updatedAt) VALUES (?, ?, ?, ?, ?)');
    for (const p of stateObj.partners || []) {
      stmtPartner.run(p.id, p.name || '', p.type || '', JSON.stringify(p), p._updatedAt || 0);
    }

    stmtMetadata.run('productCaseDedupe_v1', JSON.stringify({
      at: Date.now(),
      via: 'scripts/db-migrate-product-dedupe.js'
    }));
  });
  tx();
}

function main() {
  const dbPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error('Không tìm thấy CSDL:', dbPath);
    process.exit(1);
  }

  const backupPath = `${dbPath}.bak_product_dedupe_${Date.now()}`;
  fs.copyFileSync(dbPath, backupPath);
  console.log('Backup:', backupPath);

  const db = new Database(dbPath);
  const stateObj = readStateFromDb(db);
  console.log(`Đọc CSDL: ${stateObj.products.length} mặt hàng, ${stateObj.vouchers.length} chứng từ`);

  const result = dedupeProductCatalogOnState(stateObj);
  if (!result.changed) {
    console.log('Không có mã trùng cần gộp — CSDL đã sạch.');
    db.close();
    process.exit(0);
    return;
  }

  saveStateToDb(db, stateObj);
  db.close();

  console.log(`Hoàn tất: ${result.beforeCount} → ${result.afterCount} mặt hàng`);
  console.log(`  Gộp bỏ: ${result.removedCount}`);
  console.log(`  Cập nhật productId trên CT: ${result.voucherItemUpdates}`);
  process.exit(0);
}

main();
