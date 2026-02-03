import * as Lark from '@larksuiteoapi/node-sdk';

const env = process.env;
const API_BASE_URL = (env.REFLY_API_BASE_URL ?? 'https://api.refly.ai/v1').replace(/\/$/, '');
const API_KEY = env.REFLY_API_KEY ?? '';
const VARIABLE_INPUT = env.REFLY_INPUT_VAR ?? 'input';
const VARIABLE_FILES = env.REFLY_FILES_VAR ?? 'files';
const COPILOT_LOCALE = env.REFLY_COPILOT_LOCALE ?? 'zh-Hans';
let BOT_USER_ID = env.BOT_USER_ID ?? '';
let BOT_OPEN_ID = env.BOT_OPEN_ID ?? '';
const LOG_LEVEL = env.LOG_LEVEL ?? 'info';
const MAX_LARK_UPLOAD_MB = Number(env.LARK_MAX_UPLOAD_MB ?? 20);
const MAX_LARK_DOWNLOAD_MB = Number(env.LARK_MAX_DOWNLOAD_MB ?? 100);
const MAX_LARK_IMAGE_MB = Number(env.LARK_MAX_IMAGE_MB ?? 10);
const MAX_WORKFLOW_MINUTES = Number(env.WORKFLOW_MAX_MINUTES ?? 30);
const POLL_INTERVAL_MS = Number(env.WORKFLOW_POLL_INTERVAL_MS ?? 3000);
const OUTPUT_INTERVAL_MS = Number(env.WORKFLOW_OUTPUT_INTERVAL_MS ?? 5000);
const STATUS_NOTIFY_INTERVAL_MS = Number(env.WORKFLOW_STATUS_NOTIFY_INTERVAL_MS ?? 5000);
const MERGE_WINDOW_MS = Number(env.REQUEST_MERGE_WINDOW_MS ?? 3000);
const MERGE_NOTICE_TEXT = env.MERGE_NOTICE_TEXT ?? '收到，已合并。';
const PROGRESS_PLANNER_TEXT = env.PROGRESS_PLANNER_TEXT ?? '正在理解需求...';
const PROGRESS_COPILOT_TEXT = env.PROGRESS_COPILOT_TEXT ?? '正在生成Skills...';
const PROGRESS_READY_TEXT = env.PROGRESS_READY_TEXT ?? '已理解需求，准备生成Skills...';
const PROGRESS_SHOW_ID = env.PROGRESS_SHOW_ID === '1' || env.PROGRESS_SHOW_ID === 'true';
const CARD_HEADER_BADGE = env.CARD_HEADER_BADGE ?? '';
const PROGRESS_OUTPUT_LINES = Number(env.PROGRESS_OUTPUT_LINES ?? 6);
const MAX_USER_GENERATE_CONCURRENCY = Number(env.USER_MAX_GENERATE_CONCURRENCY ?? 5);
const MAX_USER_RUN_CONCURRENCY = Number(env.USER_MAX_RUN_CONCURRENCY ?? 5);
const ENABLE_ARTIFACTS_CARD =
  env.ENABLE_ARTIFACTS_CARD === undefined
    ? true
    : ['1', 'true', 'yes', 'y'].includes(String(env.ENABLE_ARTIFACTS_CARD).toLowerCase());
const MAX_CARD_IMAGES = Number(env.CARD_MAX_IMAGES ?? 20);
const MAX_CARD_FILES = Number(env.CARD_MAX_FILES ?? 30);
const CARD_TEXT_MAX_LENGTH = Number(env.CARD_TEXT_MAX_LENGTH ?? 500);
const AI_SEARCH_ENDPOINT = env.AI_SEARCH_ENDPOINT ?? '';
const AI_SEARCH_API_TOKEN = env.AI_SEARCH_API_TOKEN ?? '';
const AI_SEARCH_ACCOUNT_ID = env.AI_SEARCH_ACCOUNT_ID ?? '';
const AI_SEARCH_MODE = env.AI_SEARCH_MODE ?? '';
const AI_SEARCH_MODEL = env.AI_SEARCH_MODEL ?? '';
const AI_SEARCH_INDEX = env.AI_SEARCH_INDEX ?? '';
const AI_SEARCH_FILTER = env.AI_SEARCH_FILTER ?? '';
const AI_SEARCH_TOP_K = Number(env.AI_SEARCH_TOP_K ?? 5);
const AI_SEARCH_MIN_SCORE = Number(env.AI_SEARCH_MIN_SCORE ?? 0);
const AI_SEARCH_TIMEOUT_MS = Number(env.AI_SEARCH_TIMEOUT_MS ?? 2000);
const AI_SEARCH_MAX_CONTEXT_CHARS = Number(env.AI_SEARCH_MAX_CONTEXT_CHARS ?? 2000);
const AI_SEARCH_MAX_ITEM_CHARS = Number(env.AI_SEARCH_MAX_ITEM_CHARS ?? 500);
const AI_SEARCH_INCLUDE_SCORE = env.AI_SEARCH_INCLUDE_SCORE === '1' || env.AI_SEARCH_INCLUDE_SCORE === 'true';
const AI_SEARCH_REWRITE_QUERY = env.AI_SEARCH_REWRITE_QUERY === '1' || env.AI_SEARCH_REWRITE_QUERY === 'true';
const AI_SEARCH_RERANK_ENABLED = env.AI_SEARCH_RERANK_ENABLED === '1' || env.AI_SEARCH_RERANK_ENABLED === 'true';
const AI_SEARCH_RERANK_MODEL = env.AI_SEARCH_RERANK_MODEL ?? '';
const AI_SEARCH_STREAM = env.AI_SEARCH_STREAM === '1' || env.AI_SEARCH_STREAM === 'true';

const CANCEL_PATTERN = /^(取消|中止|停止|终止|abort|cancel|stop)(任务|执行)?$/i;
const CARD_INPUT_NAME = 'clarify_input';
const CARD_ABORT_ACTION = 'abort';
const CARD_RETRY_GENERATE_ACTION = 'retry_generate';
const CARD_RETRY_RUN_ACTION = 'retry_run';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const baseConfig = {
  appId: env.APP_ID,
  appSecret: env.APP_SECRET,
  domain: env.BASE_DOMAIN ?? 'https://open.feishu.cn',
};

const client = new Lark.Client(baseConfig);
const wsClient = new Lark.WSClient(baseConfig);

const processedMessageIds = new Set();
const pendingRequests = new Map();
const activeExecutions = new Map();
const activeGenerations = new Map();
const lastRequestTextBySession = new Map();
const clarifySessions = new Map();
const sessionMemory = new Map();
const progressStates = new Map();
const progressInputLocks = new Set();
const retryContexts = new Map();

const findProgressByMessageId = (messageId) => {
  if (!messageId) return null;
  for (const [requestKey, state] of progressStates.entries()) {
    if (state?.messageId === messageId) {
      return { requestKey, state };
    }
  }
  return null;
};

const findPendingByRequestKey = (requestKey) => {
  if (!requestKey) return null;
  for (const [sessionKey, pending] of pendingRequests.entries()) {
    if (pending?.requestKey === requestKey) {
      return { sessionKey, pending };
    }
  }
  return null;
};

const cancelByRequestKey = async ({ requestKey, chatId, chatType, messageId, sender }) => {
  if (!requestKey) return { ok: false, stage: 'missing' };

  const pendingEntry = findPendingByRequestKey(requestKey);
  if (pendingEntry?.pending) {
    if (pendingEntry.pending.timer) {
      clearTimeout(pendingEntry.pending.timer);
    }
    pendingRequests.delete(pendingEntry.sessionKey);
    return { ok: true, stage: 'pending' };
  }

  const running = activeExecutions.get(requestKey);
  if (running?.executionId) {
    const abortRes = await requestJson(
      `${API_BASE_URL}/openapi/workflow/${running.executionId}/abort`,
      { method: 'POST', headers: { ...buildHeaders(), 'Content-Type': 'application/json' } },
    );
    const ok = Boolean(abortRes.ok && abortRes.data?.success);
    if (ok) {
      await sendProgressCard({
        chatId,
        chatType,
        messageId,
        sender,
        requestKey,
        title: '中止中',
        statusText: '中止中',
        stageText: '执行中',
        etaText: '等待终止',
        summaryText: '已发送中止请求，等待执行结束。',
        showAbort: false,
      });
    }
    return { ok, stage: 'running' };
  }

  return { ok: false, stage: 'none' };
};

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return '[unserializable]';
  }
};

const shouldLog = (level) => {
  const current = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.info;
  const target = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  return target <= current;
};

const log = (level, message, data) => {
  if (!shouldLog(level)) return;
  const suffix = data ? ` ${safeStringify(data)}` : '';
  const line = `[${level.toUpperCase()}] ${message}${suffix}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
};

const logInfo = (message, data) => log('info', message, data);
const logDebug = (message, data) => log('debug', message, data);
const logWarn = (message, data) => log('warn', message, data);
const logError = (message, data) => log('error', message, data);

const redactTokens = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => redactTokens(item));
  }
  if (!value || typeof value !== 'object') return value;
  const cloned = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof key === 'string' && key.toLowerCase().includes('token')) {
      cloned[key] = '[redacted]';
    } else {
      cloned[key] = redactTokens(val);
    }
  }
  return cloned;
};

const formatErrorDetails = (error) => {
  if (!error) return { message: 'unknown' };
  const response = error?.response;
  return {
    message: error?.message ?? String(error),
    status: response?.status,
    data: response?.data,
  };
};

const safeJsonParse = (raw) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return {};
  }
};

const extractJsonFromText = (text) => {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return null;
    }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (_error) {
    return null;
  }
};

const mergeUniqueList = (items, keyGetter) => {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    const key = keyGetter(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

const buildHistoryText = (history) => {
  const lines = [];
  for (const item of history) {
    if (!item?.content) continue;
    const roleLabel = item.role === 'assistant' ? '机器人' : '用户';
    lines.push(`${roleLabel}: ${item.content}`);
  }
  return lines.join('\n');
};

const extractUserHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history.filter((item) => item?.role === 'user' && item?.content);
};

const buildGenerateQuery = ({ history, latestUserMessage }) => {
  const lines = [];
  const userHistory = extractUserHistory(history);
  for (const item of userHistory) {
    lines.push(item.content);
  }
  if (latestUserMessage) {
    lines.push(latestUserMessage);
  }
  return lines.filter(Boolean).join('\n');
};

const getSessionMemory = (key) => {
  if (!sessionMemory.has(key)) {
    sessionMemory.set(key, { history: [], lastWorkflows: [] });
  }
  return sessionMemory.get(key);
};

const appendHistory = (key, entries, { reset = false } = {}) => {
  const memory = getSessionMemory(key);
  const history = reset ? [] : [...(memory.history ?? [])];
  for (const entry of entries) {
    if (!entry?.content) continue;
    history.push({ role: entry.role, content: entry.content });
  }
  memory.history = history.slice(-10);
};

const pushWorkflowSummary = (key, summary) => {
  const memory = getSessionMemory(key);
  const list = Array.isArray(memory.lastWorkflows) ? [...memory.lastWorkflows] : [];
  list.unshift(summary);
  memory.lastWorkflows = list.slice(0, 3);
};

const truncateText = (text, max = 180) => {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

const truncateCardText = (text, max = CARD_TEXT_MAX_LENGTH) => {
  const limit = Number.isFinite(max) && max > 0 ? max : 500;
  if (!text || text.length <= limit) return text;
  const truncated = text.slice(0, limit);
  const cutPoints = [
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('？'),
    truncated.lastIndexOf('\n'),
    truncated.lastIndexOf('；'),
  ];
  const cutPoint = Math.max(...cutPoints);
  if (cutPoint > limit * 0.6) {
    return `${truncated.slice(0, cutPoint + 1)}...`;
  }
  return `${truncated}...`;
};

const truncateTextFromEnd = (text, max = CARD_TEXT_MAX_LENGTH) => {
  const limit = Number.isFinite(max) && max > 0 ? max : 500;
  if (!text || text.length <= limit) return text;
  const tail = text.slice(-limit);
  return `[...truncated...]\n${tail}`;
};

const resolveAiSearchEndpoint = () => {
  if (!AI_SEARCH_ENDPOINT) return '';
  if (!AI_SEARCH_ACCOUNT_ID) return AI_SEARCH_ENDPOINT;
  return AI_SEARCH_ENDPOINT
    .replace('{ACCOUNT_ID}', AI_SEARCH_ACCOUNT_ID)
    .replace('${ACCOUNT_ID}', AI_SEARCH_ACCOUNT_ID)
    .replace('$ACCOUNT_ID', AI_SEARCH_ACCOUNT_ID);
};

const isAiSearchEnabled = () => Boolean(resolveAiSearchEndpoint());

const normalizeAiSearchItems = (data) => {
  const root = data?.result ?? data?.data ?? data ?? {};
  let items = [];
  if (Array.isArray(root)) {
    items = root;
  } else if (Array.isArray(root?.data)) {
    items = root.data;
  } else if (Array.isArray(root?.matches)) {
    items = root.matches;
  } else if (Array.isArray(root?.results)) {
    items = root.results;
  } else if (Array.isArray(data?.data)) {
    items = data.data;
  } else if (Array.isArray(data?.matches)) {
    items = data.matches;
  } else if (Array.isArray(data?.results)) {
    items = data.results;
  }

  return items
    .map((item) => {
      const meta = item?.metadata || item?.data || item?.document || {};
      const title =
        item?.title || meta?.title || meta?.name || item?.name || meta?.fileName || '';
      const content =
        item?.content ||
        item?.text ||
        item?.snippet ||
        meta?.content ||
        meta?.text ||
        meta?.snippet ||
        meta?.body ||
        '';
      const url =
        item?.url || meta?.url || meta?.source || meta?.link || item?.link || item?.source || '';
      const score =
        typeof item?.score === 'number'
          ? item.score
          : typeof meta?.score === 'number'
            ? meta.score
            : null;
      return { title, content, url, score };
    })
    .filter((item) => item.title || item.content);
};

const buildAiSearchRequestBody = (query) => {
  const endpoint = resolveAiSearchEndpoint();
  const useAutorag = AI_SEARCH_MODE === 'autorag' || endpoint.includes('/autorag/rags/');
  if (useAutorag) {
    const body = {
      query,
      stream: AI_SEARCH_STREAM,
      max_num_results: AI_SEARCH_TOP_K,
      rewrite_query: AI_SEARCH_REWRITE_QUERY,
    };
    if (AI_SEARCH_MODEL) {
      body.model = AI_SEARCH_MODEL;
    }
    if (Number.isFinite(AI_SEARCH_MIN_SCORE)) {
      body.ranking_options = { score_threshold: AI_SEARCH_MIN_SCORE };
    }
    if (AI_SEARCH_RERANK_ENABLED || AI_SEARCH_RERANK_MODEL) {
      body.reranking = {
        enabled: AI_SEARCH_RERANK_ENABLED,
        ...(AI_SEARCH_RERANK_MODEL ? { model: AI_SEARCH_RERANK_MODEL } : {}),
      };
    }
    if (AI_SEARCH_FILTER) {
      const filter = safeJsonParse(AI_SEARCH_FILTER);
      if (filter && Object.keys(filter).length) {
        body.filter = filter;
      }
    }
    return body;
  }
  const body = {
    query,
    top_k: AI_SEARCH_TOP_K,
    ...(AI_SEARCH_INDEX ? { index: AI_SEARCH_INDEX } : {}),
  };
  if (AI_SEARCH_FILTER) {
    const filter = safeJsonParse(AI_SEARCH_FILTER);
    if (filter && Object.keys(filter).length) {
      body.filter = filter;
    }
  }
  return body;
};

const fetchAiSearchResults = async (query) => {
  const endpoint = resolveAiSearchEndpoint();
  if (!endpoint || !query) {
    logInfo('[AI Search] 跳过：未启用或查询为空', { enabled: Boolean(endpoint), hasQuery: Boolean(query) });
    return [];
  }

  logInfo('[AI Search] 开始请求', {
    query: truncateText(query, 100),
    endpoint,
    mode: AI_SEARCH_MODE,
    topK: AI_SEARCH_TOP_K,
    minScore: AI_SEARCH_MIN_SCORE,
    timeout: AI_SEARCH_TIMEOUT_MS
  });

  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (AI_SEARCH_API_TOKEN) {
    headers.Authorization = `Bearer ${AI_SEARCH_API_TOKEN}`;
    logInfo('[AI Search] 使用 API Token 认证');
  }
  const body = buildAiSearchRequestBody(query);
  logInfo('[AI Search] 请求体', { body });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_SEARCH_TIMEOUT_MS);
  const startTime = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const elapsed = Date.now() - startTime;
    logInfo('[AI Search] 收到响应', { status: res.status, elapsed: `${elapsed}ms` });

    let data = null;
    try {
      data = await res.json();
    } catch (_error) {
      logWarn('[AI Search] 响应解析失败', { error: _error?.message });
      data = null;
    }

    if (!res.ok) {
      logWarn('[AI Search] 响应失败', { status: res.status, data });
      return [];
    }

    const items = normalizeAiSearchItems(data);
    logInfo('[AI Search] 结果解析完成', {
      itemCount: items.length,
      hasScores: items.some(item => typeof item.score === 'number'),
      scores: items.map(item => item.score).filter(s => s !== null),
      items: buildAiSearchLogItems(items)
    });

    return items;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const isTimeout = error?.name === 'AbortError';
    logWarn('[AI Search] 请求失败', {
      message: error?.message || String(error),
      isTimeout,
      elapsed: `${elapsed}ms`
    });
    return [];
  } finally {
    clearTimeout(timer);
  }
};

const buildAiSearchContext = (items) => {
  logInfo('[AI Search] 构建上下文', { totalItems: items.length });

  const filtered = items
    .filter((item) =>
      typeof item.score === 'number' ? item.score >= AI_SEARCH_MIN_SCORE : true,
    )
    .slice(0, Math.max(0, AI_SEARCH_TOP_K || 0));

  logInfo('[AI Search] 过滤后结果', {
    filteredCount: filtered.length,
    minScore: AI_SEARCH_MIN_SCORE,
    topK: AI_SEARCH_TOP_K
  });

  if (!filtered.length) {
    logInfo('[AI Search] 无有效结果，跳过上下文增强');
    return '';
  }

  const blocks = filtered.map((item, index) => {
    const title = item.title ? truncateText(item.title, 80) : `文档${index + 1}`;
    const content = item.content
      ? truncateText(item.content, AI_SEARCH_MAX_ITEM_CHARS)
      : '';
    const url = item.url ? truncateText(item.url, 160) : '';
    const scoreText =
      AI_SEARCH_INCLUDE_SCORE && typeof item.score === 'number'
        ? `（相关度 ${item.score.toFixed(2)}）`
        : '';
    const lines = [`【${index + 1}】${title}${scoreText}`];
    if (content) lines.push(content);
    if (url) lines.push(`来源：${url}`);
    return lines.join('\n');
  });
  const text = `以下是与问题相关的参考资料（来自检索结果，仅供参考）：\n${blocks.join('\n\n')}`;
  const truncated = truncateText(text, AI_SEARCH_MAX_CONTEXT_CHARS);

  logInfo('[AI Search] 上下文构建完成', {
    contextLength: truncated.length,
    maxLength: AI_SEARCH_MAX_CONTEXT_CHARS,
    isTruncated: truncated.length < text.length
  });

  return truncated;
};

const buildAiSearchLogItems = (items) =>
  items.slice(0, 5).map((item) => ({
    title: truncateText(item.title || '', 80),
    score: typeof item.score === 'number' ? Number(item.score.toFixed(3)) : undefined,
    url: truncateText(item.url || '', 120),
    snippet: truncateText(item.content || '', 160),
  }));

const augmentQueryWithAiSearch = async (query) => {
  if (!query || !isAiSearchEnabled()) {
    logInfo('[AI Search] 查询增强跳过', { hasQuery: Boolean(query), enabled: isAiSearchEnabled() });
    return { query, context: '' };
  }

  logInfo('[AI Search] 开始查询增强', { originalQueryLength: query.length });

  const results = await fetchAiSearchResults(query);
  const context = buildAiSearchContext(results);

  if (!context) {
    logInfo('[AI Search] 无上下文，返回原始查询');
    return { query, context: '' };
  }

  const augmentedQuery = `${query}\n\n${context}`;
  logInfo('[AI Search] 查询增强完成', {
    originalLength: query.length,
    contextLength: context.length,
    augmentedLength: augmentedQuery.length,
    resultsUsed: results.length
  });

  return { query: augmentedQuery, context };
};

const formatBytes = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = index === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(decimals)}${units[index]}`;
};

