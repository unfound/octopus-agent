/**
 * 09 - PeerAgent（对等 Agent）
 *
 * 与 BaseAgent 的关系：继承核心 runLoop，添加 MessageBus 通信能力
 *
 * PeerAgent 的特点：
 * 1. 长驻 — 注册到 MessageBus 后持续运行
 * 2. 完整工具集 — 没有工具过滤
 * 3. 双向通信 — 可以主动发消息给其他 Agent
 * 4. 独立身份 — 有 name + description
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import { BaseAgent, type BaseAgentConfig } from "../shared/base-agent";
import type { MessageBus, AgentMessage, HandlerResult } from "./message-bus";

/** PeerAgent 配置 */
export interface PeerAgentConfig extends BaseAgentConfig {
  name: string;
  description: string;
  systemPrompt?: string;
  tools?: ToolSet;
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
 * const reply = await researcher.chat("研究 TypeScript 类型系统");
 * const response = await researcher.requestFrom("writer", "write_report", { findings });
 * ```
 */
export class PeerAgent extends BaseAgent {
  readonly description: string;
  private bus: MessageBus;
  private systemPrompt: string;

  constructor(config: PeerAgentConfig) {
    super(config);
    this.description = config.description;
    this.bus = config.bus;
    this.systemPrompt = config.systemPrompt ?? buildDefaultPrompt(this);

    // 注入 system prompt
    this.store.add({ role: "system", content: this.systemPrompt });

    // 注册到 MessageBus
    this.bus.register(this.name, this.handleBusMessage.bind(this));
  }

  /** 获取 agent 描述信息（用于发现） */
  getInfo() {
    return { name: this.name, description: this.description };
  }

  /** 处理用户输入（主对话入口） */
  async chat(userMessage: string): Promise<string> {
    this.store.add({ role: "user", content: userMessage });
    const { finalText } = await this.runLoop();
    return finalText;
  }

  /** 主动向另一个 Agent 发送消息并等待回复（RPC） */
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

  /** 主动向另一个 Agent 发送通知（单向） */
  sendTo(target: string, action: string, payload: unknown): void {
    this.bus.send({
      from: this.name,
      to: target,
      action,
      payload,
    });
  }

  /** 处理来自 MessageBus 的消息 */
  private async handleBusMessage(
    msg: AgentMessage,
  ): Promise<HandlerResult> {
    const formattedMsg = `[来自 Agent "${msg.from}"] (${msg.action})\n${
      typeof msg.payload === "string"
        ? msg.payload
        : JSON.stringify(msg.payload, null, 2)
    }`;

    this.store.add({ role: "user", content: formattedMsg });

    const { finalText } = await this.runLoop();

    return {
      reply: finalText,
    };
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

/** 创建 listAgents 工具 — 让 Agent 能发现其他 Agent */
export function createListAgentsTool(bus: MessageBus) {
  return tool({
    description: "列出当前在线的所有 Agent 及其能力描述",
    inputSchema: z.object({}),
    execute: async () => {
      const agents = bus.getRegisteredAgents();
      return {
        agents: agents.map((name) => ({
          name,
          status: "online",
        })),
        count: agents.length,
      };
    },
  });
}
