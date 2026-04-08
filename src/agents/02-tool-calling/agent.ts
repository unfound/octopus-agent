/**
 * 带工具调用的 Agent
 *
 * 核心概念：
 * - 将工具注册到 Agent
 * - Agent 会自动判断何时调用工具
 * - ReAct 模式：思考 → 行动 → 观察 → 回答
 */

import { Agent } from "@mastra/core/agent";
import "dotenv/config";
import { timeTool } from "./tools/time-tool";

/**
 * 带工具的 Agent 指令
 */
const instructions = `
你是一个精确的时间助手。

当用户询问时间时：
1. 判断用户需要的时区
2. 使用 getCurrentTime 工具获取时间
3. 基于工具返回的结果回答用户

支持的常用时区：
- Asia/Shanghai（北京时间）
- America/New_York（纽约时间）
- Europe/London（伦敦时间）
- Asia/Tokyo（东京时间）
- UTC

如果用户没有指定时区，默认使用 Asia/Shanghai。
`;

/**
 * 获取默认模型
 * 优先级：环境变量 > 默认值
 */
function getDefaultModel(): string {
  return process.env.DEFAULT_MODEL || "openrouter/stepfun/step-3.5-flash";
}

/**
 * 创建带工具的 Agent
 */
export function createToolAgent(model?: string) {
  return new Agent({
    id: "time-assistant",
    name: "Time Assistant",
    instructions,
    model: model || getDefaultModel(),
    tools: {
      getCurrentTime: timeTool,
    },
  });
}

// 导出默认实例
export const toolAgent = createToolAgent();
