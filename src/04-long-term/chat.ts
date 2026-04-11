/**
 * 04 - 带长期记忆的交互式对话
 *
 * 对话后自动提取记忆，下次启动能回忆起之前的内容
 *
 * 运行方式：npx tsx src/04-long-term/chat.ts
 *
 * 测试方式：
 *   第一次运行（存储记忆）：
 *     1. 输入「我叫 Octopus，是个 TypeScript 开发者」
 *     2. 输入「我喜欢用 Vercel AI SDK」
 *     3. 输入「我的电脑是 MacBook Pro M4」
 *     4. /exit 退出 → 记忆自动提取并写入 JSONL
 *
 *   第二次运行（回忆记忆）：
 *     1. 重新启动（npx tsx src/04-long-term/chat.ts）
 *     2. 输入「你还记得我是谁吗？」—— Agent 应该提到 Octopus / TypeScript
 *     3. 输入「我用什么框架？」—— Agent 应该提到 Vercel AI SDK
 *
 *   注意：回忆能力取决于 LLM 提取 + BM25 检索质量，本地小模型可能不够精准
 */

import { Agent } from "./agent";
import { interactiveChat } from "../shared/interactive";

const MODEL_ID = "local/qwen/qwen3.5-9b";
const MEMORY_FILE = "/tmp/octopus-agent/memories.jsonl";

async function main() {
  const agent = new Agent({ model: MODEL_ID, memoryFile: MEMORY_FILE });
  await agent.init();

  await interactiveChat(
    (msg) => agent.send(msg),
    {
      welcome: `🐙 04 - 带长期记忆的 Agent
   对话内容会被提取存档，跨 session 可回忆
   记忆文件: ${MEMORY_FILE}
   /exit 退出\n`,
    }
  );

  console.log("📊 最终统计:", agent.getStats());
}

main().catch(console.error);
