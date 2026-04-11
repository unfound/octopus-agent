/**
 * 01 - 单轮对话演示
 *
 * 运行方式：npx tsx src/01-basic-agent/index.ts
 */

import { chat } from "./agent";

async function main() {
  console.log("🧪 单轮对话测试\n");

  const questions = ["你好，请介绍一下你自己", "1+1等于几？"];

  for (const question of questions) {
    console.log(`📝 问题: ${question}`);
    const answer = await chat(question);
    console.log(`🐙: ${answer}\n`);
  }
}

main().catch(console.error);
