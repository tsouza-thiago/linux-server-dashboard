import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class JsonStore {
  constructor({ file, defaults = [] }) {
    this.file = file;
    this.data = defaults;
    this._pending = null;
    this._lastSave = Promise.resolve();
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[store] falha ao carregar ${this.file}: ${err.message}`);
      }
    }
  }

  async _atomicWrite(data) {
    try {
      await fsp.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const tmp = `${this.file}.tmp`;
      await fsp.writeFile(tmp, data, { mode: 0o600 });
      await fsp.rename(tmp, this.file);
    } catch (err) {
      console.error(`[store] falha ao gravar ${this.file}: ${err.message}`);
    }
  }

  save() {
    this._pending = JSON.stringify(this.data);
    const run = async () => {
      while (this._pending !== null) {
        const data = this._pending;
        this._pending = null;
        await this._atomicWrite(data);
      }
    };
    this._lastSave = this._lastSave.then(run, run);
    return this._lastSave;
  }

  async flush() {
    await this._lastSave;
  }
}

export class AlertsStore extends JsonStore {
  constructor({ file = 'data/alerts.json', max = 500 } = {}) {
    super({ file });
    this.max = max;
  }

  add({ level, message, key }) {
    const alert = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      level,
      message,
      status: 'new',
    };
    if (key) alert.key = key;
    this.data.push(alert);
    this.trim();
    this.save();
    return alert;
  }

  setStatus(id, status) {
    const a = this.data.find((x) => x.id === id);
    if (!a) return null;
    a.status = status;
    if (status === 'resolved') a.resolvedAt = new Date().toISOString();
    this.save();
    return a;
  }

  trim() {
    if (this.data.length > this.max) {
      this.data.splice(0, this.data.length - this.max);
    }
  }

  get active() {
    return this.data.filter((a) => a.status === 'new' || a.status === 'ack');
  }

  list({ status, level, limit = 100 } = {}) {
    let out = this.data;
    if (status) out = out.filter((a) => a.status === status);
    if (level) out = out.filter((a) => a.level === level);
    return out.slice(-limit).reverse();
  }

  reconcile(conditions) {
    const keyOf = (c) => c.key || c.message;
    const present = new Set(conditions.map(keyOf));
    const open = this.active;
    for (const a of open) {
      if (!present.has(keyOf(a))) {
        a.status = 'resolved';
        a.resolvedAt = new Date().toISOString();
      }
    }
    for (const c of conditions) {
      if (!open.some((a) => keyOf(a) === keyOf(c))) {
        this.add(c);
      }
    }
    if (open.length || conditions.length) this.save();
  }
}

export class AnnotationsStore extends JsonStore {
  constructor({ file = 'data/annotations.json' } = {}) {
    super({ file });
  }

  add({ ts, text, label = '' }) {
    const annotation = {
      id: randomUUID(),
      ts: ts || new Date().toISOString(),
      text: String(text || '').slice(0, 500),
      label: String(label || '').slice(0, 80),
    };
    this.data.push(annotation);
    this.save();
    return annotation;
  }

  remove(id) {
    const before = this.data.length;
    this.data = this.data.filter((a) => a.id !== id);
    if (this.data.length !== before) this.save();
    return this.data.length !== before;
  }
}