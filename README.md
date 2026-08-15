# Linux Server Dashboard

**Monitoramento em tempo real do seu servidor Linux, direto do navegador — sem instalar
nada no servidor, sem senha, sem agente.**

Uma vez por minuto, este painel conecta no servidor por SSH (somente leitura), coleta
dezenas de métricas e as mostra em gráficos interativos. Feito para funcionar até em
hardware muito limitado (1 núcleo, pouca RAM) — por exemplo, uma máquina velha em casa.

```
  ┌─────────────────────────────────────────────────────┐
  │        Linux Server Dashboard                       │
  │   CPU  RAM  Temp  Discos  Rede  SMART  Serviços     │
  │                                                     │
  │   ┌──────────┐  ┌──────────┐  ┌──────────┐         │
  │   │ Load     │  │ RAM      │  │ Temp CPU │         │
  │   │ 0.15     │  │ 900/2GB  │  │  29.0°C  │         │
  │   └──────────┘  └──────────┘  └──────────┘         │
  └─────────────────────────────────────────────────────┘
               ▲ gráficos em tempo real
               │
       [seu computador]
       Node.js + Express (127.0.0.1:3000)
               │
               │ 1 comando SSH por minuto (somente leitura)
               ▼
       ┌────────────────────┐
       │   Servidor Linux   │  ← nada é instalado nele
       └────────────────────┘
```

---

## Índice

