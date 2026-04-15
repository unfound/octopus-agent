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
import { SubAgent } from "./agent";
import { createDelegateTool } from "./delegate";
import { mixtureOfAgents } from "./moa";
import { tools as baseTools } from "../02-tool-system/tools";
import { createFileLogHooks } from "../shared/hooks";
import { BaseAgent } from "../shared/base-agent";
import { MessageStore } from "../shared/message-store";
import { WindowManager, slidingWindow } from "../03-memory/window";

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

/**
 * 父代理 — 继承 BaseAgent，用 runLoop 走 hooks
 *
 * 与直接用 generateText 的区别：
 * - BaseAgent.runLoop 在每一步触发 hooks（时机正确）
 * - 有完整的 messages、timestamps、durationMs
 */
class ParentAgent extends BaseAgent {
  /**
   * 执行父代理任务，返回最终文本
   *
   * 内部创建 MessageStore + WindowManager（与 SubAgent 类似），
   * 但不销毁 — 可以连续调用 chat()
   */
  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const store = new MessageStore();
    const wm = new WindowManager(store, slidingWindow(20));

    store.add({ role: "system", content: systemPrompt });
    store.add({ role: "user", content: userMessage });

    const { finalText } = await this.runLoop(store, wm);
    return finalText;
  }
}

async function demoDelegate() {
  console.log("\n📦 Demo 2: 父代理 + delegate 工具\n");

  // 共享 hooks → 父子日志写同一个文件，用 agentName 区分
  const hooks = createFileLogHooks({ prefix: "08-delegate" });

  // 父代理用 BaseAgent（hooks 在 runLoop 中正确时机触发）
  const parent = new ParentAgent({
    model: process.env.DEFAULT_MODEL,
    maxTurns: 5,
    name: "parent",
    hooks,
    tools: {
      ...baseTools,
      delegate: createDelegateTool({
        tools: baseTools,
        model: process.env.DEFAULT_MODEL,
        maxTurns: 5,
        hooks, // 子代理共享 hooks
      }),
    },
  });

  const system =
    "你是一个智能助手。你可以自己完成任务，也可以用 delegate 工具委派子任务给子代理。" +
    "子代理有独立上下文，完成后返回摘要给你。";

  const reply = await parent.chat(system, "用 delegate 工具读取 package.json 并分析项目结构");

  // 验证输出
  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ 完成`);
  console.log(`📋 父代理回复: ${reply.slice(0, 200)}${reply.length > 200 ? "..." : ""}`);
  console.log(`📁 日志: ${hooks.logFile}`);
  console.log(`\n💡 日志按实际执行顺序记录: parent → delegate → delegate → parent`);
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
