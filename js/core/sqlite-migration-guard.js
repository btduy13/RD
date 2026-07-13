"use strict";

const fs = require("fs");

function databaseHasPersistedState(database) {
  if (!database) return false;

  for (const table of ["vouchers", "products", "partners"]) {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
    if (Number(row && row.count) > 0) return true;
  }

  const metadata = database.prepare(
    "SELECT COUNT(*) AS count FROM metadata WHERE key <> 'schemaVersion'"
  ).get();
  return Number(metadata && metadata.count) > 0;
}

function getAvailableArchivePath(sourcePath, suffix) {
  const basePath = `${sourcePath}.${suffix}`;
  if (!fs.existsSync(basePath)) return basePath;

  let counter = 1;
  while (fs.existsSync(`${basePath}.${counter}`)) counter += 1;
  return `${basePath}.${counter}`;
}

function archiveLegacyStateFile(sourcePath, suffix) {
  const archivePath = getAvailableArchivePath(sourcePath, suffix);
  fs.renameSync(sourcePath, archivePath);
  return archivePath;
}

module.exports = {
  archiveLegacyStateFile,
  databaseHasPersistedState,
  getAvailableArchivePath
};
