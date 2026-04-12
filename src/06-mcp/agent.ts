/**
 * 06 - MCP Agent
 *
 * Agent 本身不关心工具从哪来 — 它只接收 tools 对象。
 * 工具可以来自：
 *   - 本地定义的 tool()（如 02-tool-system）
 *   - MCP Server（通过 mcp-loader 加载）
 *   - 混合来源
 *
 * 集成 hooks 系统，方便调试 LLM 调用过程。
 */

import { generateText, type ModelMessage, type ToolCallPart, type ToolResultPart, type JSONValue } from "ai";
import { getModel } from "../shared/model";
import { type AgentHooks, type LLMCallRecord, countRoles } from "../shared/hooks";
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
    hooks?: AgentHooks;
  }
) {
  const maxSteps = options?.maxSteps ?? 10;
  const hooks = options?.hooks;
  let callCounter = 0;

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
    callCounter++;

    // ══════════════════════════════════════════
    // Hooks: onLLMStart
    // ══════════════════════════════════════════
    const requestRecord = {
      callIndex: callCounter,
      timestamp: new Date().toISOString(),
      agentName: "mcp-agent",
      request: {
        messages: [...messages],
        messageCount: messages.length,
        roleStats: countRoles(messages),
      },
    };
    hooks?.onLLMStart?.(requestRecord);

    const startTime = Date.now();
    const result = await generateText({
      model: getModel(options?.model),
      messages,
      tools,
    });
    const durationMs = Date.now() - startTime;

    // ══════════════════════════════════════════
    // Hooks: onLLMEnd
    // ══════════════════════════════════════════
    const fullRecord: LLMCallRecord = {
      ...requestRecord,
      response: {
        text: result.text,
        toolCalls: (result.toolCalls ?? []).map(tc => ({
          toolName: tc.toolName,
          args: tc.input,
        })),
        toolResults: (result.toolResults ?? []).map(tr => ({
          toolName: tr.toolName,
          result: tr.output,
        })),
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
          reasoningTokens: result.usage.reasoningTokens,
        },
        finishReason: result.finishReason ?? "unknown",
        durationMs,
      },
    };
    hooks?.onLLMEnd?.(fullRecord);

    // 没有工具调用 → Agent 说完了
    if (!result.toolCalls || result.toolCalls.length === 0) {
      return result.text;
    }

    // 构造 assistant 消息
    const assistantParts: Array<{ type: "text"; text: string } | ToolCallPart> = [];
    if (result.text) assistantParts.push({ type: "text", text: result.text });
    for (const tc of result.toolCalls) {
      assistantParts.push({
        type: "tool-call",
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
      });

      // Hooks: onToolCall
      hooks?.onToolCall?.(tc.toolName, tc.input);
    }
    messages.push({ role: "assistant", content: assistantParts });

    // 构造 tool result 消息
    const toolResultParts: ToolResultPart[] = result.toolResults.map((tr) => {
      // Hooks: onToolResult
      hooks?.onToolResult?.(tr.toolName, tr.output);
      return {
        type: "tool-result" as const,
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        output: { type: "json" as const, value: tr.output as JSONValue },
      };
    });
    messages.push({ role: "tool", content: toolResultParts });
  }

  return "达到最大迭代次数，Agent 停止。";
}
