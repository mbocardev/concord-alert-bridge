#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { loadConfig, loadDotEnv } = require('./config');
const { readSnapshot } = require('./snapshot');
const { detectEvents, currentStaleKeys } = require('./diff');
const { loadReviewPacket } = require('./review-packet');
const { buildMessage } = require('./messages');
const { send } = require('./notifier');
const { NotifiedStore } = require('./store');

function log(level, message) {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

function printState(snapshot) {
  const rows = [...snapshot.tasks.values()].map(
    (t) => `  ${t.id}  ${String(t.status).padEnd(15)} ${t.agentId || '-'}  ${t.title}`,
  );
  log('info', `State: ${snapshot.tasks.size} task(s), ${snapshot.agents.size} agent(s)${rows.length ? '\n' + rows.join('\n') : ''}`);
}

async function main() {
  loadDotEnv(path.resolve(process.cwd(), '.env'));
  const config = loadConfig();
  const store = new NotifiedStore(config.statePath);
  let prev = null;
  let lastDigest = '';
  let lastWarning = '';
  let running = false;

  log('info', `Watching ${config.concordDir} every ${config.pollIntervalMs / 1000}s, destination: ${config.webhookType}`);

  async function tick() {
    if (running) return;
    running = true;
    try {
      const curr = readSnapshot(config.concordDir, (level, message) => {
        if (message !== lastWarning) log(level, message);
        lastWarning = message;
      });
      if (!curr) return;
      lastWarning = '';
      const now = Date.now();

      if (prev === null) {
        // First poll: remember existing history without alerting on it.
        for (const key of currentStaleKeys(curr, now, config.awayAfterMs)) store.add(key);
        for (const t of curr.tasks.values()) {
          if (t.status === 'review_ready') store.add(`review:${t.id}:${t.updatedAt}`);
        }
        store.save();
        printState(curr);
        lastDigest = digestOf(curr);
        prev = curr;
        return;
      }

      const digest = digestOf(curr);
      if (digest !== lastDigest) {
        printState(curr);
        lastDigest = digest;
      }

      for (const event of detectEvents(prev, curr, now, config.awayAfterMs)) {
        if (store.has(event.key)) continue;
        const packet = event.type === 'review_ready' ? await loadReviewPacket(event.task.id, config, log) : {};
        const ok = await send(buildMessage(event, packet, now), config, log);
        if (ok) {
          store.add(event.key);
          store.save();
          log('info', `Alert sent: ${event.key}`);
        } else {
          log('warn', `Alert not delivered, will retry on next poll: ${event.key}`);
        }
      }
      prev = curr;
    } catch (err) {
      log('error', `Unexpected error during poll: ${err.message}`);
    } finally {
      running = false;
    }
  }

  await tick();
  setInterval(tick, config.pollIntervalMs);
}

function digestOf(snapshot) {
  return JSON.stringify([...snapshot.tasks.values()].map((t) => [t.id, t.status, t.agentId]));
}

main().catch((err) => {
  log('error', err.message);
  process.exit(1);
});
