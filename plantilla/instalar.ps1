# Instala la oficina en este equipo: comprueba los requisitos, instala las dependencias de la
# casa 3D y la compila. No crea tareas programadas ni modifica nada fuera de esta carpeta,
# salvo la caché de npm.
$ErrorActionPreference = 'Stop'
$oficina = $PSScriptRoot

function Aviso([string]$texto) { Write-Host "  ! $texto" -ForegroundColor Yellow }
function Bien([string]$texto) { Write-Host "  OK $texto" -ForegroundColor Green }

Write-Host "`nComprobando requisitos" -ForegroundColor Cyan
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Falta Node.js 22 o superior: https://nodejs.org' }
$version = (& node -v).TrimStart('v')
if ([int]($version.Split('.')[0]) -lt 22) { throw "Tienes Node.js $version; se necesita 22 o superior: https://nodejs.org" }
Bien "Node.js $version"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Falta npm (viene con Node.js).' }

$motores = 0
if (Get-Command claude -ErrorAction SilentlyContinue) { Bien 'Claude Code encontrado'; $motores++ }
else { Aviso 'Claude Code no está en el PATH: https://claude.com/claude-code' }
$codexEscritorio = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
if ((Get-Command codex -ErrorAction SilentlyContinue) -or (Test-Path $codexEscritorio)) { Bien 'Codex encontrado'; $motores++ }
else { Aviso 'Codex no está instalado: https://openai.com/codex' }
if ($motores -eq 0) { Aviso 'Sin ningún motor la oficina abre, pero los agentes no podrán trabajar. Instala al menos uno.' }

Write-Host "`nInstalando la casa 3D (puede tardar varios minutos)" -ForegroundColor Cyan
$casa = Join-Path $oficina 'casa'
Push-Location $casa
try {
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm install falló. Revisa tu conexión a internet y vuelve a intentarlo.' }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'La compilación de la casa falló.' }
} finally { Pop-Location }
Bien 'Casa compilada'

Write-Host "`nListo. Abre la oficina con:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$(Join-Path $oficina 'scripts\abrir-oficina.ps1')`"`n"
