window.Dash = window.Dash || {};

(function init() {
  Dash.period = '24h';
  Dash.samples = [];
  Dash.latest = null;
  Dash.alerts = { active: [], all: [] };
  Dash.annotations = [];
  Dash.diskDetailMount = null;
  Dash.ioDev = 'sda';
  Dash.procsSort = { key: 'mem', dir: -1 };
  Dash.procsFilter = '';
  Dash.alertFilter = 'active';
  Dash.nextPollAt = null;

  const PERIOD_MS = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '72h': 259200000 };

  function periodRange() {
    const from = new Date(Date.now() - PERIOD_MS[Dash.period]).toISOString();
    return `from=${encodeURIComponent(from)}`;
  }

  function updateAlertBadge() {
    const n = Dash.alerts.active.length;
    const b = $('alertBadge');
    b.hidden = n === 0;
    b.textContent = n;
  }

  function setStatus(payload) {
    const meta = payload.meta || {};
    const online = !!meta.online;
    $('statusDot').className = `dot ${online ? 'dot-online' : 'dot-offline'}`;
    $('lastPollAt').textContent = Dash.fmt.time(meta.lastPollAt) + (meta.lastError ? ` · ${meta.lastError}` : '');
    Dash.nextPollAt = meta.nextPollAt ? Date.parse(meta.nextPollAt) : null;
    if (payload.sample && payload.sample.os && payload.sample.os.name) {
      $('osLabel').textContent = payload.sample.os.name;
    }
  }

  Dash.api = {
    async ackAlert(id) {
      await fetch(`/api/alerts/${id}/ack`, { method: 'POST' });
      await refreshAlerts();
    },
    async resolveAlert(id) {
      await fetch(`/api/alerts/${id}/resolve`, { method: 'POST' });
      await refreshAlerts();
    },
    async addAnnotation(sample) {
      const text = prompt(`Anotação para ${Dash.fmt.timeDate(sample.ts)}:`);
      if (!text || !text.trim()) return;
      await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ts: sample.ts, text: text.trim(), label: text.trim().slice(0, 40) }),
      });
      const res = await fetch('/api/annotations');
      Dash.annotations = (await res.json()).annotations || [];
      Dash.charts.applyAnnotations();
    },
  };

  async function refreshAlerts() {
    const res = await fetch('/api/alerts?limit=200');
    const data = await res.json();
    Dash.alerts.active = data.active || [];
    Dash.alerts.all = data.all || [];
    updateAlertBadge();
    Dash.sections.alertBar(Dash.alerts.active);
    Dash.sections.health(Dash.latest);
    if (Dash.router.current() === 'alertas') Dash.sections.alertsView();
  }

  async function refreshAll() {
    try {
      const [h, st, al, an] = await Promise.all([
        fetch(`/api/history?limit=720&${periodRange()}`).then((r) => r.json()),
        fetch('/api/status').then((r) => r.json()),
        fetch('/api/alerts?limit=200').then((r) => r.json()),
        fetch('/api/annotations').then((r) => r.json()),
      ]);
      Dash.samples = h.samples || [];
      Dash.alerts.active = al.active || [];
      Dash.alerts.all = al.all || [];
      Dash.annotations = an.annotations || [];
      setStatus(st);
      if (st.sample) Dash.latest = st.sample;
      updateAlertBadge();
      Dash.charts.resetZoom();
      Dash.charts.sync();
      Dash.charts.applyAnnotations();
      Dash.sections.health(Dash.latest);
      Dash.sections.alertBar(Dash.alerts.active);
      Dash.sections.overview(Dash.latest);
      renderActiveView();
    } catch (err) {
      console.error('refreshAll falhou, tentando de novo em 10s', err);
      setTimeout(refreshAll, 10000);
    }
  }

  function renderActiveView() {
    const view = Dash.router.current();
    const latest = Dash.latest;
    switch (view) {
      case 'discos':
        Dash.sections.disks(latest);
        if (latest && Dash.diskDetailMount) $('diskDetailMount').textContent = Dash.diskDetailMount;
        Dash.charts.sync();
        break;
      case 'rede':
        Dash.sections.net(latest);
        Dash.sections.ioDevTabs();
        Dash.charts.sync();
        break;
      case 'processos':
        Dash.sections.procs(latest);
        break;
      case 'alertas':
        Dash.sections.alertsView();
        break;
      case 'analise':
        Dash.sections.analysis();
        break;
      case 'historico':
        Dash.sections.history();
        break;
      default:
        break;
    }
  }

  function openSSE() {
    const es = new EventSource('/api/stream');
    es.addEventListener('hello', (e) => {
      const payload = JSON.parse(e.data);
      setStatus(payload);
      if (payload.sample) {
        Dash.latest = payload.sample;
        Dash.sections.health(Dash.latest);
        Dash.sections.overview(Dash.latest);
        renderActiveView();
      }
    });
    es.addEventListener('sample', (e) => {
      const payload = JSON.parse(e.data);
      Dash.latest = payload.sample;
      Dash.alerts.active = payload.alerts || [];
      Dash.samples.push(payload.sample);
      if (Dash.samples.length > 1500) Dash.samples.splice(0, Dash.samples.length - 1500);
      Dash.sections.health(Dash.latest);
      Dash.sections.alertBar(Dash.alerts.active);
      Dash.sections.overview(Dash.latest);
      updateAlertBadge();
      Dash.charts.sync();
      renderActiveView();
    });
    es.addEventListener('alerts', (e) => {
      const payload = JSON.parse(e.data);
      Dash.alerts.active = payload.alerts || [];
      Dash.alerts.all = payload.all || Dash.alerts.all;
      updateAlertBadge();
      Dash.sections.alertBar(Dash.alerts.active);
      Dash.sections.health(Dash.latest);
      if (Dash.router.current() === 'alertas') Dash.sections.alertsView();
    });
    es.addEventListener('annotations', (e) => {
      Dash.annotations = JSON.parse(e.data).annotations || [];
      Dash.charts.applyAnnotations();
    });
    es.addEventListener('status', (e) => setStatus(JSON.parse(e.data)));
    es.onerror = () => { $('statusDot').className = 'dot dot-offline'; };
  }

  function wireUI() {
    $('pollBtn').addEventListener('click', async () => {
      $('pollBtn').disabled = true;
      try {
        await fetch('/api/poll', { method: 'POST' });
      } finally {
        setTimeout(() => { $('pollBtn').disabled = false; }, 5000);
      }
    });

    $('periodToggle').querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('periodToggle').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        Dash.period = btn.dataset.period;
        refreshAll();
      });
    });

    $('exportBtn').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = `/api/export?format=csv&${periodRange()}`;
      a.download = '';
      a.click();
    });

    $('procSearch').addEventListener('input', (e) => {
      Dash.procsFilter = e.target.value;
      Dash.sections.procs(Dash.latest);
    });
    $('procsTable').querySelectorAll('th').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (!key) return;
        if (Dash.procsSort.key === key) Dash.procsSort.dir *= -1;
        else Dash.procsSort = { key, dir: -1 };
        Dash.sections.procs(Dash.latest);
      });
    });

    $('alertFilters').querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('alertFilters').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        Dash.alertFilter = btn.dataset.filter;
        Dash.sections.alertsView();
      });
    });

    $('modalClose').addEventListener('click', () => Dash.sections.modal.close());
    $('modal').addEventListener('click', (e) => {
      if (e.target === $('modal')) Dash.sections.modal.close();
    });
    $('modalAnnotate').addEventListener('click', () => {
      if (Dash.sections.modal.sample) Dash.api.addAnnotation(Dash.sections.modal.sample);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') Dash.sections.modal.close();
    });

    setInterval(() => {
      if (!Dash.nextPollAt) return;
      const ms = Dash.nextPollAt - Date.now();
      $('countdown').textContent = ms > 0 ? `${Math.ceil(ms / 1000)}s` : 'coletando…';
    }, 500);
  }

  Dash.sections.renderActiveView = renderActiveView;

  Dash.charts.registerSpecs();
  Dash.router.init();
  wireUI();
  refreshAll();
  openSSE();
})();