const WORKFLOW_STATUS_LABELS = {
  init: '初始化',
  waiting: '等待中',
  executing: '执行中',
  finish: '完成',
  failed: '失败',
  timeout: '超时',
};

const formatWorkflowStatus = (status) => {
  if (!status) return '未知';
  return WORKFLOW_STATUS_LABELS[status] || status;
};

const buildWorkflowMemorySummary = (workflows) => {
  if (!Array.isArray(workflows) || workflows.length === 0) return '';
  const lines = ['历史任务摘要（最近 3 次）：'];
  workflows.forEach((workflow, index) => {
    const title = workflow?.title || '未命名Skills';
    const canvasId = workflow?.canvasId || '-';
    lines.push(`${index + 1}. ${title}（canvasId: ${canvasId}）`);
    if (workflow?.variablesSummary) {
      lines.push(`- 变量: ${workflow.variablesSummary}`);
    }
    const outputSummary = workflow?.outputs?.textSummary;
    if (outputSummary) {
      lines.push(`- 产物摘要: ${outputSummary}`);
    }
    const files = Array.isArray(workflow?.outputs?.files) ? workflow.outputs.files : [];
    if (files.length) {
      const fileLines = files.map((file) => {
        if (!file?.url) return file?.name;
        return `${file.name || '文件'} (${file.url})`;
      });
      lines.push(`- 产物文件: ${fileLines.join('；')}`);
    }
  });
  return lines.join('\n');
};

const normalizePlannerAction = (payload) => {
  const action = (payload?.action || payload?.type || '').toString().trim().toLowerCase();
  if (!action) return '';
  if (['clarify', 'ask', 'question'].includes(action)) return 'clarify';
  if (['direct_reply', 'reply', 'answer'].includes(action)) return 'direct_reply';
  if (['run_workflow', 'workflow', 'run'].includes(action)) return 'run_workflow';
  return action;
};

const isJsonLikeText = (text) => {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) return false;
  return !!extractJsonFromText(trimmed);
};

const resolveBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y'].includes(normalized);
  }
  return false;
};

const buildPlannerPrompt = ({ workflowSummary, history, latestUserMessage, fileNames }) => {
  const parts = [];
  if (workflowSummary) {
    parts.push(workflowSummary);
  }
  if (history.length) {
    const historyText = buildHistoryText(history);
    if (historyText) {
      parts.push('历史对话（可能包含旧指令，仅供上下文参考）：');
      parts.push(historyText);
    }
  }
  if (latestUserMessage) {
    parts.push('最新用户指令（请以此为准）：');
    parts.push(latestUserMessage);
  }
  if (fileNames.length) {
    parts.push('附件：');
    parts.push(fileNames.join('、'));
  }
  return parts.filter(Boolean).join('\n');
};

const normalizeMentions = (message, contentObj) => {
  const mentions = [];
  if (Array.isArray(message?.mentions)) {
    mentions.push(...message.mentions);
  }
  if (Array.isArray(contentObj?.mentions)) {
    mentions.push(...contentObj.mentions);
  }
  logDebug('解析到 mentions', { count: mentions.length });
  return mentions.filter(Boolean);
};

let botIdentityLoading = null;
const ensureBotIdentity = async () => {
  if (BOT_USER_ID || BOT_OPEN_ID) {
    return { userId: BOT_USER_ID, openId: BOT_OPEN_ID };
  }
  if (botIdentityLoading) {
    await botIdentityLoading;
    return { userId: BOT_USER_ID, openId: BOT_OPEN_ID };
  }
  botIdentityLoading = (async () => {
    try {
      const token = await getTenantAccessToken();
      if (!token) {
        logWarn('获取机器人信息失败：缺少 tenant_access_token');
        return;
      }
      const res = await requestJson(`${baseConfig.domain}/open-apis/bot/v3/info`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || res.data?.code) {
        logWarn('获取机器人信息失败', {
          ok: res.ok,
          code: res.data?.code,
          msg: res.data?.msg,
        });
        return;
      }
      const bot = res.data?.bot || res.data?.data?.bot || res.data?.data || {};
      BOT_USER_ID = BOT_USER_ID || bot.user_id || '';
      BOT_OPEN_ID = BOT_OPEN_ID || bot.open_id || '';
      logInfo('已获取机器人信息', {
        botUserId: BOT_USER_ID ? 'set' : '',
        botOpenId: BOT_OPEN_ID ? 'set' : '',
      });
    } catch (error) {
      logWarn('获取机器人信息失败', { error: formatErrorDetails(error) });
    }
  })();
  await botIdentityLoading;
  botIdentityLoading = null;
  return { userId: BOT_USER_ID, openId: BOT_OPEN_ID };
};

const shouldForceRunWorkflow = (replyText) => {
  if (!replyText) return false;
  const text = String(replyText);
  return /无法访问|无法直接访问|需要.*API|缺少.*工具|无法获取.*数据|需要.*权限/.test(text);
};

const isBotMentioned = (mentions) => {
  if (!mentions || mentions.length === 0) return false;
  if (!BOT_USER_ID && !BOT_OPEN_ID) {
    logWarn('未设置 BOT_USER_ID/BOT_OPEN_ID，无法判断 @ 目标，已忽略群聊消息');
    return false;
  }
  logDebug('检查 mention 匹配', {
    mentionCount: mentions.length,
    mentions: mentions.map(m => ({ userId: m?.id?.user_id, openId: m?.id?.open_id })),
    botUserId: BOT_USER_ID,
    botOpenId: BOT_OPEN_ID
  });
  const matched = mentions.some(
    (mention) =>
      mention?.id?.user_id === BOT_USER_ID || mention?.id?.open_id === BOT_OPEN_ID,
  );
  logDebug('匹配机器人 mention', { matched });
  return matched;
};

const stripMentions = (text, mentions) => {
  let result = text || '';
  if (Array.isArray(mentions)) {
    for (const mention of mentions) {
      if (mention?.key) {
        result = result.split(mention.key).join('');
      }
    }
  }
  result = result.replace(/<at[^>]*>.*?<\/at>/g, '');
  return result.replace(/\s+/g, ' ').trim();
};

const normalizeRequestText = (text) => {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim();
};

const buildUserKey = (sender, sessionKey) => {
  if (sender?.id) {
    const prefix = sender.idType || 'user';
    return `${prefix}:${sender.id}`;
  }
  return `session:${sessionKey}`;
};

const countActiveGenerations = (userKey) => {
  if (!userKey) return 0;
  let count = 0;
  for (const info of activeGenerations.values()) {
    if (info?.userKey === userKey) count += 1;
  }
  return count;
};

const countActiveRuns = (userKey) => {
  if (!userKey) return 0;
  let count = 0;
  for (const info of activeExecutions.values()) {
    if (info?.userKey !== userKey) continue;
    if (info?.stage === 'run') count += 1;
  }
  return count;
};

const buildConcurrencyLimitSummary = (limit, label) =>
  `已超过单个用户最大 ${limit} 个${label}并发限制，请稍后重试。`;

const isDuplicateRequest = ({ sessionKey, normalizedText }) => {
  if (!sessionKey || !normalizedText) return false;
  const pending = pendingRequests.get(sessionKey);
  if (pending) {
    const pendingText = normalizeRequestText(pending.inputParts.filter(Boolean).join('\n'));
    if (pendingText && pendingText === normalizedText) {
      return true;
    }
  }
  for (const info of activeExecutions.values()) {
    if (info?.sessionKey !== sessionKey) continue;
    if (info?.normalizedText && info.normalizedText === normalizedText) {
      return true;
    }
  }
  return false;
};

const resolveSender = (sender) => {
  if (sender?.sender_id?.open_id) {
    return { id: sender.sender_id.open_id, idType: 'open_id' };
  }
  if (sender?.sender_id?.user_id) {
    return { id: sender.sender_id.user_id, idType: 'user_id' };
  }
  return { id: '', idType: '' };
};

const isBotSender = (sender) => {
  if (!sender?.id) return false;
  if (BOT_OPEN_ID && sender.id === BOT_OPEN_ID) return true;
  if (BOT_USER_ID && sender.id === BOT_USER_ID) return true;
  return false;
};

const resolveOperator = (operator) => {
  if (operator?.user_id) {
    return { id: operator.user_id, idType: 'user_id' };
  }
  if (operator?.open_id) {
    return { id: operator.open_id, idType: 'open_id' };
  }
  return { id: '', idType: '' };
};

const buildMentionPrefix = (sender) => {
  if (!sender?.id) return '';
  if (sender.idType === 'open_id') {
    return `<at open_id=\"${sender.id}\"></at> `;
  }
  return `<at user_id=\"${sender.id}\"></at> `;
};

const buildCardMentionTag = (sender) => {
  if (!sender?.id) return '';
  return `<at id=\"${sender.id}\"></at>`;
};

const sendTextMessage = async ({ chatId, chatType, messageId, sender, text }) => {
  logDebug('发送文本消息', { chatId, chatType, messageId, text });
  const payload = {
    content: JSON.stringify({ text: `${buildMentionPrefix(sender)}${text}` }),
    msg_type: 'text',
  };

  if (chatType === 'p2p') {
    await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        ...payload,
      },
    });
    return;
  }

  await client.im.v1.message.reply({
    path: { message_id: messageId },
    data: payload,
  });
};

const formatTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const formatElapsed = (startedAt) => {
  if (!startedAt) return '';
  const diffMs = Math.max(0, Date.now() - startedAt);
  const totalSeconds = Math.floor(diffMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}秒`);
  return `耗时 ${parts.join('')}`;
};

const formatElapsedCompact = (ms) => {
  const diffMs = Math.max(0, Number(ms) || 0);
  if (diffMs < 1000) return `${diffMs}毫秒`;
  const totalSeconds = Math.floor(diffMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}秒`);
  return parts.join('');
};

const resolveProgressHeaderTemplate = (statusText, showInput) => {
  const text = `${statusText || ''}`;
  if (text.includes('失败') || text.includes('错误')) return 'red';
  if (text.includes('超时')) return 'orange';
  if (text.includes('完成')) return 'green';
  if (showInput || text.includes('等待') || text.includes('澄清')) return 'yellow';
  return 'blue';
};

const resolveProgressTitle = (title, statusText, stageText) => {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  const isPlaceholder = !trimmed || trimmed === '进度更新';
  const fallback = statusText || stageText || '进度更新';
  const candidate = isPlaceholder ? fallback : trimmed;
  return truncateText(candidate, 24);
};

const buildProgressFooter = (requestId) => {
  const suffix = PROGRESS_SHOW_ID ? `  ·  ID：${requestId || '-'}` : '';
  return `<font color='grey'>更新：${formatTimestamp()}${suffix}</font>`;
};

const splitOutputLines = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const appendRecentLines = (existing, incoming, limit) => {
  const base = Array.isArray(existing) ? existing : [];
  const next = [...base, ...incoming].filter(Boolean);
  const max = Number.isFinite(limit) && limit > 0 ? limit : 6;
  return next.slice(-max);
};

const formatOutputSnippet = (line, max = 120) => {
  const trimmed = typeof line === 'string' ? line.trim() : '';
  if (!trimmed) return '';
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

const truncateOutputBlock = (text, max = 400) => {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return '';
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max);
};

const updateNodeOutputCache = (map, key, title, text) => {
  if (!(map instanceof Map) || !key || !text) return;
  const incoming = splitOutputLines(text);
  if (!incoming.length) return;
  const existing = map.get(key);
  const lines = appendRecentLines(existing?.lines, incoming, PROGRESS_OUTPUT_LINES);
  map.set(key, {
    title: title || existing?.title || key,
    lines,
    timestamp: Date.now(),
  });
};

const buildCardHeaderTitle = (title, fallback) => {
  const base = title || fallback || '';
  if (!CARD_HEADER_BADGE) return base;
  return `${base} · ${CARD_HEADER_BADGE}`;
};