1. [O que é? (para leigos)](#o-que-é-para-leigos)
2. [O que ele monitora](#o-que-ele-monitora)
3. [Como funciona por dentro](#como-funciona-por-dentro)
4. [Por que é eficiente](#por-que-é-eficiente)
5. [Funcionalidades do dashboard](#funcionalidades-do-dashboard)
6. [Pré-requisitos](#pré-requisitos)
7. [Instalação](#instalação)
8. [Configuração](#configuração)
9. [Como usar](#como-usar)
10. [Exemplo real do autor](#exemplo-real-do-autor)
11. [API](#api)
12. [Alertas](#alertas)
13. [Segurança](#segurança)
14. [Estrutura do projeto](#estrutura-do-projeto)
15. [Solução de problemas](#solução-de-problemas)
16. [FAQ](#faq)
17. [Licença](#licença)

---

## O que é? (para leigos)

Imagine que o seu servidor é uma casa e você quer saber o que acontece lá dentro sem
precisar entrar toda hora. Este programa é o "painel de controle" dessa casa: um
site que fica aberto no seu navegador e mostra, **a cada 60 segundos**, como o
servidor está passando:

- o **processador** está sobrecarregado ou tranquilo?
- a **memória** está perto de acabar?
- o **disco** está enchendo? Quando vai encher?
- está **quente** demais?
- os **serviços** importantes estão no ar?
- o **disco** está com sinais de falha?

Se algo estiver errado, o painel avisa — com alertas de cor amarela (atenção) ou
vermelha (urgente), e uma nota de saúde de 0 a 100 no canto da tela.

Tudo isso **sem instalar nada no servidor** e **sem precisar de senha**: a conversa
acontece por SSH, com chave criptográfica, e apenas **uma vez por minuto**.

---

## O que ele monitora

| Métrica | O que significa | Por que importa |
|---------|-----------------|-----------------|
| **Load (1/5/15)** | Carga do processador nas médias de 1, 5 e 15 min | Mostra se a CPU está saturada (neste projeto, 1 núcleo → 1,0 = 100%) |
| **Memória RAM / Swap** | Uso de memória e da "reserva" no disco | Swap subindo = falta RAM, sistema fica lento |
| **Temperatura CPU** | Calor do processador em °C | Acima de 60 °C é sinal de alerta (ventilação/poeira) |
| **Discos** | Espaço usado/livre por partição | Disco ≥ 90% = risco de lotação; o painel prevê o **ETA** (quando vai encher) |
| **SMART** | Autodiagnóstico de saúde dos discos | `PASSED` = saudável; diferente = risco de falha física (faça backup!) |
| **Rede** | Download/upload em **Mbps** | Tráfego em tempo real, detecta picos e vazamentos |
| **I/O dos discos** | Leitura/escrita em **MB/s** por disco | Identifica discos sobrecarregados |
| **Serviços SMB** | smbd/nmbd ativos ou parados | Se caírem, os compartilhamentos de rede param |
| **Top processos** | Os que mais consomem memória | Acha o "vilão" quando a RAM sobe |
| **Uptime / boot** | Tempo ligado e hora do último boot | Contexto para interpretar as demais métricas |

---

## Como funciona por dentro

```
[Servidor Linux]  ← responde 1 comando SSH por minuto (LC_ALL=C, não-interativo)
      ↑
[poller.js]  coleta → parse → taxas de rede/I/O → alertas → amostra JSON
      ↑
[history.js]  histórico em memória (2h p/ UI) + persistência atômica em data/history.json
      ↑
[index.js]  Express (127.0.0.1:3000) → dashboard + API REST + SSE (tempo real)
      ↑
[Navegador]  sidebar multi-view, zoom nos gráficos, health score, alertas, anotações
```

O ciclo é simples e proposital:

1. **Coleta** — a cada 60 s o poller executa **um único comando SSH** no servidor, que
   lê dezenas de métricas do sistema (CPU, memória, discos, rede, temperatura, SMART,
   serviços, processos) e devolve tudo em uma resposta só.
2. **Parse** — a resposta é interpretada localmente e vira uma "amostra" JSON
   (uma linha = um minuto da vida do servidor).
3. **Persistência** — a amostra entra no histórico (3 dias, com escrita atômica).
4. **Entrega** — o Express serve o dashboard e atualiza os gráficos em tempo real via
   **SSE** (Server-Sent Events), sem o navegador precisar recarregar.

> **Toda a interatividade** (filtros, zoom, ordenação, ETA, agregações) acontece **no
> seu navegador**. O servidor continua respondendo apenas o seu 1 comando por minuto —
> nada mais.

---

## Por que é eficiente

- **Zero dependências no servidor** — nada é instalado, compilado ou configurado nele.
  O monitoramento é 100% leitura.
- **1 único SSH por minuto** — carga mínima, combinada em um só comando. Criado
  originalmente para um servidor de **1 núcleo e pouca RAM**.
- **Somente leitura** — o servidor não recebe comandos que alterem nada (sem agentes,
  sem scripts persistentes).
- **Sem senhas** — autenticação por **chave SSH** (Ed25519), nunca por senha.
- **Dashboard restrito ao seu computador** — bind em `127.0.0.1`; ninguém mais na rede
  consegue abrir o painel.
- **Histórico de 3 dias** — mesmo após reiniciar, os gráficos continuam de onde pararam
  (persistência em JSON com gravação atômica).
- **Tempo real sem carga extra** — atualizações por SSE; o navegador não fica
  recarregando a página.
- **Interatividade client-side** — zoom, pan, filtros e ordenação não incomodam o servidor.
- **Exportação** — relatórios CSV/JSON do período atual para abrir no Excel/LibreOffice.
- **Alertas com ciclo de vida** — `new → ack → resolved`, com auto-resolve quando a
  condição deixa de existir.

---

## Funcionalidades do dashboard

O painel tem **8 telas**, navegáveis pela coluna da esquerda:

| Tela | O que mostra |
|------|--------------|
| **Visão Geral** | Cartões de load, RAM, swap, temperatura, uptime + 4 gráficos (load, RAM, temp, discos) + rede + serviços |
| **Discos** | Cartão por disco com % usado, espaço livre e **previsão de lotação (ETA)**; gráfico por disco; selo SMART |
| **Rede** | Download/upload em Mbps, tráfego ao longo do tempo, I/O por disco (abas sda/sdb/sdc) |
| **Processos** | Top 7 por consumo de memória, com busca e ordenação por qualquer coluna |
| **Alertas** | Ciclo de vida completo, filtros (ativos/todos/warning/critical), reconhecer e resolver |
| **Análise** | **Índice de saúde** com os descontos, pressão de RAM (6h), ETA de discos, resumo diário, **outages** e % de uptime (30 dias) |
| **Histórico** | Tabela com todas as amostras do período — "rolar o passado" com valores exatos |
| **Ajuda** | Guia rápido embutido no próprio painel |

**Interações em todas as telas:**

- **Período**: botões `1h` / `6h` / `24h` / `72h` no topo.
- **Zoom**: roda do mouse sobre o gráfico. **Pan**: `Shift` + arrastar.
- **Detalhe**: clique num ponto do gráfico para abrir tudo daquela coleta.
- **Anotações**: marque eventos na linha do tempo (ex.: "troquei o cooler") para
  entender mudanças semanas depois.
- **Coletar agora**: botão que força uma coleta imediata, sem esperar o minuto.
- **Exportar**: baixa o período atual em CSV (abre direto no Excel).

---

## Pré-requisitos

1. **Node.js 18 ou mais novo** — o "motor" do programa.
   ```bash
   node --version   # deve mostrar v18.x ou superior
   ```
2. **Acesso SSH ao servidor por chave** — o "crachá" que fala com o servidor sem senha.
   ```bash
   ssh seu-host 'echo ok'   # deve responder "ok" sem pedir senha
   ```
3. **Servidor ligado e na rede** — o painel coleta dele, afinal.

> Não sabe configurar a chave SSH? Veja a seção [Solução de problemas](#solução-de-problemas)
> ("Chave SSH"). O serviço `sshd` precisa estar ativo no servidor — nada além disso.

---

## Instalação

```bash
git clone https://github.com/seu-usuario/linux-server-dashboard.git
cd linux-server-dashboard
npm install
```

Se quiser personalizar (porta, intervalo, host), crie o arquivo de configuração:

```bash
cp .env.example .env
```

> O programa já funciona com valores padrão — o `.env` é opcional.

**Teste rápido** (coleta única, sem abrir o navegador):

```bash
node server/poller.js --once
```

Deve imprimir um JSON com `"ok": true` e os dados do servidor. Se aparecer isso,
a comunicação está funcionando.

---

## Configuração

As variáveis ficam no arquivo `.env` (copie de `.env.example` e preencha):

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `SSH_HOST` | `seu-host` | Host/alias SSH do servidor (`seu-host` ou `user@ip`) |
| `POLL_INTERVAL` | `60000` | Intervalo entre coletas em ms (60000 = 1 minuto) |
| `PORT` | `3000` | Porta do dashboard no seu computador |
| `HISTORY_LIMIT` | `4320` | Amostras retidas (4320 = 3 dias a 1/min) |
| `HISTORY_FILE` | `data/history.json` | Arquivo de persistência do histórico |
| `LOG_FILE` | `data/dashboard.log` | Arquivo de log |
| `NET_IF` | *(vazio)* | Interface de rede a monitorar (vazio = seção Rede omitida) |
| `DISK_MOUNTS` | `/` | Mount points monitorados, separados por espaço |
| `DISK_DEVS` | *(vazio)* | Dispositivos de bloco p/ IO/SMART (vazio = omitido) |
| `SERVICES` | *(vazio)* | Serviços systemd monitorados, separados por espaço |

---

## Como usar

### Iniciar

```bash
npm start
# ou, se preferir o script amigável:
./start.sh
```

Você verá algo como:
```
dashboard em http://127.0.0.1:3000 — host: seu-host, intervalo: 60000ms
```
A primeira coleta acontece na hora; depois, uma a cada 60 s.

### Abrir o painel

No navegador (Firefox, Chrome...), acesse:

```
http://localhost:3000
```

**Deixe o terminal aberto** — enquanto o `npm start` rodar, o painel funciona.
Fechar a aba do navegador não para o serviço; fechar o terminal sim.

> O painel só é acessível **neste computador** (`127.0.0.1`). Ninguém mais na rede
> consegue abrir — isso é proposital.

### Rodar em segundo plano

```bash
nohup npm start > data/nohup.log 2>&1 &
```

### Verificar se está rodando

```bash
curl http://127.0.0.1:3000/api/status
```
Deve devolver um JSON com `"online":true`.

### Parar

```bash
./stop.sh        # forma fácil (encontra e encerra o processo)
# ou Ctrl+C no terminal do npm start
```

> **Nada se perde ao parar.** O histórico fica salvo em `data/history.json` e os
> gráficos continuam de onde pararam. Parar o painel **não afeta o servidor**.

---

## Exemplo real do autor

Esta ferramenta nasceu para vigiar um servidor caseiro de hardware muito limitado —
a prova de que funciona até em máquinas de baixo custo:

- **Hardware**: 1 núcleo, pouca RAM, rede 100 Mbps
- **Sistema**: Debian (stable), kernel recente
- **Discos**: um disco de sistema + HDs SMR de alta capacidade (lentos para reescrever)
- **Serviços**: smbd/nmbd (compartilhamentos de rede SMB/CIFS)

Mesmo com 1 núcleo e menos de 1 GB de RAM, o servidor responde o comando de coleta em
~1 segundo, sem sentir. **O dashboard roda no seu computador, não no servidor.**

Se você tem um servidor (nuvem, VPS, máquina velha em casa, Raspberry Pi...), o
princípio é o mesmo: o monitoramento não pesa em quem é monitorado.

---

## API

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/` | GET | Dashboard web (sidebar multi-view, hash routing) |
| `/api/status` | GET | Última amostra + meta (online, lastPollAt, nextPollAt, offlineSince) + alertas ativos |
| `/api/history` | GET | `?limit=N&from=&to=` → amostras no range (downsample p/ máx 720) |
| `/api/alerts` | GET | `?status=&level=&limit=` → `{active, all}` com ciclo de vida |
| `/api/alerts/:id/ack` | POST | Reconhece um alerta |
| `/api/alerts/:id/resolve` | POST | Resolve um alerta |
| `/api/annotations` | GET/POST | Lista / cria anotações (`{ts, text, label}`) |
| `/api/annotations/:id` | DELETE | Remove uma anotação |
| `/api/export` | GET | `?format=csv\|json&from=&to=` → download do relatório |
| `/api/stream` | GET | SSE: `hello`, `sample`, `alerts`, `annotations`, `status` |
| `/api/poll` | POST | Dispara coleta imediata ("coletar agora") |

---

## Alertas

| Condição | Nível | O que fazer |
|----------|-------|-------------|
| Disco ≥ 90% usado | ⚠️ warning | Liberar espaço; atenção especial à partição de sistema |
| RAM usada ≥ 90% | ⚠️ warning | Conferir a tela **Processos**; encerrar o que pesa |
| Temperatura CPU ≥ 60 °C | ⚠️ warning | Verificar ventilação, poeira nos coolers, posição do PC |
| SMART diferente de `PASSED` | 🔴 critical | **Backup imediato** — pode ser falha física |
| smbd/nmbd inativo | 🔴 critical | Reiniciar o serviço no servidor |
| SSH falhou (servidor inacessível) | 🔴 critical | Servidor desligado/fora da rede; o painel tenta sozinho a cada minuto |

**Regra de ouro:** warning = preste atenção, critical = aja.

Os alertas têm ciclo de vida: **novo → reconhecido (✓) → resolvido**. O painel
resolve sozinho quando a condição deixa de existir, ou você resolve manualmente.

---

## Segurança

Este projeto foi desenhado com segurança em mente. Os principais pontos:

- **Sem senhas.** A autenticação é por **chave SSH** (Ed25519). O `.env` não guarda
  senha nenhuma, e o `.env.example` só traz placeholders.
- **Somente leitura.** O servidor executa apenas comandos de leitura (`cat`, `df`,
  `free`, `ps`, `smartctl`...). Nada é instalado, alterado ou executado de forma
  persistente no servidor.
- **1 comando por minuto.** Contato mínimo, previsível e barato.
- **Dashboard local.** Bind em `127.0.0.1` — o painel não fica exposto na rede.
- **Sem agentes.** Não há daemon, serviço ou script rodando no servidor — não há
  superfície de ataque nova por lá.
- **Segredos fora do git.** `.env` e `data/` estão no `.gitignore`; o repositório
  público contém apenas código e modelos sem valores.
- **SSH não-interativo.** `BatchMode=yes` + `ConnectTimeout=10` — falha rápido se o
  servidor estiver fora, sem travar nem pedir interação.

> Se você fosse auditar: o único contato com o servidor é o comando SSH construído em
> `server/poller.js` (`buildCommand()`). É só leitura, é só 1 por minuto, e é isso.

---

## Estrutura do projeto

```
linux-server-dashboard/
├── AGENTS.md               ← regras e arquitetura do projeto
├── TUTORIAL.md             ← tutorial passo a passo para leigos
├── README.md               ← este arquivo
├── start.sh                ← inicia o serviço (cria .env/deps se faltarem)
├── stop.sh                 ← para o serviço com segurança
├── package.json            (deps: express + chart.js + zoom/annotation plugins)
├── .env.example            (modelo de configuração, sem valores reais)
├── .gitignore              (exclui .env, data/, node_modules/)
├── data/                   (runtime: history.json, alerts.json, annotations.json, log)
├── server/
│   ├── index.js            (Express, SSE, API, loop de poll, export CSV)
│   ├── poller.js           (comando SSH, parse, taxas de rede/I/O, alertas)
│   ├── history.js          (buffer em memória + persistência JSON atômica + range/downsample)
│   └── stores.js           (JsonStore genérico: AlertsStore, AnnotationsStore)
└── public/
    ├── index.html          (dashboard PT-BR, dark theme, sidebar multi-view)
    ├── style.css
    └── js/
        ├── main.js         (orquestração: SSE, refresh, ações, modais)
        ├── router.js       (navegação por hash entre as views)
        ├── charts.js       (Chart.js + zoom/pan + anotações no timeline)
        ├── sections.js     (renderização das views, tabelas sortáveis/filtráveis)
        └── analysis.js     (health score, ETA de disco, pressão de RAM, outages)
```

---

## Solução de problemas

### O painel não abre no navegador
- O serviço está rodando? (o terminal está com `npm start` ativo?)
- Mudou a porta? Use a nova porta na URL (`PORT` no `.env`).
- Teste: `curl http://127.0.0.1:3000/api/status`

### "Servidor inacessível" (dot vermelho)
1. `ping -c 3 seu-host`
2. `ssh seu-host 'uptime'`
3. Se voltou, o painel se recupera sozinho no próximo minuto (ou clique em **Coletar agora**).

### Chave SSH pedindo senha
- A chave não está sendo usada. Confira `ls -la ~/.ssh/` e o seu `~/.ssh/config`.
- "Permission denied" = a chave pública não está autorizada no servidor. Reautorize:
  ```bash
  ssh-copy-id seu-host
  ```

### Gráficos vazios
- Histórico vazio? `ls -la data/history.json` (tamanho > 0).
- Período maior que o histórico disponível? Selecione `1h`.
- Na primeira execução, aguarde 1-2 minutos para acumular amostras.

### Porta 3000 já em uso
```bash
lsof -i :3000                 # descobrir quem está usando
# opções: kill <PID> ou mudar PORT no .env
```

### Ver os logs
```bash
tail -f data/dashboard.log
```

---

## FAQ

**Isso é invasivo?** Não. É leitura pura: o servidor só responde um comando por minuto
com métricas do sistema — nenhum arquivo é modificado.

**Afeta o desempenho do servidor?** Muito pouco. Um comando leve a cada 60 s é
irrelevante, até num servidor de 1 núcleo. Todo o trabalho pesado (parse, gráficos,
histórico) roda na sua máquina.

**Preciso de senha?** Não. O acesso é por chave SSH. Se o seu servidor só aceita
senha, configure a chave antes (`ssh-copy-id`).

**Funciona em qualquer servidor Linux?** Sim, desde que tenha `sshd` ativo e os
comandos padrão (`df`, `free`, `ps`, `systemctl`, `smartctl`*). O comando de coleta é
montado em `server/poller.js` — ajuste discos, interface de rede e serviços conforme
o seu ambiente.

**E se o servidor ficar off?** O painel mostra o alerta de inacessível, preserva o
histórico e continua tentando a cada minuto — recupera sozinho quando volta.

**Guarda muitos dados?** No servidor: nada (zero escrita). Na sua máquina: ~60–200
pequenas escritas por dia no SSD local (histórico de 3 dias).

**É seguro expor na internet?** Não é para isso. O dashboard bind em `127.0.0.1` é
deliberado — rode localmente e, se quiser acesso remoto, use uma VPN/túnel SSH.

---

## Licença

**MIT** — use, modifique e compartilhe livremente, com atribuição.

---

*Monitoramento somente leitura via SSH — 1 coleta/min — dashboard local em 127.0.0.1.
O servidor não instala nada.*