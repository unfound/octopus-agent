/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 验证重构后的 PeerAgent 逻辑正确性
 *
 * 使用 mock LanguageModel + 内存 MessageBus
 * 验证：chat、handleBusMessage、destroy、getInfo、多 agent hooks 区分
 */

import type { LanguageModel } from "ai";
import { PeerAgent } from "../src/09-multi-agent/agent";
import { MessageBus } from "../src/09-multi-agent/message-bus";
import type { AgentHooks, LLMCallRecord } from "../src/shared/hooks";

// ====== Mock Model Factory ======

interface MockStep {
  text: string;
  toolCalls?: Array<{ type: "tool-call"; toolCallId: string; toolName: string; input: unknown }>;
  toolResults?: Array<{ type: "tool-result"; toolCallId: string; toolName: string; output: unknown }>;
}

function createMockModel(steps: MockStep[]): LanguageModel {
  let callIndex = 0;
  return {
    specificationVersion: "v2" as const,
    provider: "mock",
    modelId: "mock-model",
    defaultObjectGenerationMode: "json" as const,
    doGenerate: async () => {
      const step = steps[callIndex] ?? steps[steps.length - 1];
      callIndex++;
      return {
        finishReason: "stop" as any,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        content: [
          { type: "text" as const, text: step.text },
          ...(step.toolCalls ?? []),
        ],
        warnings: [],
        rawCall: { rawPrompt: "", rawSettings: {} },
        request: { body: "" },
        response: { id: "mock-id", modelId: "mock-model", headers: {}, body: "" },
      };
    },
    doStream: async () => { throw new Error("not supported"); },
  } as unknown as LanguageModel;
}

// ====== Test Helpers ======

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

// ====== Test Cases ======

async function testBasicChat() {
  console.log("\n📝 Test 1: 基础 chat 功能");

  const model = createMockModel([{ text: "Hello from researcher!" }]);

  const bus = new MessageBus();
  const agent = new PeerAgent({
    name: "researcher",
    description: "负责研究分析",
    model: model as any,
    bus,
    maxTurns: 5,
  });

  const reply = await agent.chat("研究 TypeScript");

  assert(reply === "Hello from researcher!", `reply matches`);
  assert(agent.getInfo().name === "researcher", "getInfo().name correct");
  assert(agent.getInfo().description === "负责研究分析", "getInfo().description correct");
  assert(bus.getRegisteredAgents().includes("researcher"), "agent registered on bus");

  agent.destroy();
  assert(!bus.getRegisteredAgents().includes("researcher"), "agent unregistered after destroy");
}

async function testBusMessageHandling() {
  console.log("\n📝 Test 2: 处理来自 MessageBus 的消息");

  const model = createMockModel([{ text: "研究结果: TypeScript 很好" }]);

  const bus = new MessageBus();
  const agent = new PeerAgent({
    name: "researcher",
    description: "负责研究",
    model: model as any,
    bus,
    maxTurns: 5,
  });

  const response = await bus.request({
    from: "writer",
    to: "researcher",
    action: "research",
    payload: "研究 TypeScript 的优势",
  });

  assert(response.payload === "研究结果: TypeScript 很好", "bus response matches");

  agent.destroy();
}

async function testMultipleAgentsIsolated() {
  console.log("\n📝 Test 3: 多 Agent 隔离（各自独立上下文）");

  const model1 = createMockModel([{ text: "Agent 1 response" }]);
  const model2 = createMockModel([{ text: "Agent 2 response" }]);

  const bus = new MessageBus();
  const agent1 = new PeerAgent({
    name: "agent1", description: "First",
    model: model1 as any, bus, maxTurns: 5,
  });
  const agent2 = new PeerAgent({
    name: "agent2", description: "Second",
    model: model2 as any, bus, maxTurns: 5,
  });

  const reply1 = await agent1.chat("Q1");
  const reply2 = await agent2.chat("Q2");

  assert(reply1 === "Agent 1 response", "agent1 reply");
  assert(reply2 === "Agent 2 response", "agent2 reply");
  assert(bus.getRegisteredAgents().length === 2, "both agents registered");

  agent1.destroy();
  agent2.destroy();
  assert(bus.getRegisteredAgents().length === 0, "both agents unregistered");
}

