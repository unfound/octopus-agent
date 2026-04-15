/**
 * 09-multi-agent 交互入口
 *
 * 演示两种模式：
 * 1. 研究 + 写作协作 — 两个 PeerAgent 通过 MessageBus 协作
 * 2. Handoff 转交 — Agent 间对等转交任务
 *
 * 运行方式：
 *   npx tsx src/09-multi-agent/chat.ts collab
 *   npx tsx src/09-multi-agent/chat.ts handoff
 *   npx tsx src/09-multi-agent/chat.ts interactive
 */

import { createInterface } from "readline";
import { tool } from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import { MessageBus } from "./message-bus";
import { PeerAgent } from "./agent";
import { createHandoffTool, createBroadcastTool } from "./handoff";
import { tools as baseTools } from "../02-tool-system/tools";
import { createFileLogHooks } from "../shared/hooks";

// ========== Demo 1: 研究 + 写作协作 ==========

async function demoCollab() {
  console.log("\n📦 Demo 1: 研究 Agent + 写作 Agent 协作\n");

  // 共享一个 hooks 实例 → 日志写同一个文件，用 agentName 区分
  const hooks = createFileLogHooks({ prefix: "09-collab" });
  const bus = new MessageBus();

  const researcher = new PeerAgent({
    name: "researcher",
    description: "负责信息搜索和分析",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      webSearch: tool({
        description: "搜索互联网获取信息",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => ({
          results: [
            `${query} 是一种重要的技术概念，广泛应用于现代软件开发中。`,
            `${query} 的核心优势包括类型安全、更好的 IDE 支持和重构友好。`,
          ],
        }),
      }),
      handoff: createHandoffTool(bus, "researcher"),
    },
    systemPrompt:
      '你是一个研究员 Agent，代号 "researcher"。' +
      "收到研究任务后，使用搜索工具收集信息并整理成要点。",
  });

  const writer = new PeerAgent({
    name: "writer",
    description: "负责内容创作和编辑",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      handoff: createHandoffTool(bus, "writer"),
    },
    systemPrompt:
      '你是一个写作 Agent，代号 "writer"。' +
      "收到写作任务或研究数据后，撰写高质量的文章。",
  });

  console.log(`已注册 Agent: ${bus.getRegisteredAgents().join(", ")}\n`);

  // 步骤 1: 用户给 researcher 发任务
  const researchResult = await researcher.chat(
    "研究 TypeScript 类型系统的三大优势，整理成要点",
  );

  // 步骤 2: Researcher 把结果发给 Writer
  const writeResponse = await researcher.requestFrom("writer", "write_article", {
    title: "TypeScript 类型系统的优势",
    findings: researchResult,
    format: "简要总结，不超过 200 字",
  });

  // 验证输出
  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ 完成 | Agent: ${bus.getRegisteredAgents().join(", ")}`);
  console.log(`📋 Researcher: ${researchResult.slice(0, 150)}${researchResult.length > 150 ? "..." : ""}`);
  console.log(`📋 Writer: ${String(writeResponse.payload).slice(0, 150)}`);
  console.log(`📊 通信统计: ${JSON.stringify(bus.getStats())}`);
  console.log(`📁 日志: ${hooks.logFile}`);
  console.log(`\n💡 提示: 日志中 [researcher #N] 和 [writer #N] 前缀区分来源`);

  researcher.destroy();
  writer.destroy();
}

// ========== Demo 2: Handoff 转交 ==========

async function demoHandoff() {
  console.log("\n📦 Demo 2: Agent 间 Handoff 转交\n");

  const hooks = createFileLogHooks({ prefix: "09-handoff" });
  const bus = new MessageBus();

  const general = new PeerAgent({
    name: "general",
    description: "通用助手，接收用户请求，必要时转交",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      handoff: createHandoffTool(bus, "general"),
    },
    systemPrompt:
      '你是一个通用 Agent，代号 "general"。' +
      "如果某个任务更适合专业 Agent，使用 handoff 转交。" +
      "当前可用: code-expert（代码）、researcher（研究）。",
  });

  const codeExpert = new PeerAgent({
    name: "code-expert",
    description: "代码专家",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      handoff: createHandoffTool(bus, "code-expert"),
    },
    systemPrompt:
      '你是一个代码专家 Agent，代号 "code-expert"。' +
      "收到代码相关任务后，给出专业的分析和建议。",
  });

  console.log(`已注册 Agent: ${bus.getRegisteredAgents().join(", ")}\n`);

  // 用户给 general 发任务，general 可能 handoff 给 code-expert
  const reply = await general.chat(
    "请帮我审查这段代码: const x: any = JSON.parse(input); return x.value;",
  );

  // 验证输出
  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ 完成`);
  console.log(`📋 最终回复: ${reply.slice(0, 200)}${reply.length > 200 ? "..." : ""}`);
  console.log(`📊 通信统计: ${JSON.stringify(bus.getStats())}`);
  console.log(`📁 日志: ${hooks.logFile}`);

  general.destroy();
  codeExpert.destroy();
}

// ========== 交互模式 ==========

async function interactiveMode() {
  console.log("\n💬 Multi-Agent 交互模式\n");

  const hooks = createFileLogHooks({ prefix: "09-interactive" });
  const bus = new MessageBus();

  const researcher = new PeerAgent({
    name: "researcher",
    description: "信息研究与分析",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      webSearch: tool({
        description: "搜索互联网获取信息",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => ({
          results: [`关于 "${query}" 的搜索结果...`],
        }),
      }),
      handoff: createHandoffTool(bus, "researcher"),
      broadcast: createBroadcastTool(bus, "researcher"),
    },
    systemPrompt: '你是研究员 Agent "researcher"。负责信息收集和分析。',
  });

  const writer = new PeerAgent({
    name: "writer",
    description: "内容创作与编辑",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      handoff: createHandoffTool(bus, "writer"),
      broadcast: createBroadcastTool(bus, "writer"),
    },
    systemPrompt: '你是写作 Agent "writer"。负责内容创作和编辑。',
  });

  console.log("已注册 Agent: researcher, writer");
  console.log('输入任务，用 @agent 指定目标，如 "@researcher 研究 AI"');
  console.log('输入 "quit" 退出\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask("🎯 任务: ");
    const trimmed = input.trim();
    if (trimmed.toLowerCase() === "quit") break;
    if (!trimmed) continue;

    const match = trimmed.match(/^@(\S+)\s+(.+)$/);
    const targetAgent = match ? match[1] : "researcher";
    const message = match ? match[2] : trimmed;

    const agents: Record<string, PeerAgent> = { researcher, writer };
    const agent = agents[targetAgent];
    if (!agent) {
      console.log(`❌ Agent "${targetAgent}" 不存在。可用: researcher, writer`);
      continue;
    }

    try {
      const reply = await agent.chat(message);
      console.log(`\n📋 [${targetAgent}] ${reply}\n`);
    } catch (err) {
      console.error("❌ 错误:", err);
    }
  }

  rl.close();
  researcher.destroy();
  writer.destroy();
}

// ========== 入口 ==========

async function main() {
  const mode = process.argv[2] || "interactive";

  switch (mode) {
    case "collab":
      await demoCollab();
      break;
    case "handoff":
      await demoHandoff();
      break;
    case "interactive":
    default:
      await interactiveMode();
      break;
  }
}

main().catch(console.error);
