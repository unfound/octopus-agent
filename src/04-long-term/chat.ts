/**
 * 04 - 带长期记忆的交互式对话
 *
 * 对话后自动提取记忆，下次启动能回忆起之前的内容
 *
 * 运行方式：npx tsx src/04-long-term/chat.ts
 */

import { Agent } from "./agent";
import { interactiveChat } from "../shared/interactive";

const MEMORY_FILE = "/tmp/octopus-agent/memories.jsonl";

async function main() {
  const agent = new Agent({ memoryFile: MEMORY_FILE });
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
