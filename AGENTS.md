# LINUX-SERVER-DASHBOARD — Monitoramento de servidor Linux

Dashboard de monitoramento ativo em tempo real de um servidor Linux
rodando na rede local. Toda a carga de coleta fica na máquina local; o servidor apenas
responde **1 comando SSH por minuto** — requisito obrigatório (hardware muito limitado).

## Regras (obrigatórias)

- Conectar sempre via alias SSH (ex.: `ssh meu-servidor`, definido em `~/.ssh/config` →
  `usuario@192.0.2.10:22`, chave Ed25519 `~/.ssh/sua_chave`)
- **NUNCA** exibir, imprimir ou commitar o conteúdo de `.env` (o `.env` do servidor contém
  senhas). Este projeto não precisa de senha: autenticação é por chave SSH
- Apenas comandos não-interativos: `ssh meu-servidor '<comando>'`
- **1 único SSH por poll** com comando combinado (sem paralelismo contra o servidor)
- Servidor modesto (1 núcleo, pouca RAM): nunca executar compilações, instalar pacotes ou
  scripts pesados **no servidor**. Monitoramento é somente leitura
- Discos **SMR**: evitar escrita intensa/aleatória no servidor
- Dados dinâmicos (temperatura, espaço, status) sempre coletados ao vivo, nunca presumidos
- Dashboard bind em `127.0.0.1` (somente máquina local)
- O servidor NÃO instala nada — zero dependências remotas

## Arquitetura

```
[Servidor Debian 13]  ← 1 SSH/min (comando único, LC_ALL=C, não-interativo)
        ↑
[Node.js local]  ── poller (intervalo 60s) → parse → histórico em memória (2h UI) + JSON
        ↓
[Express local 127.0.0.1:3000]  ── dashboard + /api/status + /api/history + /api/alerts +
                                   /api/annotations + /api/export + SSE
        ↓
[Browser: http://localhost:3000]  — sidebar multi-view, zoom nos gráficos, health score,
                                   alertas acionáveis, anotações, exportação CSV/JSON
```

> **Interatividade é 100% client-side** (filtros, ordenação, zoom, ETA, agregações). O
> backend só persiste alertas/anotações e serve histórico — o limite de 1 SSH/min continua.

## Quickstart

```bash
npm install
npm start          # lê .env, carrega histórico, primeiro poll imediato, depois a cada 60s
```

- Teste rápido do poller sem o servidor web:
  ```bash
  node server/poller.js --once
  ```
- Logs em `data/dashboard.log` (também no console).

## Configuração (variáveis de ambiente em `.env`)

| Variável        | Padrão    | Descrição                                        |
|-----------------|-----------|--------------------------------------------------|
| `SSH_HOST`      | `seu-host` | Alias SSH (do `~/.ssh/config`) ou `user@ip`   |
| `POLL_INTERVAL` | `60000`   | Intervalo de coleta em ms (1 min = 60000)        |
| `PORT`          | `3000`    | Porta do dashboard local                         |
| `HISTORY_LIMIT` | `4320`    | Amostras retidas (3 dias a 1/min; 4320 = 72h)    |
| `HISTORY_FILE`  | `data/history.json` | Arquivo de persistência               |
| `LOG_FILE`      | `data/dashboard.log` | Arquivo de log                          |
| `NET_IF`        | *(vazio)* | Interface de rede a monitorar (vazio = seção Rede omitida) |
| `DISK_MOUNTS`   | `/`       | Mount points monitorados, separados por espaço    |
| `DISK_DEVS`     | *(vazio)* | Dispositivos de bloco p/ IO/SMART (vazio = omitido) |
| `SERVICES`      | *(vazio)* | Serviços systemd monitorados, separados por espaço |

## Comando SSH de coleta (1 por poll)

> O comando é montado dinamicamente pelo poller a partir das variáveis acima.
> Exemplo com `NET_IF=enpXsY`, `DISK_MOUNTS=/ /mnt/disco1`, `DISK_DEVS=sda sdb`, `SERVICES=smbd nmbd`:

