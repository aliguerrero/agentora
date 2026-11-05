#!/bin/sh
# Abre la oficina en Linux: arranca el servidor si no está corriendo y abre el navegador.
# El servidor queda en segundo plano y escribe en logs/servidor.log. Para apagarlo:
#   sh scripts/abrir-oficina.sh --apagar
set -eu
oficina=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
puerto=${OFICINA_PUERTO:-4848}
url="http://127.0.0.1:$puerto/casa"
pidfile="$oficina/logs/servidor.pid"

escucha() {
  node -e "require('net').connect($puerto,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
}

if [ "${1:-}" = "--apagar" ]; then
  if [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null; then
    rm -f "$pidfile"
    echo "Oficina apagada."
  else
    rm -f "$pidfile"
    echo "No encontré un servidor iniciado con este script."
  fi
  exit 0
fi

if ! escucha; then
  mkdir -p "$oficina/logs"
  cd "$oficina"
  nohup node servidor/server.mjs >> logs/servidor.log 2>&1 &
  echo $! > "$pidfile"
  i=0
  while [ $i -lt 20 ] && ! escucha; do sleep 0.5; i=$((i + 1)); done
  if ! escucha; then
    echo "El servidor no arrancó. Revisa logs/servidor.log" >&2
    exit 1
  fi
fi

echo "Oficina en $url"
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$url" >/dev/null 2>&1 || true
fi
