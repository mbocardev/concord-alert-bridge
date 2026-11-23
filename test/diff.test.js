'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../src/snapshot');
const { detectEvents, currentStaleKeys } = require('../src/diff');
const { parseReviewPacket } = require('../src/review-packet');
const { buildMessage, toSlack, toTeams } = require('../src/messages');
const { loadConfig } = require('../src/config');
const { send } = require('../src/notifier');

const NOW = Date.parse('2026-11-20T12:00:00Z');
const MIN = 60000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

function snap(tasks, agents = []) {
  return normalize({
    tasks: tasks.map(([id, status, agent]) => ({
      task_id: id, title: `Task ${id}`, status, agent_id: agent, updated_at: '2026-11-20T11:00:00Z',
    })),
    presence: agents.map(([id, msAgo]) => ({ agent_id: id, last_seen: iso(msAgo) })),
  });
}

test('alerts when a task moves to review_ready', () => {
  const prev = snap([['t1', 'active', 'a']], [['a', MIN]]);
  const curr = snap([['t1', 'review_ready', 'a']], [['a', MIN]]);
  const events = detectEvents(prev, curr, NOW);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'review_ready');
});

test('no review alert when the task was already review_ready', () => {
  const s = snap([['t1', 'review_ready', 'a']], [['a', MIN]]);
  assert.deepEqual(detectEvents(s, s, NOW), []);
});

test('no alert on first poll (prev is null) for existing history', () => {
  const curr = snap([['t1', 'review_ready', 'a']], [['a', MIN]]);
  assert.deepEqual(detectEvents(null, curr, NOW), []);
});

test('detects a claim whose agent has been away for 30+ minutes', () => {
  const curr = snap([['t1', 'active', 'a']], [['a', 45 * MIN]]);
  const [e] = detectEvents(curr, curr, NOW);
  assert.equal(e.type, 'stale_claim');
  assert.equal(e.reason, 'agent-away');
});

test('detects a claim whose agent is missing from the roster', () => {
  const curr = snap([['t1', 'active', 'ghost']], []);
  assert.equal(detectEvents(curr, curr, NOW)[0].reason, 'agent-unregistered');
});

test('does not flag a claim held by a live agent or a finished task', () => {
  const curr = snap([['t1', 'active', 'a'], ['t2', 'complete', 'ghost']], [['a', 2 * MIN]]);
  assert.deepEqual(detectEvents(curr, curr, NOW), []);
});

test('event keys are stable across polls (dedup relies on them)', () => {
  const curr = snap([['t1', 'active', 'a']], [['a', 45 * MIN]]);
  assert.equal(detectEvents(curr, curr, NOW)[0].key, detectEvents(curr, curr, NOW + MIN)[0].key);
  assert.deepEqual(currentStaleKeys(curr, NOW, 30 * MIN), ['stale:t1:a']);
});

test('parses summary, tests and risks from a review packet', () => {
  const md = '# Review Packet: t1 — X\n\n## Plan\n\nAdd login\n\n## Tests run\n\n- `npm test`\n\n## Assumptions\n\n- Users have email\n\n## Open questions\n\n_None_\n';
  assert.deepEqual(parseReviewPacket(md), {
    summary: 'Add login', tests: '- `npm test`', risks: '- Users have email',
  });
});

test('formats messages for Slack and Teams', () => {
  const [e] = detectEvents(snap([['t1', 'active', 'a']], [['a', MIN]]), snap([['t1', 'review_ready', 'a']], [['a', MIN]]), NOW);
  const msg = buildMessage(e, { summary: 'S', tests: 'T', risks: 'R' }, NOW);
  assert.match(msg.title, /Ready for review/);
  assert.equal(toSlack(msg).blocks[1].fields.length, 4);
  assert.equal(toTeams(msg).attachments[0].content.body[1].facts.length, 4);
});

test('config rejects a missing webhook URL and non-https URLs', () => {
  assert.throws(() => loadConfig({ WEBHOOK_TYPE: 'slack' }), /WEBHOOK_URL is required/);
  assert.throws(() => loadConfig({ WEBHOOK_TYPE: 'slack', WEBHOOK_URL: 'http://x' }), /https/);
});

test('send() returns false instead of throwing when the webhook fails', async () => {
  const logs = [];
  const log = (l, m) => logs.push(m);
  const cfg = { webhookType: 'slack', webhookUrl: 'https://hooks.example/secret' };
  const msg = { title: 't', fields: [] };
  assert.equal(await send(msg, cfg, log, async () => { throw new Error('down'); }), false);
  assert.equal(await send(msg, cfg, log, async () => ({ ok: false, status: 500 })), false);
  assert.ok(logs.every((m) => !m.includes('secret')));
});
