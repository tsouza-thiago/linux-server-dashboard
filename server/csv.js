export function csvEscape(value) {
  const s = String(value ?? '');
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCSV(samples) {
  const mounts = [...new Set(samples.flatMap((s) => (s.disks || []).map((d) => d.mount)))];
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
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}