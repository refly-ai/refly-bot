# Refly Bot

English | [简体中文](./README.md)

A powerful multi-platform chatbot powered by [Refly.ai](https://refly.ai). Currently supports Feishu/Lark with automated environment setup, smart conversations, and task progress tracking.

---

## 📋 Preparation

Before running the bot, you need to prepare your Feishu/Lark app credentials and Refly.ai API Key.

👉 **[Click here: Step-by-step guide on obtaining keys and Feishu configuration](https://powerformer.feishu.cn/wiki/YxMRwsQFriAMNukKr5Yc9OjMnnf)**

---

## 🚀 Quick Start

Run the command for your system in Terminal or PowerShell:

### 🍎 Mac / 🐧 Linux (Terminal)
- **Mainland China (Accelerated)**:
  ```bash
  curl -sSL https://ghproxy.net/https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh | bash
  ```
- **Official**:
  ```bash
  curl -sSL https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh | bash
  ```

### 🪟 Windows (PowerShell)
- **Mainland China (Accelerated)**:
  ```powershell
  iwr https://ghproxy.net/https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh -OutFile run.bat; .\run.bat
  ```
- **Official**:
  ```powershell
  iwr https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh -OutFile run.bat; .\run.bat
  ```

> **The script will automatically**: Detect/Install Node.js runtime (portable), switch to fast mirrors, install dependencies, and start the bot.

---

## ⚙️ Configuration

### Option A: Start via Command Line
Provide parameters directly in your command (replace `xxx` with actual values):

- **Unix**: `APP_ID=xxx APP_SECRET=xxx REFLY_API_KEY=xxx sh run.sh`
- **Windows**: `$env:APP_ID="xxx"; $env:APP_SECRET="xxx"; $env:REFLY_API_KEY="xxx"; .\run.bat`

### Option B: Persistent Global Config (Recommended)
Set your credentials once to avoid re-entering them in future sessions:

- **Windows**:
  ```powershell
  New-Item -ItemType Directory -Force -Path "$HOME\.refly"; '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' | Out-File -FilePath "$HOME\.refly\refly-bot.json" -Encoding utf8
  ```
- **Mac / Linux**:
  ```bash
  mkdir -p ~/.refly && echo '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' > ~/.refly/refly-bot.json
  ```

---

Made with ❤️ by the Refly community
