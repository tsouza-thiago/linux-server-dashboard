# Política de Segurança

## Reportando vulnerabilidades

Este projeto é usado para monitorar um servidor pessoal em uma rede local. Se você
encontrar uma vulnerabilidade, **não abra uma issue pública** (o problema pode revelar
detalhes da infraestrutura). Reporte de forma privada:

- Abra uma issue no GitHub marcada como **private/security** (se disponível), ou
- Envie um e-mail ao mantenedor (verificado pelo perfil GitHub do repositório).

Sempre inclua: o passo a passo para reproduzir, o impacto estimado e a versão afetada.

## Princípios de segurança do projeto

Desenhado para não tocar em nada além de leitura no servidor monitorado:

- **Autenticação por chave SSH** (Ed25519) — nunca senha. `BatchMode=yes` + `ConnectTimeout=10`.
- **1 único comando SSH por minuto** — o servidor não instala nem executa nada além
  do comando de coleta (somente leitura: `df`, `free`, `ps`, `systemctl is-active`, `smartctl`...).
- **Dashboard bind em `127.0.0.1`** — nunca exposto em rede aberta.
- **Sem segredos no repositório** — `.env` e `data/` estão no `.gitignore`; o repositório
  contém apenas código e modelos com placeholders.
- **Zero agentes no servidor** — não há daemon, serviço ou script persistente instalado nele.

## Higiene operacional recomendada

- Nunca commite `.env` nem `data/` (contêm hostnames, IPs e telemetria da rede interna).
- Monitore apenas o necessário: preencha `NET_IF`, `DISK_MOUNTS`, `DISK_DEVS` e `SERVICES`
  com o mínimo exigido pelo seu ambiente.
- Se qualquer nome/uso de chave SSH tiver vazado em repositório ou histórico público,
  **rotacione a chave** imediatamente (veja abaixo).
- Não torne o dashboard acessível fora da máquina local; para acesso remoto use VPN/túnel SSH.

## Rotação de chave SSH (recomendado se houve vazamento)

Se o nome ou o uso de uma chave apareceu em histórico público de git, trate a chave
como comprometida e rotacione:

1. Na **máquina local**, gere um novo par de chaves com nome novo:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/sua_chave_nova -C "usuario@maquina"
   ```
2. Copie a chave pública para o servidor (executado da máquina local, uma única vez):
   ```bash
   ssh-copy-id -i ~/.ssh/sua_chave_nova.pub seu-host
   ```
   (ou acrescente a linha em `~/.ssh/authorized_keys` no servidor manualmente.)
3. Atualize `~/.ssh/config` apontando o bloco do servidor para a nova chave
   (`IdentityFile ~/.ssh/sua_chave_nova`).
4. Teste: `ssh seu-host 'echo ok'` deve responder `ok` sem senha.
5. **Remova a chave antiga** da máquina local e do `authorized_keys` do servidor,
   depois descarte-a.
6. Atualize o `SSH_HOST`/configs do projeto se o alias mudou.

> Regra do projeto: o `~/.ssh/config` usa o mesmo alias em `SSH_HOST` do `.env`.