/**
 * 交互式对话循环
 *
 * 共享的 readline 循环逻辑，各章节的 chat.ts 调用它
 * 只负责 UI（读输入、显示输出），不管模型逻辑
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * 启动交互式对话
 *
 * @param handler - 处理用户消息的函数，返回回复文本
 * @param opts - 可选配置
 */
export async function interactiveChat(
  handler: (message: string) => Promise<string>,
  opts?: {
    welcome?: string;
    prompt?: string;
  }
) {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log(opts?.welcome ?? "🐙 输入 /exit 退出 | /clear 清除上下文\n");

  const prompt = opts?.prompt ?? "你: ";

  while (true) {
    const input = await rl.question(prompt);

    if (input.trim() === "/exit") break;
    if (input.trim() === "/clear") {
      // handler 可以自行处理 /clear，这里跳过
      continue;
    }
    if (!input.trim()) continue;

    const reply = await handler(input);
    console.log(`🐙: ${reply}\n`);
  }

  rl.close();
  console.log("👋 再见！");
}
