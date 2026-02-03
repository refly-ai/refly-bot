#!/bin/bash
set -e

echo "Detected Mac / Linux environment..."
WORK_DIR=$(pwd)
RUNTIME_DIR="$WORK_DIR/.runtime"
NODE_VERSION="v20.11.1"

# 1. Setup portable Node.js
if ! command -v node &> /dev/null; then
    if [ ! -d "$RUNTIME_DIR/node" ]; then
        echo "Downloading portable Node.js..."
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

echo "Node.js ready: $(node -v)"

# 2. Start
if [ -f "$WORK_DIR/cli.js" ]; then
    node "$WORK_DIR/cli.js"
else
    echo "Starting via npx..."
    npx --yes refly-bot
fi
