import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export class HistoryStore {
  constructor({ limit = 4320, file = 'data/history.json' } = {}) {
    this.limit = limit;
    this.file = file;
    this.samples = [];
    this._pending = null;
    this._lastSave = Promise.resolve();
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed
        : Array.isArray(parsed.samples) ? parsed.samples : [];
      this.samples = list
        .filter((s) => s && s.ts)
        .sort((a, b) => (a.ts < b.ts ? -1 : 1))
        .slice(-this.limit);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[history] falha ao carregar ${this.file}: ${err.message}`);
      }
      this.samples = [];
    }
  }

  append(sample) {
    this.samples.push(sample);
    if (this.samples.length > this.limit) {
      this.samples.splice(0, this.samples.length - this.limit);
    }
    this.save();
  }

  async _atomicWrite(data) {
    try {
      await fsp.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const tmp = `${this.file}.tmp`;
      await fsp.writeFile(tmp, data, { mode: 0o600 });
      await fsp.rename(tmp, this.file);
    } catch (err) {
      console.error(`[history] falha ao gravar ${this.file}: ${err.message}`);
    }
  }

  save() {
    this._pending = JSON.stringify(this.samples);
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

  getLatest() {
    return this.samples.length ? this.samples[this.samples.length - 1] : null;
  }

  getSamples(limit = 120) {
    return this.samples.slice(-limit);
  }

  getRange(from, to, limit = 720) {
    const list = this.samples.filter(
      (s) => (!from || s.ts >= from) && (!to || s.ts <= to)
    );
    return downsample(list, limit);
  }

  get length() {
    return this.samples.length;
  }
}

export function downsample(list, maxPoints = 720) {
  if (list.length <= maxPoints) return list;
  const stride = Math.ceil(list.length / maxPoints);
  const out = [];
  for (let i = 0; i < list.length; i += stride) out.push(list[i]);
  const last = list[list.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}