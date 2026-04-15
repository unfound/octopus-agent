/**
 * 08-sub-agent 交互入口
 *
 * 演示三种用法：
 * 1. 基础 SubAgent — 直接创建子代理执行任务
 * 2. delegate 工具 — 在父代理中委派子任务
 * 3. MoA — 多模型协作推理
 *
 * 运行方式：
 *   npx tsx src/08-sub-agent/chat.ts subagent
 *   npx tsx src/08-sub-agent/chat.ts delegate
 *   npx tsx src/08-sub-agent/chat.ts moa
 *   npx tsx src/08-sub-agent/chat.ts interactive
 */

import { createInterface } from "readline";
import { generateText, stepCountIs } from "ai";
import { getModel } from "../shared/model";
import { SubAgent } from "./agent";
import { createDelegateTool } from "./delegate";
import { mixtureOfAgents } from "./moa";
import { tools as baseTools } from "../02-tool-system/tools";
import {
  createFileLogHooks,
  emitHooksFromResult,
  type AgentHooks,
} from "../shared/hooks";

// ========== Demo 1: 基础 SubAgent ==========

async function demoSubAgent() {
  console.log("\n📦 Demo 1: 基础 SubAgent\n");

  // summary 模式：每次 LLM 调用只输出一行
  // 可改为 'verbose' 输出完整信息，或 false 静默
  const hooks = createFileLogHooks({ prefix: "08-subagent" });

  const child = new SubAgent({
    model: process.env.DEFAULT_MODEL,
    maxTurns: 5,
    tools: baseTools,
    name: "child",
    hooks,
  });

  const result = await child.run(
    "读取当前目录下的 package.json 文件，列出项目名称、版本号和所有依赖",
    "工作目录: " + process.cwd(),
  );

  // 验证输出 — 简洁地告诉你结果
  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ 完成 | ${result.success ? "成功" : "失败"} | ${result.stats.apiCalls} calls | ${result.stats.estimatedTokens} tok`);
  console.log(`📋 ${result.summary.slice(0, 200)}${result.summary.length > 200 ? "..." : ""}`);
  if (result.stats.toolTrace.length > 0) {
    console.log(`🔧 工具: ${result.stats.toolTrace.map(t => t.toolName).join(", ")}`);
  }
  console.log(`📁 日志: ${hooks.logFile}`);
}

// ========== Demo 2: 父代理 + delegate ==========

async function demoDelegate() {
  console.log("\n📦 Demo 2: 父代理 + delegate 工具\n");

  const hooks = createFileLogHooks({ prefix: "08-delegate" });
  const model = getModel(process.env.DEFAULT_MODEL);

  // 父代理的工具 = 基础工具 + delegate
  const parentTools = {
    ...baseTools,
    delegate: createDelegateTool({
      tools: baseTools,
      model: process.env.DEFAULT_MODEL,
      maxTurns: 5,
      hooks, // 子代理共享同一个 hooks（日志写同一个文件）
    }),
  };

  const system =
    "你是一个智能助手。你可以自己完成任务，也可以用 delegate 工具委派子任务给子代理。" +
    "子代理有独立上下文，完成后返回摘要给你。";

  const startTime = Date.now();
  const result = await generateText({
    model,
    system,
    messages: [{ role: "user", content: "用 delegate 工具读取 package.json 并分析项目结构" }],
    tools: parentTools,
    stopWhen: stepCountIs(5),
  });

  // ⚠️ 关键：父代理的 generateText 也需要 hook 记录
  // emitHooksFromResult 从原始结果提取并触发 hooks
  emitHooksFromResult(hooks, "parent", result);

  // 验证输出
  const parentSteps = (result as any).steps ?? [];
  const delegateCalls = parentSteps.flatMap((s: any) => s.toolCalls ?? [])
    .filter((tc: any) => tc.toolName === "delegate");

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ 完成 | 父代理 ${parentSteps.length} steps | delegate 调用 ${delegateCalls.length} 次`);
  console.log(`📋 父代理回复: ${result.text.slice(0, 200)}${result.text.length > 200 ? "..." : ""}`);
  console.log(`📁 日志: ${hooks.logFile}`);
  console.log(`\n💡 提示: 日志文件包含 parent + child 的完整记录，用 agentName 字段区分`);
}

// ========== Demo 3: MoA ==========

async function demoMoA() {
  console.log("\n📦 Demo 3: MoA（多模型协作推理）\n");

  const result = await mixtureOfAgents({
    query: "用一句话解释什么是 TypeScript 的类型系统",
    models: [
      process.env.DEFAULT_MODEL,
      process.env.DEFAULT_MODEL, // 演示用同一个模型
    ],
    maxTurns: 3,
    tools: baseTools,
  });

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ 完成 | ${result.responses.length} 个模型响应 | 综合 ${result.synthesis.slice(0, 100)}...`);
}

// ========== 交互模式 ==========

async function interactiveMode() {
  console.log("\n💬 SubAgent 交互模式\n");
  console.log("输入任务，子代理会执行并返回结果");
  console.log('输入 "quit" 退出\n');

  const hooks = createFileLogHooks({ prefix: "08-interactive" });
  const child = new SubAgent({
    model: process.env.DEFAULT_MODEL,
    maxTurns: 10,
    tools: baseTools,
    name: "child",
    hooks,
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask("🎯 任务: ");
    const trimmed = input.trim();
    if (trimmed.toLowerCase() === "quit") break;
    if (!trimmed) continue;

    const result = await child.run(trimmed);
    console.log(`\n📋 ${result.summary}\n`);
  }

  rl.close();
}

// ========== 入口 ==========

async function main() {
  const mode = process.argv[2] || "interactive";

  switch (mode) {
    case "subagent":
      await demoSubAgent();
      break;
    case "delegate":
      await demoDelegate();
      break;
    case "moa":
      await demoMoA();
      break;
    case "interactive":
    default:
      await interactiveMode();
      break;
  }
}

main().catch(console.error);
