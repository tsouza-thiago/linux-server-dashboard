import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { HistoryStore } from './history.js';
import { AlertsStore, AnnotationsStore } from './stores.js';
import { collect } from './poller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* .env opcional */ }
  return out;
}

const env = loadEnv();
const SSH_HOST = env.SSH_HOST || 'seu-host';
const POLL_INTERVAL = parseInt(env.POLL_INTERVAL, 10) || 60000;
const PORT = parseInt(env.PORT, 10) || 3000;
const HISTORY_FILE = path.join(ROOT, env.HISTORY_FILE || 'data/history.json');
const LOG_FILE = path.join(ROOT, env.LOG_FILE || 'data/dashboard.log');

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logStream.write(`${line}\n`);
}

const store = new HistoryStore({
  limit: parseInt(env.HISTORY_LIMIT, 10) || 4320,
  file: HISTORY_FILE,
});
const alertsStore = new AlertsStore({ file: path.join(ROOT, 'data/alerts.json') });
const annotationsStore = new AnnotationsStore({ file: path.join(ROOT, 'data/annotations.json') });

const state = {
  online: false,
  offlineSince: null,
  lastPollAt: null,
  nextPollAt: null,
  lastError: null,
  polling: false,
};

const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

function broadcastAlerts() {
  broadcast('alerts', { alerts: alertsStore.active, all: alertsStore.list({ limit: 50 }) });
}

async function runPoll({ manual = false } = {}) {
  if (state.polling) return;
  state.polling = true;
  const started = Date.now();
  try {
    const res = await collect({ host: SSH_HOST, prev: store.getLatest() });
    state.lastPollAt = new Date().toISOString();
    state.nextPollAt = new Date(Date.now() + POLL_INTERVAL).toISOString();
    if (res.ok) {
      state.online = true;
      state.offlineSince = null;
      state.lastError = null;
      store.append(res.sample);
      alertsStore.reconcile(res.alerts);
      log(`poll OK (${Date.now() - started}ms) — amostras: ${store.length}`);
      broadcast('sample', { sample: res.sample, alerts: alertsStore.active });
      broadcastAlerts();
    } else {
      const wasOnline = state.online;
      state.online = false;
      if (wasOnline || !state.offlineSince) state.offlineSince = new Date().toISOString();
      state.lastError = res.error;
      alertsStore.reconcile([{ level: 'critical', message: `Servidor inacessível: ${res.error}` }]);
      log(`poll FALHOU: ${res.error}`);
      broadcast('status', statusPayload());
      broadcastAlerts();
    }
  } catch (err) {
    state.online = false;
    if (!state.offlineSince) state.offlineSince = new Date().toISOString();
    state.lastError = err.message;
    log(`poll ERRO: ${err.stack || err.message}`);
  } finally {
    state.polling = false;
  }
}

function statusPayload() {
  return {
    meta: {
      host: SSH_HOST,
      online: state.online,
      offlineSince: state.offlineSince,
      lastPollAt: state.lastPollAt,
      nextPollAt: state.nextPollAt,
      lastError: state.lastError,
      pollIntervalMs: POLL_INTERVAL,
      historySize: store.length,
      historyLimit: store.limit,
      serverTime: new Date().toISOString(),
    },
    sample: store.getLatest(),
    alerts: alertsStore.active,
  };
}

function parseRange(req) {
  const from = req.query.from || undefined;
  const to = req.query.to || undefined;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 720, 1), 2000);
  return { from, to, limit };
}

function toCSV(samples) {
  const mounts = [...new Set(samples.flatMap((s) => (s.disks || []).map((d) => d.mount)))];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = [
    'ts', 'host', 'uptimeSec', 'cores', 'kernel', 'load1', 'load5', 'load15',
    'ramTotalMB', 'ramUsedMB', 'ramAvailMB', 'swapTotalMB', 'swapUsedMB',
    'tempC', 'rxMbps', 'txMbps',
    ...mounts.flatMap((m) => {
      const k = m.replace(/[^a-zA-Z0-9]/g, '_');
      return [`disk_${k}_pct`, `disk_${k}_usedGB`, `disk_${k}_availGB`];
    }),
    ...(samples.some((s) => s.io?.length) ? ['ioDev', 'ioReadMBps', 'ioWriteMBps'] : []),
  ];
  const lines = [headers.join(',')];
  for (const s of samples) {
    const row = [
      s.ts, s.host, s.uptimeSec, s.cores ?? '', s.os?.kernel ?? '',
      s.load?.[0], s.load?.[1], s.load?.[2],
      s.ram?.total ?? '', s.ram?.used ?? '', s.ram?.avail ?? '',
      s.ram?.swapTotal ?? '', s.ram?.swapUsed ?? '',
      s.tempC ?? '', s.net?.rxMbps ?? '', s.net?.txMbps ?? '',
    ];
    for (const m of mounts) {
      const d = (s.disks || []).find((x) => x.mount === m) || {};
      row.push(d.pct ?? '', d.usedBytes ? (d.usedBytes / 1e9).toFixed(2) : '', d.availBytes ? (d.availBytes / 1e9).toFixed(2) : '');
    }
    if (s.io?.length) {
      for (const io of s.io) row.push(io.dev, io.readMBps ?? '', io.writeMBps ?? '');
    }
    lines.push(row.map(esc).join(','));
  }
  return lines.join('\n');
}

