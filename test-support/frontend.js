import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { FakeDocument } from './fake-dom.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');

class ChartStub {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.data = config.data;
    this.options = config.options;
  }
  update() {}
  resize() {}
  resetZoom() {}
  static register() {}
}

class EventSourceStub {
  addEventListener() {}
}

export function createSandbox(extra = {}) {
  const document = new FakeDocument();
  const location = { hash: '' };
  const sandbox = {
    document,
    location,
    console,
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout,
    clearTimeout,
    prompt: () => null,
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      blob: async () => new Blob([]),
    }),
    EventSource: EventSourceStub,
    sessionStorage: {
      getItem() { return null; },
      setItem() {},
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    Chart: ChartStub,
    ChartZoom: {},
    URL,
    Blob: globalThis.Blob,
    Dash: {},
    ...extra,
  };
  sandbox.window = sandbox;
  sandbox.window.location = location;
  sandbox.window.addEventListener = () => {};
  vm.createContext(sandbox);
  return { sandbox, document, location, Dash: sandbox.Dash };
}

export function runInSandbox(sandbox, file) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

export function loadFrontend(name, extra = {}) {
  const ctx = createSandbox(extra);
  runInSandbox(ctx.sandbox, path.join(ROOT, 'public', 'js', name));
  return ctx;
}

export function loadAll(names, extra = {}) {
  const ctx = createSandbox(extra);
  for (const n of names) runInSandbox(ctx.sandbox, path.join(ROOT, 'public', 'js', n));
  return ctx;
}