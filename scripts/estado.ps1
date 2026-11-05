# Atajo para Windows: la lógica está en estado.mjs, igual para Windows y Linux.
& node (Join-Path $PSScriptRoot 'estado.mjs') @args
exit $LASTEXITCODE
