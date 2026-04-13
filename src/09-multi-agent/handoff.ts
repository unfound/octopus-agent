/**
 * Handoff — Agent 间对等转交
 *
 * 与 Sub-Agent delegate 的区别：
 * - delegate: parent 创建 child，child 完成后销毁
 * - handoff: Agent A 把当前上下文转给 Agent B，B 接手处理
 *
 * 类似 OpenAI Swarm 的 handoff 机制
 * 没有"上级"，Agent 自己判断该转给谁
 */

import { tool } from "ai";
import { z } from "zod";
import type { MessageBus, AgentMessage } from "./message-bus";

/** Handoff 结果 */
export interface HandoffResult {
  /** 是否转交成功 */
  success: boolean;
  /** 接手的 Agent 名称 */
  targetAgent: string;
  /** 转交原因 */
  reason: string;
  /** 目标 Agent 的回复 */
  response?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 创建 handoff 工具
 *
 * Agent 把此工具加入工具集，即可在对话中将任务转交给其他 Agent：
 *
 * ```typescript
 * const researcher = new PeerAgent({
 *   name: "researcher",
 *   bus,
 *   tools: {
 *     ...myTools,
 *     handoff: createHandoffTool(bus, "researcher"),
 *   },
 * });
 * ```
 *
 * @param bus MessageBus 实例
 * @param currentAgent 当前 Agent 名称（用于消息来源标识）
 */
export function createHandoffTool(bus: MessageBus, currentAgent: string) {
  return tool({
    description:
      "将当前任务转交给另一个更合适的 Agent 处理。" +
      "当任务超出你的能力范围，或者另一个 Agent 有更专业的工具时使用。" +
      "转交时会带上任务上下文，对方会直接处理并返回结果。",
    inputSchema: z.object({
      target: z.string().describe("目标 Agent 名称"),
      reason: z.string().describe("为什么要转交给这个 Agent"),
      context: z.string().describe("要传递给目标 Agent 的任务描述和上下文"),
    }),
    execute: async ({ target, reason, context }): Promise<HandoffResult> => {
      // 检查目标 Agent 是否在线
      const agents = bus.getRegisteredAgents();
      if (!agents.includes(target)) {
        return {
          success: false,
          targetAgent: target,
          reason,
          error: `Agent "${target}" 未在线。可用 Agent: ${agents.join(", ")}`,
        };
      }

      // 不能转给自己
      if (target === currentAgent) {
        return {
          success: false,
          targetAgent: target,
          reason,
          error: "不能转交给自己",
        };
      }

      try {
        // 通过 MessageBus 发送转交请求
        const response = await bus.request({
          from: currentAgent,
          to: target,
          action: "handoff",
          payload: {
            reason,
            context,
            fromAgent: currentAgent,
          },
        });

        return {
          success: true,
          targetAgent: target,
          reason,
          response:
            typeof response.payload === "string"
              ? response.payload
              : JSON.stringify(response.payload),
        };
      } catch (err) {
        return {
          success: false,
          targetAgent: target,
          reason,
          error: `转交失败: ${err}`,
        };
      }
    },
  });
}

/**
 * 创建 broadcast 工具 — 向所有 Agent 广播消息
 *
 * 用于通知类消息（不需要回复）
 */
export function createBroadcastTool(bus: MessageBus, currentAgent: string) {
  return tool({
    description:
      "向所有在线 Agent 广播一条通知消息（单向，不需要回复）。" +
      "用于状态更新、知识共享等场景。",
    inputSchema: z.object({
      action: z.string().describe("消息动作名（如 'status_update', 'knowledge_share'）"),
      message: z.string().describe("要广播的消息内容"),
    }),
    execute: async ({ action, message }) => {
      const agents = bus.getRegisteredAgents().filter((a) => a !== currentAgent);

      for (const agent of agents) {
        bus.send({
          from: currentAgent,
          to: agent,
          action,
          payload: { message, fromAgent: currentAgent },
        });
      }

      return {
        success: true,
        notifiedAgents: agents,
        message: `已向 ${agents.length} 个 Agent 广播消息`,
      };
    },
  });
}
