'use strict';

const MAX_FIELD = 700;

function clip(text) {
  const t = (text || '').trim();
  return t.length > MAX_FIELD ? `${t.slice(0, MAX_FIELD - 1)}…` : t;
}

function formatAge(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h >= 48) return `${Math.floor(h / 24)} days`;
  return `${h} h ${minutes % 60} min`;
}

/** Builds a platform-neutral message: { title, fields: [{ name, value }] }. */
function buildMessage(event, packet = {}, now = Date.now()) {
  const t = event.task;
  if (event.type === 'review_ready') {
    return {
      title: `Ready for review: ${t.title} (${t.id})`,
      fields: [
        { name: 'Agent', value: t.agentId || 'unknown' },
        { name: 'Summary', value: clip(packet.summary) || 'No summary provided' },
        { name: 'Tests', value: clip(packet.tests) || 'No tests reported' },
        { name: 'Risks', value: clip(packet.risks) || 'None reported' },
      ],
    };
  }
  const scope = [...t.expectedFiles, ...t.modules].join(', ') || 'not specified';
  const since = event.lastSeen
    ? `${formatAge(now - Date.parse(event.lastSeen))} ago (${event.lastSeen})`
    : 'unknown (agent no longer registered)';
  return {
    title: `Stale claim: ${t.title} (${t.id})`,
    fields: [
      { name: 'Agent', value: `${event.agentId} (${event.reason})` },
      { name: 'Files / modules', value: clip(scope) },
      { name: 'Last seen', value: since },
    ],
  };
}

function toSlack(msg) {
  return {
    text: msg.title,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: msg.title.slice(0, 150) } },
      {
        type: 'section',
        fields: msg.fields.map((f) => ({ type: 'mrkdwn', text: `*${f.name}*\n${f.value}`.slice(0, 2000) })),
      },
    ],
  };
}

function toTeams(msg) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: msg.title, weight: 'Bolder', size: 'Medium', wrap: true },
            { type: 'FactSet', facts: msg.fields.map((f) => ({ title: f.name, value: f.value })) },
          ],
        },
      },
    ],
  };
}

function toConsole(msg) {
  return [msg.title, ...msg.fields.map((f) => `  ${f.name}: ${f.value.replace(/\n/g, '\n    ')}`)].join('\n');
}

module.exports = { buildMessage, toSlack, toTeams, toConsole, formatAge };
