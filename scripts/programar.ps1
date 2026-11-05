# Registra la jornada de la oficina en el Programador de tareas de Windows.
# Corre de lunes a viernes a la hora indicada, con tu usuario y solo si tienes la
# sesión iniciada. Si el equipo estaba apagado, corre al encenderlo.
# Uso: .\programar.ps1            (07:00)
#      .\programar.ps1 -Hora 06:30
#      .\programar.ps1 -Quitar     (elimina la tarea)
param(
    [string]$Hora = '07:00',
    [switch]$Quitar
)

$nombre = 'DevBox Oficina - Jornada'

if ($Quitar) {
    Unregister-ScheduledTask -TaskName $nombre -Confirm:$false
    Write-Host "Tarea '$nombre' eliminada."
    return
}

$script = Join-Path $PSScriptRoot 'jornada.ps1'
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script)
$disparador = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $Hora
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador -Settings $ajustes `
    -Description 'Empleados de IA de la oficina DevBox (Claude Code).' -Force | Out-Null
Write-Host "Tarea '$nombre' registrada: lunes a viernes a las $Hora."
