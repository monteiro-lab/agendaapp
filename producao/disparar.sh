#!/bin/sh
# Gatilho de minuto dos lembretes.
#
# Roda na máquina do Postgres (não na Vercel: o cron do plano Hobby só dispara
# 1x/dia e não existe worker sempre ligado lá). Bate em /api/disparar, que
# manda os pushes vencidos.
#
# Instalar:
#   sudo install -m 0755 disparar.sh /usr/local/bin/agenda-disparar
#   sudo install -m 0600 /dev/null   /etc/agenda-disparar.env
#   # preencher o .env com API_BASE e DISPARAR_SECRET (modo 0600: só o dono lê)
#
# O segredo fica no arquivo de ambiente, nunca na linha do crontab — argumento
# de processo é visível para qualquer usuário da máquina (`ps aux`).

set -eu

ARQUIVO_ENV="${AGENDA_ENV:-/etc/agenda-disparar.env}"
[ -r "$ARQUIVO_ENV" ] && . "$ARQUIVO_ENV"

: "${API_BASE:?defina API_BASE em $ARQUIVO_ENV (ex.: https://SEU-APP.vercel.app)}"
: "${DISPARAR_SECRET:?defina DISPARAR_SECRET em $ARQUIVO_ENV}"

TRAVA="/tmp/agenda-disparar.lock"

disparar() {
  # --max-time 45: o cron bate de novo em 60s; nunca deixar duas rodadas juntas.
  resposta=$(
    curl -fsS --max-time 45 \
      -H "Authorization: Bearer ${DISPARAR_SECRET}" \
      "${API_BASE}/api/disparar"
  ) || {
    echo "agenda-disparar: falha ao chamar ${API_BASE}/api/disparar" >&2
    exit 1
  }

  # Só registra quando houve algo — senão o syslog enche com 1440 linhas/dia.
  case "$resposta" in
    *'"enviados":0'*'"falhas":0'*) : ;;
    *) echo "agenda-disparar: $resposta" ;;
  esac
}

# flock evita sobreposição se uma rodada demorar mais que o minuto.
# Sem o lock disponível (ou já travado), a rodada simplesmente é pulada.
if [ "${1:-}" != "--travado" ] && command -v flock >/dev/null 2>&1; then
  flock -n "$TRAVA" "$0" --travado || exit 0
  exit 0
fi

disparar
