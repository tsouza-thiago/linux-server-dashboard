window.Dash = window.Dash || {};

Chart.register(ChartZoom, window['chartjs-plugin-annotation']);

Dash.charts = {
  charts: {},
  specs: {},

  COLORS: ['#3b82f6', '#f5a524', '#22c55e', '#e5484d', '#a855f7', '#06b6d4'],

  textColor() {
    try {
      return document.documentElement.dataset.theme === 'light' ? '#64748b' : '#9ca3af';
    } catch { return '#9ca3af'; }
  },

  faintColor() {
    try {
      return document.documentElement.dataset.theme === 'light' ? '#94a3b8' : '#6b7280';
    } catch { return '#6b7280'; }
  },

  gridColor() {
    try {
      return document.documentElement.dataset.theme === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.05)';
    } catch { return 'rgba(255,255,255,0.05)'; }
  },

  labels(samples) {
    return samples.map((s) => new Date(s.ts).toLocaleTimeString('pt-BR', { hour12: false }));
  },

  series(samples, fn) {
    return samples.map((s) => {
      const v = fn(s);
      return v === null || v === undefined ? null : v;
    });
  },

  registerSpecs() {
    const C = this.COLORS;
    this.specs = {
      load: {
        canvas: 'chartLoad',
        fn: (samples) => ({
          labels: this.labels(samples),
          datasets: [
            { label: '1 min', data: this.series(samples, (s) => s.load?.[0]), color: C[0] },
            { label: '5 min', data: this.series(samples, (s) => s.load?.[1]), color: C[1] },
            { label: '15 min', data: this.series(samples, (s) => s.load?.[2]), color: C[2] },
          ],
        }),
      },
      ram: {
        canvas: 'chartRam',
        fn: (samples) => ({
          labels: this.labels(samples),
          datasets: [{
            label: 'RAM %',
            data: this.series(samples, (s) => (s.ram && s.ram.total ? +((s.ram.used / s.ram.total) * 100).toFixed(1) : null)),
            color: C[0],
            fill: true,
          }],
        }),
      },
      temp: {
        canvas: 'chartTemp',
        fn: (samples) => ({
          labels: this.labels(samples),
          datasets: [{
            label: 'CPU °C',
            data: this.series(samples, (s) => s.tempC ?? null),
            color: C[1],
            fill: true,
          }],
        }),
      },
      disk: {
        canvas: 'chartDisk',
        fn: (samples) => {
          const mounts = [...new Set(samples.flatMap((s) => (s.disks || []).map((d) => d.mount)))];
          return {
            labels: this.labels(samples),
            datasets: mounts.map((m, i) => ({
              label: m,
              data: this.series(samples, (s) => {
                const d = (s.disks || []).find((x) => x.mount === m);
                return d ? d.pct : null;
              }),
              color: C[i % C.length],
            })),
          };
        },
      },
      diskDetail: {
        canvas: 'chartDiskDetail',
        fn: (samples) => {
          const m = Dash.diskDetailMount;
          return {
            labels: this.labels(samples),
            datasets: m ? [{
              label: `${m} %`,
              data: this.series(samples, (s) => {
                const d = (s.disks || []).find((x) => x.mount === m);
                return d ? d.pct : null;
              }),
              color: C[0],
              fill: true,
            }] : [],
          };
        },
      },
      net: {
        canvas: 'chartNet',
        fn: (samples) => ({
          labels: this.labels(samples),
          datasets: [
            { label: 'Download Mbps', data: this.series(samples, (s) => s.net?.rxMbps ?? null), color: C[2], fill: true },
            { label: 'Upload Mbps', data: this.series(samples, (s) => s.net?.txMbps ?? null), color: C[3] },
          ],
        }),
      },
      io: {
        canvas: 'chartIO',
        fn: (samples) => {
          const dev = Dash.ioDev;
          return {
            labels: this.labels(samples),
            datasets: [
              { label: `${dev} leitura MB/s`, data: this.series(samples, (s) => {
                const io = (s.io || []).find((x) => x.dev === dev);
                return io ? io.readMBps ?? null : null;
              }), color: C[2], fill: true },
              { label: `${dev} escrita MB/s`, data: this.series(samples, (s) => {
                const io = (s.io || []).find((x) => x.dev === dev);
                return io ? io.writeMBps ?? null : null;
              }), color: C[3] },
            ],
          };
        },
      },
    };
    for (const [id, spec] of Object.entries(this.specs)) this.create(id, spec);
  },

  create(id, spec) {
    const canvas = document.getElementById(spec.canvas);
    if (!canvas) return null;
    this.charts[id] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: this.textColor(), boxWidth: 12, boxHeight: 12 } },
          zoom: {
            pan: { enabled: true, mode: 'x', modifierKey: 'shift' },
            zoom: { wheel: { enabled: true, speed: 0.05 }, pinch: { enabled: true }, mode: 'x' },
          },
          annotation: { annotations: {} },
        },
        scales: {
          x: {
            ticks: { color: this.faintColor(), maxTicksLimit: 8, maxRotation: 0 },
            grid: { color: this.gridColor() },
          },
          y: {
            ticks: { color: this.faintColor() },
            grid: { color: this.gridColor() },
            beginAtZero: true,
          },
        },
        onClick: (evt, els, chart) => this.handleClick(evt, els, chart),
      },
    });
    return this.charts[id];
  },

  toDataset(d) {
    return {
      label: d.label,
      data: d.data,
      borderColor: d.color,
      backgroundColor: d.color + '22',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.25,
      fill: d.fill || false,
    };
  },

  sync() {
    for (const [id, spec] of Object.entries(this.specs)) {
      const chart = this.charts[id];
      if (!chart) continue;
      const { labels, datasets } = spec.fn(Dash.samples);
      chart.data.labels = labels;
      chart.data.datasets = datasets.map((d) => this.toDataset(d));
      chart.update('none');
    }
  },

  applyAnnotations() {
    const anns = {};
    (Dash.annotations || []).forEach((a, i) => {
      anns['a' + i] = {
        type: 'line',
        scaleID: 'x',
        value: a.ts,
        borderColor: '#a855f7',
        borderWidth: 1,
        borderDash: [5, 4],
        label: {
          display: true,
          content: a.label || a.text.slice(0, 28),
          position: 'start',
          color: '#fff',
          backgroundColor: 'rgba(168,85,247,0.85)',
          font: { size: 10 },
        },
      };
    });
    for (const chart of Object.values(this.charts)) {
      chart.options.plugins.annotation.annotations = anns;
      chart.update('none');
    }
  },

  resetZoom() {
    for (const chart of Object.values(this.charts)) {
      if (typeof chart.resetZoom === 'function') chart.resetZoom();
    }
  },

  resize() {
    for (const chart of Object.values(this.charts)) chart.resize();
  },

  handleClick(evt, els, chart) {
    if (!els || !els.length) return;
    const idx = els[0].index;
    const s = Dash.samples[idx];
    if (s && Dash.sections.modal) Dash.sections.modal.open(s);
  },
};