const buildProgressOverviewValue = (summaryText) => {
  if (!summaryText) return '-';
  const lines = String(summaryText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return '-';
  return truncateText(lines[0], 24);
};

const buildArtifactsOverviewValue = (metrics) => {
  if (!metrics || metrics.summary === '无产物') return '无产物';
  return truncateText(metrics.summary || '', 24) || '无产物';
};

const buildProgressCardContent = ({
  title,
  statusText,
  stageText,
  etaText,
  summaryText,
  requestId,
  showInput,
  showAbort,
  showRetry,
  retryAction,
  retryLabel,
  inputPlaceholder,
  latestInput,
}) => {
  const summary = summaryText || '-';
  const normalizedLatestInput = typeof latestInput === 'string' ? latestInput.trim() : '';
  const overviewValue = buildProgressOverviewValue(summaryText);
  const latestInputText = normalizedLatestInput ? truncateText(normalizedLatestInput, 200) : '';
  const guidanceLines = [];
  if (showInput) {
    guidanceLines.push(
      inputPlaceholder ? `${inputPlaceholder}（支持直接回复本会话）` : '请在下方输入框提交补充，或直接回复本会话。',
    );
  }
  if (showAbort) {
    guidanceLines.push('如需中止，可点击“中止任务”或发送“取消”。');
  }

  const elements = [
    {
      tag: 'column_set',
      flex_mode: 'stretch',
      horizontal_spacing: '8px',
      horizontal_align: 'left',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          background_style: 'blue-50',
          elements: [
            {
              tag: 'markdown',
              content: `**<font color='blue'>状态</font>**\n${statusText || '-'}`,
              text_align: 'center',
              text_size: 'normal_v2',
            },
          ],
          padding: '8px 8px 8px 8px',
          vertical_spacing: '8px',
          horizontal_align: 'left',
          vertical_align: 'top',
          weight: 1,
        },
        {
          tag: 'column',
          width: 'weighted',
          background_style: 'violet-50',
          elements: [
            {
              tag: 'markdown',
              content: `**<font color='violet'>时间</font>**\n${etaText || '-'}`,
              text_align: 'center',
              text_size: 'normal_v2',
            },
          ],
          padding: '8px 8px 8px 8px',
          vertical_spacing: '8px',
          horizontal_align: 'left',
          vertical_align: 'top',
          weight: 1,
        },
        {
          tag: 'column',
          width: 'weighted',
          background_style: 'purple-50',
          elements: [
            {
              tag: 'markdown',
              content: `**<font color='purple'>概览</font>**\n${overviewValue || '-'}`,
              text_align: 'center',
              text_size: 'normal_v2',
            },
          ],
          padding: '8px 8px 8px 8px',
          vertical_spacing: '8px',
          horizontal_align: 'left',
          vertical_align: 'top',
          weight: 1,
        },
      ],
      margin: '0px 0px 8px 0px',
    },
    { tag: 'hr', margin: '0px 0px 8px 0px' },
    {
      tag: 'markdown',
      content: `**进度摘要**\n${summary}`,
      text_align: 'left',
      text_size: 'normal_v2',
      margin: '0px 0px 0px 0px',
    },
    ...(latestInputText
      ? [
          {
            tag: 'markdown',
            content: `**已补充**\n${latestInputText}`,
            text_align: 'left',
            text_size: 'normal_v2',
            margin: '0px 0px 0px 0px',
          },
        ]
      : []),
    ...(guidanceLines.length
      ? [
          {
            tag: 'markdown',
            content: `**操作提示**\n${guidanceLines.map((line) => `- ${line}`).join('\n')}`,
            text_align: 'left',
            text_size: 'normal_v2',
            margin: '0px 0px 0px 0px',
          },
        ]
      : []),
  ];

  if (showInput) {
    elements.push({
      tag: 'form',
      name: 'clarify_form',
      margin: '8px 0px 0px 0px',
      elements: [
        {
          tag: 'input',
          element_id: CARD_INPUT_NAME,
          name: CARD_INPUT_NAME,
          required: false,
          input_type: 'multiline_text',
          rows: 2,
          auto_resize: true,
          max_rows: 6,
          max_length: 1000,
          placeholder: {
            tag: 'plain_text',
            content: inputPlaceholder || '请补充需求',
          },
          width: 'fill',
        },
        {
          tag: 'column_set',
          flex_mode: 'none',
          background_style: 'default',
          horizontal_spacing: '8px',
          columns: [
            {
              tag: 'column',
              width: 'auto',
              vertical_align: 'top',
              elements: [
                {
                  tag: 'button',
                  text: { tag: 'plain_text', content: '提交补充' },
                  type: 'primary',
                  action_type: 'form_submit',
                  value: { action: 'clarify_submit', source: 'refly_progress' },
                  name: 'clarify_submit',
                },
              ],
            },
          ],
          margin: '0px',
        },
      ],
    });
  }

  if (showAbort) {
    elements.push({
      tag: 'button',
      text: { tag: 'plain_text', content: '中止任务' },
      type: 'danger',
      behaviors: [
        {
          type: 'callback',
          value: { action: CARD_ABORT_ACTION, source: 'refly_progress' },
        },
      ],
      name: 'abort_button',
      margin: '8px 0px 0px 0px',
    });
  }

  if (showRetry) {
    elements.push({
      tag: 'button',
      text: { tag: 'plain_text', content: retryLabel || '重试' },
      type: 'primary',
      behaviors: [
        {
          type: 'callback',
          value: { action: retryAction || CARD_RETRY_GENERATE_ACTION, source: 'refly_progress' },
        },
      ],
      name: 'retry_button',
      margin: '8px 0px 0px 0px',
    });
  }

  elements.push({
    tag: 'markdown',
    content: buildProgressFooter(requestId),
    text_align: 'left',
    text_size: 'normal',
    margin: '0px 0px 0px 0px',
  });

  return JSON.stringify({
    schema: '2.0',
    config: {
      update_multi: true,
      wide_screen_mode: true,
      style: {
        text_size: {
          normal_v2: { default: 'normal', pc: 'normal', mobile: 'heading' },
        },
      },
    },
    body: {
      direction: 'vertical',
      padding: '12px 12px 12px 12px',
      elements,
    },
    header: {
      title: { tag: 'plain_text', content: buildCardHeaderTitle(title, '进度更新') },
      subtitle: { tag: 'plain_text', content: '' },
      template: resolveProgressHeaderTemplate(statusText, showInput),
      padding: '12px 8px 12px 8px',
    },
  });
};

const buildArtifactCountLine = (group) => {
  if (!group) return '';
  const parts = [];
  const textCount = Array.isArray(group.texts) ? group.texts.length : 0;
  const imageCount = Array.isArray(group.images) ? group.images.length : 0;
  const fileCount = Array.isArray(group.files) ? group.files.length : 0;
  if (textCount) parts.push(`${textCount}条文本`);
  if (imageCount) parts.push(`${imageCount}张图片`);
  if (fileCount) parts.push(`${fileCount}个文件`);
  return parts.join(' · ');
};

const buildArtifactsMetrics = (artifactGroups) => {
  const metrics = { nodeCount: 0, textCount: 0, imageCount: 0, fileCount: 0, summary: '' };
  if (!Array.isArray(artifactGroups) || artifactGroups.length === 0) {
    metrics.summary = '无产物';
    return metrics;
  }
  metrics.nodeCount = artifactGroups.length;
  for (const group of artifactGroups) {
    metrics.textCount += Array.isArray(group?.texts) ? group.texts.length : 0;
    metrics.imageCount += Array.isArray(group?.images) ? group.images.length : 0;
    metrics.fileCount += Array.isArray(group?.files) ? group.files.length : 0;
  }
  const parts = [];
  if (metrics.textCount) parts.push(`${metrics.textCount}条文本`);
  if (metrics.imageCount) parts.push(`${metrics.imageCount}张图片`);
  if (metrics.fileCount) parts.push(`${metrics.fileCount}个文件`);
  metrics.summary = parts.length ? parts.join(' · ') : '无产物';
  return metrics;
};

const buildArtifactsOriginBlock = ({ sender, originText }) => {
  const mentionTag = buildCardMentionTag(sender);
  const userLabel = mentionTag ? `${mentionTag} ` : '用户 ';
  const trimmedText =
    originText && typeof originText === 'string' ? originText.trim() : '';
  const contentText = trimmedText ? truncateCardText(trimmedText, 200) : '（仅附件或无文本）';
  return {
    tag: 'markdown',
    content: `**来源**\n${userLabel}原始消息：${contentText}`,
    text_align: 'left',
    text_size: 'normal_v2',
    margin: '0px 0px 8px 0px',
  };
};

const buildArtifactFileLines = (files, images) => {
  const lines = [];
  const imageFallbacks = Array.isArray(images)
    ? images.filter((image) => !image?.imageKey || image?.skipReason)
    : [];

  for (const image of imageFallbacks) {
    const name = image?.name || '图片';
    const sizeText = formatBytes(image?.size);
    const reason =
      image?.skipReason === 'limit'
        ? '超出展示上限'
        : image?.skipReason === 'too_large'
          ? '文件过大'
          : image?.skipReason === 'upload_failed'
            ? '预览失败'
            : image?.skipReason === 'no_url'
              ? '无链接'
              : '';
    const metaParts = [];
    if (sizeText) metaParts.push(sizeText);
    if (reason) metaParts.push(reason);
    const meta = metaParts.length ? `（${metaParts.join(' · ')}）` : '';
    if (image?.url) {
      lines.push(`- 🖼️ [${name}](${image.url})${meta}`);
    } else {
      lines.push(`- 🖼️ ${name}${meta}`);
    }
  }

  if (Array.isArray(files)) {
    for (const file of files) {
      const name = file?.name || '文件';
      const sizeText = formatBytes(file?.size);
      const meta = sizeText ? `（${sizeText}）` : '';
      if (file?.url) {
        lines.push(`- 📎 [${name}](${file.url})${meta}`);
      } else {
        lines.push(`- 📎 ${name}${meta}`);
      }
    }
  }

  const limit = Number.isFinite(MAX_CARD_FILES) && MAX_CARD_FILES > 0 ? MAX_CARD_FILES : 30;
  if (lines.length > limit) {
    const hidden = lines.length - limit;
    return [...lines.slice(0, limit), `- ... 还有 ${hidden} 个文件未展开`];
  }
  return lines;
};

const buildImageLabel = (name) => ({
  tag: 'markdown',
  content: `<font color='grey'>${truncateText(name || '图片', 40)}：</font>`,
  text_align: 'left',
  text_size: 'normal',
  margin: '0px 0px 4px 0px',
});

const buildImageGrid = (images) => {
  const elements = [];
  const validImages = Array.isArray(images) ? images.filter((img) => img?.imageKey) : [];

  if (validImages.length === 0) return elements;

  if (validImages.length === 1) {
    const img = validImages[0];
    elements.push(buildImageLabel(img?.name));
    elements.push({
      tag: 'img',
      img_key: img.imageKey,
      alt: { tag: 'plain_text', content: img?.name || '图片' },
      mode: 'fit_horizontal',
      preview: true,
      custom_width: 320,
      margin: '0px 0px 8px 0px',
    });
    return elements;
  }

  for (let i = 0; i < validImages.length; i += 2) {
    const leftImg = validImages[i];
    const rightImg = validImages[i + 1];

    const columns = [
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [
          buildImageLabel(leftImg?.name),
          {
            tag: 'img',
            img_key: leftImg.imageKey,
            alt: { tag: 'plain_text', content: leftImg?.name || '图片' },
            mode: 'crop_center',
            preview: true,
            custom_width: 150,
          },
        ],
      },
    ];

    if (rightImg) {
      columns.push({
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [
          buildImageLabel(rightImg?.name),
          {
            tag: 'img',
            img_key: rightImg.imageKey,
            alt: { tag: 'plain_text', content: rightImg?.name || '图片' },
            mode: 'crop_center',
            preview: true,
            custom_width: 150,
          },
        ],
      });
    }

    elements.push({
      tag: 'column_set',
      flex_mode: 'stretch',
      horizontal_spacing: '8px',
      columns,
      margin: '0px 0px 8px 0px',
    });
  }

  return elements;
};

const buildArtifactsCardContent = ({
  title,
  artifactGroups,
  statusText,
  etaText,
  requestId,
  sender,
  originText,
}) => {
  const groups = Array.isArray(artifactGroups) ? artifactGroups : [];
  const metrics = buildArtifactsMetrics(groups);
  const elements = [];

  elements.push({
    tag: 'column_set',
    flex_mode: 'stretch',
    horizontal_spacing: '8px',
    columns: [
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        background_style: 'green-50',
        padding: '8px 8px 8px 8px',
        elements: [
          {
            tag: 'markdown',
            content: `**<font color='green'>状态</font>**\n${statusText || '完成'}`,
            text_align: 'center',
            text_size: 'normal_v2',
          },
        ],
      },
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        background_style: 'blue-50',
        padding: '8px 8px 8px 8px',
        elements: [
          {
            tag: 'markdown',
            content: `**<font color='blue'>耗时</font>**\n${etaText || '-'}`,
            text_align: 'center',
            text_size: 'normal_v2',
          },
        ],
      },
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        background_style: 'grey-50',
        padding: '8px 8px 8px 8px',
        elements: [
            {
              tag: 'markdown',
              content: `**<font color='grey'>概览</font>**\n${buildArtifactsOverviewValue(metrics)}`,
              text_align: 'center',
              text_size: 'normal_v2',
            },
        ],
      },
    ],
    margin: '0px 0px 8px 0px',
  });

  elements.push({ tag: 'hr', margin: '0px 0px 8px 0px' });

  const overviewParts = [];
  if (metrics.nodeCount) overviewParts.push(`${metrics.nodeCount}个步骤`);
  if (metrics.summary && metrics.summary !== '无产物') overviewParts.push(metrics.summary);
  // 顶部已有概览栏，避免重复展示

  // 群聊已用回复引用原消息，不再重复展示来源信息

  if (!groups.length) {
    elements.push({
      tag: 'markdown',
      content: `<font color='grey'>本次执行未产出可展示内容。</font>`,
      text_align: 'left',
      text_size: 'normal_v2',
      margin: '0px 0px 12px 0px',
    });
    elements.push({
      tag: 'markdown',
      content: buildProgressFooter(requestId),
      text_align: 'left',
      text_size: 'normal',
      margin: '0px 0px 0px 0px',
    });
    return JSON.stringify({
      schema: '2.0',
      config: {
        update_multi: true,
        wide_screen_mode: true,
        style: {
          text_size: {
            normal_v2: { default: 'normal', pc: 'normal', mobile: 'heading' },
          },
        },
      },
      body: {
        direction: 'vertical',
        padding: '12px 12px 12px 12px',
        elements,
      },
      header: {
        title: { tag: 'plain_text', content: buildCardHeaderTitle(title, '执行完成') },
        subtitle: { tag: 'plain_text', content: '' },
        template: resolveProgressHeaderTemplate(statusText, false),
        padding: '12px 8px 12px 8px',
      },
    });
  }

  if (metrics.imageCount) {
    elements.push({
      tag: 'markdown',
      content: `<font color='grey'>提示：图片支持点击放大预览。</font>`,
      text_align: 'left',
      text_size: 'normal',
      margin: '0px 0px 8px 0px',
    });
  }

  groups.forEach((group, index) => {
    const countLine = buildArtifactCountLine(group);
    const titleLine = countLine
      ? `**🎯 ${group.title}**\n<font color='grey'>${countLine}</font>`
      : `**🎯 ${group.title}**`;
    elements.push({
      tag: 'markdown',
      content: titleLine,
      text_align: 'left',
      text_size: 'heading',
      margin: '0px 0px 8px 0px',
    });

    if (Array.isArray(group.texts) && group.texts.length > 0) {
      const latestText = [...group.texts].reverse().find((text) => text && text.trim());
      const textContent = latestText || '';
      elements.push({
        tag: 'column_set',
        flex_mode: 'stretch',
        horizontal_spacing: '0px',
        columns: [
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            background_style: 'grey-50',
            padding: '12px 12px 12px 12px',
            elements: [
              {
                tag: 'markdown',
                content: textContent,
                text_align: 'left',
                text_size: 'normal',
              },
            ],
          },
        ],
        margin: '0px 0px 8px 0px',
      });
    }

    if (Array.isArray(group.images) && group.images.length > 0) {
      elements.push(...buildImageGrid(group.images));
    }

    const fileLines = buildArtifactFileLines(group.files, group.images);
    if (fileLines.length) {
      elements.push({
        tag: 'markdown',
        content: `**📎 文件**\n${fileLines.join('\n')}`,
        text_align: 'left',
        text_size: 'normal',
        margin: '0px 0px 8px 0px',
      });
    }

    if (index < groups.length - 1) {
      elements.push({ tag: 'hr', margin: '8px 0px 12px 0px' });
    }
  });

  // 艾特原用户
  if (sender?.id) {
    elements.push({
      tag: 'markdown',
      content: `${buildCardMentionTag(sender)} 你的 Skills 已执行完成`,
      text_align: 'left',
      text_size: 'normal',
      margin: '8px 0px 8px 0px',
    });
  }

  elements.push({
    tag: 'markdown',
    content: buildProgressFooter(requestId),
    text_align: 'left',
    text_size: 'normal',
    margin: '0px 0px 0px 0px',
  });

  return JSON.stringify({
    schema: '2.0',
    config: {
      update_multi: true,
      wide_screen_mode: true,
      style: {
        text_size: {
          normal_v2: { default: 'normal', pc: 'normal', mobile: 'heading' },
        },
      },
    },
    body: {
      direction: 'vertical',
      padding: '12px 12px 12px 12px',
      elements,
    },
    header: {
      title: { tag: 'plain_text', content: buildCardHeaderTitle(title, '执行完成') },
      subtitle: { tag: 'plain_text', content: '' },
      template: resolveProgressHeaderTemplate(statusText, false),
      padding: '12px 8px 12px 8px',
    },
  });
};

const buildProgressCardData = (options) => {
  const content = buildProgressCardContent(options);
  return safeJsonParse(content);
};

const buildDirectReplyCardContent = ({ title, text }) =>
  JSON.stringify({
    schema: '2.0',
    config: {
      update_multi: true,
      wide_screen_mode: true,
      style: {
        text_size: {
          normal_v2: { default: 'normal', pc: 'normal', mobile: 'heading' },
        },
      },
    },
    body: {
      direction: 'vertical',
      padding: '12px 12px 12px 12px',
      elements: [
        {
          tag: 'markdown',
          content: text || '-',
          text_align: 'left',
          text_size: 'normal_v2',
          margin: '0px 0px 0px 0px',
        },
      ],
    },
    header: {
      title: { tag: 'plain_text', content: buildCardHeaderTitle(title, '回复') },
      subtitle: { tag: 'plain_text', content: '' },
      template: 'blue',
      padding: '12px 8px 12px 8px',
    },
  });

