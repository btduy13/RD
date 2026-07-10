'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const electronPath = require('electron');

const runner = path.join(__dirname, 'voucher-template-editor-electron-runner.js');
const result = spawnSync(electronPath, [runner], {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8',
  stdio: 'pipe'
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
assert.equal(result.status, 0, `voucher template editor test failed with status ${result.status}`);
console.log('voucher template editor regression tests passed');
