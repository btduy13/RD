"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_MAX_BACKUP_BYTES = 512 * 1024 * 1024;

function validateSerializedState(jsonData, maxBytes = DEFAULT_MAX_BACKUP_BYTES) {
  if (typeof jsonData !== "string") {
    throw new TypeError("Backup data must be a JSON string.");
  }
  if (Buffer.byteLength(jsonData, "utf8") > maxBytes) {
    throw new Error("Backup data is too large.");
  }

  const parsed = JSON.parse(jsonData);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Backup data must contain a JSON object.");
  }
  return parsed;
}

function makeBackupTimestamp(now = new Date()) {
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
    `_${pad(now.getMilliseconds(), 3)}`;
}

function writeJsonBackup(backupDir, jsonData, options = {}) {
  validateSerializedState(jsonData, options.maxBytes);
  fs.mkdirSync(backupDir, { recursive: true });

  const suffix = crypto.randomBytes(4).toString("hex");
  const filename = `RD_Backup_${makeBackupTimestamp(options.now)}_${suffix}.json`;
  const backupPath = path.join(backupDir, filename);
  const tempPath = path.join(backupDir, `.${filename}.${process.pid}.tmp`);

  try {
    fs.writeFileSync(tempPath, jsonData, { encoding: "utf8", flag: "wx" });
    fs.renameSync(tempPath, backupPath);
    return backupPath;
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_) {}
    throw error;
  }
}

function listJsonBackupsNewestFirst(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter((filename) => filename.startsWith("RD_Backup_") && filename.endsWith(".json"))
    .map((filename) => ({
      name: filename,
      time: fs.statSync(path.join(backupDir, filename)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);
}

function readLatestValidJsonBackup(backupDir, options = {}) {
  const invalidFiles = [];
  for (const file of listJsonBackupsNewestFirst(backupDir)) {
    const backupPath = path.join(backupDir, file.name);
    try {
      const data = fs.readFileSync(backupPath, "utf8");
      validateSerializedState(data, options.maxBytes);
      return { ok: true, data, filename: file.name, invalidFiles };
    } catch (error) {
      invalidFiles.push({ filename: file.name, error: error.message });
    }
  }

  return {
    ok: false,
    error: invalidFiles.length > 0
      ? "No valid JSON backup is available."
      : "No backup file is available.",
    invalidFiles
  };
}

module.exports = {
  DEFAULT_MAX_BACKUP_BYTES,
  listJsonBackupsNewestFirst,
  makeBackupTimestamp,
  readLatestValidJsonBackup,
  validateSerializedState,
  writeJsonBackup
};