const buildProgressPostContent = ({
  title,
  statusText,
  stageText,
  etaText,
  summaryText,
  requestId,
  showInput,
  showAbort,
  showRetry,
  retryAction,
  retryLabel,
  inputPlaceholder,
  latestInput,
}) => {
  const normalizedLatestInput = typeof latestInput === 'string' ? latestInput.trim() : '';
  return {
    zh_cn: {
      title: title ?? '进度更新',
      content: [
        [{ tag: 'text', text: `状态：${statusText ?? '-'}` }],
        [{ tag: 'text', text: `预计：${etaText ?? '-'}` }],
        [{ tag: 'text', text: summaryText ?? '-' }],
        ...(normalizedLatestInput
          ? [[{ tag: 'text', text: `已补充：${truncateText(normalizedLatestInput, 200)}` }]]
          : []),
        ...(showInput || showAbort
          ? [
              [
                {
                  tag: 'text',
                  text: `操作提示：${[
                    showInput ? inputPlaceholder || '请直接回复本会话补充需求。' : '',
                    showAbort ? '发送“取消”可中止任务。' : '',
                  ]
                    .filter(Boolean)
                    .join('；')}`,
                },
              ],
            ]
          : []),
        [
          {
            tag: 'text',
            text: PROGRESS_SHOW_ID
              ? `更新：${formatTimestamp()}  ID：${requestId ?? '-'}`
              : `更新：${formatTimestamp()}`,
          },
        ],
      ],
    },
  };
};

const buildProgressSignature = ({
  title,
  statusText,
  stageText,
  etaText,
  summaryText,
  showInput,
  showAbort,
  showRetry,
  retryAction,
  retryLabel,
  inputPlaceholder,
  latestInput,
}) =>
  [
    title,
    statusText,
    stageText,
    etaText,
    summaryText,
    showInput,
    showAbort,
    showRetry,
    retryAction,
    retryLabel,
    inputPlaceholder,
    latestInput,
  ]
    .map((value) => value ?? '')
    .join('|');

const deleteProgressMessage = async (requestKey) => {
  if (!requestKey) return;
  const state = progressStates.get(requestKey);
  if (!state?.messageId) return;
  try {
    await client.im.v1.message.delete({ path: { message_id: state.messageId } });
    progressStates.delete(requestKey);
  } catch (error) {
    logWarn('撤回进度消息失败', {
      error: formatErrorDetails(error),
      requestKey,
      messageId: state.messageId,
    });
  }
};

const sendProgressPostMessage = async ({
  chatId,
  chatType,
  messageId,
  title,
  statusText,
  stageText,
  etaText,
  summaryText,
  requestId,
  showInput,
  showAbort,
  showRetry,
  retryAction,
  retryLabel,
  inputPlaceholder,
  latestInput,
  existingMessageId,
}) => {
  const content = buildProgressPostContent({
    title,
    statusText,
    stageText,
    etaText,
    summaryText,
    requestId,
    showInput,
    showAbort,
    showRetry,
    retryAction,
    retryLabel,
    inputPlaceholder,
    latestInput,
  });
  const payload = {
    msg_type: 'post',
    content: JSON.stringify(content),
  };

  if (existingMessageId) {
    const res = await client.im.v1.message.update({
      path: { message_id: existingMessageId },
      data: payload,
    });
    return res?.data?.message_id ?? existingMessageId;
  }

  if (chatType === 'p2p') {
    const res = await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        ...payload,
      },
    });
    return res?.data?.message_id;
  }

  const res = await client.im.v1.message.reply({
    path: { message_id: messageId },
    data: payload,
  });
  return res?.data?.message_id;
};

const sendProgressCard = async ({
  chatId,
  chatType,
  messageId,
  sender,
  requestKey,
  title,
  statusText,
  stageText,
  etaText,
  summaryText,
  showInput,
  showAbort,
  showRetry,
  retryAction,
  retryLabel,
  inputPlaceholder,
  latestInput,
  forceInput,
  lockInput,
  autoDelete,
}) => {
  const fallbackText = summaryText || statusText || '处理中...';
  const state = progressStates.get(requestKey);
  const titleSource = title && title !== '进度更新' ? title : state?.title ?? title;
  const resolvedTitle = resolveProgressTitle(titleSource, statusText, stageText);
  const resolvedLatestInput = latestInput ?? state?.latestInput;
  const startedAt = state?.startedAt ?? Date.now();
  const elapsedText = formatElapsed(startedAt);
  const resolvedEtaText = elapsedText || etaText;
  const isLocked = progressInputLocks.has(requestKey) || state?.inputLocked;
  const allowInput = forceInput ? true : Boolean(showInput) && !isLocked;
  const resolvedAutoDelete = autoDelete ?? state?.autoDelete;
  const signature = buildProgressSignature({
    title: resolvedTitle,
    statusText,
    stageText,
    etaText: resolvedEtaText,
    summaryText: summaryText ?? fallbackText,
    showInput: allowInput,
    showAbort,
    showRetry,
    retryAction,
    retryLabel,
    inputPlaceholder,
    latestInput: resolvedLatestInput,
  });
  if (!requestKey) {
    await sendTextMessage({ chatId, chatType, messageId, sender, text: fallbackText });
    return;
  }

  if (state?.lastSignature === signature) {
    return;
  }
  if (state?.mode === 'post') {
    try {
      const newId = await sendProgressPostMessage({
        chatId,
        chatType,
        messageId,
        title: resolvedTitle,
        statusText,
        stageText,
        etaText: resolvedEtaText,
        summaryText,
      requestId: requestKey,
      showInput: allowInput,
      showAbort,
      showRetry,
      retryAction,
      retryLabel,
      inputPlaceholder,
      latestInput: resolvedLatestInput,
      existingMessageId: state.messageId,
    });
      if (newId) {
        const nextLocked = forceInput ? false : lockInput ? true : state?.inputLocked;
        if (forceInput) {
          progressInputLocks.delete(requestKey);
        } else if (lockInput) {
          progressInputLocks.add(requestKey);
        }
        progressStates.set(requestKey, {
          mode: 'post',
          messageId: newId,
          lastSignature: signature,
          title: resolvedTitle,
          latestInput: resolvedLatestInput,
          inputLocked: nextLocked,
          autoDelete: resolvedAutoDelete,
          startedAt,
        });
        return;
      }
    } catch (error) {
      logWarn('更新进度富文本失败', { error: formatErrorDetails(error), requestKey });
    }
    await sendTextMessage({ chatId, chatType, messageId, sender, text: fallbackText });
    return;
  }

  const cardContent = buildProgressCardContent({
    title: resolvedTitle,
    statusText,
    stageText,
    etaText: resolvedEtaText,
    summaryText,
    requestId: requestKey,
    showInput: allowInput,
    showAbort,
    showRetry,
    retryAction,
    retryLabel,
    inputPlaceholder,
    latestInput: resolvedLatestInput,
  });

  try {
    const existingMessageId = state?.mode === 'card' ? state.messageId : null;
    if (existingMessageId) {
      try {
        await client.im.v1.message.patch({
          path: { message_id: existingMessageId },
          data: {
            content: cardContent,
          },
        });
        return;
      } catch (error) {
        logWarn('更新进度卡片失败，准备重建', {
          error: formatErrorDetails(error),
          requestKey,
          messageId: existingMessageId,
        });
        progressStates.delete(requestKey);
      }
    }

    if (!existingMessageId) {
      let res = null;
      if (chatType !== 'p2p' && messageId) {
        res = await client.im.v1.message.reply({
          path: { message_id: messageId },
          data: {
            msg_type: 'interactive',
            content: cardContent,
          },
        });
      } else {
        res = await client.im.v1.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            msg_type: 'interactive',
            content: cardContent,
          },
        });
      }
      const newMessageId = res?.data?.message_id;
      if (newMessageId) {
        const nextLocked = forceInput ? false : lockInput ? true : state?.inputLocked;
        if (forceInput) {
          progressInputLocks.delete(requestKey);
        } else if (lockInput) {
          progressInputLocks.add(requestKey);
        }
        progressStates.set(requestKey, {
          mode: 'card',
          messageId: newMessageId,
          lastSignature: signature,
          title: resolvedTitle,
          latestInput: resolvedLatestInput,
          inputLocked: nextLocked,
          autoDelete: resolvedAutoDelete,
          startedAt,
        });
        return;
      }
      logWarn('进度卡片未返回 message_id', {
        requestKey,
        response: res?.data ?? null,
      });
    }
  } catch (error) {
    logWarn('发送进度卡片失败', {
      error: formatErrorDetails(error),
      requestKey,
    });
  }

  try {
    const newId = await sendProgressPostMessage({
      chatId,
      chatType,
      messageId,
      title: resolvedTitle,
      statusText,
      stageText,
      etaText: resolvedEtaText,
      summaryText: summaryText ?? fallbackText,
      requestId: requestKey,
      showInput: allowInput,
      showAbort,
      showRetry,
      retryAction,
      retryLabel,
      inputPlaceholder,
      latestInput: resolvedLatestInput,
      existingMessageId: null,
    });
    if (newId) {
      const nextLocked = forceInput ? false : lockInput ? true : state?.inputLocked;
      if (forceInput) {
        progressInputLocks.delete(requestKey);
      } else if (lockInput) {
        progressInputLocks.add(requestKey);
      }
      progressStates.set(requestKey, {
        mode: 'post',
        messageId: newId,
        lastSignature: signature,
        title: resolvedTitle,
        latestInput: resolvedLatestInput,
        inputLocked: nextLocked,
        autoDelete: resolvedAutoDelete,
        startedAt,
      });
      return;
    }
  } catch (error) {
    logWarn('发送进度富文本失败', { error: formatErrorDetails(error), requestKey });
  }

  progressStates.set(requestKey, {
    mode: 'text',
    lastSignature: signature,
    title: resolvedTitle,
    latestInput: resolvedLatestInput,
    inputLocked: forceInput ? false : lockInput ? true : state?.inputLocked,
    autoDelete: resolvedAutoDelete,
    startedAt,
  });
  if (forceInput) {
    progressInputLocks.delete(requestKey);
  } else if (lockInput) {
    progressInputLocks.add(requestKey);
  }
  await sendTextMessage({ chatId, chatType, messageId, sender, text: fallbackText });
};

const sendArtifactsCard = async ({
  chatId,
  chatType,
  messageId,
  sender,
  requestKey,
  title,
  cardContent,
  fallbackText,
}) => {
  if (!cardContent) {
    if (fallbackText) {
      await sendTextMessage({ chatId, chatType, messageId, sender, text: fallbackText });
    }
    return false;
  }
  if (!requestKey) {
    if (fallbackText) {
      await sendTextMessage({ chatId, chatType, messageId, sender, text: fallbackText });
    }
    return false;
  }

  const state = progressStates.get(requestKey);
  const signature = `artifacts|${cardContent}`;
  if (state?.lastSignature === signature) return true;

  if (state?.mode === 'card' && state?.messageId) {
    try {
      await client.im.v1.message.patch({
        path: { message_id: state.messageId },
        data: { content: cardContent },
      });
      progressStates.set(requestKey, {
        mode: 'card',
        messageId: state.messageId,
        lastSignature: signature,
        title: title || state?.title || '执行完成',
        autoDelete: false,
        startedAt: state?.startedAt ?? Date.now(),
      });
      return true;
    } catch (error) {
      logWarn('更新产物卡片失败，准备重建', {
        error: formatErrorDetails(error),
        requestKey,
        messageId: state.messageId,
      });
    }
  }

  try {
    let res = null;
    if (chatType !== 'p2p' && messageId) {
      res = await client.im.v1.message.reply({
        path: { message_id: messageId },
        data: { msg_type: 'interactive', content: cardContent },
      });
    } else {
      res = await client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, msg_type: 'interactive', content: cardContent },
      });
    }
    const newMessageId = res?.data?.message_id;
    if (newMessageId) {
      progressStates.set(requestKey, {
        mode: 'card',
        messageId: newMessageId,
        lastSignature: signature,
        title: title || '执行完成',
        autoDelete: false,
        startedAt: state?.startedAt ?? Date.now(),
      });
      return true;
    }
  } catch (error) {
    logWarn('发送产物卡片失败', { error: formatErrorDetails(error), requestKey });
  }

  if (fallbackText) {
    await sendTextMessage({ chatId, chatType, messageId, sender, text: fallbackText });
  }
  return false;
};

const sendDirectReplyCard = async ({ chatId, chatType, messageId, sender, requestKey, text }) => {
  const replyText = text || '已收到。';
  const cardContent = buildDirectReplyCardContent({ title: '回复', text: replyText });
  if (!requestKey) {
    await sendTextMessage({ chatId, chatType, messageId, sender, text: replyText });
    return;
  }

  const state = progressStates.get(requestKey);
  const signature = `reply|${replyText}`;
  if (state?.lastSignature === signature) return;

  try {
    const existingMessageId = state?.messageId;
    if (existingMessageId) {
      await client.im.v1.message.patch({
        path: { message_id: existingMessageId },
        data: { content: cardContent },
      });
      progressStates.set(requestKey, {
        mode: 'card',
        messageId: existingMessageId,
        lastSignature: signature,
        title: '回复',
        autoDelete: false,
      });
      return;
    }
  } catch (error) {
    logWarn('更新回复卡片失败', { error: formatErrorDetails(error), requestKey });
  }

  try {
    const res = await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: { receive_id: chatId, msg_type: 'interactive', content: cardContent },
    });
    const newMessageId = res?.data?.message_id;
    if (newMessageId) {
      progressStates.set(requestKey, {
        mode: 'card',
        messageId: newMessageId,
        lastSignature: signature,
        title: '回复',
        autoDelete: false,
      });
      return;
    }
  } catch (error) {
    logWarn('发送回复卡片失败', { error: formatErrorDetails(error), requestKey });
  }

  await sendTextMessage({ chatId, chatType, messageId, sender, text: replyText });
};

const buildHeaders = () => ({
  Authorization: `Bearer ${API_KEY}`,
});

const requestJson = async (url, options) => {
  logDebug('请求 API', { url, method: options?.method ?? 'GET' });
  const res = await fetch(url, options);
  const text = await res.text();
  if (!text) return { ok: res.ok, data: null };
  let data;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    const message = text.slice(0, 300);
    logWarn('响应不是 JSON', {
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      message,
    });
    return {
      ok: false,
      data: {
        message,
        status: res.status,
        contentType: res.headers.get('content-type') || '',
      },
    };
  }
  return { ok: res.ok, data };
};

