/**
 * 04 - 长期记忆演示
 *
 * 演示跨 session 的记忆持久化：
 * 1. Session 1：告诉 Agent 一些个人信息
 * 2. Session 2：新建 Agent（新实例），问之前聊过的内容
 * 3. Agent 能通过 BM25 检索 + JSONL 存储回忆起来
 *
 * 运行方式：
 * npx tsx src/04-long-term/index.ts
 */

import { Agent } from "./agent";

const MEMORY_FILE = "/tmp/octopus-agent/memories.jsonl";

async function _demo_crossSessionMemory() {
  console.log("━━━ 场景：跨 Session 记忆 ━━━\n");

  // ═══ Session 1：存储记忆 ═══
  console.log("📖 Session 1：告诉 Agent 一些个人信息\n");
  const agent1 = new Agent({ memoryFile: MEMORY_FILE });
  await agent1.init();

  const r1 = await agent1.send("我叫 Octopus，是个 TypeScript 开发者，目前在学习 AI Agent 开发。");
  console.log("👤 我叫 Octopus，是个 TypeScript 开发者");
  console.log("🤖", r1, "\n");

  const r2 = await agent1.send("我喜欢用 Vercel AI SDK，不太喜欢 Mastra 这种大框架。");
  console.log("👤 我喜欢用 Vercel AI SDK，不太喜欢 Mastra。");
  console.log("🤖", r2, "\n");

  const r3 = await agent1.send("我的电脑是 MacBook Pro M4，工作目录在 ~/projects。");
  console.log("👤 我的电脑是 MacBook Pro M4。");
  console.log("🤖", r3, "\n");

  // ═══ Session 2：新实例，读取已有记忆 ═══
  console.log("\n📖 Session 2：新建 Agent（模拟重启）\n");
  const agent2 = new Agent({ memoryFile: MEMORY_FILE });
  await agent2.init();

  const r4 = await agent2.send("你还记得我是谁吗？");
  console.log("👤 你还记得我是谁吗？");
  console.log("🤖", r4, "\n");

  const r5 = await agent2.send("我之前说过喜欢什么框架来着？");
  console.log("👤 我之前说过喜欢什么框架来着？");
  console.log("🤖", r5, "\n");

  console.log("📊 Session 2 统计:", agent2.getStats());
}

async function demo_bm25Direct() {
  console.log("\n━━━ BM25 直接测试（不需要 API key）━━━\n");

  const { BM25Index } = await import("./bm25");

  const index = new BM25Index();
  index.add("m1", "用户叫 Octopus，TypeScript 开发者");
  index.add("m2", "用户喜欢 Vercel AI SDK，不喜欢 Mastra 框架");
  index.add("m3", "用户电脑是 MacBook Pro M4");
  index.add("m4", "用户在学习 AI Agent 开发");
  index.add("m5", "用户的工作目录在 ~/projects");

  const queries = ["用户叫什么名字", "用什么编程语言", "电脑型号"];
  for (const q of queries) {
    const results = index.search(q, 3);
    console.log(`🔍 "${q}"`);
    for (const r of results) {
      console.log(`   ${r.score.toFixed(3)} → ${r.docId}`);
    }
    console.log();
  }
}

async function main() {
  console.log("🧪 04 - 长期记忆演示\n");

  // BM25 直接测试（不需要 API key，可以立即验证算法）
  await demo_bm25Direct();

  // 跨 session 记忆（需要 API key）
  // await demo_crossSessionMemory();
}

main().catch(console.error);
