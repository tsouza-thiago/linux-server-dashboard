#!/usr/bin/env bash
# ============================================================
# Linux Server Dashboard — stop.sh
# Para o painel de monitoramento com segurança.
#
# Como usar (na pasta do projeto):
#   ./stop.sh
#
# O histórico fica salvo em data/history.json — nada se perde.
# O servidor monitorado não é afetado.
# ============================================================
cd "$(dirname "$0")"

PORT=$(grep -E '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
PORT=${PORT:-3000}

# 1. Encontrar o processo do painel (node server/index.js)
PID=$(pgrep -f "node server/index.js" | head -1)

# 2. Fallback: quem está escutando na porta do painel?
if [ -z "$PID" ] && command -v lsof >/dev/null 2>&1; then
  PID=$(lsof -t -i ":$PORT" 2>/dev/null | head -1)
fi

if [ -z "$PID" ]; then
  echo "O painel não está rodando (nada a parar)."
  exit 0
fi

echo "Parando Linux Server Dashboard (PID $PID)..."
kill "$PID" 2>/dev/null

# Aguarda até 5 segundos para o encerramento limpo
for _ in 1 2 3 4 5; do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "Serviço parado. O histórico foi preservado (data/history.json)."
    exit 0
  fi
  sleep 1
done

echo "Encerramento lento — forçando..."
kill -9 "$PID" 2>/dev/null
echo "Serviço parado (forçado)."