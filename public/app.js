const MAX_POINTS = 120;
let samples = [];
let charts = {};
let nextPollAt = null;
const CHART_COLORS = ['#3b82f6', '#f5a524', '#22c55e', '#e5484d', '#a855f7'];

const common = (d) => ({
  label: d.label,
  data: d.data,
  borderColor: d.color || CHART_COLORS[0],
  backgroundColor: (d.color || CHART_COLORS[0]) + '22',
  borderWidth: 1.5,
  pointRadius: 0,
  tension: 0.25,
  fill: d.fill || false,
});

const $ = (id) => document.getElementById(id);

function fmtBytes(bytes) {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR');
}

function barColor(pct) {
  if (pct >= 90) return '#e5484d';
  if (pct >= 60) return '#f5a524';
  return '#3b82f6';
}

function setBar(el, pct, color) {
  const p = Math.min(Math.max(pct, 0), 100);
  el.style.width = `${p}%`;
  el.style.background = color || barColor(p);
}

function renderAlerts(alerts) {
  const el = $('alerts');
  el.innerHTML = '';
  if (!alerts || !alerts.length) return;
  for (const a of alerts) {
    const div = document.createElement('div');
    div.className = `alert alert-${a.level}`;
    div.textContent = a.message;
    el.appendChild(div);
  }
}

function renderSample(s) {
  if (!s) return;
  $('hostLabel').textContent = s.host || '—';
  $('lastPollAt').textContent = fmtTime(s.ts);
  $('uptimeValue').textContent = fmtUptime(s.uptimeSec || 0);
  $('bootAt').textContent = `boot: ${fmtTime(s.bootAt)}`;

  $('load1').textContent = s.load[0].toFixed(2);
  $('load5').textContent = s.load[1].toFixed(2);
  $('load15').textContent = s.load[2].toFixed(2);
  const loadPct = Math.min(s.load[0] * 100, 100);
  setBar($('loadBar'), loadPct, loadPct > 90 ? '#e5484d' : '#3b82f6');

  const r = s.ram;
  if (r) {
    const usedPct = r.total ? (r.used / r.total) * 100 : 0;
    $('ramUsed').textContent = `${r.used} MB`;
    $('ramTotal').textContent = `/ ${r.total} MB`;
    setBar($('ramBar'), usedPct);
    $('ramNote').textContent = `livre: ${r.avail} MB · cache: ${r.cache} MB`;
    const swPct = r.swapTotal ? (r.swapUsed / r.swapTotal) * 100 : 0;
    $('swapUsed').textContent = `${r.swapUsed} MB`;
    $('swapTotal').textContent = `/ ${r.swapTotal} MB`;
    setBar($('swapBar'), swPct);
  }

  if (s.tempC !== null && s.tempC !== undefined) {
    $('tempValue').textContent = s.tempC.toFixed(1);
    setBar($('tempBar'), (s.tempC / 60) * 100);
    $('tempNote').textContent = s.tempC >= 60 ? 'ATENÇÃO: acima do limite' : `limite: 60°C`;
  } else {
    $('tempValue').textContent = '—';
  }

  renderDisks(s);
  renderNet(s);
  renderServices(s);
  renderProcs(s);
}

function renderDisks(s) {
  const tbody = $('disksTable').querySelector('tbody');
  tbody.innerHTML = '';
  for (const d of s.disks || []) {
    const smart = (s.smart || []).find((x) => `/${x.dev}` === d.mount.replace(/\/\d+$/, '') || x.dev === d.mount.replace('/dev/', '')) || {};
    const smartOk = !smart.status || smart.status === 'PASSED';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.mount}</td>
      <td>${d.size}</td>
      <td>${d.used}</td>
      <td>${d.avail}</td>
      <td>${d.pct}%</td>
      <td class="bar-cell"><div class="bar"><div class="bar-fill" style="width:${d.pct}%;background:${barColor(d.pct)}"></div></div></td>
      <td><span class="badge ${smartOk ? 'badge-ok' : 'badge-bad'}">${smart.status || '—'}</span></td>`;
    tbody.appendChild(tr);
  }
}

function renderNet(s) {
  const n = s.net || {};
  $('rxMbps').textContent = `${(n.rxMbps || 0).toFixed(2)} Mbps`;
  $('txMbps').textContent = `${(n.txMbps || 0).toFixed(2)} Mbps`;
  $('rxTotal').textContent = fmtBytes(n.rxBytes || 0);
  $('txTotal').textContent = fmtBytes(n.txBytes || 0);
}

function renderServices(s) {
  const el = $('services');
  el.innerHTML = '';
  for (const [svc, state] of Object.entries(s.services || {})) {
    const ok = state === 'active';
    const badge = document.createElement('span');
    badge.className = `badge ${ok ? 'badge-ok' : 'badge-bad'}`;
    badge.textContent = `${svc}: ${state}`;
    el.appendChild(badge);
  }
}

function renderProcs(s) {
  const tbody = $('procsTable').querySelector('tbody');
  tbody.innerHTML = '';
  for (const p of s.topProcs || []) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.pid}</td><td>${p.user}</td><td>${p.cpu.toFixed(1)}</td><td>${p.mem.toFixed(1)}</td><td class="mono">${p.cmd}</td>`;
    tbody.appendChild(tr);
  }
}

