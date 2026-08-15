#!/usr/bin/env bash
# ============================================================
# install-lib.sh — funções puras de validação do instalador.
# Sourced pelo install.sh (não executa nada sozinho).
#
# Espelham as validações de server/config.js (sanitizeHost,
# sanitizeToken, isPlaceholderHost) para proteger ~/.ssh/config
# e .env contra injeção: quebras de linha, espaços, '/', e
# tokens iniciando com '-' (interpretados como opção).
# ============================================================

# Host/IP: [A-Za-z0-9._-]+, nunca iniciando com '-'.
valid_host() {
  local v="$1"
  [ -n "$v" ] || return 1
  case "$v" in
    -*|*[!A-Za-z0-9._-]*) return 1 ;;
  esac
  return 0
}

# Usuário SSH: mesmo charset do host.
valid_user() { valid_host "$1"; }

# Alias SSH: começa com [a-z0-9_], depois [a-z0-9_-]*.
valid_alias() {
  local v="$1"
  case "$v" in
    [a-z0-9_][a-z0-9_-]*) return 0 ;;
  esac
  return 1
}

# Porta: inteiro 1–65535.
valid_port() {
  local v="$1"
  case "$v" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$v" -ge 1 ] 2>/dev/null && [ "$v" -le 65535 ] 2>/dev/null
}

# Placeholder do .env.example (seu-host / seu_host_ou_alias_ssh / usuario@ip).
is_placeholder_host() {
  local v
  v="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$v" in
    *seu*host*|*usuario@ip*|*usuário@ip*) return 0 ;;
  esac
  return 1
}