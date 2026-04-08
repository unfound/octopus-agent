/**
 * 基础 Agent - 最简单的单轮对话
 *
 * 核心概念：
 * - Agent = LLM + 指令模板
 * - 通过 instructions 给 Agent 定义角色和行为
 * - 模型格式: "provider/model-name"
 */

import { Agent } from "@mastra/core/agent";
import "dotenv/config";

// Agent 的系统指令，定义 Agent 的角色和能力
const instructions = `
你是一个友好的 AI 助手。
请用简洁、有趣的方式回答用户的问题。
`;

/**
 * 获取默认模型
 * 优先级：环境变量 > 默认值
 */
function getDefaultModel(): string {
  return process.env.DEFAULT_MODEL || "openrouter/stepfun/step-3.5-flash";
}

/**
 * 创建基础 Agent
 *
 * @param model - 模型名称，默认使用环境变量或 step-3.5-flash
 * @returns Agent 实例
 */
export function createBasicAgent(model?: string) {
  return new Agent({
    id: "basic-agent",
    name: "Basic Agent",
    instructions,
    model: model || getDefaultModel(),
  });
}

// 导出默认 Agent 实例
export const basicAgent = createBasicAgent();
