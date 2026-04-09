/**
 * 01 - 基础 Agent 入口
 *
 * 演示最简单的单轮对话
 *
 * 运行方式：
 * npx tsx src/01-basic-agent/index.ts
 */

import { chat } from "./agent";

async function main() {
  console.log("🧪 基础 Agent 测试\n");

  const questions = ["你好，请介绍一下你自己", "1+1等于几？"];

  for (const question of questions) {
    console.log(`\n📝 问题: ${question}`);
    console.log("🤖 回答:\n");

    const answer = await chat(question);
    console.log(answer);
  }
}

main().catch(console.error);