```sh
echo '===HOST==='; hostname; echo '===OS==='; uname -r; head -2 /etc/os-release 2>/dev/null;
echo '===CPU==='; getconf _NPROCESSORS_ONLN 2>/dev/null; echo '===UPTIME==='; cat /proc/uptime;
echo '===LOAD==='; cat /proc/loadavg; echo '===FREE==='; LC_ALL=C free -m;
echo '===DF==='; LC_ALL=C df -h --output=target,size,used,avail,pcent / /mnt/disco1 2>/dev/null;
echo '===DFB==='; LC_ALL=C df -B1 --output=target,size,used,avail,pcent / /mnt/disco1 2>/dev/null;
echo '===NET==='; cat /proc/net/dev | grep enpXsY;
echo '===IO==='; cat /proc/diskstats | awk '$3=="sda"||$3=="sdb"';
echo '===TEMP==='; cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null;
echo '===SMART==='; for d in sda sdb; do printf '%s:' "$d"; smartctl -H /dev/$d 2>/dev/null | grep -oE 'PASSED|FAILED' | head -1; done;
echo '===SERVICES==='; LC_ALL=C systemctl is-active smbd nmbd;
echo '===PS==='; LC_ALL=C ps aux --sort=-%mem | head -8
```

- `LC_ALL=C` obrigatório (locale pt_BR mudaria cabeçalhos de `free`/`df`/`ps`)
- `ssh -o BatchMode=yes -o ConnectTimeout=10` — falha rápido se o servidor estiver off
- Temperatura vem de `/sys/class/thermal/thermal_zone0/temp` (lm-sensors não instalado no servidor)

## Formato da amostra (1 por poll)

```json
{
  "ts": "2026-08-15T09:12:00.000Z",
  "host": "seu-host",
  "os": { "kernel": "6.1.0-33-amd64", "name": "Debian GNU/Linux 12 (bookworm)" },
  "cores": 1,
  "uptimeSec": 720,
  "bootAt": "2026-08-15T09:00:00.000Z",
  "load": [0.15, 0.09, 0.10],
  "ram": { "total": 2000, "used": 900, "free": 200, "cache": 800, "avail": 900,
           "swapTotal": 1024, "swapUsed": 0 },
  "disks": [
    { "mount": "/", "size": "100G", "used": "12G", "avail": "83G", "pct": 12,
      "sizeBytes": 107374182400, "usedBytes": 12884901888, "availBytes": 89120571392 },
    { "mount": "/mnt/disco1", "size": "1.0T", "used": "300G", "avail": "700G", "pct": 29,
      "sizeBytes": 1099511627776, "usedBytes": 322122547200, "availBytes": 751619276800 }
  ],
  "net": { "rxBytes": 206460, "txBytes": 1739375,
           "rxMbps": 0.0, "txMbps": 0.0 },
  "io": [ { "dev": "sda", "sectorsRead": 290554, "sectorsWrite": 61168,
            "readMBps": 0.0, "writeMBps": 0.0 } ],
  "tempC": 29.0,
  "smart": [ { "dev": "sda", "status": "PASSED" } ],
  "services": { "smbd": "active", "nmbd": "active" },
  "topProcs": [ { "user": "root", "pid": 1, "cpu": 0.0, "mem": 0.3, "cmd": "systemd" } ]
}
```

> Amostras antigas (sem os campos novos) continuam válidas — o frontend trata campos ausentes.

## Persistência (data/)

- **`history.json`** — append incremental a cada poll, gravação **atômica** (`*.tmp` + rename)
  - Retenção: `HISTORY_LIMIT` amostras (padrão 4320 = 3 dias), FIFO; no boot continua acumulando
- **`alerts.json`** — histórico de alertas com ciclo de vida: `new` → `ack` → `resolved`
  - Auto-resolve: quando a condição deixa de existir no poll seguinte, o alerta é resolvido
  - Reconhecer/resolver também via UI (painel de alertas); retenção máx 500
- **`annotations.json`** — anotações do usuário na linha do tempo (texto + rótulo + timestamp)
- ~60-200 escritas/dia no SSD local (irrelevante; não toca o servidor)

## API

