/**
 * 03 - 带记忆的 Agent
 *
 * 在 02 的 ReAct 循环基础上，加入：
 * 1. MessageStore — 跨轮次保留对话历史
 * 2. WindowManager — 管理上下文窗口，防止爆 token
 * 3. 多轮对话 — agentChat 支持连续对话
 *
 * 核心区别：
 * - 02 的 agent 每次调用都是独立的（无状态）
 * - 03 的 agent 维护对话历史（有状态），可以引用之前聊过的内容
 */

import { generateText, type ModelMessage, type ToolResultPart, type JSONValue } from "ai";
import { getModel } from "../shared/model";
import { MessageStore } from "../shared/message-store";
import {
  WindowManager,
  type WindowStrategy,
  slidingWindow,
} from "./window";
import { tools } from "../02-tool-system/tools";

/** 系统提示词 */
const SYSTEM_PROMPT = `你是一个有用的 AI 助手，名叫 Octopus。
你可以使用工具来完成任务。
回答要简洁。`;

/**
 * 有状态的 Agent — 维护对话历史
 *
 * 和 02 的 agentChat 最大区别：
 * - 02: agentChat(msg) → 每次独立
 * - 03: agent.send(msg) → 记住之前的对话
 */
export class Agent {
  private store: MessageStore;
  private windowManager: WindowManager;
  private maxTurns: number;

  constructor(opts: {
    strategy?: WindowStrategy;
    maxTurns?: number;
    systemPrompt?: string;
  } = {}) {
    this.store = new MessageStore();
    this.windowManager = new WindowManager(
      this.store,
      opts.strategy ?? slidingWindow(20),
    );
    this.maxTurns = opts.maxTurns ?? 10;

    // 系统提示词作为第一条消息
    this.store.add({
      role: "system",
      content: opts.systemPrompt ?? SYSTEM_PROMPT,
    });
  }

  /**
   * 发送用户消息，返回助手回复
   *
   * ReAct 循环 + 记忆管理：
   * 1. 应用窗口策略（裁剪/压缩历史）
   * 2. 拼装完整消息列表
   * 3. 调用 LLM（带工具）
   * 4. 如果有工具调用，执行后回到 3
   * 5. 把最终回复存入历史
   */
  async send(userMessage: string): Promise<string> {
    // 存用户消息
    this.store.add({ role: "user", content: userMessage });

    // 应用窗口策略（可能压缩/截断历史）
    const injectedMessages = await this.windowManager.apply();

    // 拼装完整消息列表：系统 + 注入(摘要等) + 历史
    const messages: ModelMessage[] = [
      ...injectedMessages,
      ...this.store.getMessages(),
    ];

    const model = getModel();
    let turnCount = 0;

    // ReAct 循环
    while (turnCount < this.maxTurns) {
      turnCount++;

      const result = await generateText({
        model,
        messages,
        tools,
      });

      // 没有工具调用 → 最终回复
      if (!result.toolCalls || result.toolCalls.length === 0) {
        // 存助手回复到历史
        this.store.add({
          role: "assistant",
          content: result.text,
        });
        return result.text;
      }

      // 有工具调用 → 执行并继续循环
      // 把助手的回复（含 tool_calls）和工具结果都加到 messages
      messages.push({
        role: "assistant",
        content: result.text || "",
      });

      for (const tc of result.toolCalls) {
        const toolResult = result.toolResults?.find(
          (tr) => tr.toolCallId === tc.toolCallId,
        );

        const toolResultPart: ToolResultPart = {
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: toolResult
            ? { type: "json", value: toolResult.output as JSONValue }
            : { type: "text", value: "工具执行完成" },
        };

        messages.push({
          role: "tool",
          content: [toolResultPart],
        });
      }
    }

    // 超过最大轮次
    const fallback = "（达到最大工具调用次数限制）";
    this.store.add({ role: "assistant", content: fallback });
    return fallback;
  }

  /** 获取对话历史 */
  getHistory() {
    return this.store.getMessages();
  }

  /** 获取历史统计 */
  getStats() {
    return {
      messages: this.store.length,
      estimatedTokens: this.store.totalEstimatedTokens,
    };
  }

  /** 清空历史（保留系统提示词） */
  reset(): void {
    const systemMsg = this.store.getMessages()[0];
    this.store.clear();
    if (systemMsg) {
      this.store.add(systemMsg);
    }
  }

  /** 切换窗口策略 */
  setStrategy(strategy: WindowStrategy): void {
    this.windowManager.setStrategy(strategy);
  }
}
