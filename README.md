# Refly Bot

[English](./README.en.md) | 简体中文

基于 [Refly.ai](https://refly.ai) 的强大多平台聊天机器人。

---

## 🚀 极速启动与配置

在运行前，请确保你已获取飞书/Lark 应用凭证及 Refly API Key。
👉 [点击查看：Key 获取指引](https://powerformer.feishu.cn/wiki/YxMRwsQFriAMNukKr5Yc9OjMnnf)

### 方法 A：一行代码直接运行 (最快)
在终端复制并运行（请替换 `xxx` 为你的实际密钥）：

- **🍎 Mac / 🐧 Linux**:
  ```bash
  curl -sSL https://ghproxy.net/https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh | APP_ID=xxx APP_SECRET=xxx REFLY_API_KEY=xxx bash
  ```
- **🪟 Windows (PowerShell)**:
  ```powershell
  $env:APP_ID="xxx"; $env:APP_SECRET="xxx"; $env:REFLY_API_KEY="xxx"; iwr https://ghproxy.net/https://raw.githubusercontent.com/refly-ai/refly-bot/main/run.sh -OutFile run.bat; .\run.bat
  ```

### 方法 B：保存配置后运行 (推荐)
如果你想永久保存配置，避免每次输入，请先运行下方命令创建配置文件：

- **Windows**:
  ```powershell
  New-Item -ItemType Directory -Force -Path "$HOME\.refly"; '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' | Out-File -FilePath "$HOME\.refly\refly-bot.json" -Encoding utf8
  ```
- **Mac / Linux**:
  ```bash
  mkdir -p ~/.refly && echo '{"APP_ID":"ID","APP_SECRET":"KEY","REFLY_API_KEY":"AIKEY"}' > ~/.refly/refly-bot.json
  ```
**配置完成后**，未来再次运行上述“一键启动”指令即可直接进入机器人，无需再次输入变量。

---

> **脚本会自动为你完成**：检测并安装 Node.js 运行时、切换国内加速镜像、安装依赖并启动机器人。

---

## ⭐ 喜欢这个项目吗？

如果你觉得这个机器人对你有帮助，请给我们的项目点个 **Star**！这是对我们最大的支持和鼓励。

👉 **[点击这里前往 GitHub 点赞](https://github.com/refly-ai/refly)**

---

由 Refly 社区用 ❤️ 制作
