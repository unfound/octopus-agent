/**
 * 03 - 带记忆的交互式对话
 *
 * Agent 维护对话历史，能记住之前聊过的内容
 *
 * 运行方式：npx tsx src/03-memory/chat.ts
 */

import { Agent } from "./agent";
import { interactiveChat } from "../shared/interactive";

async function main() {
  const agent = new Agent();

  await interactiveChat(
    (msg) => agent.send(msg),
    {
      welcome: "🐙 03 - 带记忆的 Agent\n   维护对话历史，能记住之前聊过的内容\n   /exit 退出\n",
    }
  );

  console.log("📊 最终统计:", agent.getStats());
}

main().catch(console.error);
