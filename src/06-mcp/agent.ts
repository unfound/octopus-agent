/**
 * 06 - MCP Agent
 *
 * Agent 本身不关心工具从哪来 — 它只接收 tools 对象。
 * 工具可以来自：
 *   - 本地定义的 tool()（如 02-tool-system）
 *   - MCP Server（通过 mcp-loader 加载）
 *   - 混合来源
 *
 * 这就是解耦的价值：Agent 和 MCP 完全独立。
 */

import { generateText, type ModelMessage, type ToolCallPart, type ToolResultPart, type JSONValue } from "ai";
import { getModel } from "../shared/model";
import { tool } from "ai";

/**
 * Agent 对话（工具来源无关）
 *
 * @param userMessage - 用户输入
 * @param tools - 工具集合（来自任何来源）
 * @param options - 配置
 * @returns 最终回复文本
 */
export async function agentChat(
  userMessage: string,
  tools: Record<string, ReturnType<typeof tool>>,
  options?: {
    model?: string;
    system?: string;
    maxSteps?: number;
  }
) {
  const maxSteps = options?.maxSteps ?? 10;

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: options?.system ?? `你是一个助手，可以使用工具来完成任务。
根据用户需求选择合适的工具。
操作前先了解当前状态，操作后确认结果。`,
    },
    { role: "user", content: userMessage },
  ];

  for (let step = 0; step < maxSteps; step++) {
    const result = await generateText({
      model: getModel(options?.model),
      messages,
      tools,
    });

    if (!result.toolCalls || result.toolCalls.length === 0) {
      return result.text;
    }

    const assistantParts: Array<{ type: "text"; text: string } | ToolCallPart> = [];
    if (result.text) assistantParts.push({ type: "text", text: result.text });
    for (const tc of result.toolCalls) {
      assistantParts.push({
        type: "tool-call",
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
      });
    }
    messages.push({ role: "assistant", content: assistantParts });

    const toolResultParts: ToolResultPart[] = result.toolResults.map((tr) => ({
      type: "tool-result" as const,
      toolCallId: tr.toolCallId,
      toolName: tr.toolName,
      output: { type: "json" as const, value: tr.output as JSONValue },
    }));
    messages.push({ role: "tool", content: toolResultParts });
  }

  return "达到最大迭代次数，Agent 停止。";
}
