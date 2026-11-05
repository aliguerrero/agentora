# Abre la oficina interactiva: arranca el servidor local si no está corriendo y
# abre el navegador. El servidor queda en una ventana minimizada; ciérrala para apagarlo.
$oficina = Split-Path -Parent $PSScriptRoot
$puerto = 4848
$url = "http://127.0.0.1:$puerto/casa"

$enMarcha = $false
try { $enMarcha = (Test-NetConnection 127.0.0.1 -Port $puerto -WarningAction SilentlyContinue -InformationLevel Quiet) } catch {}

if (-not $enMarcha) {
    $servidor = Join-Path $oficina 'servidor\server.mjs'
    Start-Process node -ArgumentList "`"$servidor`"" -WorkingDirectory $oficina -WindowStyle Minimized
    Start-Sleep -Seconds 2
}
Start-Process $url
