/**
 * 10-sandbox 交互入口
 *
 * 演示权限控制和安全执行的各种场景：
 * 1. 工具黑名单 — 禁止危险工具
 * 2. 路径限制 — 只能访问指定目录
 * 3. 敏感信息过滤 — 自动脱敏
 * 4. 用户确认 — 危险操作前暂停
 *
 * 运行方式：
 *   npx tsx src/10-sandbox/chat.ts demo
 *   npx tsx src/10-sandbox/chat.ts interactive
 */

import { createInterface } from "node:readline";
import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import { PermissionManager, createReadOnlyPermissions } from "./permissions";
import { Sanitizer, createFileSanitizer } from "./sanitizer";
import { wrapTools, createSafeTools } from "./wrapper";

// ========== 模拟工具 ==========

/** 模拟的 exec 工具 */
const mockExec = tool({
  description: "执行 shell 命令",
  inputSchema: z.object({
    command: z.string().describe("要执行的命令"),
  }),
  execute: async ({ command }) => {
    // 模拟执行结果
    if (command.includes("passwd")) {
      return "root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin";
    }
    if (command.includes("secret")) {
      return "api_key=sk-abc123secret456password=MySecretPass123";
    }
    return `执行结果: ${command}`;
  },
});

/** 模拟的 read_file 工具 */
const mockReadFile = tool({
  description: "读取文件内容",
  inputSchema: z.object({
    path: z.string().describe("文件路径"),
  }),
  execute: async ({ path }) => {
    // 模拟读取结果
    if (path.includes("passwd")) {
      return "root:x:0:0:root:/root:/bin/bash";
    }
    if (path.includes(".env")) {
      return "API_KEY=sk-proj-abc123def456\nDB_PASSWORD=SuperSecret123";
    }
    if (path.includes("config")) {
      return "server:\n  host: 192.168.1.100\n  token: ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    }
    return `文件内容: ${path}`;
  },
});

/** 模拟的 write_file 工具 */
const mockWriteFile = tool({
  description: "写入文件",
  inputSchema: z.object({
    path: z.string().describe("文件路径"),
    content: z.string().describe("文件内容"),
  }),
  execute: async ({ path, content }) => {
    return `已写入 ${path} (${content.length} 字节)`;
  },
});

const mockTools = {
  exec: mockExec,
  read_file: mockReadFile,
  write_file: mockWriteFile,
};

// ========== 演示函数 ==========

/** 直接测试权限管理器 */
function testPermissionManager() {
  console.log("\n📦 测试 1: 权限管理器\n");

  const pm = new PermissionManager({
    blockedTools: ["exec"],
    blockedPaths: ["/etc/passwd", "/etc/shadow"],
    allowedPaths: ["/tmp/agent-workspace"],
  });

  console.log("工具权限检查:");
  console.log(`  exec: ${JSON.stringify(pm.checkToolAccess("exec"))}`);
  console.log(`  read_file: ${JSON.stringify(pm.checkToolAccess("read_file"))}`);

  console.log("\n路径权限检查:");
  console.log(`  /etc/passwd: ${JSON.stringify(pm.checkPathAccess("/etc/passwd"))}`);
  console.log(`  /tmp/test.txt: ${JSON.stringify(pm.checkPathAccess("/tmp/test.txt"))}`);
  console.log(`  /tmp/agent-workspace/file.txt: ${JSON.stringify(pm.checkPathAccess("/tmp/agent-workspace/file.txt"))}`);

  console.log("\n网络权限检查:");
  console.log(`  https://evil.com/api: ${JSON.stringify(pm.checkNetworkAccess("https://evil.com/api"))}`);
  console.log(`  https://api.openai.com: ${JSON.stringify(pm.checkNetworkAccess("https://api.openai.com"))}`);
}

/** 测试敏感信息过滤 */
function testSanitizer() {
  console.log("\n📦 测试 2: 敏感信息过滤\n");

  const sanitizer = new Sanitizer();

  const testCases = [
    "我的 API key 是 sk-abc123def456ghi789",
    "password=MySecretPass123",
    "token: ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----",
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "AWS Key: AKIAIOSFODNN7EXAMPLE",
  ];

  console.log("脱敏测试:\n");
  for (const text of testCases) {
    const clean = sanitizer.sanitize(text);
    const detected = sanitizer.detect(text);
    console.log(`  原文: ${text}`);
    console.log(`  脱敏: ${clean}`);
    console.log(`  检测到 ${detected.length} 个敏感信息`);
    console.log();
  }
}

/** 测试工具包装器 */
async function testToolWrapper() {
  console.log("\n📦 测试 3: 工具包装器 — 权限拦截\n");

  // 创建安全工具集：禁止 exec，只允许 /tmp 目录
  const safeTools = createSafeTools(mockTools, {
    blockedTools: ["exec"],
    sandboxPath: "/tmp",
    sanitizeOutput: true,
  });

  console.log("配置: exec 被禁止, 只允许 /tmp 目录\n");

  // 测试 1: 调用被禁止的工具
  console.log("测试 1: 调用 exec 工具");
  try {
    await (safeTools.exec as any).execute({ command: "ls" });
    console.log("  ❌ 应该被拦截但没有");
  } catch (err) {
    console.log(`  ✅ 正确拦截: ${(err as Error).message}`);
  }

  // 测试 2: 读取被禁止的路径
  console.log("\n测试 2: 读取 /etc/passwd");
  try {
    await (safeTools.read_file as any).execute({ path: "/etc/passwd" });
    console.log("  ❌ 应该被拦截但没有");
  } catch (err) {
    console.log(`  ✅ 正确拦截: ${(err as Error).message}`);
  }

  // 测试 3: 读取允许的路径
  console.log("\n测试 3: 读取 /tmp/test.txt");
  try {
    const result = await (safeTools.read_file as any).execute({ path: "/tmp/test.txt" });
    console.log(`  ✅ 成功: ${result}`);
  } catch (err) {
    console.log(`  ❌ 不应该失败: ${(err as Error).message}`);
  }

  // 测试 4: 输出脱敏
  console.log("\n测试 4: 读取 .env 文件（输出脱敏）");
  try {
    const result = await (safeTools.read_file as any).execute({ path: "/tmp/.env" });
    console.log(`  结果: ${result}`);
    console.log(`  ✅ 输出已脱敏`);
  } catch (err) {
    console.log(`  ❌ 错误: ${(err as Error).message}`);
  }
}

/** 测试完整 Agent 集成 */
async function testAgentIntegration() {
  console.log("\n📦 测试 4: Agent 集成（使用安全工具）\n");

  // 创建安全工具集
  const safeTools = createSafeTools(mockTools, {
    blockedTools: ["exec"],
    onConfirm: async (toolName, input) => {
      console.log(`\n⚠️  需要确认: ${toolName}`);
      console.log(`输入: ${JSON.stringify(input, null, 2)}`);
      console.log("→ 自动放行（演示模式）\n");
      return "allow";
    },
  });

  // 直接使用 generateText 测试
  const model = getModel();
  const systemPrompt = "你是一个安全的助手。使用工具时请谨慎。";

  console.log("发送指令: 读取 /etc/passwd 文件");
  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: "读取 /etc/passwd 文件" }],
      tools: safeTools,
      stopWhen: stepCountIs(3),
    });
    console.log(`回复: ${result.text}`);
  } catch (err) {
    console.log(`✅ 正确拦截: ${(err as Error).message}`);
  }
}

