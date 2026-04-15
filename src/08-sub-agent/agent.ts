/**
 * 08 - SubAgent（子代理）
 *
 * 与 BaseAgent 的关系：继承核心 runLoop，添加子代理特有的逻辑
 *
 * SubAgent 的特点：
 * 1. 独立上下文 — 每次 run() 创建新的 MessageStore
 * 2. 临时生命周期 — 任务完成即销毁，返回结构化结果
 * 3. 聚焦 system prompt — 由 goal + context 生成
 */

import type { ToolSet } from "ai";
import { MessageStore } from "../shared/message-store";
import { WindowManager, slidingWindow } from "../03-memory/window";
import { BaseAgent, type BaseAgentConfig } from "../shared/base-agent";

/** 子代理运行结果 */
export interface SubAgentResult {
  success: boolean;
  summary: string;
  error?: string;
  stats: {
    apiCalls: number;
    messageCount: number;
    estimatedTokens: number;
    toolTrace: Array<{ toolName: string; args: unknown; result: unknown }>;
  };
}

/** SubAgent 配置 */
export interface SubAgentConfig extends BaseAgentConfig {
  tools?: ToolSet;
}

/**
 * 构建子代理的 system prompt
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
 *   model: "local/qwen/qwen3.5-9b",
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
export class SubAgent extends BaseAgent {
  constructor(config: SubAgentConfig = {}) {
    // super() 创建的 store/windowManager 不会被使用
    // SubAgent 每次 run() 创建独立的新实例
    super(config);
  }

  async run(goal: string, context?: string): Promise<SubAgentResult> {
    // 每次 run 创建独立的 store
    const store = new MessageStore();
    const wm = new WindowManager(store, slidingWindow(20));

    store.add({
      role: "system",
      content: buildSystemPrompt(goal, context),
    });
    store.add({ role: "user", content: goal });

    try {
      const { finalText, stats } = await this.runLoop(store, wm);

      if (stats.apiCalls < this.maxTurns) {
        return {
          success: true,
          summary: finalText || "任务完成，无输出。",
          stats,
        };
      }

      return {
        success: false,
        summary: "达到最大迭代次数，子代理停止。",
        error: `超过最大迭代次数 (${this.maxTurns})`,
        stats,
      };
    } catch (err) {
      return {
        success: false,
        summary: "",
        error: String(err),
        stats: {
          apiCalls: 0,
          messageCount: store.length,
          estimatedTokens: store.totalEstimatedTokens,
          toolTrace: [],
        },
      };
    }
  }
}
