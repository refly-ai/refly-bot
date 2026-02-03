# Refly Bot

[English](./README.en.md) | 简体中文

基于 [Refly.ai](https://refly.ai) 的强大多平台聊天机器人。

---

## 📋 准备工作

在运行机器人之前，你需要准备好飞书/Lark 的应用凭证以及 Refly.ai 的 API Key。

👉 **[点击查看：Key 获取指引](https://powerformer.feishu.cn/wiki/YxMRwsQFriAMNukKr5Yc9OjMnnf)**

---

## 🚀 极速启动与配置

请在**终端 (Terminal)**、**PowerShell** 或 **CMD** 中根据网络环境选择运行。

### 方法 A：一行代码直接运行 (最快)
复制下方命令启动（请替换 `xxx` 为你的实际密钥）：

- **🍎 Mac / 🐧 Linux**:
  ```bash
  curl -sSL https://ghproxy.net/https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh?v=1 | APP_ID=xxx APP_SECRET=xxx REFLY_API_KEY=xxx bash
  ```
- **🪟 Windows (PowerShell)**:
  ```powershell
  $env:APP_ID="xxx"; $env:APP_SECRET="xxx"; $env:REFLY_API_KEY="xxx"; iwr https://ghproxy.net/https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.bat?v=1 -OutFile run.bat; .\run.bat
  ```
- **🪟 Windows (CMD)**:
  ```batch
  set APP_ID=xxx& set APP_SECRET=xxx& set REFLY_API_KEY=xxx& curl -L https://ghproxy.net/https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.bat?v=1 -o run.bat && run.bat
  ```

### 方法 B：保存配置后运行 (推荐)
如果你想永久保存配置，避免每次输入，请先运行下方命令创建配置文件：

- **Windows (PowerShell/CMD)**:
  ```powershell
  New-Item -ItemType Directory -Force -Path "$HOME\.refly"; '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' | Out-File -FilePath "$HOME\.refly\refly-bot.json" -Encoding utf8
  ```
- **Mac / Linux**:
  ```bash
  mkdir -p ~/.refly && echo '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' > ~/.refly/refly-bot.json
  ```
**配置完成后**，未来再次运行上述启动指令（无需带参数）即可直接启动。

---

## ⭐ 喜欢这个项目吗？

如果你觉得这个机器人对你有帮助，请给我们的项目点个 **Star**！这是对我们最大的支持和鼓励。

👉 **[点击这里前往 GitHub 点赞](https://github.com/refly-ai/refly)**

---

由 Refly 社区用 ❤️ 制作