// ========== 交互模式 ==========

async function interactiveMode() {
  console.log("\n💬 Sandbox 交互模式\n");

  const safeTools = createSafeTools(mockTools, {
    sanitizeOutput: true,
    onConfirm: async (toolName, input) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

      console.log(`\n⚠️  工具 "${toolName}" 需要确认`);
      console.log(`输入: ${JSON.stringify(input, null, 2)}`);
      const answer = await ask("允许执行？[y/n]: ");
      rl.close();

      return answer.trim().toLowerCase() === "y" ? "allow" : "deny";
    },
  });

  const model = getModel();
  const systemPrompt = "你是一个安全的助手。使用工具时请谨慎。";

  console.log("安全 Agent 已启动。所有操作都经过权限检查和脱敏处理。");
  console.log("输入 'quit' 退出\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask("🔒 安全Agent: ");
    const trimmed = input.trim();
    if (trimmed.toLowerCase() === "quit") break;
    if (!trimmed) continue;

    messages.push({ role: "user", content: trimmed });

    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        messages,
        tools: safeTools,
        stopWhen: stepCountIs(5),
      });

      console.log(`\n📋 ${result.text}\n`);
      messages.push({ role: "assistant", content: result.text });
    } catch (err) {
      console.error(`\n❌ ${(err as Error).message}\n`);
    }
  }

  rl.close();
}

// ========== 入口 ==========

async function main() {
  const mode = process.argv[2] || "demo";

  switch (mode) {
    case "demo":
      testPermissionManager();
      testSanitizer();
      await testToolWrapper();
      // await testAgentIntegration(); // 需要模型服务
      break;
    case "interactive":
      await interactiveMode();
      break;
    default:
      console.log("用法: npx tsx src/10-sandbox/chat.ts [demo|interactive]");
  }
}

main().catch(console.error);