function setStatus(payload) {
  const meta = payload.meta || {};
  const online = !!meta.online;
  $('statusDot').className = `dot ${online ? 'dot-online' : 'dot-offline'}`;
  $('hostLabel').textContent = meta.host || '—';
  $('lastPollAt').textContent = fmtTime(meta.lastPollAt);
  nextPollAt = meta.nextPollAt ? Date.parse(meta.nextPollAt) : null;
  renderAlerts(payload.alerts);
  if (meta.lastError) {
    $('lastPollAt').textContent += ` · erro: ${meta.lastError}`;
  }
}

function createChart(id, config) {
  const ctx = $(id).getContext('2d');
  charts[id] = new Chart(ctx, config);
}

function chartConfig(label, color, fill = false) {
  return {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: { labels: { color: '#9ca3af', boxWidth: 12 } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { ticks: { color: '#6b7280', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
      },
    },
  };
}

function initCharts() {
  const base = {
    load: chartConfig('load'),
    ram: chartConfig('ram'),
    disk: chartConfig('disk'),
    net: chartConfig('net'),
    temp: chartConfig('temp'),
  };
  const colors = CHART_COLORS;

  createChart('chartLoad', {
    ...base.load,
    data: {
      labels: [],
      datasets: [
        { ...common({ label: '1 min', data: [], color: '#3b82f6' }) },
        { ...common({ label: '5 min', data: [], color: '#f5a524' }) },
        { ...common({ label: '15 min', data: [], color: '#22c55e' }) },
      ],
    },
  });
  createChart('chartRam', {
    ...base.ram,
    data: { labels: [], datasets: [{ ...common({ label: 'RAM %', data: [], color: '#3b82f6', fill: true }) }] },
  });
  createChart('chartDisk', {
    ...base.disk,
    data: { labels: [], datasets: [] },
  });
  createChart('chartNet', {
    ...base.net,
    data: {
      labels: [],
      datasets: [
        { ...common({ label: 'Download Mbps', data: [], color: '#22c55e', fill: true }) },
        { ...common({ label: 'Upload Mbps', data: [], color: '#e5484d' }) },
      ],
    },
  });
  createChart('chartTemp', {
    ...base.temp,
    data: { labels: [], datasets: [{ ...common({ label: 'CPU °C', data: [], color: '#f5a524', fill: true }) }] },
  });
}

function updateCharts() {
  const labels = samples.map((s) => new Date(s.ts).toLocaleTimeString('pt-BR', { hour12: false }));

  charts.chartLoad.data.labels = labels;
  charts.chartLoad.data.datasets[0].data = samples.map((s) => s.load[0]);
  charts.chartLoad.data.datasets[1].data = samples.map((s) => s.load[1]);
  charts.chartLoad.data.datasets[2].data = samples.map((s) => s.load[2]);

  charts.chartRam.data.labels = labels;
  charts.chartRam.data.datasets[0].data = samples.map((s) =>
    s.ram && s.ram.total ? +((s.ram.used / s.ram.total) * 100).toFixed(1) : null);

  const mounts = [...new Set(samples.flatMap((s) => (s.disks || []).map((d) => d.mount)))];
  charts.chartDisk.data.labels = labels;
  charts.chartDisk.data.datasets = mounts.map((m, i) => ({
    ...charts.chartDisk.data.datasets.find((ds) => ds.label === m) || common({ label: m, data: [], color: CHART_COLORS[i % CHART_COLORS.length] }),
    data: samples.map((s) => {
      const d = (s.disks || []).find((x) => x.mount === m);
      return d ? d.pct : null;
    }),
  }));

  charts.chartNet.data.labels = labels;
  charts.chartNet.data.datasets[0].data = samples.map((s) => (s.net ? s.net.rxMbps : null));
  charts.chartNet.data.datasets[1].data = samples.map((s) => (s.net ? s.net.txMbps : null));

  charts.chartTemp.data.labels = labels;
  charts.chartTemp.data.datasets[0].data = samples.map((s) => s.tempC ?? null);

  for (const c of Object.values(charts)) c.update('none');
}

function addSample(sample) {
  samples.push(sample);
  if (samples.length > MAX_POINTS) samples.splice(0, samples.length - MAX_POINTS);
  updateCharts();
}

async function init() {
  initCharts();
  try {
    const res = await fetch('/api/history?limit=120');
    const data = await res.json();
    samples = data.samples || [];
    if (samples.length) {
      renderSample(samples[samples.length - 1]);
      updateCharts();
    }
    const st = await (await fetch('/api/status')).json();
    setStatus(st);
    if (st.sample) renderSample(st.sample);
  } catch (err) {
    console.error('init failed', err);
  }

  const es = new EventSource('/api/stream');
  es.addEventListener('hello', (e) => {
    const payload = JSON.parse(e.data);
    setStatus(payload);
    if (payload.sample) renderSample(payload.sample);
  });
  es.addEventListener('sample', (e) => {
    const payload = JSON.parse(e.data);
    renderSample(payload.sample);
    addSample(payload.sample);
    renderAlerts(payload.alerts);
  });
  es.addEventListener('status', (e) => {
    setStatus(JSON.parse(e.data));
  });
  es.onerror = () => { $('statusDot').className = 'dot dot-offline'; };

  setInterval(() => {
    if (!nextPollAt) return;
    const ms = nextPollAt - Date.now();
    $('countdown').textContent = ms > 0 ? `${Math.ceil(ms / 1000)}s` : 'coletando…';
  }, 500);

  $('pollBtn').addEventListener('click', async () => {
    $('pollBtn').disabled = true;
    try {
      await fetch('/api/poll', { method: 'POST' });
    } finally {
      setTimeout(() => { $('pollBtn').disabled = false; }, 5000);
    }
  });
}

init();