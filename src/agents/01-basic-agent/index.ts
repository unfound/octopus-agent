/**
 * 01 - 基础 Agent 入口
 *
 * 运行方式：
 * npx tsx src/agents/01-basic-agent/index.ts
 */

import { basicAgent } from "./agent";

async function main() {
  console.log("🧪 基础 Agent 测试\n");

  const questions = [
    "你好，请介绍一下你自己",
    "1+1等于几？",
  ];

  for (const question of questions) {
    console.log(`\n📝 问题: ${question}`);
    console.log("🤖 回答:\n");

    // 使用 generate() 方法（非流式）
    const response = await basicAgent.generate(question);

    console.log(response.text);
    console.log();
  }
}

main().catch(console.error);
