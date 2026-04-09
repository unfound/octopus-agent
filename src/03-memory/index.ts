/**
 * 03 - 记忆系统演示
 *
 * 演示三种场景：
 * 1. 基本多轮对话 — Agent 能记住前面聊过什么
 * 2. 窗口策略切换 — 对比滑动窗口 vs token 预算 vs 摘要压缩
 * 3. 长对话压缩 — 模拟上下文溢出，观察自动压缩
 *
 * 运行方式：
 * npx tsx src/03-memory/index.ts
 */

import { Agent } from "./agent";
import { slidingWindow, tokenBudget, summaryCompression } from "./window";

async function demo1_basicMemory() {
  console.log("━━━ 场景 1：基本多轮对话 ━━━\n");

  const agent = new Agent();

  // 第一轮：自我介绍
  const r1 = await agent.send("我叫 Octopus，是个 TypeScript 开发者。");
  console.log("👤 我叫 Octopus，是个 TypeScript 开发者。");
  console.log("🤖", r1, "\n");

  // 第二轮：引用前面的信息
  const r2 = await agent.send("我刚才说我叫什么来着？");
  console.log("👤 我刚才说我叫什么来着？");
  console.log("🤖", r2, "\n");

  // 第三轮：继续对话
  const r3 = await agent.send("帮我看看当前目录有什么文件");
  console.log("👤 帮我看看当前目录有什么文件");
  console.log("🤖", r3, "\n");

  console.log("📊 历史统计:", agent.getStats());
}

async function demo2_windowStrategies() {
  console.log("\n━━━ 场景 2：窗口策略对比 ━━━\n");

  // 滑动窗口 — 只保留最近 4 条
  console.log("── 滑动窗口 (keep last 4) ──");
  const agent1 = new Agent({ strategy: slidingWindow(4) });
  await agent1.send("第一条消息");
  await agent1.send("第二条消息");
  await agent1.send("第三条消息");
  await agent1.send("第四条消息");
  await agent1.send("第五条消息 — 问：我第一条说了什么？");
  console.log("📊 统计:", agent1.getStats());
  // 第一条会被滑出窗口，Agent 应该记不住

  // Token 预算 — 最多 200 tokens
  console.log("\n── Token 预算 (max 200 tokens) ──");
  const agent2 = new Agent({ strategy: tokenBudget(200) });
  await agent2.send("这是一条用来测试 token 预算策略的消息。");
  await agent2.send("又一条消息。");
  console.log("📊 统计:", agent2.getStats());
}

async function demo3_summaryCompression() {
  console.log("\n━━━ 场景 3：摘要压缩 ━━━\n");
  console.log("（触发条件：超过 4 条消息，压缩旧消息，保留最近 2 条）\n");

  const agent = new Agent({
    strategy: summaryCompression({
      triggerAfterMessages: 4,
      keepRecentMessages: 2,
    }),
  });

  await agent.send("我在做一个 TypeScript 项目，用 Vercel AI SDK。");
  console.log("👤 第 1 轮");
  await agent.send("项目需要实现工具调用功能。");
  console.log("👤 第 2 轮");
  await agent.send("我选择了 Zod 做参数校验。");
  console.log("👤 第 3 轮");
  await agent.send("现在想加记忆系统。");
  console.log("👤 第 4 轮 → 触发压缩");

  // 第 5 轮应该触发摘要压缩
  const r5 = await agent.send("我们之前讨论了什么？帮我总结一下。");
  console.log("👤 第 5 轮");
  console.log("🤖", r5);
  console.log("\n📊 最终统计:", agent.getStats());
}

async function main() {
  console.log("🧪 03 - 记忆系统演示\n");

  await demo1_basicMemory();
  // 注：场景 2、3 需要 API key，取消注释即可运行
  // await demo2_windowStrategies();
  // await demo3_summaryCompression();
}

main().catch(console.error);
