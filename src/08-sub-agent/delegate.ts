/**
 * delegate 工具 — 父代理委派子任务给 SubAgent
 *
 * 设计原则：
 * 1. 隔离 — 子代理有独立上下文，不继承 parent 历史
 * 2. 受限 — 排除危险工具（delegate、clarify 等）
 * 3. 临时 — 任务完成即销毁，只返回摘要
 * 4. 可并行 — 支持同时创建多个子代理
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { SubAgent, type SubAgentResult, type SubAgentConfig } from "./agent";
import type { AgentHooks } from "../shared/hooks";

/** 禁止子代理使用的工具名 */
const BLOCKED_TOOLS = new Set([
  "delegate",    // 禁止递归委派
  "clarify",     // 不能直接问用户
]);

/** 最大并发子代理数 */
const MAX_CONCURRENT = 3;

/** 委派配置 */
export interface DelegateConfig {
  /** 可用工具集（传给子代理前会过滤 blocked tools） */
  tools?: ToolSet;
  /** 默认模型（子代理继承） */
  model?: string;
  /** 最大迭代次数 */
  maxTurns?: number;
  /** Hooks */
  hooks?: AgentHooks;
}

/**
 * 过滤工具集，移除被禁止的工具
 */
function filterTools(tools: ToolSet): ToolSet {
  const filtered: ToolSet = {};
  for (const [name, t] of Object.entries(tools)) {
    if (!BLOCKED_TOOLS.has(name)) {
      filtered[name] = t;
    }
  }
  return filtered;
}

/**
 * 创建 delegate 工具
 *
 * 父代理把此工具加入自己的工具集，即可委派子任务：
 *
 * ```typescript
 * const myTools = {
 *   readFile: readFileTool,
 *   execCommand: execCommandTool,
 *   delegate: createDelegateTool({ tools: myTools }),
 * };
 * ```
 */
export function createDelegateTool(config: DelegateConfig = {}) {
  const childTools = filterTools(config.tools ?? {});
  let activeChildren = 0;

  return tool({
    description:
      "将子任务委派给一个独立的子代理执行。子代理有独立上下文和受限工具集，" +
      "完成后返回摘要。适用于：并行研究多个主题、隔离执行长任务、" +
      "需要独立上下文的子任务。不要递归委派。",
    inputSchema: z.object({
      goal: z.string().describe("要委派的任务目标，描述清晰具体"),
      context: z
        .string()
        .optional()
        .describe("任务上下文，提供子代理需要的背景信息"),
      toolNames: z
        .array(z.string())
        .optional()
        .describe(
          "允许子代理使用的工具名称列表（不传则使用所有可用工具，除了被禁止的）",
        ),
    }),
    execute: async ({ goal, context, toolNames }) => {
      // 检查并发限制
      if (activeChildren >= MAX_CONCURRENT) {
        return {
          success: false,
          error: `已达到最大并发子代理数 (${MAX_CONCURRENT})，请等待其他子代理完成后再试。`,
        };
      }

      // 如果指定了工具名，过滤出指定的工具
      let toolsForChild = childTools;
      if (toolNames && toolNames.length > 0) {
        toolsForChild = {};
        for (const name of toolNames) {
          if (childTools[name]) {
            toolsForChild[name] = childTools[name];
          }
        }
      }

      activeChildren++;
      try {
        const child = new SubAgent({
          model: config.model,
          maxTurns: config.maxTurns ?? 10,
          tools: toolsForChild,
          name: "delegate",
          hooks: config.hooks,
        });

        const result = await child.run(goal, context);

        return {
          success: result.success,
          summary: result.summary,
          error: result.error,
          stats: {
            apiCalls: result.stats.apiCalls,
            messageCount: result.stats.messageCount,
            estimatedTokens: result.stats.estimatedTokens,
          },
        };
      } finally {
        activeChildren--;
      }
    },
  });
}

/**
 * 创建并行 delegate 工具 — 同时委派多个子任务
 *
 * ```typescript
 * const parallelDelegate = createParallelDelegateTool({
 *   tools: myTools,
 * });
 * ```
 */
export function createParallelDelegateTool(config: DelegateConfig = {}) {
  const childTools = filterTools(config.tools ?? {});

  return tool({
    description:
      "同时委派多个子任务给多个子代理并行执行。每个子代理独立运行，" +
      "完成后返回所有结果的摘要。适用于：对比研究、并行数据收集、" +
      "多方案评估。",
    inputSchema: z.object({
      tasks: z
        .array(
          z.object({
            goal: z.string().describe("任务目标"),
            context: z.string().optional().describe("任务上下文"),
          }),
        )
        .min(1)
        .max(MAX_CONCURRENT)
        .describe(`子任务列表（最多 ${MAX_CONCURRENT} 个）`),
    }),
    execute: async ({ tasks }) => {
      // 并行创建子代理
      const children = tasks.map((task, i) => {
        const child = new SubAgent({
          model: config.model,
          maxTurns: config.maxTurns ?? 10,
          tools: childTools,
          name: `delegate-${i}`,
          hooks: config.hooks,
        });
        return child.run(task.goal, task.context);
      });

      const results = await Promise.all(children);

      return {
        success: results.every((r) => r.success),
        results: results.map((r, i) => ({
          taskIndex: i,
          goal: tasks[i].goal,
          success: r.success,
          summary: r.summary,
          error: r.error,
        })),
        totalApiCalls: results.reduce((sum, r) => sum + r.stats.apiCalls, 0),
      };
    },
  });
}
