: <<'BATCH'
@echo off
pushd "%~dp0"
echo 🪟 Detected Windows environment...

REM === Windows Logic (Embedded PowerShell) ===
powershell -NoProfile -ExecutionPolicy Bypass -Command " `
    $ScriptDir = Get-Location; `
    $RuntimeDir = Join-Path $ScriptDir '.runtime'; `
    $NodeVersion = 'v20.11.1'; `
    function Test-Node { try { node -v > $null; return $true } catch { return $false } }; `
    if (-not (Test-Node)) { `
        if (-not (Test-Path '$RuntimeDir\node')) { `
            Write-Host '🌐 Downloading portable Node.js...' -ForegroundColor Yellow; `
            $NodeUrl = 'https://npmmirror.com/mirrors/node/v20.11.1/node-v20.11.1-win-x64.zip'; `
            if (-not (Test-Path $RuntimeDir)) { New-Item -ItemType Directory -Path $RuntimeDir }; `
            Invoke-WebRequest -Uri $NodeUrl -OutFile '$RuntimeDir\node.zip'; `
            Expand-Archive -Path '$RuntimeDir\node.zip' -DestinationPath $RuntimeDir; `
            Rename-Item -Path (Join-Path $RuntimeDir 'node-v20.11.1-win-x64') -NewName 'node'; `
            Remove-Item '$RuntimeDir\node.zip' -Force; `
        }; `
        $env:Path = '$(Join-Path $RuntimeDir 'node');' + $env:Path; `
    }; `
    Write-Host ('✅ Node.js ready: ' + (node -v)) -ForegroundColor Green; `
    if (Test-Path 'cli.js') { node 'cli.js' } else { Write-Host '📦 Starting via npx...' -ForegroundColor Cyan; npx refly-bot }; `
"
if %errorlevel% neq 0 pause
popd
exit /b %errorlevel%
BATCH

# --- Unix Shell Logic (Embedded Bash) ---
echo "🍎/🐧 Detected Unix environment..."
WORK_DIR=$(pwd)
RUNTIME_DIR="$WORK_DIR/.runtime"
NODE_VERSION="v20.11.1"

if ! command -v node &> /dev/null; then
    if [ ! -d "$RUNTIME_DIR/node" ]; then
        echo "🌐 Downloading portable Node.js..."
        OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
        ARCH="$(uname -m)"
        [ "$ARCH" = "x86_64" ] && ARCH="x64"
        [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ] && ARCH="arm64"
        URL="https://npmmirror.com/mirrors/node/$NODE_VERSION/node-$NODE_VERSION-$OS-$ARCH.tar.gz"
        mkdir -p "$RUNTIME_DIR"
        curl -L "$URL" | tar -xz -C "$RUNTIME_DIR"
        mv "$RUNTIME_DIR"/node-$NODE_VERSION-$OS-$ARCH "$RUNTIME_DIR/node"
    fi
    export PATH="$RUNTIME_DIR/node/bin:$PATH"
fi

echo "✅ Node.js ready: $(node -v)"

if [ -f "$WORK_DIR/cli.js" ]; then
    node "$WORK_DIR/cli.js"
else
    echo "📦 Starting via npx..."
    npx refly-bot
fi
