# Refly Bot

[English](./README.en.md) | 简体中文

基于 [Refly.ai](https://refly.ai) 的强大多平台聊天机器人。

---

## 📋 准备工作

在运行机器人之前，你需要准备好飞书/Lark 的应用凭证以及 Refly.ai 的 API Key。

👉 **[点击查看：详细的 Key 获取与飞书配置指引](https://powerformer.feishu.cn/wiki/YxMRwsQFriAMNukKr5Yc9OjMnnf)**

---

## 🚀 极速一键启动

根据你的系统环境，在终端复制并运行以下指令：

### 🍎 Mac / 🐧 Linux (Terminal)
- **国内推荐 (加速镜像)**:
  ```bash
  curl -sSL https://ghproxy.net/https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh | bash
  ```
- **官方源**:
  ```bash
  curl -sSL https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh | bash
  ```

### 🪟 Windows (PowerShell)
- **国内推荐 (加速镜像)**:
  ```powershell
  iwr https://ghproxy.net/https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh -OutFile run.bat; .\run.bat
  ```
- **官方源**:
  ```powershell
  iwr https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh -OutFile run.bat; .\run.bat
  ```

> **脚本会自动为你完成**：检测并安装 Node.js 运行时、切换国内加速镜像、安装依赖并启动机器人。

---

## ⚙️ 账号配置说明

### 方式 A：通过命令行启动
直接在命令中带入参数（替换 `xxx` 为实际值）：

- **Unix**: `APP_ID=xxx APP_SECRET=xxx REFLY_API_KEY=xxx sh run.sh`
- **Windows**: `$env:APP_ID="xxx"; $env:APP_SECRET="xxx"; $env:REFLY_API_KEY="xxx"; .\run.bat`

### 方式 B：永久全局配置 (推荐)
运行以下命令创建配置文件，之后可直接启动：

- **Unix**: `mkdir -p ~/.refly && echo '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' > ~/.refly/refly-bot.json`
- **Windows**: `New-Item -ItemType Directory -Force -Path "$HOME\.refly"; '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' | Out-File -FilePath "$HOME\.refly\refly-bot.json" -Encoding utf8`

---

由 Refly 社区用 ❤️ 制作