const extractAttachment = (messageType, contentObj, messageId) => {
  if (!contentObj || typeof contentObj !== 'object') return [];
  const list = [];
  const pushItem = (fileKey, fileName, fileSize, resourceType) => {
    if (!fileKey) return;
    list.push({ messageId, fileKey, fileName, fileSize, resourceType });
  };

  switch (messageType) {
    case 'file':
      pushItem(contentObj.file_key, contentObj.file_name, Number(contentObj.file_size), 'file');
      break;
    case 'image':
      pushItem(contentObj.image_key ?? contentObj.file_key, contentObj.file_name, undefined, 'image');
      break;
    case 'audio':
      pushItem(contentObj.file_key ?? contentObj.audio_key, contentObj.file_name, undefined, 'audio');
      break;
    case 'video':
      pushItem(contentObj.file_key ?? contentObj.video_key, contentObj.file_name, undefined, 'video');
      break;
    default:
      break;
  }

  if (Array.isArray(contentObj.file_keys)) {
    for (const fileKey of contentObj.file_keys) {
      pushItem(fileKey, contentObj.file_name, contentObj.file_size, 'file');
    }
  }

  return list;
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const downloadLarkResource = async ({ messageId, fileKey, resourceType }) => {
  logInfo('下载飞书附件', { messageId, fileKey, resourceType });
  const resource = await client.im.messageResource.get({
    params: { type: resourceType },
    path: { message_id: messageId, file_key: fileKey },
  });
  const stream = resource.getReadableStream();
  return streamToBuffer(stream);
};

const uploadFilesToRefly = async (buffers) => {
  if (!buffers.length) return [];
  logInfo('上传附件到 Refly', { count: buffers.length });
  const formData = new FormData();
  for (const file of buffers) {
    formData.append('files', new Blob([file.buffer]), file.fileName);
  }
  const { data, ok } = await requestJson(`${API_BASE_URL}/openapi/files/upload`, {
    method: 'POST',
    headers: buildHeaders(),
    body: formData,
  });
  if (!ok || !data?.success) {
    throw new Error(`上传文件失败: ${JSON.stringify(data)}`);
  }
  const files = Array.isArray(data?.data?.files) ? data.data.files : [];
  const fallbackNames = buffers.map((file) => file.fileName || '');
  return files
    .map((item, index) => ({
      fileKey: item?.fileKey,
      fileName: item?.fileName || fallbackNames[index] || item?.name,
    }))
    .filter((item) => item.fileKey);
};

let tenantAccessTokenCache = null;
const fetchAuthToken = async (endpoint) => {
  const url = `${baseConfig.domain}/open-apis/auth/v3/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      app_id: baseConfig.appId,
      app_secret: baseConfig.appSecret,
    }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_error) {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
};

const getTenantAccessToken = async () => {
  const now = Date.now();
  if (tenantAccessTokenCache && tenantAccessTokenCache.expireAt > now + 60_000) {
    return tenantAccessTokenCache.token;
  }
  if (!baseConfig.appId || !baseConfig.appSecret) {
    logWarn('缺少飞书 app_id 或 app_secret', {
      hasAppId: !!baseConfig.appId,
      hasAppSecret: !!baseConfig.appSecret,
    });
  }
  let token = null;
  let expire = 3600;

  const tenantRes = await fetchAuthToken('tenant_access_token/internal');
  token = tenantRes?.data?.tenant_access_token ?? null;
  expire = Number(tenantRes?.data?.expire ?? expire);
  if (!token || tenantRes?.data?.code) {
    logWarn('获取飞书 tenant_access_token 失败', {
      status: tenantRes?.status,
      code: tenantRes?.data?.code,
      msg: tenantRes?.data?.msg,
      hasToken: !!token,
      response: redactTokens(tenantRes?.data),
    });
  }

  if (!token) {
    const appRes = await fetchAuthToken('app_access_token/internal');
    token = appRes?.data?.tenant_access_token ?? appRes?.data?.app_access_token ?? null;
    expire = Number(appRes?.data?.expire ?? expire);
    if (!token || appRes?.data?.code) {
      logWarn('获取飞书 app_access_token 失败', {
        status: appRes?.status,
        code: appRes?.data?.code,
        msg: appRes?.data?.msg,
        hasTenantToken: !!appRes?.data?.tenant_access_token,
        hasAppToken: !!appRes?.data?.app_access_token,
        response: redactTokens(appRes?.data),
      });
    }
  }

  if (!token) {
    throw new Error('获取飞书 tenant_access_token 失败');
  }

  tenantAccessTokenCache = {
    token,
    expireAt: now + expire * 1000,
  };
  return token;
};

const buildLarkFileType = (fileName) => {
  const safeName = `${fileName || ''}`.trim();
  const ext = safeName.includes('.') ? safeName.split('.').pop().toLowerCase() : '';
  const allowed = new Set(['opus', 'mp4', 'pdf', 'doc', 'xls', 'ppt', 'stream']);
  return allowed.has(ext) ? ext : 'stream';
};

const uploadFileToLark = async ({ buffer, fileName }) => {
  logInfo('上传产物到飞书', { fileName, size: buffer?.length });
  const token = await getTenantAccessToken();
  const formData = new FormData();
  const fileType = buildLarkFileType(fileName);
  formData.append('file_type', fileType);
  const fallbackName = fileName && fileName.includes('.') ? fileName : `${fileName || 'output'}.txt`;
  formData.append('file_name', fallbackName);
  formData.append('file', new Blob([buffer]), fileName);

  const res = await fetch(`${baseConfig.domain}/open-apis/im/v1/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const json = await res.json();
  if (!res.ok || json?.code !== 0) {
    throw new Error(`上传飞书文件失败: ${JSON.stringify(json)}`);
  }
  return json?.data?.file_key;
};

const getFileExtension = (fileName) => {
  if (!fileName) return '';
  const trimmed = `${fileName}`.trim();
  if (!trimmed.includes('.')) return '';
  return trimmed.split('.').pop().toLowerCase();
};

const isImageFileName = (fileName) => {
  const ext = getFileExtension(fileName);
  if (!ext) return false;
  return new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'ico', 'tiff', 'heic']).has(ext);
};

const isImageType = (mimeType, fileName) => {
  if (mimeType && typeof mimeType === 'string' && mimeType.startsWith('image/')) {
    return true;
  }
  return isImageFileName(fileName);
};

const uploadImageToLark = async ({ buffer, fileName }) => {
  logInfo('上传图片到飞书', { fileName, size: buffer?.length });
  const token = await getTenantAccessToken();
  const formData = new FormData();
  formData.append('image_type', 'message');
  formData.append('image', new Blob([buffer]), fileName || 'image.png');

  const res = await fetch(`${baseConfig.domain}/open-apis/im/v1/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const json = await res.json();
  if (!res.ok || json?.code !== 0) {
    throw new Error(`上传飞书图片失败: ${JSON.stringify(json)}`);
  }
  return json?.data?.image_key;
};

const sendImageMessage = async ({ chatId, chatType, messageId, imageKey }) => {
  logInfo('发送飞书图片消息', { chatId, chatType, messageId });
  const payload = {
    content: JSON.stringify({ image_key: imageKey }),
    msg_type: 'image',
  };

  if (chatType === 'p2p') {
    await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: { receive_id: chatId, ...payload },
    });
    return;
  }

  await client.im.v1.message.reply({
    path: { message_id: messageId },
    data: payload,
  });
};

const sendFileMessage = async ({ chatId, chatType, messageId, fileKey }) => {
  logInfo('发送飞书文件消息', { chatId, chatType, messageId });
  const payload = {
    content: JSON.stringify({ file_key: fileKey }),
    msg_type: 'file',
  };

  if (chatType === 'p2p') {
    await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: { receive_id: chatId, ...payload },
    });
    return;
  }

  await client.im.v1.message.reply({
    path: { message_id: messageId },
    data: payload,
  });
};

const sendOutputFiles = async ({ chatId, chatType, messageId, sender, files }) => {
  if (!Array.isArray(files) || files.length === 0) return;
  const maxBytes = MAX_LARK_UPLOAD_MB > 0 ? MAX_LARK_UPLOAD_MB * 1024 * 1024 : Infinity;
  const maxImageBytes = MAX_LARK_IMAGE_MB > 0 ? MAX_LARK_IMAGE_MB * 1024 * 1024 : maxBytes;

  for (const file of files) {
    const fileName = file?.name || 'output';
    const fileSize = Number(file?.size ?? 0);
    const fileUrl = file?.url;
    const isImage = isImageFileName(fileName);

    if (!fileUrl) {
      await sendTextMessage({
        chatId,
        chatType,
        messageId,
        sender,
        text: `产物文件 ${fileName} 暂时无法提供下载地址。`,
      });
      continue;
    }

    if (fileSize && fileSize > maxBytes) {
      await sendTextMessage({
        chatId,
        chatType,
        messageId,
        sender,
        text: `产物文件过大，请直接下载：${fileUrl}`,
      });
      continue;
    }

    try {
      const res = await fetch(fileUrl);
      if (!res.ok) {
        logWarn('下载产物失败', { fileName, fileUrl, status: res.status });
        throw new Error(`下载失败 ${res.status}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (isImage && (!fileSize || fileSize <= maxImageBytes)) {
        const imageKey = await uploadImageToLark({ buffer, fileName });
        if (!imageKey) {
          throw new Error('未获取到飞书 image_key');
        }
        await sendImageMessage({ chatId, chatType, messageId, imageKey });
      } else {
        const fileKey = await uploadFileToLark({ buffer, fileName });
        if (!fileKey) {
          throw new Error('未获取到飞书 file_key');
        }
        await sendFileMessage({ chatId, chatType, messageId, fileKey });
      }
    } catch (error) {
      logWarn('上传产物失败', {
        fileName,
        fileSize,
        fileUrl,
        error: formatErrorDetails(error),
      });
      await sendTextMessage({
        chatId,
        chatType,
        messageId,
        sender,
        text: `产物文件 ${fileName} 上传失败，请直接下载：${fileUrl}`,
      });
    }
  }
};

const buildNodeOutputText = (message) => {
  if (!message) return '';
  const parts = [];
  if (typeof message === 'string') {
    parts.push(message);
  }
  if (message?.text) {
    parts.push(message.text);
  }
  if (message?.content) {
    parts.push(message.content);
  }
  if (message?.reasoningContent) {
    parts.push(`推理：${message.reasoningContent}`);
  }
  return parts.filter(Boolean).join('\n');
};

const buildOutputText = (nodeTitle, message) => {
  const parts = [];
  if (nodeTitle) {
    parts.push(`【${nodeTitle}】`);
  }
  if (message?.content) {
    parts.push(message.content);
  }
  if (message?.reasoningContent) {
    parts.push(`推理：${message.reasoningContent}`);
  }
  return parts.filter(Boolean).join('\n');
};

const collectMessagesFromOutputNodes = (outputNodes) => {
  const messages = [];
  const nodes = Array.isArray(outputNodes) ? outputNodes : [];
  for (const node of nodes) {
    const nodeTitle = node?.title || '';
    const list = Array.isArray(node?.messages) ? node.messages : [];
    for (const message of list) {
      const text = buildOutputText(nodeTitle, message);
      if (text) messages.push(text);
    }
  }
  return messages;
};

const groupArtifactsByNode = (outputNodes, files, nodeIdToTitle) => {
  const nodeMap = new Map();
  const ensureGroup = (nodeId, title, fallbackTitle) => {
    const key = nodeId || title || fallbackTitle || 'unknown';
    if (!nodeMap.has(key)) {
      const resolvedTitle =
        title || (nodeId ? nodeIdToTitle?.get(nodeId) : '') || fallbackTitle || '未命名步骤';
      nodeMap.set(key, {
        nodeId: nodeId || key,
        title: resolvedTitle,
        texts: [],
        images: [],
        files: [],
        textSet: new Set(),
      });
    }
    return nodeMap.get(key);
  };

  const pushText = (group, text) => {
    const normalized = typeof text === 'string' ? text.trim() : '';
    if (!normalized) return;
    if (group.textSet.has(normalized)) return;
    group.textSet.add(normalized);
    group.texts.push(normalized);
  };

  if (Array.isArray(outputNodes)) {
    for (const node of outputNodes) {
      const nodeId = node?.nodeId || node?.node_id || '';
      const title = node?.title || '';
      const group = ensureGroup(nodeId, title, '未命名步骤');
      if (node?.content && typeof node.content === 'string') {
        pushText(group, node.content);
      }
      const messages = Array.isArray(node?.messages) ? node.messages : [];
      for (const message of messages) {
        const text = buildNodeOutputText(message);
        if (text) pushText(group, text);
      }
    }
  }

  if (Array.isArray(files)) {
    for (const file of files) {
      const nodeId = file?.nodeId || file?.node_id || '';
      const title = nodeIdToTitle?.get(nodeId) || '';
      const group = ensureGroup(nodeId, title, '其他产物');
      if (isImageType(file?.type, file?.name)) {
        group.images.push(file);
      } else {
        group.files.push(file);
      }
    }
  }

  const groups = Array.from(nodeMap.values()).filter(
    (group) => group.texts.length || group.images.length || group.files.length,
  );
  for (const group of groups) {
    delete group.textSet;
  }
  return groups;
};

const markImagesForCard = (artifactGroups, maxImages) => {
  let remaining = Number.isFinite(maxImages) && maxImages > 0 ? maxImages : 0;
  for (const group of artifactGroups) {
    const images = Array.isArray(group?.images) ? group.images : [];
    for (const image of images) {
      if (!image?.url) {
        image.shouldUpload = false;
        image.skipReason = 'no_url';
        continue;
      }
      if (remaining > 0) {
        image.shouldUpload = true;
        remaining -= 1;
      } else {
        image.shouldUpload = false;
        image.skipReason = 'limit';
      }
    }
  }
};

const uploadImagesToLarkBatch = async (images) => {
  const results = new Map();
  if (!Array.isArray(images) || images.length === 0) return results;
  const maxImageBytes = MAX_LARK_IMAGE_MB > 0 ? MAX_LARK_IMAGE_MB * 1024 * 1024 : Infinity;
  const seenUrls = new Set();

  for (const img of images) {
    const url = img?.url;
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);

    if (img?.size && Number(img.size) > maxImageBytes) {
      results.set(url, { imageKey: null, error: '文件过大' });
      continue;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        results.set(url, { imageKey: null, error: `下载失败 ${res.status}` });
        continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > maxImageBytes) {
        results.set(url, { imageKey: null, error: '文件过大' });
        continue;
      }
      const imageKey = await uploadImageToLark({ buffer, fileName: img?.name });
      results.set(url, { imageKey, error: '' });
    } catch (error) {
      logWarn('上传图片失败', { name: img?.name, error: formatErrorDetails(error) });
      results.set(url, { imageKey: null, error: error?.message || '上传失败' });
    }
  }

  return results;
};

const normalizeErrorText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
};

const normalizeTerminology = (text) => {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/工作流/g, 'Skills')
    .replace(/workflow/gi, 'Skills')
    .replace(/Copilot Agent/g, 'Skills Agent')
    .replace(/Copilot/g, 'Skills')
    .replace(/copilot/g, 'Skills')
    .replace(/vibe 工作流/g, 'vibe Skills')
    .replace(/节点/g, '步骤')
    .replace(/任务节点/g, '任务步骤');
};

const buildFailureReasonLine = (nodeExecutions, lastErrorMap, limit = 3) => {
  if (!Array.isArray(nodeExecutions) || nodeExecutions.length === 0) return '';
  const failedNodes = nodeExecutions.filter(
    (node) => (node.status || 'waiting') === 'failed' && node?.type !== 'start',
  );
  if (!failedNodes.length) return '';
  const details = [];
  for (const node of failedNodes) {
    const title = node.title || node.nodeId || '步骤';
    const directError = normalizeErrorText(node.errorMessage || node.error || node.message);
    let fallbackError = '';
    const key = node.nodeId || node.title;
    if (!directError && key && lastErrorMap instanceof Map) {
      const entry = lastErrorMap.get(key);
      fallbackError = entry?.error || '';
    }
    const errorText = directError || fallbackError;
    if (errorText) {
      details.push(`${title} - ${errorText}`);
    }
    if (details.length >= limit) break;
  }
  if (details.length) {
    return `失败原因：${details.join('；')}`;
  }
  const titles = failedNodes
    .map((node) => node.title || node.nodeId || '步骤')
    .filter(Boolean)
    .slice(0, limit);
  if (titles.length) {
    return `失败原因：${titles.join('、')} 未提供详细错误信息`;
  }
  return '失败原因：未提供详细错误信息';
};

const buildProgressSummary = (nodeExecutions, lastStatusMap, lastOutputMap, lastErrorMap) => {
  const isStartNode = (node) => {
    if (!node) return false;
    if (node?.type === 'start') return true;
    const title = typeof node?.title === 'string' ? node.title.trim().toLowerCase() : '';
    return title === 'start';
  };
  const formatStepList = (items, limit = 6) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return '';
    if (list.length <= limit) return list.join('、');
    return `${list.slice(0, limit).join('、')}等${list.length}步`;
  };

  const changes = {
    finish: [],
    executing: [],
    failed: [],
    waiting: [],
    init: [],
  };

  const displayNodes = Array.isArray(nodeExecutions)
    ? nodeExecutions.filter((node) => !isStartNode(node))
    : [];
  let finishCount = 0;

  const finishedTitles = [];
  const executingTitles = [];
  const waitingTitles = [];
  const failedTitles = [];

  for (const node of displayNodes) {
    const status = node.status || 'waiting';
    if (status === 'finish') finishCount += 1;

    const title = node.title || node.nodeId || '步骤';
    if (status === 'finish') finishedTitles.push(title);
    if (status === 'executing') executingTitles.push(title);
    if (status === 'failed') failedTitles.push(title);
    if (status !== 'finish' && status !== 'executing' && status !== 'failed') {
      waitingTitles.push(title);
    }

    const prev = lastStatusMap.get(node.nodeId);
    if (prev !== status) {
      if (!changes[status]) {
        changes[status] = [];
      }
      changes[status].push(title);
    }
  }

  const total = displayNodes.length;
  const percent = total > 0 ? Math.round((finishCount / total) * 100) : 0;
  const barWidth = 10;
  const filled = total > 0 ? Math.round((finishCount / total) * barWidth) : 0;
  const solidBlock = '▰';
  const emptyBlock = '▱';
  const bar = `${solidBlock.repeat(filled)}${emptyBlock.repeat(barWidth - filled)}`;
  const lines = [];
  lines.push('**完成进度**');
  lines.push(`${bar} ${percent}%`);

  const executingTitle = executingTitles[0] || '';
  if (executingTitle) {
    lines.push('**当前步骤**');
    lines.push(executingTitle);
    if (lastOutputMap instanceof Map) {
      const executingNode = displayNodes.find(
        (node) => (node.status || 'waiting') === 'executing',
      );
      const outputKey = executingNode?.nodeId || executingNode?.title || '';
      const entry = outputKey ? lastOutputMap.get(outputKey) : null;
      const outputLines = entry?.lines || [];
      if (outputLines.length) {
        lines.push('**输出**');
        lines.push('> ...');
        outputLines
          .slice(-PROGRESS_OUTPUT_LINES)
          .map((line) => formatOutputSnippet(line, 120))
          .filter(Boolean)
          .forEach((line) => lines.push(`> ${line}`));
        lines.push('> ...');
      }
    }
  }

  const finishedLine = formatStepList(finishedTitles);
  if (finishedLine) {
    lines.push('**已完成**');
    lines.push(finishedLine);
  }
  const waitingLine = formatStepList(waitingTitles);
  if (waitingLine) {
    lines.push('**待执行**');
    lines.push(waitingLine);
  }
  const failedLine = formatStepList(failedTitles);
  if (failedLine) {
    lines.push('**失败**');
    lines.push(failedLine);
  }

  const failureLine = buildFailureReasonLine(nodeExecutions, lastErrorMap);
  if (failureLine) {
    lines.push(failureLine);
  }

  return {
    summary: lines.join('\n'),
    executingTitle,
    hasChange:
      changes.finish.length ||
      changes.executing.length ||
      changes.failed.length ||
      changes.waiting.length ||
      changes.init.length,
  };
};

