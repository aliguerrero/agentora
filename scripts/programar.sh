#!/bin/sh
# Registra la jornada de la oficina en cron (Linux): de lunes a viernes a la hora indicada.
# Si el equipo está apagado a esa hora, ese día no corre.
# Uso: sh scripts/programar.sh            (07:00)
#      sh scripts/programar.sh 06:30
#      sh scripts/programar.sh --quitar   (elimina la tarea)
set -eu
oficina=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
marca="# oficina-devbox-jornada"
actual=$(crontab -l 2>/dev/null | grep -vF "$marca" || true)

if [ "${1:-}" = "--quitar" ]; then
  printf '%s\n' "$actual" | crontab -
  echo "Tarea eliminada."
  exit 0
fi

hora=${1:-07:00}
case "$hora" in
  [0-1][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
  *) echo "Hora inválida: usa HH:MM, por ejemplo 06:30." >&2; exit 2 ;;
esac
h=$(printf '%s' "$hora" | cut -d: -f1 | sed 's/^0\(.\)/\1/')
m=$(printf '%s' "$hora" | cut -d: -f2 | sed 's/^0\(.\)/\1/')
node_bin=$(command -v node)
linea="$m $h * * 1-5 cd \"$oficina\" && \"$node_bin\" scripts/jornada.mjs >> logs/jornada.log 2>&1 $marca"
printf '%s\n%s\n' "$actual" "$linea" | sed '/^$/d' | crontab -
echo "Tarea registrada: lunes a viernes a las $hora."
