'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WEBHOOK_TYPES = ['slack', 'teams', 'console'];

/** Minimal .env loader: existing environment variables always win. */
function loadDotEnv(file, env = process.env) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (env[key] === undefined) env[key] = value;
  }
}

function positiveNumber(name, raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return n;
}

function loadConfig(env = process.env) {
  const webhookType = (env.WEBHOOK_TYPE || 'console').toLowerCase();
  if (!WEBHOOK_TYPES.includes(webhookType)) {
    throw new Error(`WEBHOOK_TYPE must be one of: ${WEBHOOK_TYPES.join(', ')}`);
  }
  const webhookUrl = env.WEBHOOK_URL || '';
  if (webhookType !== 'console' && !webhookUrl) {
    throw new Error(`WEBHOOK_URL is required when WEBHOOK_TYPE is "${webhookType}"`);
  }
  if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) {
    throw new Error('WEBHOOK_URL must start with https://');
  }
  const repoPath = path.resolve(env.CONCORD_REPO_PATH || process.cwd());
  return {
    repoPath,
    concordDir: path.join(repoPath, '.concord'),
    webhookType,
    webhookUrl,
    pollIntervalMs: positiveNumber('POLL_INTERVAL_SECONDS', env.POLL_INTERVAL_SECONDS, 5) * 1000,
    awayAfterMs: positiveNumber('AWAY_AFTER_MINUTES', env.AWAY_AFTER_MINUTES, 30) * 60 * 1000,
    statePath: path.resolve(env.STATE_FILE || path.join(process.cwd(), '.alert-bridge-state.json')),
  };
}

module.exports = { loadConfig, loadDotEnv };
