/**
 * 02 - 工具调用入口
 *
 * 演示 readFile / writeFile / execCommand 三个工具
 *
 * 运行方式：
 * npx tsx src/agents/02-tool-calling/index.ts
 */

import { toolAgent } from "./agent";

async function main() {
  console.log("🧪 工具调用 Agent 测试\n");

  // 场景 1：写文件
  console.log("━━━ 场景 1：写文件 ━━━");
  const writeResp = await toolAgent.generate(
    "在 /tmp/mastra-test/hello.txt 写入内容 'Hello from Mastra Agent!'"
  );
  console.log("🤖", writeResp.text);

  // 场景 2：读文件
  console.log("\n━━━ 场景 2：读文件 ━━━");
  const readResp = await toolAgent.generate(
    "读取 /tmp/mastra-test/hello.txt 的内容"
  );
  console.log("🤖", readResp.text);

  // 场景 3：执行命令
  console.log("\n━━━ 场景 3：执行命令 ━━━");
  const execResp = await toolAgent.generate(
    "运行 `ls -la /tmp/mastra-test/` 查看刚才创建的文件"
  );
  console.log("🤖", execResp.text);
}

main().catch(console.error);
