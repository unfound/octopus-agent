/**
 * Trace Viewer — 日志可视化分析工具
 *
 * 读取 hooks 生成的 JSON 日志，输出调用链树状图
 *
 * 用法：
 *   npx tsx src/shared/trace.ts <log-file.json>
 *   npx tsx src/shared/trace.ts <log-file.json> --verbose   # 展开 messages
 *   npx tsx src/shared/trace.ts <log-file.json> --json      # 输出结构化 JSON
 */

import { readFileSync } from "fs";
import type { ModelMessage } from "ai";

// ====== 类型 ======

interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
}

interface ToolCall {
  toolName: string;
  args: unknown;
}

interface ToolResult {
  toolName: string;
  result: unknown;
}

interface LLMCallRecord {
  callIndex: number;
  timestamp: string;
  agentName: string;
  request: {
    messages: ModelMessage[];
    messageCount: number;
    roleStats: Record<string, number>;
  };
  response: {
    text: string;
    toolCalls: ToolCall[];
    toolResults: ToolResult[];
    usage: Usage;
    finishReason: string;
    durationMs: number;
  };
}

// ====== 格式化工具 ======

function truncate(s: string, max: number): string {
  const clean = s.replace(/\n/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

function formatTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return ms + "ms";
}

// finish reason 图标
function finishIcon(reason: string): string {
  switch (reason) {
    case "stop": return "✅";
    case "tool-calls": return "🔧";
    case "length": return "✂️";
    case "error": return "❌";
    default: return "⏰";
  }
}

// agentName 颜色（循环分配）
const AGENT_COLORS = [
  "\x1b[36m",  // cyan
  "\x1b[33m",  // yellow
  "\x1b[35m",  // magenta
  "\x1b[32m",  // green
  "\x1b[34m",  // blue
];
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function agentColor(agentName: string, colorMap: Map<string, number>): string {
  if (!colorMap.has(agentName)) {
    colorMap.set(agentName, colorMap.size % AGENT_COLORS.length);
  }
  return AGENT_COLORS[colorMap.get(agentName)!];
}

// ====== 核心渲染 ======

interface TraceLine {
  indent: number;        // 缩进层级（0=主agent，1=子agent）
  agentName: string;
  callIndex: number;
  textPreview: string;
  toolCalls: string[];   // tool names
  toolArgs: string[];    // 简化的 args
  tokens: number;
  duration: number;
  finishReason: string;
  // verbose 用
  messages?: ModelMessage[];
}

/**
 * 从日志记录推断调用树结构
 *
 * 规则：
 * - 当一条记录调用了 delegate/parallelDelegate → 下一条不同 agent 的记录是子调用，indent+1
 * - 子调用结束后（回到原 agent）→ indent 归位
 */
function buildTraceLines(records: LLMCallRecord[]): TraceLine[] {
  const lines: TraceLine[] = [];
  let currentIndent = 0;
  let primaryAgent = records[0]?.agentName ?? "agent";
  let inDelegate = false;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const isDelegateCall = r.response.toolCalls.some(
      tc => tc.toolName === "delegate" || tc.toolName === "parallelDelegate"
    );
    const isDifferentAgent = r.agentName !== primaryAgent;

    // 进入子调用
    if (isDelegateCall && i + 1 < records.length) {
      inDelegate = true;
      currentIndent = 0;
    }

    // 子 agent 的记录
    if (isDifferentAgent && inDelegate) {
      currentIndent = 1;
    }

    // 回到主 agent
    if (!isDifferentAgent && inDelegate && currentIndent > 0) {
      inDelegate = false;
      currentIndent = 0;
    }

    const toolNames = r.response.toolCalls.map(tc => tc.toolName);
    const toolArgs = r.response.toolCalls.map(tc => {
      const args = tc.args as Record<string, unknown>;
      // 提取关键参数
      if (args?.goal) return `goal="${truncate(String(args.goal), 30)}"`;
      if (args?.path) return `path="${String(args.path)}"`;
      if (args?.query) return `query="${truncate(String(args.query), 30)}"`;
      if (args?.command) return `cmd="${truncate(String(args.command), 30)}"`;
      return Object.keys(args ?? {}).slice(0, 2).join(", ");
    });

    // 文本预览
    let textPreview = "";
    if (r.response.text) {
      textPreview = truncate(r.response.text, 50);
    }

    lines.push({
      indent: currentIndent,
      agentName: r.agentName,
      callIndex: r.callIndex,
      textPreview,
      toolCalls: toolNames,
      toolArgs,
      tokens: r.response.usage.totalTokens,
      duration: r.response.durationMs,
      finishReason: r.response.finishReason,
      messages: r.request.messages,
    });

    // delegate 调用后，更新 primaryAgent 为子 agent
    if (isDelegateCall && i + 1 < records.length) {
      primaryAgent = records[i + 1].agentName;
    }
  }

  return lines;
}

/**
 * 渲染单行为字符串
 */
