import fs from 'node:fs';
import path from 'node:path';

export class HistoryStore {
  constructor({ limit = 4320, file = 'data/history.json' } = {}) {
    this.limit = limit;
    this.file = file;
    this.samples = [];
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

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.samples));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`[history] falha ao gravar ${this.file}: ${err.message}`);
    }
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