| Endpoint          | Método | Descrição                                             |
|-------------------|--------|-------------------------------------------------------|
| `/`               | GET    | Dashboard web (sidebar multi-view, hash routing)      |
| `/api/status`     | GET    | Última amostra + meta (online, lastPollAt, nextPollAt, offlineSince) + alertas ativos |
| `/api/history`    | GET    | `?limit=N&from=&to=` → amostras no range (downsample p/ máx 720) |
| `/api/alerts`     | GET    | `?status=&level=&limit=` → `{active, all}` com ciclo de vida |
| `/api/alerts/:id/ack`     | POST | Reconhece alerta                               |
| `/api/alerts/:id/resolve` | POST | Resolve alerta                                 |
| `/api/annotations`| GET/POST | Lista / cria anotações (`{ts, text, label}`)    |
| `/api/annotations/:id` | DELETE | Remove anotação                             |
| `/api/export`     | GET    | `?format=csv\|json&from=&to=` → download do relatório |
| `/api/stream`     | GET    | SSE: `hello`, `sample` (a cada poll), `alerts`, `annotations`, `status` |
| `/api/poll`       | POST   | Dispara coleta imediata ("coletar agora")             |

## Alertas (calculados no poller)

| Condição                              | Nível  |
|---------------------------------------|--------|
| Disco ≥ 90% usado                     | warning |
| RAM usada ≥ 90%                       | warning |
| Temperatura CPU ≥ 60°C                | warning |
| SMART diferente de PASSED             | critical |
| smbd ou nmbd inativo                  | critical |
| SSH falhou (servidor inacessível)     | critical (offline) |

## Estrutura

```
linux-server-dashboard/
├── AGENTS.md               ← este arquivo
├── TUTORIAL.md             ← guia completo de uso (instalação, iniciar/parar, dashboard)
├── start.sh                ← inicia o serviço (para leigos; cria .env/deps se faltarem)
├── stop.sh                 ← para o serviço com segurança (PID + fallback por porta)
├── package.json            (deps: express + chart.js + zoom/annotation plugins; type: module)
├── .env                    (config local — NUNCA commitar)
├── .env.example            (modelo sem valores)
├── .gitignore              (exclui .env, data/, node_modules/)
├── data/                   (history.json + alerts.json + annotations.json + dashboard.log — runtime)
├── server/
│   ├── index.js            (Express, SSE, API, loop de poll, export CSV)
│   ├── poller.js           (comando SSH, parse, taxas de rede/I/O, alertas)
│   ├── history.js          (buffer em memória + persistência JSON atômica + range/downsample)
│   └── stores.js           (JsonStore genérico: AlertsStore c/ ciclo de vida, AnnotationsStore)
└── public/
    ├── index.html          (dashboard PT-BR, dark theme, sidebar multi-view + view Ajuda)
    ├── style.css           (layout app corporativo, responsivo)
    └── js/
        ├── main.js         (orquestração: SSE, refresh por período, ações, modais)
        ├── router.js       (navegação por hash entre as views)
        ├── charts.js       (Chart.js + zoom/pan + anotações no timeline)
        ├── sections.js     (renderização de cada view, tabelas sortáveis/filtráveis)
        └── analysis.js     (health score, ETA de disco, pressão de RAM, outages, resumo diário)
```

## Troubleshooting

- **Servidor off (offline):** banner de alerta, dot vermelho, histórico preservado,
  retry automático no próximo intervalo. Verificar: `ping 192.0.2.10`,
  `ssh seu-host 'uptime'`
- **Poll demorado/parado:** logs em `data/dashboard.log`; testar comando manual:
  `ssh seu-host 'LC_ALL=C free -m'`
- **Nenhum dado (histórico vazio):** confirme `HISTORY_FILE` existente e permissões de
  escrita na pasta `data/`
- **Chave SSH quebrada:** `ssh seu-host 'echo ok'` deve responder `ok` sem pedir senha
- Servidor não expõe nada novo — firewall/serviços do servidor permanecem intocados

## Segurança

- O dashboard bind em `127.0.0.1` e nunca deve ser exposto em rede aberta
- Nunca commite `.env` nem `data/` (contêm hostnames, IPs e telemetria da rede interna)
- Autenticação exclusivamente por chave SSH (nunca senha); rotacione a chave se o nome
  ou uso dela tiver vazado em qualquer repositório/histórico
- Monitore apenas o que for necessário: preencha `NET_IF`, `DISK_MOUNTS`, `DISK_DEVS` e
  `SERVICES` com o mínimo necessário