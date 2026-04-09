/**
 * 带工具调用的 Agent — ReAct 循环
 *
 * 核心概念：自己实现 Agent Loop
 *
 * 这是 Agent 的核心机制，不依赖任何框架的内置 Agent：
 *
 * ```
 * while (还有工具调用) {
 *   1. 调用 LLM（带 messages + tools）
 *   2. LLM 返回 → 可能有文本回复，也可能有工具调用
 *   3. 如果有工具调用 → 执行工具 → 把结果塞回 messages → 继续循环
 *   4. 如果没有工具调用 → 返回最终文本
 * }
 * ```
 *
 * Vercel AI SDK 在这里只做两件事：
 *   - generateText(): 发 HTTP 请求给 LLM
 *   - tool(): 定义工具的 schema + 执行逻辑
 *
 * 循环控制、消息管理全是我们自己的代码
 */

import { generateText, type ToolCallPart } from "ai";
import { getModel } from "../shared/model";
import { tools } from "./tools";

/**
 * Agent 对话（支持多轮工具调用）
 *
 * @param userMessage - 用户输入
 * @param options - 配置
 * @returns 最终回复文本
 */
export async function agentChat(
  userMessage: string,
  options?: {
    system?: string;
    model?: string;
    maxSteps?: number;
  }
) {
  const maxSteps = options?.maxSteps ?? 10;

  // 消息列表，手动管理
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content:
        options?.system ||
        `你是一个文件系统操作助手，具备以下能力：
1. 读取文件（readFile）
2. 写入文件（writeFile）
3. 执行命令（execCommand）

使用原则：
- 操作前先用 readFile 查看现有内容
- 写入文件时确认路径正确
- 执行命令注意安全`,
    },
    { role: "user", content: userMessage },
  ];

  // ══════════════════════════════════════════
  // ReAct 循环 — 这就是 Agent 的核心！
  // ══════════════════════════════════════════
  for (let step = 0; step < maxSteps; step++) {
    const result = await generateText({
      model: getModel(options?.model),
      messages,
      tools,
    });

    // 没有工具调用 → Agent 说完了，返回最终回答
    if (!result.toolCalls || result.toolCalls.length === 0) {
      return result.text;
    }

    // 有工具调用 → 把 assistant 的回复（含工具调用）加入消息
    // Vercel AI SDK 的 generateText 已经自动执行了工具
    // result.toolResults 包含了每个工具的执行结果

    // 把 assistant 的工具调用意图加入 messages
    const assistantParts: Array<
      { type: "text"; text: string } | ToolCallPart
    > = [];

    if (result.text) {
      assistantParts.push({ type: "text", text: result.text });
    }

    for (const tc of result.toolCalls) {
      assistantParts.push({
        type: "tool-call",
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
      });
    }

    messages.push({
      role: "assistant",
      content: JSON.stringify(assistantParts),
    } as any);

    // 把工具执行结果加入 messages
    for (const tr of result.toolResults) {
      messages.push({
        role: "user" as const,
        content: JSON.stringify([
          {
            type: "tool-result",
            toolCallId: tr.toolCallId,
            result: tr.output,
          },
        ]),
      } as any);
    }
  }

  return "达到最大迭代次数，Agent 停止。";
}