const app = express();
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.json(statusPayload());
});

app.get('/api/history', (req, res) => {
  const { from, to, limit } = parseRange(req);
  res.json({ samples: store.getRange(from, to, limit), count: store.length });
});

app.get('/api/alerts', (req, res) => {
  res.json({
    active: alertsStore.active,
    all: alertsStore.list({
      status: req.query.status || undefined,
      level: req.query.level || undefined,
      limit: Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500),
    }),
  });
});

app.post('/api/alerts/:id/ack', (req, res) => {
  const a = alertsStore.setStatus(req.params.id, 'ack');
  if (!a) return res.status(404).json({ error: 'alerta não encontrado' });
  broadcastAlerts();
  res.json({ ok: true, alert: a });
});

app.post('/api/alerts/:id/resolve', (req, res) => {
  const a = alertsStore.setStatus(req.params.id, 'resolved');
  if (!a) return res.status(404).json({ error: 'alerta não encontrado' });
  broadcastAlerts();
  res.json({ ok: true, alert: a });
});

app.get('/api/annotations', (req, res) => {
  res.json({ annotations: annotationsStore.data.slice(-500).reverse() });
});

app.post('/api/annotations', (req, res) => {
  const { ts, text, label } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'texto obrigatório' });
  const annotation = annotationsStore.add({ ts, text, label });
  broadcast('annotations', { annotations: annotationsStore.data.slice(-500).reverse() });
  res.json({ ok: true, annotation });
});

app.delete('/api/annotations/:id', (req, res) => {
  const ok = annotationsStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'anotação não encontrada' });
  broadcast('annotations', { annotations: annotationsStore.data.slice(-500).reverse() });
  res.json({ ok: true });
});

app.get('/api/export', (req, res) => {
  const { from, to } = parseRange(req);
  const samples = store.getRange(from, to, 5000);
  const fmt = req.query.format === 'json' ? 'json' : 'csv';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const hostName = (store.getLatest() && store.getLatest().host) || SSH_HOST;
  if (fmt === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${hostName}-${stamp}.json"`);
    return res.send(JSON.stringify({ exportedAt: new Date().toISOString(), count: samples.length, samples }));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${hostName}-${stamp}.csv"`);
  res.send(toCSV(samples));
});

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`event: hello\ndata: ${JSON.stringify(statusPayload())}\n\n`);
  res.write(`event: annotations\ndata: ${JSON.stringify({ annotations: annotationsStore.data.slice(-500).reverse() })}\n\n`);
  sseClients.add(res);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 30000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

app.post('/api/poll', (req, res) => {
  if (state.polling) return res.status(409).json({ error: 'coleta em andamento' });
  runPoll({ manual: true });
  res.json({ ok: true });
});

app.use(express.static(path.join(ROOT, 'public')));
app.get('/vendor/chart.js', (req, res) => {
  res.sendFile(path.join(ROOT, 'node_modules/chart.js/dist/chart.umd.js'));
});
app.get('/vendor/zoom.js', (req, res) => {
  res.sendFile(path.join(ROOT, 'node_modules/chartjs-plugin-zoom/dist/chartjs-plugin-zoom.min.js'));
});
app.get('/vendor/annotation.js', (req, res) => {
  res.sendFile(path.join(ROOT, 'node_modules/chartjs-plugin-annotation/dist/chartjs-plugin-annotation.min.js'));
});

const server = app.listen(PORT, '127.0.0.1', () => {
  log(`dashboard em http://127.0.0.1:${PORT} — host: ${SSH_HOST}, intervalo: ${POLL_INTERVAL}ms`);
  runPoll();
  setInterval(runPoll, POLL_INTERVAL);
});

function shutdown() {
  log('encerrando...');
  clearInterval();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);