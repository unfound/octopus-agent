/**
 * Agent Hooks - 调试日志系统
 *
 * 捕获 agent 与大模型之间的完整通信：
 * 1. 请求：发送给模型的 messages、tools 配置
 * 2. 响应：模型返回的 text、toolCalls、toolResults、usage
 *
 * 设计原则：
 * - 完整数据写文件（人类事后分析用）
 * - Console 只输出摘要行（人类实时监控用，一行 = 一次 LLM 调用）
 * - 多 agent 场景用 agentName 区分来源
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { ModelMessage } from "ai";

/** 单次 LLM 调用的完整记录 */
export interface LLMCallRecord {
  /** 调用序号（per-agent） */
  callIndex: number;
  /** 时间戳 */
  timestamp: string;
  /** Agent 名称 — 多 agent 场景区分来源 */
  agentName: string;
  /** 发送给模型的完整 messages */
  request: {
    messages: ModelMessage[];
    messageCount: number;
    /** 消息角色分布统计 */
    roleStats: Record<string, number>;
  };
  /** 模型返回的结果 */
  response: {
    text: string;
    toolCalls: Array<{ toolName: string; args: unknown }>;
    toolResults: Array<{ toolName: string; result: unknown }>;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      reasoningTokens?: number;
    };
    finishReason: string;
    /** 耗时（毫秒） */
    durationMs: number;
  };
}

/** Hooks 接口 */
export interface AgentHooks {
  /** 每次 LLM 调用前触发 */
  onLLMStart?: (record: Omit<LLMCallRecord, "response">) => void | Promise<void>;
  /** 每次 LLM 调用后触发 */
  onLLMEnd?: (record: LLMCallRecord) => void | Promise<void>;
  /** 工具调用前触发 */
  onToolCall?: (toolName: string, args: unknown) => void | Promise<void>;
  /** 工具调用后触发 */
  onToolResult?: (toolName: string, result: unknown) => void | Promise<void>;
}

/** 日志配置 */
export interface LogConfig {
  /** 日志目录 */
  logDir: string;
  /** 日志文件名前缀（最终文件名 = prefix + 时间戳） */
  prefix: string;
  /** Console 输出级别：'summary' = 一行摘要, 'verbose' = 完整输出, false = 静默 */
  console: "summary" | "verbose" | false;
}

/**
 * 格式化调用摘要为一行
 *
 * 示例输出:
 *   ✅ [parent #1] 3 msgs → "Let me delegate..." | 3 tool-calls | 245 tokens | 1.2s
 *   ✅ [child  #1] 2 msgs → "File content is..."  | 1 tool-call  | 180 tokens | 0.8s
 */
function formatSummary(record: LLMCallRecord): string {
  const agent = record.agentName ?? "agent";
  const call = `#${record.callIndex}`;

  // 响应文本预览
  const textPreview = record.response.text
    ? `"${record.response.text.slice(0, 60).replace(/\n/g, " ")}${record.response.text.length > 60 ? "..." : ""}"`
    : "(no text)";

  // 工具调用摘要
  const toolInfo = record.response.toolCalls.length > 0
    ? `| ${record.response.toolCalls.map(t => t.toolName).join(", ")}`
    : "";

  const tokens = record.response.usage.totalTokens;
  const duration = (record.response.durationMs / 1000).toFixed(1);

  // finish reason 图标
  const icon = record.response.finishReason === "stop" ? "✅" : "⏰";

  return `${icon} [${agent} ${call}] ${record.request.messageCount} msgs → ${textPreview} ${toolInfo} | ${tokens} tok | ${duration}s`;
}

/**
 * 创建文件日志 hooks
 *
 * 把整个会话的 LLM 调用记录到单个 JSON 文件（完整数据）
 * Console 默认输出一行摘要（人类实时看）— 设置 console: 'verbose' 输出完整信息
 */
