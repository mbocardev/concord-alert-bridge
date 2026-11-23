'use strict';

const { toSlack, toTeams, toConsole } = require('./messages');

/**
 * Sends a message to the configured destination.
 * Resolves to true on success and false on failure; it never throws, so a
 * broken webhook cannot crash the service.
 */
async function send(msg, config, log, fetchImpl = globalThis.fetch) {
  if (config.webhookType === 'console') {
    console.log(`\n--- ALERT ---\n${toConsole(msg)}\n-------------`);
    return true;
  }
  const body = config.webhookType === 'slack' ? toSlack(msg) : toTeams(msg);
  try {
    const res = await fetchImpl(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      log('error', `Webhook rejected the message: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    // The URL is a secret, so it is never logged.
    log('error', `Webhook unreachable: ${err.message}`);
    return false;
  }
}

module.exports = { send };
