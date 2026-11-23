# Concord Alert Bridge

Concord coordinates coding agents with each other. This small service covers the missing human side: it **tells your team at the right moment**.

It watches a repository's `.concord/` folder and posts to **one** Slack or Microsoft Teams channel when:

1. **A task becomes ready for review** — the message includes the agent, summary, tests and risks.
2. **A claim goes stale** — an agent disappeared while holding a task (agent away, or no longer registered).

## How it works

- Polls `.concord/WORK_STATE.json` (kept up to date by Concord after every write) every few seconds.
- Compares the new snapshot with the previous one (`src/diff.js`, the core logic, unit-tested).
- Review details come from `concord review-packet <id>`, falling back to `.concord/REVIEW_PACKET.md`.
- Stale claims follow Concord's own definition: a task in `active`, `blocked` or `handoff_offered` whose owner is not on the roster or has not been seen for 30 minutes.
- Each event has a stable key stored in `.alert-bridge-state.json`, so it is sent only once, even after a restart. Failed deliveries are retried on the next poll.
- On startup, existing history is recorded but never alerted.
- A broken or unreachable webhook is logged and never crashes the service.

## Requirements

- Node.js 18+
- Concord set up in the watched repository (`npm i -g @concord-ai/concord-mcp`, then `concord setup`)
- A Slack Incoming Webhook or a Teams Workflows webhook

## Install and run

```bash
git clone <this repo>
cd concord-alert-bridge
cp .env.example .env     # then edit it
npm start
```

No dependencies to install. Run the tests with `npm test`.

## Configuration

Set in `.env` or as environment variables. The webhook URL is a secret: `.env` is git-ignored and the URL is never logged.

| Variable | Default | Description |
|---|---|---|
| `CONCORD_REPO_PATH` | current dir | Repository containing `.concord/` |
| `WEBHOOK_TYPE` | `console` | `slack`, `teams` or `console` (prints alerts, for testing) |
| `WEBHOOK_URL` | – | Webhook URL, required for `slack`/`teams`, must be https |
| `POLL_INTERVAL_SECONDS` | `5` | Polling interval |
| `AWAY_AFTER_MINUTES` | `30` | Inactivity before a claim is stale |
| `STATE_FILE` | `./.alert-bridge-state.json` | Where notified events are remembered |

Tip: start with `WEBHOOK_TYPE=console`, then switch to the real destination.

## Example alert

```
Ready for review: Add login (T1)
  Agent: claude-1
  Summary: Add login form and session handling
  Tests: npm test
  Risks: Users are assumed to have an email

Stale claim: Fix db (T2)
  Agent: codex-2 (agent-away)
  Files / modules: db.js
  Last seen: 42 min ago (2026-11-20T11:18:00Z)
```

## Ideas for improvement

- Create a GitHub Issue automatically from the review packet.
- Vue.js UI to choose which events go to which channel.
- Support several channels at once, and filter by agent or project.
- Daily summary of agent activity.
