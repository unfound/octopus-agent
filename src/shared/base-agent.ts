/**
 * BaseAgent — 08/09 Agent 的共享基类
 *
 * 提取的公共逻辑：
 * 1. 模型/工具/Hooks 配置
 * 2. 核心 ReAct 循环（generateText + tool calls + hooks）
 *
 * SubAgent 和 PeerAgent 继承此类，只实现各自的差异化逻辑。
 */

import {
  generateText,
  stepCountIs,
  type ModelMessage,
  type ToolResultPart,
  type JSONValue,
  type ToolSet,
} from "ai";
import { getModel } from "./model";
import { MessageStore } from "./message-store";
import {
  WindowManager,
  type WindowStrategy,
  slidingWindow,
} from "../03-memory/window";
import { type AgentHooks, type LLMCallRecord, countRoles } from "./hooks";

/** agentLoop 的返回值 */
export interface AgentLoopResult {
  finalText: string;
  stats: {
    apiCalls: number;
    messageCount: number;
    estimatedTokens: number;
    toolTrace: Array<{ toolName: string; args: unknown; result: unknown }>;
  };
}

/** 基础 Agent 配置 */
export interface BaseAgentConfig {
  model?: string;
  maxTurns?: number;
  strategy?: WindowStrategy;
  tools?: ToolSet;
  name?: string;
  hooks?: AgentHooks;
}

/**
 * BaseAgent — 所有 Agent 的公共基类
 *
 * 提供核心的 runLoop 方法，子类只需实现各自的初始化和结果处理。
 */
export class BaseAgent {
  protected model: ReturnType<typeof getModel>;
  protected maxTurns: number;
  protected tools: ToolSet;
  protected name: string;
  protected hooks?: AgentHooks;
  protected store: MessageStore;
  protected windowManager: WindowManager;

  constructor(config: BaseAgentConfig = {}) {
    this.model = getModel(config.model);
    this.maxTurns = config.maxTurns ?? 10;
    this.tools = config.tools ?? {};
    this.name = config.name ?? "agent";
    this.hooks = config.hooks;
    this.store = new MessageStore();
    this.windowManager = new WindowManager(
      this.store,
      config.strategy ?? slidingWindow(20),
    );
  }

  /**
   * 核心 Agent 循环 — ReAct 模式
   *
   * 使用 AI SDK v6 的 stopWhen 控制循环，SDK 内部自动执行工具并继续调用模型。
   * 可传入自定义 store/windowManager（SubAgent 每次 run 创建新的）。
   */
  protected async runLoop(
    store?: MessageStore,
    wm?: WindowManager,
  ): Promise<AgentLoopResult> {
    const s = store ?? this.store;
    const w = wm ?? this.windowManager;

    const injectedMessages = await w.apply();
    const messages: ModelMessage[] = [
      ...injectedMessages,
      ...s.getMessages(),
    ];

    // === Hooks: onLLMStart（第一轮） ===
    let callCounter = 0;
    const toolTrace: AgentLoopResult["stats"]["toolTrace"] = [];

    const startTime = Date.now();

    // 单次 generateText + stopWhen，SDK 内部自动循环
    const result = await generateText({
      model: this.model,
      messages,
      tools: this.tools,
      stopWhen: stepCountIs(this.maxTurns),
    });

    // === 遍历每一步，触发 hooks + 收集 trace ===
    const steps: Array<any> = (result as any).steps ?? [];
    for (const step of steps) {
      callCounter++;

      const requestRecord: Omit<LLMCallRecord, "response"> = {
        callIndex: callCounter,
        timestamp: new Date().toISOString(),
        agentName: this.name,
        request: {
          messages: [...messages],
          messageCount: messages.length,
          roleStats: countRoles(messages),
        },
      };
      this.hooks?.onLLMStart?.(requestRecord);

      const fullRecord: LLMCallRecord = {
        ...requestRecord,
        response: {
          text: step.text ?? "",
          toolCalls: (step.toolCalls ?? []).map((tc: any) => ({
            toolName: tc.toolName,
            args: tc.input,
          })),
          toolResults: (step.toolResults ?? []).map((tr: any) => ({
            toolName: tr.toolName,
            result: tr.output,
          })),
          usage: {
            inputTokens: step.usage?.inputTokens ?? 0,
            outputTokens: step.usage?.outputTokens ?? 0,
            totalTokens: step.usage?.totalTokens ?? 0,
            reasoningTokens: step.usage?.reasoningTokens,
          },
          finishReason: step.finishReason ?? "unknown",
          durationMs: Date.now() - startTime,
        },
      };
      this.hooks?.onLLMEnd?.(fullRecord);

      // 收集 tool trace + 触发 onToolCall/onToolResult
      for (const tc of step.toolCalls ?? []) {
        const toolResult = (step.toolResults ?? []).find(
          (tr: any) => tr.toolCallId === tc.toolCallId,
        );

        this.hooks?.onToolCall?.(tc.toolName, tc.input);

        toolTrace.push({
          toolName: tc.toolName,
          args: tc.input,
          result: toolResult?.output,
        });

        if (toolResult) {
          this.hooks?.onToolResult?.(tc.toolName, toolResult.output);
        }
      }
    }

    // 如果没有 steps（无工具调用的简单场景），至少触发一次 hook
    if (steps.length === 0) {
      callCounter++;
      const requestRecord: Omit<LLMCallRecord, "response"> = {
        callIndex: callCounter,
        timestamp: new Date().toISOString(),
        agentName: this.name,
        request: {
          messages: [...messages],
          messageCount: messages.length,
          roleStats: countRoles(messages),
        },
      };
      this.hooks?.onLLMStart?.(requestRecord);
      this.hooks?.onLLMEnd?.({
        ...requestRecord,
        response: {
          text: result.text,
          toolCalls: [],
          toolResults: [],
          usage: {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            totalTokens: result.usage.totalTokens ?? 0,
          },
          finishReason: result.finishReason ?? "unknown",
          durationMs: Date.now() - startTime,
        },
      });
    }

    // === 更新 store（对话历史完整） ===
    // SDK 内部已经处理了工具调用，但 store 需要完整历史用于后续对话
    for (const step of steps) {
      if (step.text || (step.toolCalls?.length > 0)) {
        s.add({ role: "assistant", content: step.text || "" });
      }
      for (const tc of step.toolCalls ?? []) {
        const toolResult = (step.toolResults ?? []).find(
          (tr: any) => tr.toolCallId === tc.toolCallId,
        );
        const toolResultPart: ToolResultPart = {
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: toolResult
            ? { type: "json", value: toolResult.output as JSONValue }
            : { type: "text", value: "工具执行完成" },
        };
        s.add({ role: "tool", content: [toolResultPart] });
      }
    }

    // 最终文本
    let finalText = result.text || "";
    if (!finalText && steps.length > 0) {
      finalText = "达到最大迭代次数，Agent 停止。";
    }
    s.add({ role: "assistant", content: finalText });

    return {
      finalText,
      stats: {
        apiCalls: callCounter,
        messageCount: s.length,
        estimatedTokens: s.totalEstimatedTokens,
        toolTrace,
      },
    };
  }
}
