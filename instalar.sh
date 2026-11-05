#!/bin/sh
# Instala la oficina en Linux: comprueba los requisitos, instala las dependencias de la casa 3D y la
# compila. No crea tareas programadas ni modifica nada fuera de esta carpeta, salvo la caché de npm.
set -eu
oficina=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

echo
echo "Comprobando requisitos"
if ! command -v node >/dev/null 2>&1; then echo "Falta Node.js 22 o superior: https://nodejs.org" >&2; exit 1; fi
version=$(node -v | sed 's/^v//')
if [ "${version%%.*}" -lt 22 ]; then echo "Tienes Node.js $version; se necesita 22 o superior: https://nodejs.org" >&2; exit 1; fi
echo "  OK Node.js $version"
if ! command -v npm >/dev/null 2>&1; then echo "Falta npm (suele venir con Node.js)." >&2; exit 1; fi

motores=0
if command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ]; then echo "  OK Claude Code encontrado"; motores=$((motores + 1))
else echo "  ! Claude Code no está en el PATH: https://claude.com/claude-code"; fi
if command -v codex >/dev/null 2>&1; then echo "  OK Codex encontrado"; motores=$((motores + 1))
else echo "  ! Codex no está instalado: https://openai.com/codex"; fi
if [ "$motores" -eq 0 ]; then echo "  ! Sin ningún motor la oficina abre, pero los agentes no podrán trabajar. Instala al menos uno."; fi

echo
echo "Instalando la casa 3D (puede tardar varios minutos)"
cd "$oficina/casa"
npm install --no-audit --no-fund
npm run build
echo "  OK Casa compilada"

echo
echo "Listo. Abre la oficina con:"
echo "  sh \"$oficina/scripts/abrir-oficina.sh\""
echo
