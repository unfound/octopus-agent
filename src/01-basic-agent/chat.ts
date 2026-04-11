/**
 * 01 - 持续对话演示
 *
 * 用 ChatAgent 维护上下文，实现多轮对话
 *
 * 运行方式：npx tsx src/01-basic-agent/chat.ts
 */

import { ChatAgent } from "./agent";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const MODEL_ID = "local/qwen/qwen3.5-9b";

async function main() {
  const agent = new ChatAgent(MODEL_ID);
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log("🐙 Octopus Chat");
  console.log("   持续对话模式 — 自动记住上下文");
  console.log("   /exit 退出 | /clear 清除上下文\n");

  while (true) {
    const input = await rl.question("你: ");

    if (input.trim() === "/exit") break;
    if (input.trim() === "/clear") {
      agent.clear();
      console.log("✅ 上下文已清除\n");
      continue;
    }
    if (!input.trim()) continue;

    const reply = await agent.say(input);
    console.log(`🐙: ${reply}\n`);
  }

  rl.close();
  console.log("👋 再见！");
}

main().catch(console.error);
