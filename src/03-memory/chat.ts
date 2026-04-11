/**
 * 03 - 带记忆的交互式对话
 *
 * Agent 维护对话历史，能记住之前聊过的内容
 *
 * 运行方式：npx tsx src/03-memory/chat.ts
 *
 * 测试方式：
 *   1. 第一轮输入「我叫 Octopus，是个 TypeScript 开发者，喜欢猫」
 *   2. 第二轮输入「我的爱好是什么？」—— Agent 应该回答「喜欢猫」
 *   3. 连续发 5~6 条消息（随便输入什么），触发滑动窗口截断（keep 6）
 *   4. 再问「我叫什么？」—— 窗口只保留最近 6 条，早期消息被截断，Agent 会「忘记」
 *   5. /exit 退出
 */

import { Agent } from "./agent";
import { interactiveChat } from "../shared/interactive";
import { slidingWindow } from "./window";

const MODEL_ID = "local/qwen/qwen3.5-9b";

async function main() {
  const agent = new Agent({ model: MODEL_ID, strategy: slidingWindow(6) });

  await interactiveChat(
    (msg) => agent.send(msg),
    {
      welcome: "🐙 03 - 带记忆的 Agent\n   维护对话历史，能记住之前聊过的内容\n   /exit 退出\n",
    }
  );

  console.log("📊 最终统计:", agent.getStats());
}

main().catch(console.error);
