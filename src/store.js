'use strict';

const fs = require('node:fs');

/** Persistent set of already-notified event keys (survives restarts). */
class NotifiedStore {
  constructor(file) {
    this.file = file;
    this.keys = new Set();
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data.notified)) this.keys = new Set(data.notified);
    } catch {
      /* first run or unreadable file: start empty */
    }
  }

  has(key) {
    return this.keys.has(key);
  }

  add(key) {
    this.keys.add(key);
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify({ notified: [...this.keys] }, null, 2));
    } catch {
      /* non-fatal: worst case an alert is repeated after a restart */
    }
  }
}

module.exports = { NotifiedStore };