const updateNodeTitleMap = (nodeExecutions, nodeIdToTitle) => {
  if (!Array.isArray(nodeExecutions) || !(nodeIdToTitle instanceof Map)) return;
  for (const node of nodeExecutions) {
    if (node?.nodeId && node?.title) {
      nodeIdToTitle.set(node.nodeId, node.title);
    }
  }
};

const extractPlannerPayload = (outputData) => {
  const outputNodes = Array.isArray(outputData?.output) ? outputData.output : [];
  let lastPayload = null;
  let lastText = '';
  for (const node of outputNodes) {
    const messages = Array.isArray(node?.messages) ? node.messages : [];
    for (const message of messages) {
      const candidates = [];
      if (message?.content) candidates.push(message.content);
      if (message?.reasoningContent) candidates.push(message.reasoningContent);
      for (const candidate of candidates) {
        if (!candidate) continue;
        const parsed = extractJsonFromText(candidate);
        if (parsed && (parsed.action || parsed.type)) {
          lastPayload = parsed;
          lastText = candidate;
        } else {
          lastText = candidate;
        }
      }
    }
  }
  return { payload: lastPayload, fallbackText: lastText };
};

const resolvePlaceholderValue = (value, context) => {
  if (Array.isArray(value)) {
    if (value.length === 1) {
      const resolved = resolvePlaceholderValue(value[0], context);
      if (Array.isArray(resolved) || resolved !== value[0]) {
        return resolved;
      }
    }
    return value.map((item) => resolvePlaceholderValue(item, context));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^\{\{(\w+)\}\}$/);
    const key = match ? match[1] : trimmed;
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return context[key];
    }
  }
  return value;
};

const buildRunVariables = (payload, context) => {
  const variables = {};

  if (payload?.variables && typeof payload.variables === 'object' && !Array.isArray(payload.variables)) {
    for (const [key, value] of Object.entries(payload.variables)) {
      variables[key] = resolvePlaceholderValue(value, context);
    }
  } else if (
    payload?.variableBindings &&
    typeof payload.variableBindings === 'object' &&
    !Array.isArray(payload.variableBindings)
  ) {
    for (const [key, source] of Object.entries(payload.variableBindings)) {
      variables[key] = resolvePlaceholderValue(source, context);
    }
  } else {
    variables[VARIABLE_INPUT] = context.user_input;
    if (Array.isArray(context.user_files) && context.user_files.length) {
      variables[VARIABLE_FILES] = context.user_files;
    }
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(variables)) {
    if (Array.isArray(value) && value.length === 0) continue;
    if (value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
};

const isFileVariableName = (name) =>
  /file|files|附件|文件|文档|图片|图像|image|img/i.test(name || '');

const buildRunVariablesFromPlan = (workflowPlan, context) => {
  const variables = Array.isArray(workflowPlan?.variables) ? workflowPlan.variables : [];
  if (!variables.length) {
    return buildRunVariables({}, context);
  }
  const payload = { variables: {} };
  for (const variable of variables) {
    const name = variable?.name;
    if (!name) continue;
    if (context.user_files?.length && isFileVariableName(name)) {
      payload.variables[name] = context.user_files;
    } else {
      payload.variables[name] = context.user_input;
    }
  }
  return buildRunVariables(payload, context);
};

const buildTerminalTaskInfo = (workflowPlan) => {
  const tasks = Array.isArray(workflowPlan?.tasks) ? workflowPlan.tasks : [];
  const allTaskIds = new Set();
  const dependentTaskIds = new Set();
  const idToTitle = new Map();

  for (const task of tasks) {
    const taskId = task?.id;
    if (taskId) {
      allTaskIds.add(taskId);
      if (task?.title) {
        idToTitle.set(taskId, task.title);
      }
    }
    const deps = Array.isArray(task?.dependentTasks) ? task.dependentTasks : [];
    for (const depId of deps) {
      if (depId) dependentTaskIds.add(depId);
    }
  }

  const terminalIds = new Set();
  const terminalTitles = new Set();
  for (const taskId of allTaskIds) {
    if (!dependentTaskIds.has(taskId)) {
      terminalIds.add(taskId);
      const title = idToTitle.get(taskId);
      if (title) terminalTitles.add(title);
    }
  }

  return { terminalIds, terminalTitles };
};

const generateWorkflowByCopilot = async ({ query, canvasId, progress }) => {
  logInfo('调用 Copilot 生成Skills', { canvasId, hasQuery: !!query });
  if (progress) {
    await sendProgressCard({
      chatId: progress.chatId,
      chatType: progress.chatType,
      messageId: progress.messageId,
      sender: progress.sender,
      requestKey: progress.requestKey,
      title: progress.title ?? '生成Skills中',
      statusText: progress.statusText ?? '生成Skills中',
      stageText: progress.stageText ?? 'Copilot 规划',
      etaText: progress.etaText ?? '约 30-60 秒',
      summaryText: progress.text ?? PROGRESS_COPILOT_TEXT,
      showAbort: false,
    });
  }
  const body = {
    query,
    ...(canvasId ? { canvasId } : {}),
    ...(COPILOT_LOCALE ? { locale: COPILOT_LOCALE } : {}),
  };
  const { data, ok } = await requestJson(`${API_BASE_URL}/openapi/copilot/workflow/generate`, {
    method: 'POST',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // logInfo('Copilot generate 响应', { ok, data });
  if (!ok || !data?.success) {
    const modelResponse =
      typeof data?.modelResponse === 'string' ? data.modelResponse.trim() : '';
    if (modelResponse) {
      const error = new Error(modelResponse);
      error.isModelResponse = true;
      throw error;
    }
    const errMsg =
      data?.errMsg ||
      data?.message ||
      data?.error ||
      (typeof data === 'string' ? data : '') ||
      '生成Skills失败';
    throw new Error(errMsg);
  }
  return data?.data ?? {};
};

const buildWorkflowPlanSummary = (workflowPlan) => {
  if (!workflowPlan) return '';
  const title = workflowPlan?.title ? `标题：${workflowPlan.title}` : '';
  const tasks = Array.isArray(workflowPlan?.tasks) ? workflowPlan.tasks : [];
  const nodeTitles = tasks.map((task) => task?.title).filter(Boolean);
  const nodes = nodeTitles.length
    ? `步骤：${nodeTitles.slice(0, 8).join('、')}${nodeTitles.length > 8 ? '...' : ''}`
    : '';
  const variables = Array.isArray(workflowPlan?.variables) ? workflowPlan.variables : [];
  const variableNames = variables.map((variable) => variable?.name).filter(Boolean);
  const vars = variableNames.length ? `变量：${variableNames.join('、')}` : '';
  return [title, nodes, vars].filter(Boolean).join('\n');
};

const buildVariablesSummary = (variables) => {
  if (!variables || typeof variables !== 'object') return '';
  try {
    const serialized = JSON.stringify(variables);
    return truncateText(serialized, 200);
  } catch (_error) {
    const keys = Object.keys(variables);
    return keys.length ? keys.join('、') : '';
  }
};

const buildOutputSummary = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  let latest = '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const text = typeof messages[i] === 'string' ? messages[i].trim() : '';
    if (text) {
      latest = text;
      break;
    }
  }
  if (!latest) return '';
  const content = truncateOutputBlock(latest, 400);
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summaryLines = ['**最新输出**', '> ...'];
  for (const line of lines) {
    summaryLines.push(`> ${line}`);
  }
  summaryLines.push('> ...');
  return summaryLines.join('\n');
};

const runWorkflow = async ({
  chatId,
  chatType,
  messageId,
  sender,
  canvasId,
  variables,
  requestKey,
  sessionKey,
  originText,
  terminalTaskInfo,
}) => {
  if (!canvasId) {
    throw new Error('缺少目标Skills ID');
  }
  const userKey = buildUserKey(sender, sessionKey);
  if (
    Number.isFinite(MAX_USER_RUN_CONCURRENCY) &&
    MAX_USER_RUN_CONCURRENCY > 0 &&
    countActiveRuns(userKey) >= MAX_USER_RUN_CONCURRENCY
  ) {
    retryContexts.set(requestKey, {
      type: 'run',
      sessionKey,
      userKey,
      runArgs: {
        chatId,
        chatType,
        messageId,
        sender,
        canvasId,
        variables,
        requestKey,
        sessionKey,
        originText,
        terminalTaskInfo,
      },
    });
    await sendProgressCard({
      chatId,
      chatType,
      messageId,
      sender,
      requestKey,
      title: '执行受限',
      statusText: '失败',
      stageText: '执行中',
      etaText: '等待重试',
      summaryText: buildConcurrencyLimitSummary(MAX_USER_RUN_CONCURRENCY, '运行'),
      showAbort: false,
      showRetry: true,
      retryAction: CARD_RETRY_RUN_ACTION,
      retryLabel: '重试执行',
    });
    return { status: 'limit', messages: [], files: [], finalCardSent: false };
  }
  retryContexts.delete(requestKey);
  logInfo('触发Skills', { canvasId });

  const { data, ok } = await requestJson(`${API_BASE_URL}/openapi/workflow/${canvasId}/run`, {
    method: 'POST',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ variables }),
  });

  if (!ok || !data?.success) {
    throw new Error(`触发Skills失败: ${JSON.stringify(data)}`);
  }

  const executionId = data?.data?.executionId;
  if (!executionId) {
    throw new Error('未获取到 executionId');
  }
  logInfo('Skills执行已启动', { executionId });

  const workflowStartedAt = Date.now();
  const nodeIdToTitle = new Map();
  activeExecutions.set(requestKey, {
    executionId,
    startedAt: workflowStartedAt,
    sessionKey,
    userKey,
    stage: 'run',
    normalizedText: normalizeRequestText(originText),
  });

  await sendProgressCard({
    chatId,
    chatType,
    messageId,
    sender,
    requestKey,
    title: '执行中',
    statusText: '执行已启动',
    stageText: '执行中',
    etaText: `最长 ${MAX_WORKFLOW_MINUTES} 分钟`,
    summaryText: `执行 ID：${executionId}`,
    showAbort: true,
  });

  const seenMessageIds = new Set();
  const seenFileUrls = new Set();
  const outputMessages = [];
  const outputFiles = [];
  let lastStatus = '';
  let lastNotifyAt = 0;
  let lastOutputAt = 0;
  let lastProgressSummary = '';
  let lastExecutingTitle = '';
  let artifactsCardSent = false;
  const lastNodeStatus = new Map();
  const lastNodeOutput = new Map();
  const lastNodeError = new Map();
  const deadline = Date.now() + MAX_WORKFLOW_MINUTES * 60 * 1000;

  while (true) {
    if (Date.now() > deadline) {
      logWarn('Skills执行超时', { executionId });
      await sendTextMessage({
        chatId,
        chatType,
        messageId,
        sender,
        text: `执行超时，请稍后再试。执行 ID：${executionId}`,
      });
      activeExecutions.delete(requestKey);
      return { status: 'timeout', messages: outputMessages, files: outputFiles, finalCardSent: false };
    }

    const statusRes = await requestJson(
      `${API_BASE_URL}/openapi/workflow/${executionId}/status`,
      { headers: buildHeaders() },
    );

    if (!statusRes.ok || !statusRes.data?.success) {
      throw new Error(`获取执行状态失败: ${JSON.stringify(statusRes.data)}`);
    }

    const statusData = statusRes.data?.data ?? {};
    const status = statusData.status;
    const nodeExecutions = Array.isArray(statusData.nodeExecutions)
      ? statusData.nodeExecutions
      : [];

    updateNodeTitleMap(nodeExecutions, nodeIdToTitle);

    const { summary, hasChange, executingTitle } = buildProgressSummary(
      nodeExecutions,
      lastNodeStatus,
      lastNodeOutput,
      lastNodeError,
    );
    if (executingTitle) {
      lastExecutingTitle = executingTitle;
    }
    const displayStatus = formatWorkflowStatus(status);
    const shouldNotify =
      status !== lastStatus ||
      hasChange ||
      Date.now() - lastNotifyAt > STATUS_NOTIFY_INTERVAL_MS;

    lastProgressSummary = summary;
    if (shouldNotify) {
      const runningTitle =
        status === 'finish'
          ? '产物整理中'
          : executingTitle
            ? `执行中：${executingTitle}`
            : '执行中';
      await sendProgressCard({
        chatId,
        chatType,
        messageId,
        sender,
        requestKey,
        title: runningTitle,
        statusText: displayStatus,
        stageText: '执行中',
        etaText: `最长 ${MAX_WORKFLOW_MINUTES} 分钟`,
        summaryText: summary,
        showAbort: true,
      });
      lastStatus = status;
      lastNotifyAt = Date.now();
    }

    for (const node of nodeExecutions) {
      if (node?.nodeId) {
        lastNodeStatus.set(node.nodeId, node.status || 'waiting');
      }
    }

    if (Date.now() - lastOutputAt > OUTPUT_INTERVAL_MS) {
      const outputRes = await requestJson(
        `${API_BASE_URL}/openapi/workflow/${executionId}/output`,
        { headers: buildHeaders() },
      );

      if (outputRes.ok && outputRes.data?.success) {
        const outputData = outputRes.data?.data ?? {};
        const outputNodes = Array.isArray(outputData.output) ? outputData.output : [];
        const newOutputTexts = [];
        for (const node of outputNodes) {
          const errorText = normalizeErrorText(node?.errorMessage || node?.error);
          if (errorText) {
            const key = node?.nodeId || node?.title;
            if (key) {
              lastNodeError.set(key, {
                title: node?.title || node?.nodeId || '步骤',
                error: errorText,
                timestamp: Date.now(),
              });
            }
          }
          const messages = Array.isArray(node.messages) ? node.messages : [];
          for (const message of messages) {
            if (!message?.messageId || seenMessageIds.has(message.messageId)) continue;
            const text = buildOutputText(node.title, message);
                if (text) {
                  newOutputTexts.push(text);
                  outputMessages.push(text);
                  const key = node?.nodeId || node?.title;
                  const messageText = buildNodeOutputText(message) || text;
                  if (key) {
                    updateNodeOutputCache(
                      lastNodeOutput,
                      key,
                      node?.title || node?.nodeId || '步骤',
                      messageText,
                    );
                  }
                }
            seenMessageIds.add(message.messageId);
          }
        }

        const files = Array.isArray(outputData.files) ? outputData.files : [];
        const newFiles = files.filter((file) => {
          if (!file?.url) return false;
          if (seenFileUrls.has(file.url)) return false;
          return true;
        });
        for (const file of newFiles) {
          if (file?.url) seenFileUrls.add(file.url);
        }
        if (newFiles.length) {
          outputFiles.push(...newFiles);
        }
        if (newOutputTexts.length || newFiles.length) {
          const outputSummary = buildOutputSummary(outputMessages);
          const summaryParts = [];
          if (lastProgressSummary) summaryParts.push(lastProgressSummary);
          if (outputSummary) summaryParts.push(outputSummary);
          if (newFiles.length) {
            const newFileNames = newFiles
              .map((file) => file?.name || '文件')
              .filter(Boolean);
            if (newFileNames.length) {
              summaryParts.push(`新增产物：${newFileNames.join('、')}`);
            }
          }
          const runningTitle =
            status === 'finish'
              ? '产物整理中'
              : lastExecutingTitle
                ? `执行中：${lastExecutingTitle}`
                : '执行中';
          await sendProgressCard({
            chatId,
            chatType,
            messageId,
            sender,
            requestKey,
            title: runningTitle,
            statusText: formatWorkflowStatus(status || lastStatus),
            stageText: '执行中',
            etaText: `最长 ${MAX_WORKFLOW_MINUTES} 分钟`,
            summaryText: summaryParts.join('\n'),
            showAbort: true,
          });
        }
      }
      lastOutputAt = Date.now();
    }

    let displayMessages = outputMessages;
    let displayFiles = outputFiles;
    if (status === 'finish' || status === 'failed') {
      if (status === 'failed') {
        logWarn('Skills执行失败', { executionId });
        try {
          const outputRes = await requestJson(
            `${API_BASE_URL}/openapi/workflow/${executionId}/output`,
            { headers: buildHeaders() },
          );
          if (outputRes.ok && outputRes.data?.success) {
            const outputData = outputRes.data?.data ?? {};
            const outputNodes = Array.isArray(outputData.output) ? outputData.output : [];
            for (const node of outputNodes) {
              const errorText = normalizeErrorText(node?.errorMessage || node?.error);
              if (!errorText) continue;
              const key = node?.nodeId || node?.title;
              if (!key) continue;
              lastNodeError.set(key, {
                title: node?.title || node?.nodeId || '步骤',
                error: errorText,
                timestamp: Date.now(),
              });
            }
          }
        } catch (_error) {
          // 忽略失败，继续使用已有错误信息
        }
        const failureLine = buildFailureReasonLine(nodeExecutions, lastNodeError);
        const summaryParts = [];
        if (lastProgressSummary) summaryParts.push(lastProgressSummary);
        if (failureLine && !lastProgressSummary?.includes(failureLine)) {
          summaryParts.push(failureLine);
        }
        summaryParts.push('Skills执行失败，请稍后重试。');
        const failureSummary = summaryParts.filter(Boolean).join('\n');
        await sendProgressCard({
          chatId,
          chatType,
          messageId,
          sender,
          requestKey,
          title: '执行失败',
          statusText: '失败',
          stageText: '执行中',
          etaText: '已终止',
          summaryText: failureSummary,
          showAbort: false,
        });
      } else {
        let outputData = null;
        let displayOutputNodes = null;
        try {
          const outputRes = await requestJson(
            `${API_BASE_URL}/openapi/workflow/${executionId}/output`,
            { headers: buildHeaders() },
          );
          if (outputRes.ok && outputRes.data?.success) {
            outputData = outputRes.data?.data ?? {};
            const outputNodes = Array.isArray(outputData.output) ? outputData.output : [];
            for (const node of outputNodes) {
              if (node?.nodeId && node?.title) {
                nodeIdToTitle.set(node.nodeId, node.title);
              }
              const messages = Array.isArray(node.messages) ? node.messages : [];
              for (const message of messages) {
                if (!message?.messageId || seenMessageIds.has(message.messageId)) continue;
                const text = buildOutputText(node.title, message);
                if (text) {
                  outputMessages.push(text);
                  const key = node?.nodeId || node?.title;
                  const messageText = buildNodeOutputText(message) || text;
                  if (key) {
                    updateNodeOutputCache(
                      lastNodeOutput,
                      key,
                      node?.title || node?.nodeId || '步骤',
                      messageText,
                    );
                  }
                }
                seenMessageIds.add(message.messageId);
              }
            }

            const files = Array.isArray(outputData.files) ? outputData.files : [];
            const newFiles = files.filter((file) => {
              if (!file?.url) return false;
              if (seenFileUrls.has(file.url)) return false;
              return true;
            });
            for (const file of newFiles) {
              if (file?.url) seenFileUrls.add(file.url);
            }
            if (newFiles.length) {
              outputFiles.push(...newFiles);
            }
          }
        } catch (_error) {
          // 忽略失败，继续使用已有产物信息
        }

        if (outputData) {
          const outputNodes = Array.isArray(outputData.output) ? outputData.output : [];
          const files = Array.isArray(outputData.files) ? outputData.files : [];
          const terminalIds = terminalTaskInfo?.terminalIds;
          const terminalTitles = terminalTaskInfo?.terminalTitles;
          const hasTerminalFilter =
            (terminalIds && terminalIds.size) || (terminalTitles && terminalTitles.size);
          const isTerminalNode = (nodeId, title) => {
            if (!hasTerminalFilter) return true;
            if (nodeId && terminalIds?.has(nodeId)) return true;
            if (title && terminalTitles?.has(title)) return true;
            const mappedTitle = nodeId ? nodeIdToTitle.get(nodeId) : '';
            if (mappedTitle && terminalTitles?.has(mappedTitle)) return true;
            return false;
          };
          const filteredOutputNodes = hasTerminalFilter
            ? outputNodes.filter((node) =>
                isTerminalNode(node?.nodeId || node?.node_id, node?.title),
              )
            : outputNodes;

          // 文件产物：显示所有节点的所有文件，不进行过滤
          const filteredFiles = files;
          displayOutputNodes =
            hasTerminalFilter &&
            filteredOutputNodes.length === 0 &&
            filteredFiles.length === 0
              ? outputNodes
              : filteredOutputNodes;
          displayFiles =
            hasTerminalFilter &&
            filteredOutputNodes.length === 0 &&
            filteredFiles.length === 0
              ? files
              : filteredFiles;
          if (!displayFiles.length && outputFiles.length) {
            displayFiles = outputFiles;
          }
          const filteredMessages = collectMessagesFromOutputNodes(displayOutputNodes);
          if (filteredMessages.length) {
            displayMessages = filteredMessages;
          }
        }

        if (ENABLE_ARTIFACTS_CARD && outputData) {
          try {
            await sendProgressCard({
              chatId,
              chatType,
              messageId,
              sender,
              requestKey,
              title: '产物整理中',
              statusText: '完成',
              stageText: '产物整理',
              etaText: '上传产物中',
              summaryText: 'Skills 已完成，正在上传产物，请稍等...',
              showAbort: false,
            });
            const artifactGroups = groupArtifactsByNode(
              displayOutputNodes,
              displayFiles,
              nodeIdToTitle,
            );
            markImagesForCard(artifactGroups, MAX_CARD_IMAGES);
            const imagesToUpload = artifactGroups
              .flatMap((group) => group.images || [])
              .filter((img) => img?.shouldUpload);
            const uploadResults = await uploadImagesToLarkBatch(imagesToUpload);
            for (const group of artifactGroups) {
              for (const image of group.images || []) {
                if (!image?.shouldUpload || !image?.url) continue;
                const result = uploadResults.get(image.url);
                image.imageKey = result?.imageKey || null;
                if (!image.imageKey) {
                  const errorText = result?.error || '';
                  image.skipReason = errorText.includes('文件过大')
                    ? 'too_large'
                    : 'upload_failed';
                }
              }
            }
            const elapsedText = formatElapsedCompact(Date.now() - workflowStartedAt);
            const cardContent = buildArtifactsCardContent({
              title: '✅ 执行完成',
              artifactGroups,
              statusText: '完成',
              etaText: elapsedText,
              requestId: requestKey,
              sender,
              originText,
            });
            artifactsCardSent = await sendArtifactsCard({
              chatId,
              chatType,
              messageId,
              sender,
              requestKey,
              title: '执行完成',
              cardContent,
              fallbackText: 'Skills执行完成。',
            });
          } catch (error) {
            logWarn('构建产物卡片失败', { error: formatErrorDetails(error) });
          }
        }

        if (!artifactsCardSent) {
          const outputSummary = buildOutputSummary(displayMessages);
          const fileNames = displayFiles
            .map((file) => file?.name || '文件')
            .filter(Boolean);
          const summaryParts = [];
          if (lastProgressSummary) summaryParts.push(lastProgressSummary);
          if (outputSummary) summaryParts.push(`产物摘要：${outputSummary}`);
          if (fileNames.length) summaryParts.push(`产物文件：${fileNames.join('、')}`);
          const finishSummary = summaryParts.filter(Boolean).join('\n') || '执行完成。';
          await sendProgressCard({
            chatId,
            chatType,
            messageId,
            sender,
            requestKey,
            title: '执行完成',
            statusText: '完成',
            stageText: '执行完成',
            etaText: '已完成',
            summaryText: finishSummary,
            showAbort: false,
          });
        }
      }
      logInfo('Skills执行完成', { executionId, status });
      activeExecutions.delete(requestKey);
      return {
        status,
        messages: displayMessages,
        files: displayFiles,
        finalCardSent: status === 'finish' && artifactsCardSent,
      };
    }

    await sleep(POLL_INTERVAL_MS);
  }
};

