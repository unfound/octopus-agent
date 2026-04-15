/**
 * 验证重构后的 PeerAgent 逻辑正确性
 *
 * 使用 mock LanguageModel + 内存 MessageBus
 * 验证：chat、handleBusMessage、destroy、getInfo
 */

import type { LanguageModel } from "ai";
import { PeerAgent, createListAgentsTool } from "./agent";
import { MessageBus } from "./message-bus";
import type { AgentHooks, LLMCallRecord } from "../shared/hooks";

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

  const model = createMockModel([
    { text: "Hello from researcher!" },
  ]);

  const bus = new MessageBus();
  const agent = new PeerAgent({
    name: "researcher",
    description: "负责研究分析",
    model: model as any,
    bus,
    maxTurns: 5,
  });

  const reply = await agent.chat("研究 TypeScript");

  assert(reply === "Hello from researcher!", `reply matches (got: "${reply}")`);
  assert(agent.getInfo().name === "researcher", "getInfo().name === 'researcher'");
  assert(agent.getInfo().description === "负责研究分析", "getInfo().description matches");
  assert(bus.getRegisteredAgents().includes("researcher"), "agent registered on bus");

  agent.destroy();
  assert(!bus.getRegisteredAgents().includes("researcher"), "agent unregistered after destroy");
}

async function testBusMessageHandling() {
  console.log("\n📝 Test 2: 处理来自 MessageBus 的消息");

  const model = createMockModel([
    { text: "研究结果: TypeScript 很好" },
  ]);

  const bus = new MessageBus();
  const agent = new PeerAgent({
    name: "researcher",
    description: "负责研究",
    model: model as any,
    bus,
    maxTurns: 5,
  });

  // 另一个 agent 通过 bus 发消息
  const response = await bus.request({
    from: "writer",
    to: "researcher",
    action: "research",
    payload: "研究 TypeScript 的优势",
  });

  assert(response.payload === "研究结果: TypeScript 很好", `bus response matches (got: "${response.payload}")`);

  agent.destroy();
}

async function testRequestFrom() {
  console.log("\n📝 Test 3: requestFrom RPC 调用");

  const researcherModel = createMockModel([
    { text: "TypeScript 有三大优势" },
  ]);

  const bus = new MessageBus();
  const researcher = new PeerAgent({
    name: "researcher",
    description: "研究分析",
    model: researcherModel as any,
    bus,
    maxTurns: 5,
  });

  const response = await researcher.requestFrom("researcher", "test", { query: "hello" });

  // requestFrom sends to itself in this test
  assert(typeof response.payload === "string", "response.payload is string");

  researcher.destroy();
}

async function testMultipleAgentsIsolated() {
  console.log("\n📝 Test 4: 多 Agent 隔离（各自独立上下文）");

  const model1 = createMockModel([{ text: "Agent 1 response" }]);
  const model2 = createMockModel([{ text: "Agent 2 response" }]);

  const bus = new MessageBus();
  const agent1 = new PeerAgent({
    name: "agent1",
    description: "First agent",
    model: model1 as any,
    bus,
    maxTurns: 5,
  });
  const agent2 = new PeerAgent({
    name: "agent2",
    description: "Second agent",
    model: model2 as any,
    bus,
    maxTurns: 5,
  });

  const reply1 = await agent1.chat("Question for agent 1");
  const reply2 = await agent2.chat("Question for agent 2");

  assert(reply1 === "Agent 1 response", `agent1 reply (got: "${reply1}")`);
  assert(reply2 === "Agent 2 response", `agent2 reply (got: "${reply2}")`);
  assert(bus.getRegisteredAgents().length === 2, "both agents registered");

  agent1.destroy();
  agent2.destroy();
  assert(bus.getRegisteredAgents().length === 0, "both agents unregistered");
}

async function testCustomSystemPrompt() {
  console.log("\n📝 Test 5: 自定义 system prompt");

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

// ====== Run All ======

async function main() {
  console.log("🧪 PeerAgent 重构验证测试\n");
  console.log("═".repeat(50));

  await testBasicChat();
  await testBusMessageHandling();
  await testRequestFrom();
  await testMultipleAgentsIsolated();
  await testCustomSystemPrompt();

  console.log("\n" + "═".repeat(50));
  console.log(`\n📊 结果: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
