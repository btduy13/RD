'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const result = spawnSync(require('electron'), [path.join(__dirname, 'cash-integrity-electron-runner.js')], { encoding: 'utf8', timeout: 75000 });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error);
process.exitCode = result.status === 0 ? 0 : 1;