const buildSessionKey = (chatId, sender) => {
  if (sender?.id) {
    return `${chatId}:${sender.id}`;
  }
  return `${chatId}:unknown`;
};

const buildExecutionKey = (sessionKey, messageId) => {
  const suffix =
    messageId || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return `${sessionKey}:${suffix}`;
};

const extractSessionKeyFromRequestKey = (requestKey) => {
  if (!requestKey) return '';
  const index = requestKey.lastIndexOf(':');
  if (index <= 0) return '';
  return requestKey.slice(0, index);
};

const findLatestExecution = (sessionKey) => {
  let latest = null;
  for (const [executionKey, info] of activeExecutions.entries()) {
    if (info?.sessionKey !== sessionKey) continue;
    if (!latest || (info?.startedAt ?? 0) > latest.startedAt) {
      latest = { executionKey, ...info };
    }
  }
  return latest;
};

const enqueueRequest = async ({
  chatId,
  chatType,
  messageId,
  sender,
  inputText,
  attachments = [],
  requestKey,
  skipLoading,
  sessionKeyOverride,
}) => {
  const sessionKey = sessionKeyOverride || buildSessionKey(chatId, sender);
  let pending = pendingRequests.get(sessionKey);
  const isNewPending = !pending;
  if (!pending) {
    pending = {
      sessionKey,
      chatId,
      chatType,
      sender,
      messageId,
      inputParts: [],
      attachments: [],
      createdAt: Date.now(),
      timer: null,
      notified: false,
      requestKey: requestKey || buildExecutionKey(sessionKey, messageId),
      reuseCard: Boolean(requestKey),
    };
    pendingRequests.set(sessionKey, pending);
  }

  if (inputText) {
    pending.inputParts.push(inputText);
  }
  if (attachments.length) {
    pending.attachments.push(...attachments);
  }

  pending.chatId = chatId;
  pending.chatType = chatType;
  pending.messageId = messageId;
  pending.sender = sender;
  if (requestKey) {
    pending.requestKey = requestKey;
    pending.reuseCard = true;
  }

  if (isNewPending && !skipLoading) {
    await sendProgressCard({
      chatId,
      chatType,
      messageId,
      sender,
      requestKey: pending.requestKey,
      title: '处理中',
      statusText: '已收到',
      stageText: '准备中',
      etaText: '即将开始',
      summaryText: '已收到消息，正在准备处理。',
      showAbort: false,
      showInput: false,
      autoDelete: false,
    });
  }

  if (!isNewPending && !pending.notified) {
    pending.notified = true;
    await sendTextMessage({
      chatId,
      chatType,
      messageId,
      sender,
      text: MERGE_NOTICE_TEXT,
    });
  }

  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  pending.timer = setTimeout(() => {
    startPendingRequest(sessionKey).catch((error) => {
      console.error('处理合并请求失败:', error);
    });
  }, MERGE_WINDOW_MS);
};

const startPendingRequest = async (sessionKey) => {
  const pending = pendingRequests.get(sessionKey);
  if (!pending) return;
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  pendingRequests.delete(sessionKey);
  const reuseCard = Boolean(pending.reuseCard);
  const executionKey = pending.requestKey || buildExecutionKey(sessionKey, pending.messageId);
  logInfo('开始处理请求', { sessionKey, executionKey, reuseCard });
  if (reuseCard) {
    progressInputLocks.add(executionKey);
  }

  const rawInputText = pending.inputParts.filter(Boolean).join('\n');
  const attachments = pending.attachments;

  if (!rawInputText && attachments.length === 0) {
    logWarn('空请求内容', { sessionKey });
    await sendTextMessage({
      chatId: pending.chatId,
      chatType: pending.chatType,
      messageId: pending.messageId,
      sender: pending.sender,
      text: '未检测到有效输入内容。',
    });
    return;
  }

  try {
    let uploadedFiles = [];
    if (attachments.length) {
      const dedup = new Map();
      for (const attachment of attachments) {
        if (!attachment?.fileKey) continue;
        const dedupKey = `${attachment.fileKey}:${attachment.resourceType}`;
        if (!dedup.has(dedupKey)) {
          dedup.set(dedupKey, attachment);
        }
      }

      const fileBuffers = [];
      for (const attachment of dedup.values()) {
        const fileSize = Number(attachment.fileSize ?? 0);
        if (fileSize && fileSize > MAX_LARK_DOWNLOAD_MB * 1024 * 1024) {
          await sendTextMessage({
            chatId: pending.chatId,
            chatType: pending.chatType,
            messageId: pending.messageId,
            sender: pending.sender,
            text: `附件 ${attachment.fileName || attachment.fileKey} 超过 ${MAX_LARK_DOWNLOAD_MB}MB，已跳过。`,
          });
          continue;
        }

      try {
        const buffer = await downloadLarkResource({
          messageId: attachment.messageId,
          fileKey: attachment.fileKey,
          resourceType: attachment.resourceType,
        });
          fileBuffers.push({
            buffer,
            fileName: attachment.fileName || attachment.fileKey || 'attachment',
          });
      } catch (_error) {
        logWarn('下载附件失败', { fileKey: attachment.fileKey });
        await sendTextMessage({
          chatId: pending.chatId,
            chatType: pending.chatType,
            messageId: pending.messageId,
            sender: pending.sender,
            text: `附件 ${attachment.fileName || attachment.fileKey} 下载失败，已跳过。`,
          });
        }
      }

      if (fileBuffers.length) {
        try {
        uploadedFiles = await uploadFilesToRefly(fileBuffers);
      } catch (_error) {
        logWarn('上传附件失败');
        await sendTextMessage({
          chatId: pending.chatId,
          chatType: pending.chatType,
            messageId: pending.messageId,
            sender: pending.sender,
            text: '文件上传失败，将继续以文本执行。',
          });
        }
      }
    }

    const session = clarifySessions.get(sessionKey);
    const mergedFiles = mergeUniqueList(
      [...(session?.files ?? []), ...uploadedFiles],
      (item) => item?.fileKey,
    );
    const fileKeys = mergedFiles.map((item) => item.fileKey).filter(Boolean);
    const fileNames = mergeUniqueList(
      mergedFiles
        .map((item) => item?.fileName)
        .filter(Boolean)
        .map((name) => ({ name })),
      (item) => item.name,
    ).map((item) => item.name);

    const memory = getSessionMemory(sessionKey);
    const previousHistory = session?.history?.length ? [...session.history] : [];
    if (session?.history?.length) {
      memory.history = previousHistory.slice(-10);
    }
    const userContent =
      rawInputText || (mergedFiles.length ? '（用户仅上传附件）' : '');

    const userHistory = extractUserHistory(previousHistory);
    const nextUserHistory = [...userHistory];
    if (
      userContent &&
      (!nextUserHistory.length || nextUserHistory[nextUserHistory.length - 1].content !== userContent)
    ) {
      nextUserHistory.push({ role: 'user', content: userContent });
    }

    const generateQuery = buildGenerateQuery({
      history: userHistory,
      latestUserMessage: userContent,
    });
    const resolvedQuery = generateQuery || userContent || rawInputText;

    logInfo('[Copilot] 准备调用 AI Search 增强查询', {
      hasQuery: Boolean(resolvedQuery),
      queryLength: resolvedQuery?.length
    });

    const { query: finalQuery, context: searchContext } = await augmentQueryWithAiSearch(resolvedQuery);

    if (searchContext) {
      logInfo('[Copilot] AI Search 上下文已添加到查询', {
        contextLength: searchContext.length,
        finalQueryLength: finalQuery.length
      });
    }

    let generated = null;
    try {
      const userKey = buildUserKey(pending.sender, sessionKey);
      if (
        Number.isFinite(MAX_USER_GENERATE_CONCURRENCY) &&
        MAX_USER_GENERATE_CONCURRENCY > 0 &&
        countActiveGenerations(userKey) >= MAX_USER_GENERATE_CONCURRENCY
      ) {
        retryContexts.set(executionKey, {
          type: 'generate',
          sessionKey,
          userKey,
          chatId: pending.chatId,
          chatType: pending.chatType,
          messageId: pending.messageId,
          sender: pending.sender,
          inputText: rawInputText,
          attachments,
        });
        await sendProgressCard({
          chatId: pending.chatId,
          chatType: pending.chatType,
          messageId: pending.messageId,
          sender: pending.sender,
          requestKey: executionKey,
          title: '生成受限',
          statusText: '失败',
          stageText: '生成Skills',
          etaText: '等待重试',
          summaryText: buildConcurrencyLimitSummary(MAX_USER_GENERATE_CONCURRENCY, '生成'),
          showInput: false,
          showAbort: false,
          showRetry: true,
          retryAction: CARD_RETRY_GENERATE_ACTION,
          retryLabel: '重试生成',
        });
        return;
      }

      retryContexts.delete(executionKey);

      if (userContent) {
        appendHistory(sessionKey, [{ role: 'user', content: userContent }]);
      }

      activeGenerations.set(executionKey, {
        sessionKey,
        userKey,
        startedAt: Date.now(),
        normalizedText: normalizeRequestText(rawInputText),
      });
      try {
        generated = await generateWorkflowByCopilot({
          query: finalQuery,
          progress: {
            chatId: pending.chatId,
            chatType: pending.chatType,
            messageId: pending.messageId,
            sender: pending.sender,
            text: PROGRESS_COPILOT_TEXT,
            requestKey: executionKey,
          },
        });
      } finally {
        activeGenerations.delete(executionKey);
      }
    } catch (error) {
      const errorText = normalizeErrorText(error?.message || error);
      const isModelResponse = Boolean(error?.isModelResponse);
      const summaryText = isModelResponse
        ? normalizeTerminology(errorText)
        : errorText
          ? `生成Skills失败：${errorText}\n请补充需求后再次提交。`
          : '生成Skills失败，请补充需求后再次提交。';
      clarifySessions.set(sessionKey, { history: nextUserHistory, files: mergedFiles });
      await sendProgressCard({
        chatId: pending.chatId,
        chatType: pending.chatType,
        messageId: pending.messageId,
        sender: pending.sender,
        requestKey: executionKey,
        title: '澄清需求',
        statusText: '澄清需求',
        stageText: '需求澄清',
        etaText: '等待回复',
        summaryText,
        showInput: true,
        forceInput: true,
        showAbort: false,
        inputPlaceholder: '请补充需求，或输入"中止"终止任务',
      });
      return;
    }

    if (!generated?.canvasId) {
      const summaryText = '生成Skills失败：未获取到有效Skills。\n请补充需求后再次提交。';
      clarifySessions.set(sessionKey, { history: nextUserHistory, files: mergedFiles });
      await sendProgressCard({
        chatId: pending.chatId,
        chatType: pending.chatType,
        messageId: pending.messageId,
        sender: pending.sender,
        requestKey: executionKey,
        title: '澄清需求',
        statusText: '澄清需求',
        stageText: '需求澄清',
        etaText: '等待回复',
        summaryText,
        showInput: true,
        forceInput: true,
        showAbort: false,
        inputPlaceholder: '请补充需求，或输入“中止”终止任务',
      });
      return;
    }

    logInfo('Copilot 生成完成', { canvasId: generated?.canvasId });
    clarifySessions.delete(sessionKey);
    const context = {
      user_input: resolvedQuery,
      user_files: fileKeys,
      user_file_names: fileNames,
      user_history: resolvedQuery,
    };
    const variables = buildRunVariablesFromPlan(generated?.workflowPlan, context);

    if (generated?.workflowPlan?.title) {
      await sendProgressCard({
        chatId: pending.chatId,
        chatType: pending.chatType,
        messageId: pending.messageId,
        sender: pending.sender,
        requestKey: executionKey,
        title: generated.workflowPlan.title,
        statusText: '已生成Skills',
        stageText: '准备执行',
        etaText: '即将开始',
        summaryText: 'Skills已生成，准备开始执行。',
        showAbort: false,
      });
    }

    const originText = rawInputText || (mergedFiles.length ? '（用户仅上传附件）' : '');
    const terminalTaskInfo = buildTerminalTaskInfo(generated?.workflowPlan);
    const runResult = await runWorkflow({
      chatId: pending.chatId,
      chatType: pending.chatType,
      messageId: pending.messageId,
      sender: pending.sender,
      canvasId: generated?.canvasId,
      variables,
      requestKey: executionKey,
      sessionKey,
      originText,
      terminalTaskInfo,
    });

    const outputs = runResult ?? {
      messages: [],
      files: [],
      status: 'unknown',
      finalCardSent: false,
    };
    const shouldSendSummaryCard =
      generated?.workflowPlan?.title && outputs.status !== 'failed' && !outputs.finalCardSent;
    if (shouldSendSummaryCard) {
      const outputsSummary = buildOutputSummary(outputs.messages);
      const filesSummary = Array.isArray(outputs.files)
        ? outputs.files
            .map((file) => file?.name || '文件')
            .filter(Boolean)
        : [];
      const summaryParts = [];
      if (outputs.status === 'timeout') {
        summaryParts.push('Skills执行超时。');
      } else {
        summaryParts.push('Skills执行完成。');
      }
      if (outputsSummary) summaryParts.push(`产物摘要：${outputsSummary}`);
      if (filesSummary.length) summaryParts.push(`产物文件：${filesSummary.join('、')}`);
      const title = outputs.status === 'timeout' ? '执行超时' : '执行完成';
      await sendProgressCard({
        chatId: pending.chatId,
        chatType: pending.chatType,
        messageId: pending.messageId,
        sender: pending.sender,
        requestKey: executionKey,
        title,
        statusText: outputs.status === 'timeout' ? '超时' : '完成',
        stageText: outputs.status === 'timeout' ? '执行超时' : '执行完成',
        etaText: outputs.status === 'timeout' ? '已超时' : '已完成',
        summaryText: summaryParts.join('\n'),
        showAbort: false,
      });
    }

    const outputsSummary = buildOutputSummary(outputs.messages);
    const filesSummary = Array.isArray(outputs.files)
      ? outputs.files
          .map((file) => ({
            name: file?.name || '文件',
            url: file?.url,
            size: file?.size,
          }))
          .filter((file) => file.url || file.name)
      : [];
    pushWorkflowSummary(sessionKey, {
      canvasId: generated?.canvasId,
      title: generated?.workflowPlan?.title,
      variablesSummary: buildVariablesSummary(variables),
      outputs: {
        textSummary: outputsSummary,
        files: filesSummary,
      },
      timestamp: Date.now(),
    });

    const finalNoteParts = [];
    if (outputs.status === 'failed') {
      finalNoteParts.push('Skills执行失败。');
    } else if (outputs.status === 'timeout') {
      finalNoteParts.push('Skills执行超时。');
    } else {
      finalNoteParts.push('Skills执行完成。');
    }
    if (outputsSummary) {
      finalNoteParts.push(`产物摘要：${outputsSummary}`);
    }
    if (filesSummary.length) {
      const fileNames = filesSummary.map((file) => file.name || '文件');
      finalNoteParts.push(`产物文件：${fileNames.join('、')}`);
    }
    const finalNote = finalNoteParts.join('\n');
    if (finalNote) {
      appendHistory(sessionKey, [{ role: 'assistant', content: finalNote }]);
    }
    return;
  } catch (error) {
    activeExecutions.delete(executionKey);
    await sendProgressCard({
      chatId: pending.chatId,
      chatType: pending.chatType,
      messageId: pending.messageId,
      sender: pending.sender,
      requestKey: executionKey,
      title: '处理失败',
      statusText: '失败',
      stageText: '处理失败',
      etaText: '已终止',
      summaryText: '处理失败，请稍后重试。',
      showAbort: false,
    });
    console.error('处理请求失败:', error);
  }
};

