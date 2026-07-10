'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const electronPath = require('electron');
const path = require('path');

const runner = path.join(__dirname, 'print-layout-electron-runner.js');
const result = spawnSync(electronPath, [runner], {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8',
  stdio: 'pipe'
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

assert.equal(result.status, 0, `electron print layout test failed with status ${result.status}`);
console.log('print layout electron render passed');
