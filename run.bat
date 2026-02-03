@echo off
pushd "%~dp0"
echo Detected Windows environment...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ScriptDir=Get-Location; $RuntimeDir=Join-Path $ScriptDir '.runtime'; $NodeVersion='v20.11.1'; function Test-Node { try { node -v > $null; return $true } catch { return $false } }; if (-not (Test-Node)) { if (-not (Test-Path \"$RuntimeDir\node\")) { Write-Host 'Downloading portable Node.js...' -ForegroundColor Yellow; $NodeUrl=\"https://npmmirror.com/mirrors/node/$NodeVersion/node-$NodeVersion-win-x64.zip\"; if (-not (Test-Path $RuntimeDir)) { New-Item -ItemType Directory -Path $RuntimeDir }; Invoke-WebRequest -Uri $NodeUrl -OutFile \"$RuntimeDir\node.zip\"; Expand-Archive -Path \"$RuntimeDir\node.zip\" -DestinationPath $RuntimeDir; $UnzippedDir=Join-Path $RuntimeDir \"node-$NodeVersion-win-x64\"; Rename-Item -Path $UnzippedDir -NewName 'node'; Remove-Item \"$RuntimeDir\node.zip\" -Force; }; $env:Path=\"$(Join-Path $RuntimeDir 'node');\" + $env:Path; }; Write-Host ('Node.js ready: ' + (node -v)) -ForegroundColor Green; if (Test-Path 'cli.js') { node 'cli.js' } else { Write-Host 'Starting via npx...' -ForegroundColor Cyan; npx refly-bot }"

if %errorlevel% neq 0 (
    echo.
    echo Error occurred. Please check your network or configuration.
    pause
)
popd
exit /b %errorlevel%
