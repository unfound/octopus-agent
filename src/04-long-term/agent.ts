/**
 * 04 - 带长期记忆的 Agent
 *
 * 在 03 的基础上增加：
 * - 对话前：用 BM25 检索相关长期记忆，注入 system prompt
 * - 对话后：用 LLM 提取值得记住的内容，存入 JSONL
 *
 * 对比 OpenClaw：
 * - OpenClaw: memory.md 全量注入 → 浪费 token
 * - 我们:    BM25 检索 topK → 只注入最相关的
 */

import { generateText, type ModelMessage, type ToolResultPart, type JSONValue } from "ai";
import { getModel } from "../shared/model";
import { MessageStore } from "../shared/message-store";
import {
  WindowManager,
  type WindowStrategy,
  slidingWindow,
} from "../03-memory/window";
import { tools } from "../02-tool-system/tools";
import { MemoryManager } from "./memory-manager";
import { MemoryStore } from "./memory-store";

/** 系统提示词模板 */
const SYSTEM_PROMPT = `你是一个有用的 AI 助手，名叫 Octopus。
你可以使用工具来完成任务。
回答要简洁。`;

export class Agent {
  private store: MessageStore;
  private windowManager: WindowManager;
  private model: ReturnType<typeof getModel>;
  private memoryManager: MemoryManager;
  private maxTurns: number;

  constructor(opts: {
    model?: string;
    strategy?: WindowStrategy;
    maxTurns?: number;
    systemPrompt?: string;
    memoryFile?: string;
  } = {}) {
    this.store = new MessageStore();
    this.windowManager = new WindowManager(
      this.store,
      opts.strategy ?? slidingWindow(20),
    );
    this.maxTurns = opts.maxTurns ?? 10;
    this.model = getModel(opts.model);

    const memoryStore = new MemoryStore(
      opts.memoryFile ?? "./data/memories.jsonl",
    );
    this.memoryManager = new MemoryManager(memoryStore, this.model);

    // 系统提示词（长期记忆会在 send 时动态注入）
    this.store.add({
      role: "system",
      content: opts.systemPrompt ?? SYSTEM_PROMPT,
    });
  }

  /** 初始化（加载长期记忆） */
  async init(): Promise<void> {
    await this.memoryManager.init();
  }

  /**
   * 发送用户消息，返回助手回复
   *
   * 完整流程：
   * 1. BM25 检索相关长期记忆 → 注入 system prompt
   * 2. 存用户消息 → 应用窗口策略
   * 3. ReAct 循环（带工具）
   * 4. LLM 提取新记忆 → 存入 JSONL
   */
  async send(userMessage: string): Promise<string> {
    // ═══ 1. 检索长期记忆 ═══
    // 先直接搜，搜不到就用 LLM 改写查询再搜
    const recalled = await this.memoryManager.recallWithRewrite(userMessage, 5);
    if (recalled.length > 0) {
      const memoryContext = this.memoryManager.formatForPrompt(recalled);
      // 注入到系统提示词后面
      this.store.add({ role: "system", content: memoryContext });
    }

    // ═══ 2. 存用户消息 + 窗口管理 ═══
    this.store.add({ role: "user", content: userMessage });
    const injectedMessages = await this.windowManager.apply();
    const messages: ModelMessage[] = [
      ...injectedMessages,
      ...this.store.getMessages(),
    ];

    // ═══ 3. ReAct 循环 ═══
    const model = this.model;
    let turnCount = 0;
    let finalText = "";

    while (turnCount < this.maxTurns) {
      turnCount++;
      const result = await generateText({ model, messages, tools });

      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalText = result.text;
        this.store.add({ role: "assistant", content: finalText });
        break;
      }

      // 工具调用
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
        messages.push({ role: "tool", content: [toolResultPart] });
      }

      finalText = result.text;
    }

    if (!finalText) {
      finalText = "达到最大迭代次数，Agent 停止。";
      this.store.add({ role: "assistant", content: finalText });
    }

    // ═══ 4. 提取长期记忆 ═══
    try {
      await this.memoryManager.extract(userMessage, finalText);
    } catch {
      // 记忆提取失败不应该阻断对话
    }

    return finalText;
  }

  /** 获取对话统计 */
  getStats() {
    return {
      messages: this.store.length,
      estimatedTokens: this.store.totalEstimatedTokens,
    };
  }

  /** 重置对话（保留长期记忆） */
  reset(): void {
    const systemMsg = this.store.getMessages()[0];
    this.store.clear();
    if (systemMsg) this.store.add(systemMsg);
  }
}
