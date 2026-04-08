/**
 * 基础 Agent - 最简单的单轮对话
 *
 * 核心概念：
 * - Agent = LLM + 指令模板
 * - 通过 instructions 给 Agent 定义角色和行为
 * - 模型格式: "provider/model-name" (如 "openrouter/qwen/qwen3.6-plus:free")
 */

import { Agent } from "@mastra/core/agent";

// Agent 的系统指令，定义 Agent 的角色和能力
const instructions = `
你是一个友好的 AI 助手。
请用简洁、有趣的方式回答用户的问题。
`;

/**
 * 创建基础 Agent
 *
 * @param model - 模型名称，默认使用 Qwen 免费模型
 *                   格式: "provider/model-name"
 * @returns Agent 实例
 */
export function createBasicAgent(
  model: string = "openrouter/qwen/qwen3.6-plus"
) {
  return new Agent({
    id: "basic-agent",
    name: "Basic Agent",
    instructions,
    model, // 直接传入字符串，Mastra 自动解析
  });
}

// 导出默认 Agent 实例
export const basicAgent = createBasicAgent();
