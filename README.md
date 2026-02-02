# Refly Bot

[English](./README.en.md) | 简体中文

基于 [Refly.ai](https://refly.ai) 的强大多平台聊天机器人，目前支持飞书/Lark 平台，计划扩展到更多平台。

## 功能特性

- 🤖 **AI 驱动对话**：利用 Refly.ai 的先进 AI 能力
- 💬 **智能消息处理**：支持私聊和群组 @ 提及
- 🔄 **请求合并**：智能合并连续快速消息
- 📊 **进度追踪**：AI 处理过程中的实时状态更新
- 🎨 **富文本卡片**：支持图片和文件的交互式消息卡片
- 🔍 **AI 搜索集成**：可选的 Cloudflare AI Search 增强上下文
- ⚡ **工作流执行**：执行复杂的 AI 工作流并实时监控进度
- 🌐 **多语言支持**：可配置的语言环境设置

## 快速开始

### 前置要求

- Node.js 14 或更高版本
- 具有机器人功能的飞书/Lark 应用
- Refly.ai API 访问权限

### 安装

1. 克隆仓库：
```bash
git clone https://github.com/refly-ai/refly-bot.git
cd refly-bot
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量（参见[配置说明](#配置说明)）

4. 启动机器人：

**macOS/Linux:**
```bash
APP_ID=<your_app_id> APP_SECRET=<your_app_secret> ./bootstrap.sh
```

**Windows:**
```bash
set APP_ID=<your_app_id>&set APP_SECRET=<your_app_secret>&bootstrap.bat
```

## 配置说明

### 必需的环境变量

| 变量 | 说明 |
|------|------|
| `APP_ID` | 飞书/Lark 应用 ID |
| `APP_SECRET` | 飞书/Lark 应用密钥 |
| `REFLY_API_KEY` | Refly.ai API 密钥 |
| `REFLY_PLANNER_CANVAS_ID` | Refly 画布/工作流 ID，用于 AI 处理 |

### 可选的环境变量

#### Refly 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `REFLY_API_BASE_URL` | `https://api.refly.ai/v1` | Refly API 基础 URL |
| `REFLY_INPUT_VAR` | `input` | 用户输入的变量名 |
| `REFLY_FILES_VAR` | `files` | 文件附件的变量名 |
| `REFLY_COPILOT_LOCALE` | `zh-Hans` | AI 响应的语言环境 |

#### 机器人行为

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LOG_LEVEL` | `info` | 日志级别（debug, info, warn, error）|
| `REQUEST_MERGE_WINDOW_MS` | `3000` | 合并连续消息的时间窗口（毫秒）|
| `MERGE_NOTICE_TEXT` | `收到，已合并。` | 请求合并时显示的消息 |
| `USER_MAX_GENERATE_CONCURRENCY` | `5` | 每个用户最大并发生成请求数 |
| `USER_MAX_RUN_CONCURRENCY` | `5` | 每个用户最大并发工作流执行数 |

#### 进度与状态

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PROGRESS_PLANNER_TEXT` | `正在理解需求...` | 规划阶段的状态文本 |
| `PROGRESS_COPILOT_TEXT` | `正在生成Skills...` | 生成阶段的状态文本 |
| `PROGRESS_READY_TEXT` | `已理解需求，准备生成Skills...` | 准备就绪时的状态文本 |
| `PROGRESS_SHOW_ID` | `false` | 在进度消息中显示工作流 ID |
| `PROGRESS_OUTPUT_LINES` | `6` | 进度中显示的输出行数 |
| `WORKFLOW_POLL_INTERVAL_MS` | `3000` | 工作流状态轮询间隔（毫秒）|
| `WORKFLOW_OUTPUT_INTERVAL_MS` | `5000` | 输出更新间隔（毫秒）|
| `WORKFLOW_STATUS_NOTIFY_INTERVAL_MS` | `5000` | 状态通知间隔（毫秒）|

#### 超时与限制

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WORKFLOW_MAX_MINUTES` | `30` | 工作流最大执行时间（分钟）|
| `PLANNER_MAX_MINUTES` | `5` | 规划阶段最大时间（分钟）|
| `LARK_MAX_UPLOAD_MB` | `20` | 最大文件上传大小（MB）|
| `LARK_MAX_DOWNLOAD_MB` | `100` | 最大文件下载大小（MB）|
| `LARK_MAX_IMAGE_MB` | `10` | 最大图片大小（MB）|

#### 卡片显示

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ENABLE_ARTIFACTS_CARD` | `true` | 启用富文本卡片响应 |
| `CARD_HEADER_BADGE` | - | 卡片标题的徽章文本 |
| `CARD_MAX_IMAGES` | `20` | 每个卡片最大图片数 |
| `CARD_MAX_FILES` | `30` | 每个卡片最大文件数 |
| `CARD_TEXT_MAX_LENGTH` | `500` | 卡片中最大文本长度 |

#### AI 搜索（可选）

启用 Cloudflare AI Search 集成以增强上下文：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AI_SEARCH_ENDPOINT` | - | AI Search API 端点 |
| `AI_SEARCH_API_TOKEN` | - | AI Search API 令牌 |
| `AI_SEARCH_ACCOUNT_ID` | - | Cloudflare 账户 ID |
| `AI_SEARCH_MODE` | - | 搜索模式（例如 `autorag`）|
| `AI_SEARCH_MODEL` | - | 用于搜索的模型 |
| `AI_SEARCH_INDEX` | - | 搜索索引名称 |
| `AI_SEARCH_FILTER` | - | 搜索过滤表达式 |
| `AI_SEARCH_TOP_K` | `5` | 搜索结果数量 |
| `AI_SEARCH_MIN_SCORE` | `0` | 最小相关性分数 |
| `AI_SEARCH_TIMEOUT_MS` | `2000` | 搜索超时（毫秒）|
| `AI_SEARCH_MAX_CONTEXT_CHARS` | `2000` | 最大上下文字符数 |
| `AI_SEARCH_MAX_ITEM_CHARS` | `500` | 每项最大字符数 |
| `AI_SEARCH_INCLUDE_SCORE` | `false` | 包含相关性分数 |
| `AI_SEARCH_REWRITE_QUERY` | `false` | 启用查询重写 |
| `AI_SEARCH_RERANK_ENABLED` | `false` | 启用结果重排序 |
| `AI_SEARCH_RERANK_MODEL` | - | 重排序模型 |
| `AI_SEARCH_STREAM` | `false` | 启用流式响应 |

## 使用方法

### 基本对话

1. 将机器人添加到飞书/Lark 群组或直接私聊
2. 向机器人发送消息
3. 机器人将使用 Refly.ai 处理您的请求并响应

### 群组提及

在群聊中，使用 `@机器人名称` 提及机器人，然后发送您的消息。

### 取消操作

发送以下任一命令可取消正在进行的操作：
- `取消` / `中止` / `停止` / `终止`
- `cancel` / `abort` / `stop`

## 架构

机器人采用复杂的架构设计：

- **消息队列**：处理带去重的传入消息
- **请求合并**：合并来自同一用户的连续快速消息
- **进度追踪**：长时间运行操作的实时状态更新
- **会话管理**：维护对话上下文
- **并发控制**：限制每个用户的并发操作
- **重试机制**：失败操作的自动重试

## 开发

### 项目结构

```
refly-bot/
├── index.js           # 主机器人实现
├── package.json       # Node.js 依赖
├── bootstrap.sh       # Unix 启动脚本
├── bootstrap.bat      # Windows 启动脚本
├── .gitignore        # Git 忽略规则
└── LICENSE           # Apache 2.0 许可证
```

### 开发模式运行

```bash
npm run dev
```

### 设置飞书/Lark 应用

1. 在[飞书开放平台](https://open.feishu.cn/)创建新应用
2. 启用机器人功能
3. 配置消息事件的事件订阅
4. 设置所需权限：
   - 读取消息
   - 发送消息
   - 上传/下载文件
   - 访问用户信息
5. 获取您的 `APP_ID` 和 `APP_SECRET`

## 路线图

- [ ] 支持更多消息平台（Slack、Discord 等）
- [ ] 增强错误处理和恢复
- [ ] 指标和监控
- [ ] Docker 部署支持
- [ ] 多机器人管理
- [ ] 可扩展的插件系统

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

本项目采用 Apache License 2.0 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 致谢

- 由 [Refly.ai](https://refly.ai) 提供支持
- 基于[飞书/Lark 开放平台](https://open.feishu.cn/)构建

## 支持

如有问题和疑问：
- 在 GitHub 上提交 issue
- 查看[文档](https://docs.refly.ai)

---

由 Refly 社区用 ❤️ 制作

