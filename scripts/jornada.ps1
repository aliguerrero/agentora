# Atajo para Windows: la lógica está en jornada.mjs, igual para Windows y Linux.
& node (Join-Path $PSScriptRoot 'jornada.mjs') @args
exit $LASTEXITCODE
