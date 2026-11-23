'use strict';

// Statuses in which a task is held by an agent (same set Concord uses for stale claims).
const OWNED_STATUSES = new Set(['active', 'blocked', 'handoff_offered']);

/**
 * Returns the stale claim for a task, or null.
 * A claim is stale when its owner is unknown to the roster (archived agents
 * drop off it) or has not been seen for `awayAfterMs`. Liveness is computed
 * from last_seen against `now`, because the file only holds a frozen value.
 */
function staleClaimOf(task, agents, now, awayAfterMs) {
  if (!OWNED_STATUSES.has(task.status) || task.agentId === null) return null;
  const owner = agents.get(task.agentId);
  if (!owner) return { task, agentId: task.agentId, reason: 'agent-unregistered', lastSeen: null };
  const seen = Date.parse(owner.lastSeen);
  if (Number.isNaN(seen) || now - seen >= awayAfterMs) {
    return {
      task,
      agentId: task.agentId,
      reason: 'agent-away',
      lastSeen: Number.isNaN(seen) ? null : owner.lastSeen,
    };
  }
  return null;
}

/**
 * Compares two snapshots and returns the events to notify about.
 * `prev` is the previous snapshot, or null on the first poll: the caller
 * should then baseline without alerting on existing history.
 *
 * Event keys are stable so a given event is only ever sent once:
 *   review:<taskId>:<updatedAt>   task entered review_ready
 *   stale:<taskId>:<agentId>      claim of that agent on that task went stale
 */
function detectEvents(prev, curr, now = Date.now(), awayAfterMs = 30 * 60 * 1000) {
  const events = [];
  for (const task of curr.tasks.values()) {
    const before = prev ? prev.tasks.get(task.id) : undefined;
    if (task.status === 'review_ready' && prev && (!before || before.status !== 'review_ready')) {
      events.push({ type: 'review_ready', key: `review:${task.id}:${task.updatedAt}`, task });
    }
    const stale = staleClaimOf(task, curr.agents, now, awayAfterMs);
    if (stale) {
      events.push({ type: 'stale_claim', key: `stale:${task.id}:${stale.agentId}`, ...stale });
    }
  }
  return events;
}

/** Stale claims already present in a snapshot (used to baseline on startup). */
function currentStaleKeys(snapshot, now, awayAfterMs) {
  const keys = [];
  for (const task of snapshot.tasks.values()) {
    const stale = staleClaimOf(task, snapshot.agents, now, awayAfterMs);
    if (stale) keys.push(`stale:${task.id}:${stale.agentId}`);
  }
  return keys;
}

module.exports = { detectEvents, staleClaimOf, currentStaleKeys, OWNED_STATUSES };