const handleCancelCommand = async ({ chatId, chatType, messageId, sender }) => {
  const key = buildSessionKey(chatId, sender);
  logInfo('收到取消指令', { key });

  const pending = pendingRequests.get(key);
  if (pending) {
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pendingRequests.delete(key);
    await sendTextMessage({
      chatId,
      chatType,
      messageId,
      sender,
      text: '已取消待处理请求。',
    });
    return;
  }

  if (clarifySessions.has(key)) {
    logInfo('取消澄清会话', { key });
    clarifySessions.delete(key);
    await sendTextMessage({
      chatId,
      chatType,
      messageId,
      sender,
      text: '已取消澄清流程。',
    });
    return;
  }

  const running = findLatestExecution(key);
  if (running?.executionId) {
    logInfo('尝试中止执行', {
      executionId: running.executionId,
      executionKey: running.executionKey,
    });
    const abortRes = await requestJson(
      `${API_BASE_URL}/openapi/workflow/${running.executionId}/abort`,
      { method: 'POST', headers: { ...buildHeaders(), 'Content-Type': 'application/json' } },
    );
    if (abortRes.ok && abortRes.data?.success) {
      await sendTextMessage({
        chatId,
        chatType,
        messageId,
        sender,
        text: '已发送中止请求。',
      });
    } else {
      await sendTextMessage({
        chatId,
        chatType,
        messageId,
        sender,
        text: '中止失败，请稍后重试。',
      });
    }
    return;
  }

  await sendTextMessage({
    chatId,
    chatType,
    messageId,
    sender,
    text: '当前没有可取消的任务。',
  });
};

const handleMessage = async (data) => {
  const message = data?.message ?? {};
  const messageId = message.message_id;
  if (messageId && processedMessageIds.has(messageId)) {
    logDebug('消息已处理过，忽略', { messageId });
    return;
  }
  if (messageId) processedMessageIds.add(messageId);

  const chatId = message.chat_id;
  const chatType = message.chat_type;
  const messageType = message.message_type;
  const contentObj = safeJsonParse(message.content);
  const mentions = normalizeMentions(message, contentObj);
  const sender = resolveSender(message.sender);
  logInfo('收到消息', { messageId, chatId, chatType, messageType, senderId: sender.id });
  if (isBotSender(sender)) {
    logInfo('忽略机器人自发消息', { messageId });
    return;
  }

  if (chatType !== 'p2p') {
    if (!BOT_USER_ID && !BOT_OPEN_ID) {
      await ensureBotIdentity();
    }
    if (!isBotMentioned(mentions)) {
      logDebug('群聊未@机器人，忽略', { messageId });
      return;
    }
  }

  let inputText = '';
  if (messageType === 'text') {
    const rawText = contentObj.text || '';
    inputText = stripMentions(rawText, mentions);
  }
  logDebug('解析文本', { inputText });

  if (inputText && CANCEL_PATTERN.test(inputText)) {
    await handleCancelCommand({ chatId, chatType, messageId, sender });
    return;
  }

  const attachments = extractAttachment(messageType, contentObj, messageId);
  if (attachments.length) {
    logInfo('检测到附件', { count: attachments.length });
  }

  const sessionKey = buildSessionKey(chatId, sender);
  const normalizedText = normalizeRequestText(inputText);
  if (normalizedText && attachments.length === 0 && isDuplicateRequest({ sessionKey, normalizedText })) {
    await sendTextMessage({
      chatId,
      chatType,
      messageId,
      sender,
      text: '相同请求已在处理中，已忽略本次提交。',
    });
    return;
  }

  await enqueueRequest({ chatId, chatType, messageId, sender, inputText, attachments });
};

const extractCardInputValue = (action) => {
  if (!action || typeof action !== 'object') return '';
  if (typeof action.input_value === 'string') {
    return action.input_value.trim();
  }
  const formValue = action.form_value;
  if (formValue && typeof formValue === 'object') {
    const direct = formValue[CARD_INPUT_NAME];
    if (Array.isArray(direct)) {
      return direct.filter(Boolean).join(' ').trim();
    }
    if (typeof direct === 'string') {
      return direct.trim();
    }
  }
  return '';
};

const resolveCardEvent = (data) => {
  if (!data || typeof data !== 'object') return {};
  if (data?.event?.action || data?.event?.context || data?.event?.operator) {
    return data.event;
  }
  if (data?.action || data?.context || data?.operator) {
    return data;
  }
  if (data?.event?.event?.action || data?.event?.event?.context) {
    return data.event.event;
  }
  return data?.event ?? {};
};

const isAbortCardAction = (action) => {
  if (!action) return false;
  const source = action?.value?.source;
  if (source && source !== 'refly_progress') return false;
  if (action?.value?.action === CARD_ABORT_ACTION) return true;
  if (action?.value === CARD_ABORT_ACTION) return true;
  if (action?.name === 'abort_button') return true;
  return false;
};

const resolveRetryAction = (action) => {
  if (!action) return '';
  const source = action?.value?.source;
  if (source && source !== 'refly_progress') return '';
  const value = action?.value;
  const actionValue = typeof value === 'string' ? value : value?.action;
  if (actionValue === CARD_RETRY_GENERATE_ACTION) return CARD_RETRY_GENERATE_ACTION;
  if (actionValue === CARD_RETRY_RUN_ACTION) return CARD_RETRY_RUN_ACTION;
  return '';
};

const handleRetryAction = async ({
  retryType,
  requestKey,
  chatId,
  chatType,
  messageId,
  sender,
}) => {
  const context = retryContexts.get(requestKey);
  if (!context || context.type !== (retryType === CARD_RETRY_RUN_ACTION ? 'run' : 'generate')) {
    return { toast: { type: 'warning', content: '重试信息已过期，请重新提交' } };
  }

  retryContexts.delete(requestKey);

  if (retryType === CARD_RETRY_RUN_ACTION) {
    await sendProgressCard({
      chatId,
      chatType,
      messageId,
      sender,
      requestKey,
      title: '准备重试',
      statusText: '重试中',
      stageText: '执行中',
      etaText: '即将开始',
      summaryText: '已开始重试执行，请稍候...',
      showAbort: false,
    });
    const runArgs = context.runArgs;
    if (!runArgs?.canvasId) {
      return { toast: { type: 'error', content: '重试参数不完整' } };
    }
    await runWorkflow({ ...runArgs, requestKey });
    return { toast: { type: 'info', content: '已开始重试' } };
  }

  await sendProgressCard({
    chatId,
    chatType,
    messageId,
    sender,
    requestKey,
    title: '准备重试',
    statusText: '重试中',
    stageText: '生成Skills',
    etaText: '即将开始',
    summaryText: '已开始重试生成，请稍候...',
    showAbort: false,
  });

  await enqueueRequest({
    chatId: context.chatId,
    chatType: context.chatType,
    messageId: context.messageId,
    sender: context.sender,
    inputText: context.inputText,
    attachments: context.attachments || [],
    requestKey,
    skipLoading: true,
    sessionKeyOverride: context.sessionKey,
  });
  return { toast: { type: 'info', content: '已开始重试' } };
};

const handleCardAction = async (data) => {
  const event = resolveCardEvent(data);
  const action = event?.action ?? {};
  const context = event?.context ?? {};
  const chatId = context.open_chat_id;
  const messageId = context.open_message_id;
  const sender = resolveOperator(event.operator);
  const chatType = 'group';

  if (!chatId || !messageId) {
    logWarn('卡片回调缺少上下文', {
      event: redactTokens(event),
      data: redactTokens(data),
    });
    return { toast: { type: 'error', content: '未识别会话信息' } };
  }

  const source = action?.value?.source;
  if (source && source !== 'refly_progress') {
    logDebug('忽略非本应用卡片回调', { source });
    return { toast: { type: 'info', content: '已忽略' } };
  }

  const progressEntry = findProgressByMessageId(messageId);
  const requestKey = progressEntry?.requestKey;
  if (!requestKey) {
    return { toast: { type: 'warning', content: '卡片已过期，请直接回复本会话' } };
  }

  if (isAbortCardAction(action)) {
    const result = await cancelByRequestKey({ requestKey, chatId, chatType, messageId, sender });
    if (result.ok) {
      return { toast: { type: 'info', content: '已尝试中止任务' } };
    }
    return { toast: { type: 'warning', content: '未找到可中止的任务' } };
  }

  const retryType = resolveRetryAction(action);
  if (retryType) {
    return await handleRetryAction({
      retryType,
      requestKey,
      chatId,
      chatType,
      messageId,
      sender,
    });
  }

  const inputText = extractCardInputValue(action);
  if (!inputText) {
    return { toast: { type: 'warning', content: '请输入内容后再提交' } };
  }

  if (CANCEL_PATTERN.test(inputText)) {
    const result = await cancelByRequestKey({ requestKey, chatId, chatType, messageId, sender });
    if (result.ok) {
      return { toast: { type: 'info', content: '已尝试中止任务' } };
    }
    return { toast: { type: 'warning', content: '未找到可中止的任务' } };
  }

  const cardData = buildProgressCardData({
    title: '已收到补充',
    statusText: '处理中',
    stageText: '需求澄清',
    etaText: '即将开始',
    summaryText: '已收到补充内容，正在处理。',
    requestId: requestKey,
    showInput: false,
    showAbort: false,
    latestInput: inputText,
  });

  await sendProgressCard({
    chatId,
    chatType,
    messageId,
    sender,
    requestKey,
    title: '已收到补充',
    statusText: '处理中',
    stageText: '需求澄清',
    etaText: '即将开始',
    summaryText: '已收到补充内容，正在处理。',
    showInput: false,
    showAbort: false,
    latestInput: inputText,
    lockInput: true,
  });
  await enqueueRequest({
    chatId,
    chatType,
    messageId,
    sender,
    inputText,
    attachments: [],
    requestKey,
    skipLoading: true,
    sessionKeyOverride: extractSessionKeyFromRequestKey(requestKey),
  });
  return {
    toast: { type: 'success', content: '已收到补充内容' },
    card: { type: 'raw', data: cardData },
  };
};

const eventDispatcher = new Lark.EventDispatcher({}).register({
  'im.message.receive_v1': async (data) => {
    if (!API_KEY) {
      console.error('缺少 REFLY_API_KEY');
      return;
    }
    try {
      await handleMessage(data);
    } catch (error) {
      console.error('处理消息失败:', error);
    }
  },
  'card.action.trigger': async (data) => {
    if (!API_KEY) {
      console.error('缺少 REFLY_API_KEY');
      return { toast: { type: 'error', content: '服务未就绪' } };
    }
    try {
      return await handleCardAction(data);
    } catch (error) {
      console.error('处理卡片回调失败:', error);
      return { toast: { type: 'error', content: '处理失败，请稍后重试' } };
    }
  },
});

if (!BOT_USER_ID && !BOT_OPEN_ID) {
  ensureBotIdentity().catch((error) => {
    logWarn('预热机器人信息失败', { error: formatErrorDetails(error) });
  });
}

wsClient.start({ eventDispatcher });
logInfo('机器人已启动', {
  apiBaseUrl: API_BASE_URL,
  locale: COPILOT_LOCALE,
  logLevel: LOG_LEVEL,
});
