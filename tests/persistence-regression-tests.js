'use strict';

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function testPersistenceBridgeFallback() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js/core/persistence-bridge.js'), 'utf8');
  const storage = {};
  const sandbox = {
    window: {
      localStorage: {
        setItem(k, v) { storage[k] = v; },
        getItem(k) { return storage[k] || null; }
      }
    },
    console
  };

  vm.runInNewContext(code, sandbox);

  const payload = JSON.stringify({ vouchers: [], products: [], partners: [] });
  return sandbox.window.persistFullState(payload).then((result) => {
    assert.equal(result.ok, true);
    assert.ok(storage.rd_accounting_online_cache);
    console.log('persistence-bridge fallback tests passed');
  });
}

testPersistenceBridgeFallback().then(() => {
  console.log('persistence regression tests passed');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
