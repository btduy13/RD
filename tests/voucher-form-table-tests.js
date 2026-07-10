'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const electronPath = require('electron');

const appDir = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const sales = fs.readFileSync(path.join(appDir, 'js', 'modules', 'sales.js'), 'utf8');
const purchase = fs.readFileSync(path.join(appDir, 'js', 'modules', 'purchase.js'), 'utf8');
const autosave = fs.readFileSync(path.join(appDir, 'js', 'modules', 'autosave.js'), 'utf8');
const interactions = fs.readFileSync(path.join(appDir, 'js', 'ui-interactions.js'), 'utf8');

const moduleSource = sales + '\n' + purchase;
const tbodyIds = Array.from(moduleSource.matchAll(/tbodyId:\s*"([^"]+-items-body)"/g), match => match[1]);
assert.deepEqual(new Set(tbodyIds).size, 7, 'all seven voucher item tables must be registered once');
tbodyIds.forEach(id => assert(html.includes(`id="${id}"`), `missing tbody #${id}`));

const fieldBlocks = Array.from(moduleSource.matchAll(/fieldIds:\s*\{([^}]+)\}/g), match => match[1]);
assert.equal(fieldBlocks.length, 7, 'all table configs must declare field IDs');
fieldBlocks.forEach(block => {
  Array.from(block.matchAll(/:\s*"([^"]+)"/g), match => match[1])
    .forEach(id => assert(html.includes(`id="${id}"`), `configured field ID does not exist: #${id}`));
});

assert.equal((html.match(/<thead><\/thead>/g) || []).length, 7, 'voucher item headers must be registry-rendered');
assert(!autosave.includes('purchase-id'), 'autosave must not contain stale hard-coded purchase IDs');
assert(!autosave.includes('sales-return-id'), 'autosave must not contain stale hard-coded sales return IDs');
assert(!interactions.includes("tbodyId === 'purchase-form-items-body'"), 'keyboard navigation must use the registry');

const runner = path.join(__dirname, 'voucher-form-table-electron-runner.js');
const result = spawnSync(electronPath, [runner], {
  cwd: appDir,
  encoding: 'utf8',
  stdio: 'pipe'
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
assert.equal(result.status, 0, `voucher form table electron test failed with status ${result.status}`);
console.log('voucher form table regression tests passed');
