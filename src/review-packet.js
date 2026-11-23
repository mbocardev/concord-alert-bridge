'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function sections(markdown) {
  const out = {};
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      current = m[1].toLowerCase();
      out[current] = [];
    } else if (current) {
      out[current].push(line);
    }
  }
  for (const k of Object.keys(out)) out[k] = out[k].join('\n').trim();
  return out;
}

const isEmpty = (text) => !text || /^_(none|unknown|not reported)_$/i.test(text.trim());

/** Extracts summary, tests and risks from a Concord review packet (markdown). */
function parseReviewPacket(markdown) {
  const s = sections(markdown);
  const risks = [s['open questions'], s.assumptions].filter((t) => !isEmpty(t)).join('\n');
  return {
    summary: isEmpty(s.plan) ? '' : s.plan,
    tests: isEmpty(s['tests run']) ? '' : s['tests run'],
    risks,
  };
}

function runCli(taskId, repoPath) {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'concord';
    const args = process.platform === 'win32' ? ['/c', 'concord', 'review-packet', taskId] : ['review-packet', taskId];
    execFile(command, args, { cwd: repoPath, timeout: 15000, windowsHide: true }, (err, stdout) =>
      resolve(err ? null : stdout),
    );
  });
}

/**
 * Loads the review packet of a task: first through the Concord CLI, then from
 * .concord/REVIEW_PACKET.md if it belongs to that task. Never throws.
 */
async function loadReviewPacket(taskId, config, log = () => {}) {
  let markdown = await runCli(taskId, config.repoPath);
  if (markdown && /^No (task|review packet)/.test(markdown.trim())) markdown = null;
  if (!markdown) {
    try {
      const file = fs.readFileSync(path.join(config.concordDir, 'REVIEW_PACKET.md'), 'utf8');
      if (file.includes(`# Review Packet: ${taskId}`)) markdown = file;
    } catch {
      /* no packet file */
    }
  }
  if (!markdown) {
    log('warn', `No review packet available for task ${taskId}; alert will be sent without details`);
    return { summary: '', tests: '', risks: '' };
  }
  return parseReviewPacket(markdown);
}

module.exports = { parseReviewPacket, loadReviewPacket };
