# Refly Bot

English | [简体中文](./README.md)

A powerful multi-platform chatbot powered by [Refly.ai](https://refly.ai).

---

## 📋 Preparation

Before running, ensure you have your Feishu/Lark app credentials and Refly.ai API Key.

👉 **[Click here: Key Setup Guide](https://powerformer.feishu.cn/wiki/YxMRwsQFriAMNukKr5Yc9OjMnnf)**

---

## 🚀 Quick Start & Configuration

Run the command for your system in **Terminal**, **PowerShell**, or **CMD**.

### Option A: One-line Instant Start (Fastest)
Copy and run (replace `xxx` with actual keys):

- **🍎 Mac / 🐧 Linux**:
  ```bash
  curl -sSL https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh?v=1 | APP_ID=xxx APP_SECRET=xxx REFLY_API_KEY=xxx bash
  ```
- **🪟 Windows (PowerShell)**:
  ```powershell
  $env:APP_ID="xxx"; $env:APP_SECRET="xxx"; $env:REFLY_API_KEY="xxx"; iwr https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.bat?v=1 -OutFile run.bat; .\run.bat
  ```
- **🪟 Windows (CMD)**:
  ```batch
  set APP_ID=xxx& set APP_SECRET=xxx& set REFLY_API_KEY=xxx& curl -L https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.bat?v=1 -o run.bat && run.bat
  ```

### Option B: Persistent Global Config (Recommended)
Save credentials to avoid re-entering them:

- **Windows (PowerShell/CMD)**:
  ```powershell
  New-Item -ItemType Directory -Force -Path "$HOME\.refly"; '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' | Out-File -FilePath "$HOME\.refly\refly-bot.json" -Encoding utf8
  ```
- **Mac / Linux**:
  ```bash
  mkdir -p ~/.refly && echo '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' > ~/.refly/refly-bot.json
  ```
**After setup**, just run the start command again (without parameters) in the future.

---

## ⭐ Enjoying this project?

If you find this bot helpful, please give us a **Star** on GitHub!

👉 **[Click here to Star on GitHub](https://github.com/refly-ai/refly)**

---

Made with ❤️ by the Refly community
