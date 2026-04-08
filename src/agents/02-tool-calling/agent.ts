/**
 * 带工具调用的 Agent
 *
 * 核心概念：
 * - 将工具注册到 Agent
 * - Agent 会自动判断何时调用工具
 * - ReAct 模式：思考 → 行动 → 观察 → 回答
 */

import { Agent } from "@mastra/core/agent";
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
 * 创建带工具的 Agent
 */
export function createToolAgent(
  model: string = "openrouter/qwen/qwen3.6-plus"
) {
  return new Agent({
    id: "time-assistant",
    name: "Time Assistant",
    instructions,
    model,
    tools: {
      getCurrentTime: timeTool, // 使用对象形式注册工具
    },
  });
}

// 导出默认实例
export const toolAgent = createToolAgent();
