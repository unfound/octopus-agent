/**
 * Agent Hooks - 调试日志系统
 *
 * 捕获 agent 与大模型之间的完整通信：
 * 1. 请求：发送给模型的 messages、tools 配置
 * 2. 响应：模型返回的 text、toolCalls、toolResults、usage
 *
 * 用途：调试、性能分析、理解 agent 的决策过程
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { ModelMessage, ToolSet } from "ai";

/** 单次 LLM 调用的完整记录 */
export interface LLMCallRecord {
  /** 调用序号 */
  callIndex: number;
  /** 时间戳 */
  timestamp: string;
  /** Agent 名称（用于区分多 agent 场景） */
  agentName?: string;
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
  /** 是否输出到控制台 */
  console: boolean;
}

/**
 * 创建文件日志 hooks
 *
 * 把整个会话的 LLM 调用记录到单个 JSON 文件
 * 每次调用自动生成唯一文件名（prefix + 时间戳）
 */
export function createFileLogHooks(config: Partial<LogConfig> = {}): AgentHooks & { logFile: string } {
  const logDir = config.logDir ?? join(process.cwd(), "logs");
  const toConsole = config.console ?? false;
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

    onLLMStart(record) {
      if (toConsole) {
        console.log(`\n⏳ LLM Call #${record.callIndex} started...`);
      }
    },

    onLLMEnd(record) {
      records.push(record);
      flush();

      if (toConsole) {
        console.log(`\n${"═".repeat(60)}`);
        console.log(`📞 LLM Call #${record.callIndex} [${record.timestamp}]`);
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
    },
  };
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
