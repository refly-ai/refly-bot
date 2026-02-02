# Refly Bot

A powerful multi-platform chatbot powered by [Refly.ai](https://refly.ai), currently supporting Feishu/Lark platform with plans to expand to more platforms.

## Features

- 🤖 **AI-Powered Conversations**: Leverages Refly.ai's advanced AI capabilities
- 💬 **Smart Message Handling**: Supports both direct messages and group mentions
- 🔄 **Request Merging**: Intelligently merges rapid consecutive messages
- 📊 **Progress Tracking**: Real-time status updates during AI processing
- 🎨 **Rich Card Responses**: Interactive message cards with images and files
- 🔍 **AI Search Integration**: Optional Cloudflare AI Search for enhanced context
- ⚡ **Workflow Execution**: Execute complex AI workflows with progress monitoring
- 🌐 **Multi-language Support**: Configurable locale settings

## Quick Start

### Prerequisites

- Node.js 14 or higher
- A Feishu/Lark app with bot capabilities
- Refly.ai API access

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/refly-bot.git
cd refly-bot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables (see [Configuration](#configuration))

4. Start the bot:

**macOS/Linux:**
```bash
APP_ID=<your_app_id> APP_SECRET=<your_app_secret> ./bootstrap.sh
```

**Windows:**
```bash
set APP_ID=<your_app_id>&set APP_SECRET=<your_app_secret>&bootstrap.bat
```

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `APP_ID` | Feishu/Lark app ID |
| `APP_SECRET` | Feishu/Lark app secret |
| `REFLY_API_KEY` | Refly.ai API key |
| `REFLY_CANVAS_ID` | Refly canvas/workflow ID for AI processing |

### Optional Environment Variables

#### Refly Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REFLY_API_BASE_URL` | `https://api.refly.ai/v1` | Refly API base URL |
| `REFLY_PLANNER_CANVAS_ID` | - | Separate canvas ID for planning phase |
| `REFLY_INPUT_VAR` | `input` | Variable name for user input |
| `REFLY_FILES_VAR` | `files` | Variable name for file attachments |
| `REFLY_COPILOT_LOCALE` | `zh-Hans` | Locale for AI responses |

#### Bot Behavior

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `REQUEST_MERGE_WINDOW_MS` | `3000` | Time window for merging consecutive messages (ms) |
| `MERGE_NOTICE_TEXT` | `收到，已合并。` | Message shown when requests are merged |
| `USER_MAX_GENERATE_CONCURRENCY` | `5` | Max concurrent generation requests per user |
| `USER_MAX_RUN_CONCURRENCY` | `5` | Max concurrent workflow executions per user |

#### Progress & Status

| Variable | Default | Description |
|----------|---------|-------------|
| `PROGRESS_PLANNER_TEXT` | `正在理解需求...` | Status text during planning phase |
| `PROGRESS_COPILOT_TEXT` | `正在生成Skills...` | Status text during generation |
| `PROGRESS_READY_TEXT` | `已理解需求，准备生成Skills...` | Status text when ready |
| `PROGRESS_SHOW_ID` | `false` | Show workflow ID in progress messages |
| `PROGRESS_OUTPUT_LINES` | `6` | Number of output lines to show in progress |
| `WORKFLOW_POLL_INTERVAL_MS` | `3000` | Polling interval for workflow status (ms) |
| `WORKFLOW_OUTPUT_INTERVAL_MS` | `5000` | Interval for output updates (ms) |
| `WORKFLOW_STATUS_NOTIFY_INTERVAL_MS` | `5000` | Interval for status notifications (ms) |

#### Timeouts & Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKFLOW_MAX_MINUTES` | `30` | Maximum workflow execution time (minutes) |
| `PLANNER_MAX_MINUTES` | `5` | Maximum planning phase time (minutes) |
| `LARK_MAX_UPLOAD_MB` | `20` | Maximum file upload size (MB) |
| `LARK_MAX_DOWNLOAD_MB` | `100` | Maximum file download size (MB) |
| `LARK_MAX_IMAGE_MB` | `10` | Maximum image size (MB) |

#### Card Display

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_ARTIFACTS_CARD` | `true` | Enable rich card responses |
| `CARD_HEADER_BADGE` | - | Badge text for card headers |
| `CARD_MAX_IMAGES` | `20` | Maximum images per card |
| `CARD_MAX_FILES` | `30` | Maximum files per card |
| `CARD_TEXT_MAX_LENGTH` | `500` | Maximum text length in cards |

#### AI Search (Optional)

Enable Cloudflare AI Search integration for enhanced context:

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_SEARCH_ENDPOINT` | - | AI Search API endpoint |
| `AI_SEARCH_API_TOKEN` | - | AI Search API token |
| `AI_SEARCH_ACCOUNT_ID` | - | Cloudflare account ID |
| `AI_SEARCH_MODE` | - | Search mode (e.g., `autorag`) |
| `AI_SEARCH_MODEL` | - | Model to use for search |
| `AI_SEARCH_INDEX` | - | Search index name |
| `AI_SEARCH_FILTER` | - | Search filter expression |
| `AI_SEARCH_TOP_K` | `5` | Number of search results |
| `AI_SEARCH_MIN_SCORE` | `0` | Minimum relevance score |
| `AI_SEARCH_TIMEOUT_MS` | `2000` | Search timeout (ms) |
| `AI_SEARCH_MAX_CONTEXT_CHARS` | `2000` | Max context characters |
| `AI_SEARCH_MAX_ITEM_CHARS` | `500` | Max characters per item |
| `AI_SEARCH_INCLUDE_SCORE` | `false` | Include relevance scores |
| `AI_SEARCH_REWRITE_QUERY` | `false` | Enable query rewriting |
| `AI_SEARCH_RERANK_ENABLED` | `false` | Enable result reranking |
| `AI_SEARCH_RERANK_MODEL` | - | Model for reranking |
| `AI_SEARCH_STREAM` | `false` | Enable streaming responses |

## Usage

### Basic Conversation

1. Add the bot to a Feishu/Lark group or chat directly
2. Send a message to the bot
3. The bot will process your request using Refly.ai and respond

### Group Mentions

In group chats, mention the bot with `@BotName` followed by your message.

### Canceling Operations

Send any of these commands to cancel an ongoing operation:
- `取消` / `中止` / `停止` / `终止`
- `cancel` / `abort` / `stop`

## Architecture

The bot uses a sophisticated architecture with:

- **Message Queue**: Handles incoming messages with deduplication
- **Request Merging**: Combines rapid consecutive messages from the same user
- **Progress Tracking**: Real-time status updates during long-running operations
- **Session Management**: Maintains conversation context
- **Concurrency Control**: Limits concurrent operations per user
- **Retry Mechanism**: Automatic retry for failed operations

## Development

### Project Structure

```
refly-bot/
├── index.js           # Main bot implementation
├── package.json       # Node.js dependencies
├── bootstrap.sh       # Unix startup script
├── bootstrap.bat      # Windows startup script
├── .gitignore        # Git ignore rules
└── LICENSE           # Apache 2.0 license
```

### Running in Development

```bash
npm run dev
```

### Setting up Feishu/Lark App

1. Create a new app at [Feishu Open Platform](https://open.feishu.cn/)
2. Enable bot capabilities
3. Configure event subscriptions for message events
4. Set up required permissions:
   - Read messages
   - Send messages
   - Upload/download files
   - Access user information
5. Get your `APP_ID` and `APP_SECRET`

## Roadmap

- [ ] Support for more messaging platforms (Slack, Discord, etc.)
- [ ] Enhanced error handling and recovery
- [ ] Metrics and monitoring
- [ ] Docker deployment support
- [ ] Multi-bot management
- [ ] Plugin system for extensibility

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Powered by [Refly.ai](https://refly.ai)
- Built with [Lark/Feishu Open Platform](https://open.feishu.cn/)

## Support

For issues and questions:
- Open an issue on GitHub
- Check the [documentation](https://docs.refly.ai)

---

Made with ❤️ by the Refly community
