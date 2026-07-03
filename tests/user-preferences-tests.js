'use strict';

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function createStorage(initial) {
  const map = { ...(initial || {}) };
  return {
    map,
    getItem(key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null; },
    setItem(key, value) { map[key] = String(value); }
  };
}

function loadUserPrefsModule(storage) {
  const sandbox = {
    window: {},
    console,
    JSON,
    localStorage: storage,
    getWebStorage() { return storage; }
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'js/core/user-preferences.js'), 'utf8'),
    sandbox
  );
  return sandbox;
}

function testMigrateLegacyTheme() {
  const storage = createStorage({ theme: 'light' });
  const api = loadUserPrefsModule(storage);
  const prefs = api.getUserPrefs();
  assert.equal(prefs.theme, 'light');
  assert.equal(JSON.parse(storage.getItem('rd_user_prefs')).theme, 'light');
  console.log('legacy theme migration passed');
}

function testSaveAndMergePrefs() {
  const storage = createStorage({});
  const api = loadUserPrefsModule(storage);
  api.saveUserPrefs({ theme: 'light', lastTab: 'debts', debtsViewTab: 'company' });
  const prefs = api.getUserPrefs();
  assert.equal(prefs.theme, 'light');
  assert.equal(prefs.lastTab, 'debts');
  assert.equal(prefs.debtsViewTab, 'company');
  assert.equal(storage.getItem('theme'), 'light');
  console.log('save and merge prefs passed');
}

testMigrateLegacyTheme();
testSaveAndMergePrefs();
console.log('user preferences tests passed');