async function testCustomSystemPrompt() {
  console.log("\n📝 Test 4: 自定义 system prompt");

  const model = createMockModel([{ text: "OK" }]);

  let capturedSystemContent = "";
  const hooks: AgentHooks = {
    onLLMEnd: (r) => {
      const sysMsg = r.request.messages.find((m: any) => m.role === "system");
      if (sysMsg) capturedSystemContent = sysMsg.content as string;
    },
  };

  const bus = new MessageBus();
  const agent = new PeerAgent({
    name: "custom",
    description: "Custom agent",
    model: model as any,
    bus,
    maxTurns: 5,
    hooks,
    systemPrompt: "你是自定义 Agent，专门做代码审查。",
  });

  await agent.chat("审查代码");

  assert(capturedSystemContent.includes("代码审查"), "custom system prompt used");

  agent.destroy();
}

async function testMultiAgentHooksDistinction() {
  console.log("\n📝 Test 5: 多 Agent hooks 记录区分");

  const model1 = createMockModel([{ text: "Researcher says: TS is great" }]);
  const model2 = createMockModel([{ text: "Writer says: Article drafted" }]);

  const allRecords: LLMCallRecord[] = [];
  const hooks: AgentHooks = {
    onLLMEnd: (r) => { allRecords.push(r); },
  };

  const bus = new MessageBus();
  const researcher = new PeerAgent({
    name: "researcher",
    description: "Research",
    model: model1 as any,
    bus,
    maxTurns: 5,
    hooks,
  });
  const writer = new PeerAgent({
    name: "writer",
    description: "Writing",
    model: model2 as any,
    bus,
    maxTurns: 5,
    hooks,
  });

  await researcher.chat("Research TS");
  await writer.chat("Write article");

  assert(allRecords.length === 2, `2 LLM calls recorded (got ${allRecords.length})`);

  const researcherRecords = allRecords.filter(r => r.agentName === "researcher");
  const writerRecords = allRecords.filter(r => r.agentName === "writer");
  assert(researcherRecords.length === 1, "researcher has 1 record");
  assert(writerRecords.length === 1, "writer has 1 record");
  assert(researcherRecords[0].response.text.includes("TS is great"), "researcher response correct");
  assert(writerRecords[0].response.text.includes("Article drafted"), "writer response correct");

  researcher.destroy();
  writer.destroy();
}

async function testCollaborativeFlow() {
  console.log("\n📝 Test 6: 协作流程（requestFrom）");

  // researcher 被问问题后回复
  // writer 收到 requestFrom 后回复
  const researcherModel = createMockModel([{ text: "TypeScript 有类型安全" }]);
  const writerModel = createMockModel([{ text: "文章：TypeScript 的类型安全优势" }]);

  const bus = new MessageBus();
  const researcher = new PeerAgent({
    name: "researcher", description: "Research",
    model: researcherModel as any, bus, maxTurns: 5,
  });
  const writer = new PeerAgent({
    name: "writer", description: "Write",
    model: writerModel as any, bus, maxTurns: 5,
  });

  // researcher 先做研究
  const research = await researcher.chat("研究 TS 优势");
  assert(research === "TypeScript 有类型安全", "researcher produced result");

  // researcher 把结果发给 writer
  const writeResponse = await researcher.requestFrom("writer", "write", { findings: research });
  assert(writeResponse.payload === "文章：TypeScript 的类型安全优势", "writer produced article");

  researcher.destroy();
  writer.destroy();
}

// ====== Run All ======

async function main() {
  console.log("🧪 PeerAgent 验证测试\n");
  console.log("═".repeat(50));

  await testBasicChat();
  await testBusMessageHandling();
  await testMultipleAgentsIsolated();
  await testCustomSystemPrompt();
  await testMultiAgentHooksDistinction();
  await testCollaborativeFlow();

  console.log("\n" + "═".repeat(50));
  console.log(`\n📊 结果: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
