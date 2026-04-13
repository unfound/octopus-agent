/**
 * PeerAgent — 对等 Agent
 *
 * 与 SubAgent 的核心区别：
 * 1. 长驻 — 注册到 MessageBus 后持续运行，不是一次性的
 * 2. 完整工具集 — 没有工具过滤，所有工具可用
 * 3. 双向通信 — 可以主动发消息给其他 Agent
 * 4. 独立身份 — 有 name + description，其他 Agent 可以发现和引用
 *
 * 与 07 Agent 的区别：
 * 1. 没有技能系统（简化）
 * 2. 加了 MessageBus 通信能力
 * 3. 可以处理来自其他 Agent 的消息（不仅限于用户输入）
 */

import {
  generateText,
  tool,
  type ToolSet,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import { MessageStore } from "../shared/message-store";
import {
  WindowManager,
  type WindowStrategy,
  slidingWindow,
} from "../03-memory/window";
import type { AgentHooks } from "../shared/hooks";
import type { MessageBus, AgentMessage, HandlerResult } from "./message-bus";

/** PeerAgent 配置 */
export interface PeerAgentConfig {
  /** Agent 名称（必须唯一） */
  name: string;
  /** 描述这个 Agent 的能力（其他 Agent 可以看到） */
  description: string;
  /** 模型 */
  model?: string;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 可用工具集 */
  tools?: ToolSet;
  /** 最大迭代次数（处理单条消息时） */
  maxTurns?: number;
  /** 窗口策略 */
  strategy?: WindowStrategy;
  /** Hooks */
  hooks?: AgentHooks;
  /** 消息总线 */
  bus: MessageBus;
}

/**
 * PeerAgent — 对等 Agent
 *
 * 用法：
 * ```typescript
 * const bus = new MessageBus();
 *
 * const researcher = new PeerAgent({
 *   name: "researcher",
 *   description: "负责信息搜索和分析",
 *   bus,
 *   tools: { webSearch, readFile },
 *   systemPrompt: "你是一个研究员...",
 * });
 *
 * // 处理用户输入
 * const reply = await researcher.chat("研究 TypeScript 类型系统");
 *
 * // 主动发消息给其他 Agent
 * const response = await researcher.requestFrom("writer", "write_report", {
 *   findings: researchResult,
 * });
 * ```
 */
export class PeerAgent {
  readonly name: string;
  readonly description: string;
  private model: ReturnType<typeof getModel>;
  private store: MessageStore;
  private windowManager: WindowManager;
  private maxTurns: number;
  private tools: ToolSet;
  private hooks?: AgentHooks;
  private bus: MessageBus;
  private systemPrompt: string;

  constructor(config: PeerAgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.model = getModel(config.model);
    this.maxTurns = config.maxTurns ?? 10;
    this.tools = config.tools ?? {};
    this.hooks = config.hooks;
    this.bus = config.bus;
    this.systemPrompt = config.systemPrompt ?? buildDefaultPrompt(this);

    // 初始化存储
    this.store = new MessageStore();
    this.windowManager = new WindowManager(
      this.store,
      config.strategy ?? slidingWindow(20),
    );

    // 注入 system prompt
    this.store.add({ role: "system", content: this.systemPrompt });

    // 注册到 MessageBus
    this.bus.register(this.name, this.handleBusMessage.bind(this));
  }

  /** 获取 agent 描述信息（用于发现） */
  getInfo() {
    return { name: this.name, description: this.description };
  }

  /**
   * 处理用户输入（主对话入口）
   */
  async chat(userMessage: string): Promise<string> {
    this.store.add({ role: "user", content: userMessage });
    return this.runLoop();
  }

  /**
   * 主动向另一个 Agent 发送消息并等待回复（RPC）
   */
  async requestFrom(
    target: string,
    action: string,
    payload: unknown,
  ): Promise<AgentMessage> {
    return this.bus.request({
      from: this.name,
      to: target,
      action,
      payload,
    });
  }

  /**
   * 主动向另一个 Agent 发送通知（单向）
   */
  sendTo(target: string, action: string, payload: unknown): void {
    this.bus.send({
      from: this.name,
      to: target,
      action,
      payload,
    });
  }

  /**
   * 处理来自 MessageBus 的消息
   *
   * 核心逻辑：把消息注入对话上下文，让 LLM 决定如何回复
   */
  private async handleBusMessage(
    msg: AgentMessage,
  ): Promise<HandlerResult> {
    // 把其他 Agent 的消息格式化后注入对话
    const formattedMsg = `[来自 Agent "${msg.from}"] (${msg.action})\n${
      typeof msg.payload === "string"
        ? msg.payload
        : JSON.stringify(msg.payload, null, 2)
    }`;

    this.store.add({ role: "user", content: formattedMsg });

    // 运行 agent loop 生成回复
    const response = await this.runLoop();

    return {
      reply: response,
    };
  }

  /**
   * Agent 执行循环
   *
   * 复用 07 Agent 的模式：while loop + generateText + tool calls
   */
  private async runLoop(): Promise<string> {
    const injectedMessages = await this.windowManager.apply();
    let finalText = "";

    for (let turn = 0; turn < this.maxTurns; turn++) {
      const messages: ModelMessage[] = [
        ...injectedMessages,
        ...this.store.getMessages(),
      ];

      const result = await generateText({
        model: this.model,
        messages,
        tools: this.tools,
      });

      // 没有工具调用 → 结束
      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalText = result.text || "";
        this.store.add({ role: "assistant", content: finalText });
        return finalText;
      }

      // 有工具调用
      this.store.add({
        role: "assistant",
        content: result.text || "",
      });

      for (const tc of result.toolCalls) {
        const toolResult = result.toolResults?.find(
          (tr) => tr.toolCallId === tc.toolCallId,
        );

        this.hooks?.onToolCall?.(tc.toolName, tc.input);

        const toolResultPart = {
          type: "tool-result" as const,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: toolResult
            ? { type: "json" as const, value: toolResult.output }
            : { type: "text" as const, value: "工具执行完成" },
        };
        this.store.add({ role: "tool", content: [toolResultPart] });

        if (toolResult) {
          this.hooks?.onToolResult?.(tc.toolName, toolResult.output);
        }
      }

      finalText = result.text;
    }

    if (!finalText) {
      finalText = "达到最大迭代次数，Agent 停止。";
    }
    this.store.add({ role: "assistant", content: finalText });
    return finalText;
  }

  /** 销毁 Agent（从 Bus 注销） */
  destroy(): void {
    this.bus.unregister(this.name);
  }
}

/** 构建默认系统提示词 */
function buildDefaultPrompt(agent: PeerAgent): string {
  return [
    `你是 Agent "${agent.name}"。`,
    `你的能力：${agent.description}`,
    "",
    "你可以使用工具来完成任务。",
    "当收到来自其他 Agent 的消息时，根据消息内容和你的能力做出响应。",
    "如果你认为另一个 Agent 更适合处理某项任务，可以发消息请求他们协助。",
    "",
    "回答要简洁、有条理。",
  ].join("\n");
}

/**
 * 创建 listAgents 工具 — 让 Agent 能发现其他 Agent
 */
export function createListAgentsTool(bus: MessageBus) {
  return tool({
    description: "列出当前在线的所有 Agent 及其能力描述",
    inputSchema: z.object({}),
    execute: async () => {
      const agents = bus.getRegisteredAgents();
      return {
        agents: agents.map((name) => ({
          name,
          // 从 bus 的 handler 注册信息中获取描述（简化版）
          status: "online",
        })),
        count: agents.length,
      };
    },
  });
}
