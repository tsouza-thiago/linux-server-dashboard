#!/usr/bin/env bash
# ============================================================
# Linux Server Dashboard — start.sh
# Inicia o painel de monitoramento do servidor.
#
# Como usar (na pasta do projeto):
#   ./start.sh
#
# Depois abra o navegador em: http://localhost:3000
# Para parar: Ctrl+C neste terminal, ou ./stop.sh em outro.
# ============================================================
set -e
cd "$(dirname "$0")"

echo "== Linux Server Dashboard =="

# 1. Node.js instalado?
if ! command -v node >/dev/null 2>&1; then
  echo "ERRO: Node.js não encontrado. Instale o Node.js 18+ e tente de novo."
  exit 1
fi
echo "Node.js: $(node --version)"

# 2. Dependências instaladas (primeira vez)?
if [ ! -d node_modules ]; then
  echo "Instalando dependências (primeira vez)..."
  npm install
fi

# 3. Arquivo .env criado?
if [ ! -f .env ] && [ -f .env.example ]; then
  echo "Criando .env a partir de .env.example (valores padrão)..."
  cp .env.example .env
fi

# 4. Servidor acessível via SSH? (aviso apenas — o painel se recupera sozinho)
SSH_HOST=$(grep -E '^SSH_HOST=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
SSH_HOST=${SSH_HOST:-seu-host}
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_HOST" 'echo ok' >/dev/null 2>&1; then
  echo "AVISO: o servidor não respondeu via SSH. O painel iniciará, mas mostrará 'Servidor inacessível'."
  echo "       Verifique: ssh $SSH_HOST 'echo ok'"
fi

echo "Iniciando... abra http://localhost:3000 no navegador."
echo "Para parar: Ctrl+C neste terminal, ou ./stop.sh em outro."
echo
exec npm start