function renderLine(line: TraceLine, colorMap: Map<string, number>, maxWidth: number): string {
  const color = agentColor(line.agentName, colorMap);
  const prefix = line.indent > 0 ? "  └ " : "";
  const agent = `${color}${line.agentName.padEnd(10)}${RESET}`;

  // 调用标识
  const callId = `${DIM}#${line.callIndex}${RESET}`;

  // 文本 + 工具
  let content = "";
  if (line.textPreview) {
    content = `"${line.textPreview}"`;
  }
  if (line.toolCalls.length > 0) {
    const toolStr = line.toolCalls.map((name, i) => {
      const arg = line.toolArgs[i] ? `(${line.toolArgs[i]})` : "()";
      return `${name}${arg}`;
    }).join(", ");
    content = content ? `${content} → ${toolStr}` : toolStr;
  }

  // 结束原因（非 stop 时显示）
  const finish = line.finishReason !== "stop" && line.finishReason !== "tool-calls"
    ? ` ${finishIcon(line.finishReason)} ${line.finishReason}`
    : "";

  // 右侧统计
  const stats = `${formatTokens(line.tokens)} tok ${formatDuration(line.duration)}`;

  // 缩进
  const indent = "  ".repeat(line.indent);

  return `${indent}${agent} ${callId} ${content}${finish}  ${DIM}${stats}${RESET}`;
}

/**
 * 渲染 verbose 模式：展开 messages
 */
function renderVerboseMessages(messages: ModelMessage[], indent: number): string[] {
  const lines: string[] = [];
  const pad = "  ".repeat(indent + 1);
  for (const msg of messages) {
    const preview = typeof msg.content === "string"
      ? truncate(msg.content, 80)
      : JSON.stringify(msg.content).slice(0, 80);
    lines.push(`${pad}${DIM}[${msg.role}] ${preview}${RESET}`);
  }
  return lines;
}

// ====== 汇总统计 ======

interface AgentStats {
  calls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalDuration: number;
  toolCalls: Map<string, number>;
}

function computeStats(records: LLMCallRecord[]): Map<string, AgentStats> {
  const stats = new Map<string, AgentStats>();

  for (const r of records) {
    if (!stats.has(r.agentName)) {
      stats.set(r.agentName, {
        calls: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0,
        totalDuration: 0, toolCalls: new Map(),
      });
    }
    const s = stats.get(r.agentName)!;
    s.calls++;
    s.totalTokens += r.response.usage.totalTokens;
    s.inputTokens += r.response.usage.inputTokens;
    s.outputTokens += r.response.usage.outputTokens;
    s.totalDuration += r.response.durationMs;

    for (const tc of r.response.toolCalls) {
      s.toolCalls.set(tc.toolName, (s.toolCalls.get(tc.toolName) ?? 0) + 1);
    }
  }

  return stats;
}

function renderSummary(records: LLMCallRecord[]): string[] {
  const lines: string[] = [];
  const stats = computeStats(records);
  const colorMap = new Map<string, number>();

  lines.push("");
  lines.push(`${"━".repeat(20)} Summary ${"━".repeat(20)}`);

  let totalCalls = 0;
  let totalTokens = 0;
  let totalDuration = 0;

  for (const [agent, s] of stats) {
    const color = agentColor(agent, colorMap);
    const tools = Array.from(s.toolCalls.entries())
      .map(([name, count]) => `${name}×${count}`)
      .join(", ");
    const toolStr = tools ? ` [${tools}]` : "";

    lines.push(
      `  ${color}${agent.padEnd(12)}${RESET}` +
      `${s.calls} calls | ` +
      `in ${formatTokens(s.inputTokens)} + out ${formatTokens(s.outputTokens)} = ${formatTokens(s.totalTokens)} tok | ` +
      `${formatDuration(s.totalDuration)}${toolStr}`
    );

    totalCalls += s.calls;
    totalTokens += s.totalTokens;
    totalDuration += s.totalDuration;
  }

  lines.push(`  ${DIM}${"─".repeat(50)}${RESET}`);
  lines.push(`  ${"Total".padEnd(12)} ${totalCalls} calls | ${formatTokens(totalTokens)} tok | ${formatDuration(totalDuration)}`);

  return lines;
}

// ====== 主函数 ======

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("用法: npx tsx src/shared/trace.ts <log-file.json> [--verbose] [--json]");
    process.exit(1);
  }

  const filePath = args[0];
  const verbose = args.includes("--verbose");
  const jsonMode = args.includes("--json");

  let records: LLMCallRecord[];
  try {
    const raw = readFileSync(filePath, "utf-8");
    records = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ 无法读取日志文件: ${filePath}`);
    console.error(err);
    process.exit(1);
  }

  if (records.length === 0) {
    console.log("日志为空，没有调用记录。");
    return;
  }

  // JSON 模式：直接输出结构化数据
  if (jsonMode) {
    const output = {
      file: filePath,
      totalCalls: records.length,
      agents: [...new Set(records.map(r => r.agentName))],
      timeline: records.map(r => ({
        agent: r.agentName,
        call: r.callIndex,
        text: r.response.text.slice(0, 100),
        tools: r.response.toolCalls.map(tc => tc.toolName),
        tokens: r.response.usage.totalTokens,
        durationMs: r.response.durationMs,
        finishReason: r.response.finishReason,
      })),
      stats: Object.fromEntries(
        Array.from(computeStats(records)).map(([name, s]) => [
          name,
          { calls: s.calls, tokens: s.totalTokens, durationMs: s.totalDuration },
        ])
      ),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Terminal 模式
  const colorMap = new Map<string, number>();
  const lines: string[] = [];

  // 标题
  const fileName = filePath.split("/").pop() ?? filePath;
  lines.push(`\n${"━".repeat(15)} Trace: ${fileName} ${"━".repeat(15)}\n`);

  // 调用链
  const traceLines = buildTraceLines(records);
  for (const tl of traceLines) {
    lines.push(renderLine(tl, colorMap, 80));

    // verbose: 展开 messages
    if (verbose && tl.messages) {
      lines.push(...renderVerboseMessages(tl.messages, tl.indent + 1));
    }
  }

  // 汇总
  lines.push(...renderSummary(records));

  console.log(lines.join("\n"));
}

main();