export function createFileLogHooks(config: Partial<LogConfig> = {}): AgentHooks & { logFile: string } {
  const logDir = config.logDir ?? join(process.cwd(), "logs");
  const consoleLevel = config.console ?? "summary";
  const prefix = config.prefix ?? "agent";

  // 确保日志目录存在
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // 生成唯一文件名：prefix-时间戳.json
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = join(logDir, `${prefix}-${timestamp}.json`);

  const records: LLMCallRecord[] = [];

  function flush() {
    writeFileSync(logFile, JSON.stringify(records, null, 2));
  }

  return {
    logFile,

    onLLMEnd(record) {
      records.push(record);
      flush();

      if (consoleLevel === "summary") {
        console.log(formatSummary(record));
      } else if (consoleLevel === "verbose") {
        const agent = record.agentName ?? "agent";
        console.log(`\n${"═".repeat(60)}`);
        console.log(`📞 [${agent}] Call #${record.callIndex} [${record.timestamp}]`);
        console.log(`${"═".repeat(60)}`);
        console.log(`📤 Request: ${record.request.messageCount} messages`);
        for (const msg of record.request.messages) {
          const preview = typeof msg.content === "string"
            ? msg.content.slice(0, 100)
            : JSON.stringify(msg.content).slice(0, 100);
          console.log(`   [${msg.role}] ${preview}${preview.length >= 100 ? "..." : ""}`);
        }
        console.log(`📥 Response (${record.response.durationMs}ms):`);
        if (record.response.text) {
          console.log(`   text: ${record.response.text.slice(0, 200)}`);
        }
        if (record.response.toolCalls.length > 0) {
          console.log(`   tools: ${record.response.toolCalls.map(t => t.toolName).join(", ")}`);
        }
        console.log(`   usage: ${record.response.usage.totalTokens} tokens`);
        console.log(`   finish: ${record.response.finishReason}`);
        console.log(`📁 Log: ${logFile}\n`);
      }
      // consoleLevel === false: 静默，只写文件
    },
  };
}

/**
 * 从 generateText 的原始结果提取 hook 记录
 *
 * 用于不走 BaseAgent 的场景（如 demo 中父代理直接调 generateText）
 *
 * ```typescript
 * const result = await generateText({ model, messages, tools });
 * emitHooksFromResult(hooks, "parent", result);
 * ```
 */
export function emitHooksFromResult(
  hooks: AgentHooks | undefined,
  agentName: string,
  result: { steps?: Array<Record<string, unknown>>; text?: string; usage?: Record<string, unknown>; finishReason?: string },
): void {
  if (!hooks?.onLLMEnd) return;

  const steps: Array<Record<string, unknown>> = (result as any).steps ?? [];
  let callIndex = 0;
  const startTime = Date.now();

  const emitRecord = (data: {
    text: string;
    toolCalls: Array<{ toolName: string; args: unknown }>;
    toolResults: Array<{ toolName: string; result: unknown }>;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    finishReason: string;
    messages?: ModelMessage[];
  }) => {
    callIndex++;
    const record: LLMCallRecord = {
      callIndex,
      timestamp: new Date().toISOString(),
      agentName,
      request: {
        messages: data.messages ?? [],
        messageCount: data.messages?.length ?? 0,
        roleStats: data.messages ? countRoles(data.messages) : {},
      },
      response: {
        text: data.text,
        toolCalls: data.toolCalls,
        toolResults: data.toolResults,
        usage: data.usage,
        finishReason: data.finishReason,
        durationMs: Date.now() - startTime,
      },
    };
    hooks.onLLMEnd!(record);
  };

  if (steps.length > 0) {
    for (const step of steps) {
      const s = step as any;
      emitRecord({
        text: s.text ?? "",
        toolCalls: (s.toolCalls ?? []).map((tc: any) => ({ toolName: tc.toolName, args: tc.input })),
        toolResults: (s.toolResults ?? []).map((tr: any) => ({ toolName: tr.toolName, result: tr.output })),
        usage: {
          inputTokens: s.usage?.inputTokens ?? 0,
          outputTokens: s.usage?.outputTokens ?? 0,
          totalTokens: s.usage?.totalTokens ?? 0,
        },
        finishReason: s.finishReason ?? "unknown",
      });
    }
  } else {
    emitRecord({
      text: result.text ?? "",
      toolCalls: [],
      toolResults: [],
      usage: {
        inputTokens: (result.usage as any)?.inputTokens ?? 0,
        outputTokens: (result.usage as any)?.outputTokens ?? 0,
        totalTokens: (result.usage as any)?.totalTokens ?? 0,
      },
      finishReason: result.finishReason ?? "unknown",
    });
  }
}

/**
 * 创建内存日志 hooks
 *
 * 把记录保存在内存数组中，适合测试和短会话
 */
export function createMemoryLogHooks(): AgentHooks & { getRecords: () => LLMCallRecord[] } {
  const records: LLMCallRecord[] = [];

  return {
    getRecords() {
      return records;
    },

    onLLMEnd(record) {
      records.push(record);
    },
  };
}

/**
 * 计算消息角色分布
 */
export function countRoles(messages: ModelMessage[]): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const msg of messages) {
    stats[msg.role] = (stats[msg.role] || 0) + 1;
  }
  return stats;
}
