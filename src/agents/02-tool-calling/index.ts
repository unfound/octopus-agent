/**
 * 02 - 工具调用入口
 *
 * 运行方式：
 * npx tsx src/agents/02-tool-calling/index.ts
 */

import { toolAgent } from "./agent";

async function main() {
  console.log("🧪 工具调用 Agent 测试\n");

  const questions = [
    "现在几点了？",
    "纽约现在几点？",
    "伦敦的时间是多少？",
  ];

  for (const question of questions) {
    console.log(`\n📝 问题: ${question}`);
    console.log("🤖 回答:\n");

    // 使用 generate() 方法
    const response = await toolAgent.generate(question);

    console.log(response.text);
    console.log();
  }
}

main().catch(console.error);
