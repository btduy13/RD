'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const electronPath = require('electron');

const appDir = path.join(__dirname, '..');
const runner = path.join(__dirname, 'app-shell-smoke-electron-runner.js');
const result = spawnSync(electronPath, [runner], {
  cwd: appDir,
  encoding: 'utf8',
  stdio: 'pipe',
  timeout: 30000
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
assert.notEqual(result.error && result.error.code, 'ETIMEDOUT', 'app shell smoke test timed out');
assert.equal(result.status, 0, `app shell smoke electron test failed with status ${result.status}`);
console.log('app shell smoke tests passed');

