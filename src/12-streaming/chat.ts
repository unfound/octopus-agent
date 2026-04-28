/**
 * 12-streaming 交互入口
 *
 * 展示流式输出的各种模式：
 * 1. textStream — 逐字打印
 * 2. fullStream — 事件驱动
 * 3. 工具调用流 — 带工具的流式
 * 4. 延迟对比 — generateText vs streamText
 *
 * 运行方式：
 *   npx tsx src/12-streaming/chat.ts text       # 纯文本流
 *   npx tsx src/12-streaming/chat.ts full       # 完整事件流
 *   npx tsx src/12-streaming/chat.ts tool       # 工具调用流
 *   npx tsx src/12-streaming/chat.ts benchmark  # 延迟对比
 *   npx tsx src/12-streaming/chat.ts interactive # 交互模式
 */

import { createInterface } from "node:readline";
import { tool } from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import {
  demoTextStream,
  demoFullStream,
  demoToolStream,
  benchmarkLatency,
} from "./stream-demo";

// ====== 演示工具 ======

/** 模拟的搜索工具 */
const mockSearch = tool({
  description: "搜索互联网获取信息",
  inputSchema: z.object({
    query: z.string().describe("搜索关键词"),
  }),
  execute: async ({ query }) => {
    return `搜索 "${query}" 的结果:\n1. TypeScript 5.0 发布了装饰器新语法\n2. Node.js 22 现已可用\n3. AI SDK v6 支持流式工具调用`;
  },
});

/** 模拟的文件读取工具 */
const mockReadFile = tool({
  description: "读取文件内容",
  inputSchema: z.object({
    path: z.string().describe("文件路径"),
  }),
  execute: async ({ path }) => {
    return `文件 ${path} 的内容:\n这是一个测试文件，用于演示流式工具调用。\n包含多行内容。`;
  },
});

const demoTools = { search: mockSearch, read_file: mockReadFile };

// ====== 演示函数 ======

/** 演示 1: textStream 打字机效果 */
async function demoText() {
  console.log("\n📦 Demo 1: textStream — 打字机效果\n");
  console.log("提问: 用 50 字介绍 TypeScript 的类型系统\n");

  const start = Date.now();
  let chunkCount = 0;

  const text = await demoTextStream(
    "用 50 字介绍 TypeScript 的类型系统",
    (chunk) => {
      chunkCount++;
      process.stdout.write(chunk);
    },
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n📊 统计: ${chunkCount} chunks, ${text.length} 字符, ${elapsed}s`);
}

/** 演示 2: fullStream — 完整事件流 */
async function demoFull() {
  console.log("\n📦 Demo 2: fullStream — 完整事件流\n");
  console.log("提问: TypeScript 和 JavaScript 的主要区别是什么？\n");

  const { text, events } = await demoFullStream(
    "TypeScript 和 JavaScript 的主要区别是什么？",
  );

  console.log(`\n📝 完整文本 (${text.length} 字符):`);
  console.log(text.slice(0, 200) + (text.length > 200 ? "..." : ""));

  console.log(`\n📊 事件统计:`);
  console.log(`   文本块: ${events.filter(e => e.type === "text").length}`);
  console.log(`   工具调用: ${events.filter(e => e.type === "tool-call-start").length}`);
  console.log(`   工具结果: ${events.filter(e => e.type === "tool-result").length}`);

  const finish = events.find(e => e.type === "finish");
  if (finish && "usage" in finish) {
    console.log(`   总 token: ${finish.usage.totalTokens}`);
  }
}

/** 演示 3: 工具调用流 */
async function demoTool() {
  console.log("\n📦 Demo 3: 工具调用流 — 实时查看 Agent 决策\n");
  console.log("提问: 搜索 TypeScript 5.0 的新特性，然后读取 README 文件\n");

  process.stdout.write("\n🎬 开始流式生成:\n");

  const { text, toolCalls, toolResults } = await demoToolStream(
    "搜索 TypeScript 5.0 的新特性，然后读取 README.md 文件的内容",
    demoTools,
  );

  console.log(`\n📝 最终文本: ${text.slice(0, 100)}...`);
  console.log(`\n🔧 工具调用 (${toolCalls.length}):`);
  for (const tc of toolCalls) {
    console.log(`   - ${tc.toolName}: ${JSON.stringify(tc.args).slice(0, 60)}`);
  }
  console.log(`\n✅ 工具结果 (${toolResults.length}):`);
  for (const tr of toolResults) {
    const resultStr = typeof tr.result === "string" ? tr.result.slice(0, 80) : JSON.stringify(tr.result).slice(0, 80);
    console.log(`   - ${tr.toolName}: ${resultStr}...`);
  }
}

/** 演示 4: 延迟对比 */
async function demoBenchmark() {
  console.log("\n📦 Demo 4: generateText vs streamText 延迟对比\n");
  console.log("⚠️  这会调用两次模型，请等待...\n");

  const prompt = "用一句话介绍什么是深度学习";

  try {
    const result = await benchmarkLatency(prompt);

    console.log("┌─────────────────┬──────────┬──────────┐");
    console.log("│      指标        │ generate │  stream  │");
    console.log("├─────────────────┼──────────┼──────────┤");
    console.log(`│ 首字延迟         │ ${String(result.generateTextLatency).padStart(5)}ms  │ ${String(result.streamTextFirstChunkLatency).padStart(4)}ms   │`);
    console.log(`│ 完整延迟         │ ${String(result.generateTextFullLatency).padStart(5)}ms  │ ${String(result.streamTextFullLatency).padStart(4)}ms   │`);
    console.log("└─────────────────┴──────────┴──────────┘");

    console.log("\n💡 关键观察:");
    console.log("  - generateText 的首字延迟 = 完整延迟（一次返回全部）");
    console.log("  - streamText 首字延迟远低于完整延迟（第一个 token 即返回）");
    console.log("  - 用户感知速度：streamText >> generateText");
    console.log("  - 总耗时相近：流式不会让模型变快，但让用户不等待");
  } catch (err) {
    console.error("延迟测试失败:", (err as Error).message);
    console.log("提示: 确保模型服务在运行");
  }
}

// ====== 交互模式 ======

async function interactiveMode() {
  console.log("\n💬 流式交互模式");
  console.log("输入问题，Agent 用流式输出回答。输入 'quit' 退出\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (;;) {
    const input = await ask("\n🧑 你: ");
    const trimmed = input.trim();
    if (trimmed.toLowerCase() === "quit") break;
    if (!trimmed) continue;

    messages.push({ role: "user", content: trimmed });

    // 使用 textStream 流式输出
    process.stdout.write("🤖 ");

    try {
      const { streamText } = await import("ai");
      const result = streamText({
        model: getModel(),
        messages,
      });

      let fullResponse = "";
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        process.stdout.write(chunk);
      }
      process.stdout.write("\n");

      messages.push({ role: "assistant", content: fullResponse });
    } catch (err) {
      console.error(`\n❌ 错误: ${(err as Error).message}`);
    }
  }

  rl.close();
}

// ====== 入口 ======

async function main() {
  const mode = process.argv[2] || "text";

  switch (mode) {
    case "text":
      await demoText();
      break;
    case "full":
      await demoFull();
      break;
    case "tool":
      await demoTool();
      break;
    case "benchmark":
      await demoBenchmark();
      break;
    case "interactive":
      await interactiveMode();
      break;
    default:
      console.log("用法: npx tsx src/12-streaming/chat.ts [text|full|tool|benchmark|interactive]");
  }
}

main().catch(console.error);
