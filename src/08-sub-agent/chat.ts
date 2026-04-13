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
import { generateText } from "ai";
import { getModel } from "../shared/model";
import { SubAgent } from "./agent";
import { createDelegateTool } from "./delegate";
import { mixtureOfAgents } from "./moa";
import { tools as baseTools } from "../02-tool-system/tools";
import { createFileLogHooks } from "../shared/hooks";

// ========== Demo 1: 基础 SubAgent ==========

async function demoSubAgent() {
  console.log("\n📦 Demo 1: 基础 SubAgent\n");
  console.log("═".repeat(50));

  const hooks = createFileLogHooks({ prefix: "08-subagent", console: true });

  const child = new SubAgent({
    model: process.env.DEFAULT_MODEL,
    maxTurns: 5,
    tools: baseTools,
    name: "demo-child",
    hooks,
  });

  const result = await child.run(
    "读取当前目录下的 package.json 文件，列出项目名称、版本号和所有依赖",
    "工作目录: " + process.cwd(),
  );

  console.log("\n📋 SubAgent 结果:");
  console.log("  成功:", result.success);
  console.log("  摘要:", result.summary.slice(0, 300));
  console.log("  API 调用:", result.stats.apiCalls);
  console.log("  消息数:", result.stats.messageCount);
  console.log("  Token 估算:", result.stats.estimatedTokens);
  if (result.stats.toolTrace.length > 0) {
    console.log("  工具调用:");
    for (const t of result.stats.toolTrace) {
      console.log(`    - ${t.toolName}(${JSON.stringify(t.args).slice(0, 80)})`);
    }
  }
}

// ========== Demo 2: 父代理 + delegate ==========

async function demoDelegate() {
  console.log("\n\n📦 Demo 2: 父代理 + delegate 工具\n");
  console.log("═".repeat(50));

  const hooks = createFileLogHooks({ prefix: "08-delegate", console: true });
  const model = getModel(process.env.DEFAULT_MODEL);

  // 父代理的工具 = 基础工具 + delegate
  const parentTools = {
    ...baseTools,
    delegate: createDelegateTool({
      tools: baseTools,
      model: process.env.DEFAULT_MODEL,
      maxTurns: 5,
      hooks,
    }),
  };

  // 简单的父代理循环（复用 Agent 的模式）
  const { text } = await generateText({
    model,
    system:
      "你是一个智能助手。你可以自己完成任务，也可以用 delegate 工具委派子任务给子代理。" +
      "子代理有独立上下文，完成后返回摘要给你。" +
      "对于简单任务自己完成，复杂或可并行的任务用 delegate。",
    prompt: "委派一个子代理来读取 README.md 文件并总结项目内容",
    tools: parentTools,
  });

  console.log("\n📋 父代理最终回复:", text);
}

// ========== Demo 3: MoA ==========

async function demoMoA() {
  console.log("\n\n📦 Demo 3: Mixture-of-Agents\n");
  console.log("═".repeat(50));

  const question = "JavaScript 中 let、const、var 的区别是什么？简要说明。";
  console.log(`\n问题: ${question}\n`);

  const result = await mixtureOfAgents(question, {
    // 本地模型作为参考
    referenceModels: [process.env.DEFAULT_MODEL || "openrouter/stepfun/step-3.5-flash"],
    aggregatorModel: process.env.DEFAULT_MODEL || "openrouter/stepfun/step-3.5-flash",
  });

  console.log("MoA 结果:");
  console.log("  成功:", result.success);
  console.log("  参考模型数:", result.referenceResponses.length);
  console.log("  最终回答:", result.response.slice(0, 500));
}

// ========== 交互模式 ==========

async function interactiveMode() {
  console.log("\n\n💬 交互模式 — 输入任务，Agent 用 delegate 执行\n");
  console.log("═".repeat(50));

  const model = getModel(process.env.DEFAULT_MODEL);

  const parentTools = {
    ...baseTools,
    delegate: createDelegateTool({
      tools: baseTools,
      model: process.env.DEFAULT_MODEL,
      maxTurns: 10,
    }),
  };

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

  console.log('输入任务（输入 "quit" 退出）\n');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask("🎯 任务: ");
    if (input.trim().toLowerCase() === "quit") break;
    if (!input.trim()) continue;

    try {
      const { text } = await generateText({
        model,
        system:
          "你是一个智能助手。对于复杂或耗时的任务，使用 delegate 工具委派给子代理。" +
          "简单任务自己完成。",
        prompt: input,
        tools: parentTools,
      });

      console.log(`\n📋 回复: ${text}\n`);
    } catch (err) {
      console.error("❌ 错误:", err);
    }
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
