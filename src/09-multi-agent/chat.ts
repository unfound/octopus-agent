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
  console.log("═".repeat(50));

  const hooks = createFileLogHooks({ prefix: "09-collab", console: true });
  const bus = new MessageBus();

  // 研究 Agent — 负责信息收集
  const researcher = new PeerAgent({
    name: "researcher",
    description: "负责信息搜索和分析，收集资料并整理研究结果",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      // 模拟搜索工具
      webSearch: tool({
        description: "搜索互联网获取信息",
        inputSchema: z.object({
          query: z.string().describe("搜索关键词"),
        }),
        execute: async ({ query }) => {
          // 模拟搜索结果
          return {
            results: [
              `${query} 是一种重要的技术概念，广泛应用于现代软件开发中。`,
              `${query} 的核心优势包括类型安全、更好的 IDE 支持和重构友好。`,
              `${query} 的学习曲线较陡，但长期收益显著。`,
            ],
            query,
          };
        },
      }),
      handoff: createHandoffTool(bus, "researcher"),
    },
    systemPrompt:
      '你是一个研究员 Agent，代号 "researcher"。你的专长是信息收集和分析。\n' +
      "收到研究任务后，使用搜索工具收集信息，然后整理成结构化的研究结果。\n" +
      "如果你觉得写作任务应该交给更专业的 Agent，可以用 handoff 转交。",
  });

  // 写作 Agent — 负责内容创作
  const writer = new PeerAgent({
    name: "writer",
    description: "负责内容创作和编辑，将研究结果写成文章",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      handoff: createHandoffTool(bus, "writer"),
    },
    systemPrompt:
      '你是一个写作 Agent，代号 "writer"。你的专长是内容创作和编辑。\n' +
      "收到写作任务或研究数据后，撰写高质量的文章。\n" +
      "文章应该结构清晰、语言流畅、信息准确。",
  });

  console.log("已注册 Agent:", bus.getRegisteredAgents().join(", "));

  // 模拟协作流程
  console.log("\n--- 步骤 1: 用户给 researcher 发任务 ---\n");

  const researchResult = await researcher.chat(
    "研究 TypeScript 类型系统的三大优势，整理成要点",
  );
  console.log("📋 Researcher 回复:", researchResult.slice(0, 300));

  console.log("\n--- 步骤 2: Researcher 把结果发给 Writer ---\n");

  const writeResponse = await researcher.requestFrom("writer", "write_article", {
    title: "TypeScript 类型系统的优势",
    findings: researchResult,
    format: "简要总结，不超过 200 字",
  });
  console.log("📋 Writer 回复:", String(writeResponse.payload).slice(0, 300));

  // 统计
  console.log("\n📊 通信统计:", bus.getStats());

  // 清理
  researcher.destroy();
  writer.destroy();
}

// ========== Demo 2: Handoff 转交 ==========

async function demoHandoff() {
  console.log("\n\n📦 Demo 2: Agent 间 Handoff 转交\n");
  console.log("═".repeat(50));

  const hooks = createFileLogHooks({ prefix: "09-handoff", console: true });
  const bus = new MessageBus();

  // 通用 Agent — 接收用户请求，判断是否需要转交
  const general = new PeerAgent({
    name: "general",
    description: "通用助手，接收用户请求，必要时转交给专业 Agent",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      handoff: createHandoffTool(bus, "general"),
    },
    systemPrompt:
      '你是一个通用 Agent，代号 "general"。\n' +
      "你接收所有用户请求。如果某个任务更适合专业 Agent 处理，使用 handoff 转交。\n" +
      "当前可用的专业 Agent：code-expert（代码相关）、researcher（研究分析）。",
  });

  // 代码专家 Agent
  const codeExpert = new PeerAgent({
    name: "code-expert",
    description: "代码专家，擅长代码审查、重构建议和 bug 修复",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: {
      ...baseTools,
      handoff: createHandoffTool(bus, "code-expert"),
    },
    systemPrompt:
      '你是一个代码专家 Agent，代号 "code-expert"。\n' +
      "你的专长是代码审查、重构建议和 bug 修复。\n" +
      "收到转交的代码相关任务后，给出专业的分析和建议。",
  });

  // 研究 Agent（简化版，只处理研究请求）
  const researcher = new PeerAgent({
    name: "researcher",
    description: "研究分析 Agent，擅长信息收集和分析",
    model: process.env.DEFAULT_MODEL,
    bus,
    hooks,
    tools: baseTools,
    systemPrompt:
      '你是一个研究员 Agent，代号 "researcher"。\n' +
      "收到研究任务后，收集信息并整理成结构化的研究结果。",
  });

  console.log("已注册 Agent:", bus.getRegisteredAgents().join(", "));

  // 用户给 general 发一条消息，general 可能会 handoff
  console.log("\n--- 用户给 general 发任务 ---\n");

  const reply = await general.chat(
    "请帮我审查这段代码是否有问题: " +
      "const x: any = JSON.parse(input); return x.value;",
  );
  console.log("📋 General 最终回复:", reply.slice(0, 400));

  // 统计
  console.log("\n📊 通信统计:", bus.getStats());

  // 清理
  general.destroy();
  codeExpert.destroy();
  researcher.destroy();
}

// ========== 交互模式 ==========

async function interactiveMode() {
  console.log("\n\n💬 Multi-Agent 交互模式\n");
  console.log("═".repeat(50));

  const bus = new MessageBus();
  const model = getModel(process.env.DEFAULT_MODEL);

  // 创建一组 Agent
  const researcher = new PeerAgent({
    name: "researcher",
    description: "信息研究与分析",
    model: process.env.DEFAULT_MODEL,
    bus,
    tools: {
      ...baseTools,
      webSearch: tool({
        description: "搜索互联网获取信息",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => ({
          results: [
            `关于 "${query}" 的搜索结果 1...`,
            `关于 "${query}" 的搜索结果 2...`,
          ],
        }),
      }),
      handoff: createHandoffTool(bus, "researcher"),
      broadcast: createBroadcastTool(bus, "researcher"),
    },
    systemPrompt:
      '你是研究员 Agent "researcher"。负责信息收集和分析。\n' +
      "你可以用 handoff 把任务转给更合适的 Agent。",
  });

  const writer = new PeerAgent({
    name: "writer",
    description: "内容创作与编辑",
    model: process.env.DEFAULT_MODEL,
    bus,
    tools: {
      ...baseTools,
      handoff: createHandoffTool(bus, "writer"),
      broadcast: createBroadcastTool(bus, "writer"),
    },
    systemPrompt:
      '你是写作 Agent "writer"。负责内容创作和编辑。',
  });

  console.log("已注册 Agent: researcher, writer");
  console.log('输入任务，可以用 @agent 指定目标，如 "@researcher 研究 AI"');
  console.log('输入 "quit" 退出\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask("🎯 任务: ");
    const trimmed = input.trim();
    if (trimmed.toLowerCase() === "quit") break;
    if (!trimmed) continue;

    // 解析 @agent 前缀
    const match = trimmed.match(/^@(\S+)\s+(.+)$/);
    let targetAgent = "researcher"; // 默认
    let message = trimmed;

    if (match) {
      targetAgent = match[1];
      message = match[2];
    }

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
