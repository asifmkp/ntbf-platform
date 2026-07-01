# NTBFLLC — start the whole stack (backend API + static app server)
# Usage:  powershell -ExecutionPolicy Bypass -File start-dev.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host 'Building backend...' -ForegroundColor Cyan
Push-Location "$root\backend"
npx nest build
Write-Host 'Starting backend API on http://localhost:3000 ...' -ForegroundColor Green
Start-Process -FilePath 'node' -ArgumentList 'dist/src/main.js' -WorkingDirectory "$root\backend"
Pop-Location

Write-Host 'Starting app server on http://localhost:8080 ...' -ForegroundColor Green
Start-Process -FilePath 'py' -ArgumentList '-m','http.server','8080','--directory',"$root\apps"

Start-Sleep -Seconds 3
Write-Host ''
Write-Host 'Up. Open the hub:' -ForegroundColor Cyan
Write-Host '  http://localhost:8080/index.html'
Write-Host '  http://localhost:8080/mobile-app/index.html   (field app)'
