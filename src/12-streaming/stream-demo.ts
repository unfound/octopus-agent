/**
 * 12-streaming — 流式输出核心演示
 *
 * 展示 Vercel AI SDK 的三种流模式：
 * 1. textStream — 逐 token 文本流（最简单）
 * 2. fullStream  — 完整事件流（文本 + 工具调用 + 工具结果）
 * 3. 工具调用流 — 流式场景下工具调用实时可见
 *
 * 对比 generateText vs streamText 的本质区别。
 */

import { streamText, generateText, type ToolSet } from "ai";
import { getModel } from "../shared/model";

// ====== 模式 1：textStream — 纯文本流 ======

/**
 * 最简单的流式输出：逐 token 打印
 *
 * textStream 是一个 AsyncIterable<string>，每个 chunk 是一个文本片段
 * 对于中文，通常一个 chunk = 1-2 个汉字
 * 对于英文，通常一个 chunk = 一个 token（可能是完整单词或子词）
 */
export async function demoTextStream(prompt: string, onChunk?: (chunk: string) => void): Promise<string> {
  const result = streamText({
    model: getModel(),
    prompt,
  });

  let fullText = "";

  for await (const chunk of result.textStream) {
    fullText += chunk;
    onChunk?.(chunk);
  }

  return fullText;
}

/**
 * 打字机效果 — 带延迟的流式输出
 *
 * 模拟 ChatGPT 的逐字打印效果
 */
export async function demoTypewriter(prompt: string): Promise<string> {
  const result = streamText({
    model: getModel(),
    prompt,
  });

  let fullText = "";
  process.stdout.write("\n🤖 ");

  for await (const chunk of result.textStream) {
    fullText += chunk;
    // 逐 chunk 打印，不加换行
    process.stdout.write(chunk);
    // 可选：微小延迟模拟打字机（省略以保持速度）
  }

  process.stdout.write("\n");
  return fullText;
}

// ====== 模式 2：fullStream — 完整事件流 ======

/** fullStream 事件类型 */
export type StreamEvent =
  | { type: "text"; content: string }
  | { type: "tool-call-start"; toolName: string; toolCallId: string }
  | { type: "tool-call-delta"; toolCallId: string; argsTextDelta: string }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown }
  | { type: "finish"; finishReason: string; usage: { totalTokens: number } }
  | { type: "error"; error: string };

/**
 * fullStream — 把所有流事件收集为结构化数组
 *
 * fullStream 返回的 part 类型包括：
 * - "text-delta"     → 文本增量
 * - "tool-call"      → LLM 决定调用工具（包含 toolName + args）
 * - "tool-result"    → 工具执行完毕（包含 result）
 * - "finish"         → 生成结束（包含 finishReason + usage）
 */
export async function demoFullStream(
  prompt: string,
  tools?: ToolSet,
): Promise<{ text: string; events: StreamEvent[] }> {
  const events: StreamEvent[] = [];
  let fullText = "";

  const result = streamText({
    model: getModel(),
    prompt,
    tools,
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        fullText += part.text;
        events.push({ type: "text", content: part.text });
        break;

      case "tool-call": {
        events.push({
          type: "tool-call-start",
          toolName: part.toolName,
          toolCallId: part.toolCallId,
        });
        break;
      }

      case "tool-result": {
        events.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: part.output,
        });
        break;
      }

      case "finish": {
        events.push({
          type: "finish",
          finishReason: part.finishReason,
          usage: {
            totalTokens: part.totalUsage?.totalTokens ?? 0,
          },
        });
        break;
      }

      case "error": {
        events.push({ type: "error", error: String(part.error) });
        break;
      }
    }
  }

  return { text: fullText, events };
}

// ====== 模式 3：工具调用流 — 流式场景下的工具调用 ======

/**
 * 流式 + 工具调用 — 实时展示 Agent 决策过程
 *
 * 与 generateText 的区别：
 * - generateText：等所有工具执行完 → 一次性获取 toolCalls + toolResults
 * - streamText：工具调用一开始就能知道，用户可以实时看到 Agent 在想什么
 */
export async function demoToolStream(
  prompt: string,
  tools: ToolSet,
): Promise<{
  text: string;
  toolCalls: Array<{ toolName: string; args: unknown }>;
  toolResults: Array<{ toolName: string; result: unknown }>;
}> {
  const toolCalls: Array<{ toolName: string; args: unknown }> = [];
  const toolResults: Array<{ toolName: string; result: unknown }> = [];
  let fullText = "";

  const result = streamText({
    model: getModel(),
    prompt,
    tools,
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        fullText += part.text;
        break;

      case "tool-call":
        toolCalls.push({
          toolName: part.toolName,
          args: part.input,
        });
        break;

      case "tool-result":
        toolResults.push({
          toolName: part.toolName,
          result: part.output,
        });
        break;
    }
  }

  return { text: fullText, toolCalls, toolResults };
}

// ====== 对比：generateText vs streamText ======

/**
 * 对比 generateText 和 streamText 的首字延迟
 *
 * generateText：调用 → 等待全部生成 → 返回
 * streamText：调用 → 收到第一个 chunk 即可处理
 *
 * 对于用户来说，首字延迟是最关键的用户体验指标。
 */
export async function benchmarkLatency(prompt: string): Promise<{
  generateTextLatency: number;
  streamTextFirstChunkLatency: number;
  generateTextFullLatency: number;
  streamTextFullLatency: number;
}> {
  // 测试 generateText
  const genStart = Date.now();
  await generateText({ model: getModel(), prompt });
  const generateTextFullLatency = Date.now() - genStart;
  // generateText 的首字延迟 = 完整延迟（因为一次性返回）
  const generateTextLatency = generateTextFullLatency;

  // 测试 streamText
  const streamStart = Date.now();
  let firstChunkLatency = 0;

  const streamResult = streamText({ model: getModel(), prompt });
  for await (const _chunk of streamResult.textStream) {
    if (firstChunkLatency === 0) {
      firstChunkLatency = Date.now() - streamStart;
    }
  }
  const streamFullLatency = Date.now() - streamStart;

  return {
    generateTextLatency,
    streamTextFirstChunkLatency: firstChunkLatency,
    generateTextFullLatency,
    streamTextFullLatency: streamFullLatency,
  };
}
