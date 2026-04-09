/**
 * 02 - 工具调用入口
 *
 * 演示自定义 ReAct 循环 + 工具调用
 *
 * 运行方式：
 * npx tsx src/02-tool-system/index.ts
 */

import { agentChat } from "./agent";

async function main() {
  console.log("🧪 工具调用 Agent 测试\n");

  // 场景 1：写文件
  console.log("━━━ 场景 1：写文件 ━━━");
  const r1 = await agentChat(
    "在 /tmp/agent-test/hello.txt 写入 'Hello from Agent!'"
  );
  console.log("🤖", r1);

  // 场景 2：读文件
  console.log("\n━━━ 场景 2：读文件 ━━━");
  const r2 = await agentChat("读取 /tmp/agent-test/hello.txt");
  console.log("🤖", r2);

  // 场景 3：执行命令
  console.log("\n━━━ 场景 3：执行命令 ━━━");
  const r3 = await agentChat("运行 `ls -la /tmp/agent-test/` 看看目录");
  console.log("🤖", r3);
}

main().catch(console.error);
