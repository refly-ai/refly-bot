# Refly Bot

English | [简体中文](./README.md)

A powerful multi-platform chatbot powered by [Refly.ai](https://refly.ai).

---

## 🚀 Quick Start & Configuration

Before running, ensure you have your Feishu/Lark credentials and Refly API Key.
👉 [Click here: Key Setup Guide](https://powerformer.feishu.cn/wiki/YxMRwsQFriAMNukKr5Yc9OjMnnf)

### Option A: One-line Instant Start (Fastest)
Copy and run in your terminal (replace `xxx` with actual keys):

- **🍎 Mac / 🐧 Linux**:
  ```bash
  curl -sSL https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh | APP_ID=xxx APP_SECRET=xxx REFLY_API_KEY=xxx bash
  ```
- **🪟 Windows (PowerShell)**:
  ```powershell
  $env:APP_ID="xxx"; $env:APP_SECRET="xxx"; $env:REFLY_API_KEY="xxx"; iwr https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh -OutFile run.bat; .\run.bat
  ```

### Option B: Persistent Global Config (Recommended)
Save your credentials once to avoid re-entering them in future sessions:

- **Windows**:
  ```powershell
  New-Item -ItemType Directory -Force -Path "$HOME\.refly"; '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' | Out-File -FilePath "$HOME\.refly\refly-bot.json" -Encoding utf8
  ```
- **Mac / Linux**:
  ```bash
  mkdir -p ~/.refly && echo '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' > ~/.refly/refly-bot.json
  ```
**After setup**, simply run the "Quick Start" command again to start the bot directly without re-entering variables.

---

> **The script will automatically**: Detect/Install Node.js runtime (portable), switch to fast mirrors, install dependencies, and start the bot.

---

## ⭐ Enjoying this project?

If you find this bot helpful, please give us a **Star** on GitHub! Your support means a lot to us.

👉 **[Click here to Star on GitHub](https://github.com/refly-ai/refly)**

---

Made with ❤️ by the Refly community
