/**
 * 08 - SubAgent（子代理）
 *
 * 与 07 的 Agent 相比，SubAgent 的核心区别：
 * 1. 独立上下文 — 不继承 parent 的对话历史，从零开始
 * 2. 可配置工具集 — 通过 tools 参数传入，而非写死
 * 3. 临时生命周期 — 任务完成即销毁，返回结构化结果
 * 4. 聚焦 system prompt — 由 goal + context 生成，没有技能系统
 *
 * 不继承 Agent，而是直接组合 shared 模块（MessageStore、WindowManager、hooks）
 * 这样更灵活，避免 Agent 的技能系统污染子代理
 */

import {
  generateText,
  tool,
  type ModelMessage,
  type ToolResultPart,
  type JSONValue,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import { MessageStore } from "../shared/message-store";
import {
  WindowManager,
  type WindowStrategy,
  slidingWindow,
} from "../03-memory/window";
import { type AgentHooks, type LLMCallRecord, countRoles } from "../shared/hooks";

/** 子代理运行结果 */
export interface SubAgentResult {
  /** 是否成功 */
  success: boolean;
  /** 最终摘要 */
  summary: string;
  /** 错误信息（如果失败） */
  error?: string;
  /** 统计信息 */
  stats: {
    /** LLM 调用次数 */
    apiCalls: number;
    /** 消息总数 */
    messageCount: number;
    /** 总 token 粗估 */
    estimatedTokens: number;
    /** 工具调用追踪 */
    toolTrace: Array<{ toolName: string; args: unknown; result: unknown }>;
  };
}

/** SubAgent 配置 */
export interface SubAgentConfig {
  /** 模型 ID（默认继承 parent） */
  model?: string;
  /** 最大迭代次数 */
  maxTurns?: number;
  /** 窗口策略 */
  strategy?: WindowStrategy;
  /** 可用工具集（默认空 — 纯对话代理） */
  tools?: ToolSet;
  /** 名称（用于日志） */
  name?: string;
  /** Hooks */
  hooks?: AgentHooks;
}

/**
 * 构建子代理的 system prompt
 *
 * 核心原则：
 * - 明确告诉 agent 它的任务是什么
 * - 要求完成后给出结构化摘要
 * - 不注入技能系统、记忆系统等复杂模块
 */
function buildSystemPrompt(goal: string, context?: string): string {
  const parts = [
    "你是一个专注的子代理，负责执行一个特定任务。",
    "",
    `你的任务：${goal}`,
  ];

  if (context?.trim()) {
    parts.push("", `上下文信息：${context}`);
  }

  parts.push(
    "",
    "请使用可用的工具完成任务。完成后，给出清晰简洁的摘要，包括：",
    "- 你做了什么",
    "- 你发现了什么或完成了什么",
    "- 创建或修改了哪些文件（如果有）",
    "- 遇到的任何问题",
    "",
    "注意：你的摘要将返回给父代理，请保持简洁但完整。",
  );

  return parts.join("\n");
}

/**
 * SubAgent — 临时子代理
 *
 * 用法：
 * ```typescript
 * const child = new SubAgent({
 *   model: "openrouter/stepfun/step-3.5-flash",
 *   tools: { readFile, execCommand },
 *   maxTurns: 10,
 * });
 *
 * const result = await child.run(
 *   "读取 package.json 并列出所有依赖",
 *   "项目在 /home/user/my-project"
 * );
 *
 * console.log(result.summary);
 * ```
 */
export class SubAgent {
  private model: ReturnType<typeof getModel>;
  private maxTurns: number;
  private tools: ToolSet;
  private name: string;
  private hooks?: AgentHooks;

  constructor(config: SubAgentConfig = {}) {
    this.model = getModel(config.model);
    this.maxTurns = config.maxTurns ?? 10;
    this.tools = config.tools ?? {};
    this.name = config.name ?? "subagent";
    this.hooks = config.hooks;
  }

  /**
   * 运行子代理
   *
   * @param goal 任务目标
   * @param context 可选上下文
   * @returns SubAgentResult
   */
  async run(goal: string, context?: string): Promise<SubAgentResult> {
    // 每次 run 创建独立的 store
    const store = new MessageStore();
    const windowManager = new WindowManager(store, slidingWindow(20));

    // 注入 system prompt
    store.add({
      role: "system",
      content: buildSystemPrompt(goal, context),
    });

    // 注入用户消息（触发执行）
    store.add({ role: "user", content: goal });

    const injectedMessages = await windowManager.apply();
    const toolTrace: SubAgentResult["stats"]["toolTrace"] = [];
    let callCounter = 0;

    try {
      for (let turn = 0; turn < this.maxTurns; turn++) {
        const messages: ModelMessage[] = [
          ...injectedMessages,
          ...store.getMessages(),
        ];
        callCounter++;

        // hooks
        const callIndex = callCounter;
        const timestamp = new Date().toISOString();
        const requestRecord = {
          callIndex,
          timestamp,
          agentName: this.name,
          request: {
            messages: [...messages],
            messageCount: messages.length,
            roleStats: countRoles(messages),
          },
        };
        this.hooks?.onLLMStart?.(requestRecord);

        const startTime = Date.now();
        const result = await generateText({
          model: this.model,
          messages,
          tools: this.tools,
        });
        const durationMs = Date.now() - startTime;

        // hooks
        const fullRecord: LLMCallRecord = {
          ...requestRecord,
          response: {
            text: result.text,
            toolCalls: (result.toolCalls ?? []).map((tc) => ({
              toolName: tc.toolName,
              args: tc.input,
            })),
            toolResults: (result.toolResults ?? []).map((tr) => ({
              toolName: tr.toolName,
              result: tr.output,
            })),
            usage: {
              inputTokens: result.usage.inputTokens ?? 0,
              outputTokens: result.usage.outputTokens ?? 0,
              totalTokens: result.usage.totalTokens ?? 0,
              reasoningTokens: result.usage.reasoningTokens,
            },
            finishReason: result.finishReason ?? "unknown",
            durationMs,
          },
        };
        this.hooks?.onLLMEnd?.(fullRecord);

        // 没有工具调用 → 结束
        if (!result.toolCalls || result.toolCalls.length === 0) {
          const summary = result.text || "任务完成，无输出。";
          store.add({ role: "assistant", content: summary });

          return {
            success: true,
            summary,
            stats: {
              apiCalls: callCounter,
              messageCount: store.length,
              estimatedTokens: store.totalEstimatedTokens,
              toolTrace,
            },
          };
        }

        // 处理工具调用
        store.add({
          role: "assistant",
          content: result.text || "",
        });

        for (const tc of result.toolCalls) {
          const toolResult = result.toolResults?.find(
            (tr) => tr.toolCallId === tc.toolCallId,
          );

          this.hooks?.onToolCall?.(tc.toolName, tc.input);

          // 记录 trace
          toolTrace.push({
            toolName: tc.toolName,
            args: tc.input,
            result: toolResult?.output,
          });

          const toolResultPart: ToolResultPart = {
            type: "tool-result",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            output: toolResult
              ? { type: "json", value: toolResult.output as JSONValue }
              : { type: "text", value: "工具执行完成" },
          };
          store.add({ role: "tool", content: [toolResultPart] });

          if (toolResult) {
            this.hooks?.onToolResult?.(tc.toolName, toolResult.output);
          }
        }
      }

      // 达到最大迭代次数
      return {
        success: false,
        summary: "达到最大迭代次数，子代理停止。",
        error: `超过最大迭代次数 (${this.maxTurns})`,
        stats: {
          apiCalls: callCounter,
          messageCount: store.length,
          estimatedTokens: store.totalEstimatedTokens,
          toolTrace,
        },
      };
    } catch (err) {
      return {
        success: false,
        summary: "",
        error: String(err),
        stats: {
          apiCalls: callCounter,
          messageCount: store.length,
          estimatedTokens: store.totalEstimatedTokens,
          toolTrace,
        },
      };
    }
  }
}
