/**
 * 验证重构后的 SubAgent + delegate 逻辑正确性
 *
 * 使用 mock LanguageModel，不依赖真实 LLM
 * 验证：循环次数、tool trace、hooks 调用、消息存储、隔离上下文、delegate 集成
 */

import type { LanguageModel, ToolCallPart, ToolResultPart } from "ai";
import { SubAgent } from "./agent";
import { createDelegateTool } from "./delegate";
import type { AgentHooks, LLMCallRecord } from "../shared/hooks";

// ====== Mock Model Factory ======

interface MockStep {
  text: string;
  toolCalls?: ToolCallPart[];
  toolResults?: ToolResultPart[];
  finishReason?: string;
}

function createMockModel(steps: MockStep[]): LanguageModel {
  let callIndex = 0;

  const model = {
    specificationVersion: "v2" as const,
    provider: "mock",
    modelId: "mock-model",
    defaultObjectGenerationMode: "json" as const,

    doGenerate: async () => {
      const step = steps[callIndex] ?? steps[steps.length - 1];
      callIndex++;

      return {
        finishReason: (step.finishReason ?? "stop") as any,
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

    doStream: async () => {
      throw new Error("Mock model does not support streaming");
    },
  };

  return model as unknown as LanguageModel;
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

async function testSimpleTextResponse() {
  console.log("\n📝 Test 1: 简单文本响应（无工具调用）");

  const model = createMockModel([{ text: "Hello!" }]);

  const hookRecords: LLMCallRecord[] = [];
  const hooks: AgentHooks = {
    onLLMEnd: (r) => { hookRecords.push(r); },
  };

  const agent = new SubAgent({ model: model as any, maxTurns: 5, hooks, name: "test-child" });
  const result = await agent.run("Say hello");

  assert(result.success === true, "result.success === true");
  assert(result.summary === "Hello!", `summary matches (got: "${result.summary}")`);
  assert(result.stats.apiCalls === 1, `apiCalls === 1 (got ${result.stats.apiCalls})`);
  assert(hookRecords.length === 1, `hooks onLLMEnd called 1 time (got ${hookRecords.length})`);
  assert(hookRecords[0].agentName === "test-child", `agentName === "test-child" (got: "${hookRecords[0].agentName}")`);
  // 3 messages: system + user + assistant
  assert(result.stats.messageCount === 3, `messageCount === 3 (got ${result.stats.messageCount})`);
}

async function testToolCallThenText() {
  console.log("\n📝 Test 2: 一次工具调用 → 文本响应");

  const model = createMockModel([
    {
      text: "Let me read the file",
      toolCalls: [{
        type: "tool-call", toolCallId: "tc1", toolName: "readFile",
        input: { path: "test.txt" },
      }],
      toolResults: [{
        type: "tool-result", toolCallId: "tc1", toolName: "readFile",
        output: { type: "json", value: { content: "file content here" } },
      }],
    },
    { text: "The file contains: file content here" },
  ]);

  const hookRecords: LLMCallRecord[] = [];
  const toolCalls: Array<{ name: string; args: unknown }> = [];
  const hooks: AgentHooks = {
    onLLMEnd: (r) => { hookRecords.push(r); },
    onToolCall: (name, args) => { toolCalls.push({ name, args }); },
  };

  const agent = new SubAgent({
    model: model as any, maxTurns: 5, hooks, name: "reader",
    tools: {
      readFile: {
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
        execute: async () => ({ content: "file content here" }),
      } as any,
    },
  });

  const result = await agent.run("Read test.txt");

  assert(result.success === true, "result.success === true");
  assert(result.stats.apiCalls === 2, `apiCalls === 2 (got ${result.stats.apiCalls})`);
  assert(result.stats.toolTrace.length === 1, `toolTrace.length === 1`);
  assert(result.stats.toolTrace[0].toolName === "readFile", "toolTrace[0] === readFile");
  assert(hookRecords.length === 2, `hooks: 2 LLM calls recorded (got ${hookRecords.length})`);
  assert(hookRecords.every(r => r.agentName === "reader"), "all hook records have agentName === 'reader'");
  assert(toolCalls.length === 1, `onToolCall: 1 (got ${toolCalls.length})`);
}

async function testMaxTurnsExceeded() {
  console.log("\n📝 Test 3: 达到最大迭代次数");

  const model = createMockModel([
    { text: "Working...", toolCalls: [{ type: "tool-call", toolCallId: "tc1", toolName: "doWork", input: {} }], toolResults: [{ type: "tool-result", toolCallId: "tc1", toolName: "doWork", output: { type: "json", value: "done" } }] },
    { text: "Still...", toolCalls: [{ type: "tool-call", toolCallId: "tc2", toolName: "doWork", input: {} }], toolResults: [{ type: "tool-result", toolCallId: "tc2", toolName: "doWork", output: { type: "json", value: "done" } }] },
    { text: "Almost...", toolCalls: [{ type: "tool-call", toolCallId: "tc3", toolName: "doWork", input: {} }], toolResults: [{ type: "tool-result", toolCallId: "tc3", toolName: "doWork", output: { type: "json", value: "done" } }] },
  ]);

  const agent = new SubAgent({
    model: model as any, maxTurns: 3,
    tools: {
      doWork: { description: "Do work", parameters: { type: "object", properties: {} }, execute: async () => "done" } as any,
    },
  });

  const result = await agent.run("Keep working");

  assert(result.success === false, "result.success === false (max turns)");
  assert(result.stats.apiCalls === 3, `apiCalls === 3 (got ${result.stats.apiCalls})`);
  assert(result.stats.toolTrace.length === 3, `toolTrace.length === 3`);
  assert(result.error?.includes("最大迭代次数") === true, `error mentions max iterations`);
}

async function testIsolatedContext() {
  console.log("\n📝 Test 4: 隔离上下文（多次 run 互不影响）");

  const model = createMockModel([{ text: "Response 1" }, { text: "Response 2" }]);
  const agent = new SubAgent({ model: model as any, maxTurns: 5 });

  const result1 = await agent.run("First task");
  const result2 = await agent.run("Second task");

  assert(result1.summary === "Response 1", `first run: Response 1`);
  assert(result2.summary === "Response 2", `second run: Response 2`);
  assert(result1.stats.messageCount === 3, `first: 3 messages`);
  assert(result2.stats.messageCount === 3, `second: 3 messages (not 6 — 隔离)`);
}

async function testContextInjection() {
  console.log("\n📝 Test 5: context 参数正确注入 system prompt");

  const model = createMockModel([{ text: "Done with context" }]);

  let capturedSystemContent = "";
  const hooks: AgentHooks = {
    onLLMEnd: (r) => {
      const sysMsg = r.request.messages.find((m: any) => m.role === "system");
      if (sysMsg) capturedSystemContent = sysMsg.content as string;
    },
  };

  const agent = new SubAgent({ model: model as any, maxTurns: 5, hooks });
  await agent.run("Do something", "Project is in /home/user/project");

  assert(capturedSystemContent.includes("/home/user/project"), "system prompt includes context");
  assert(capturedSystemContent.includes("Do something"), "system prompt includes goal");
}

// ====== Delegate 集成测试 ======

async function testDelegateIntegration() {
  console.log("\n📝 Test 6: delegate 工具集成（父代理 + 子代理 hooks）");

  // 父代理的 mock：调用一次 delegate，然后返回结果
  const parentModel = createMockModel([
    {
      text: "I'll delegate this",
      toolCalls: [{
        type: "tool-call", toolCallId: "tc1", toolName: "delegate",
        input: { goal: "Read package.json" },
      }],
      toolResults: [{
        type: "tool-result", toolCallId: "tc1", toolName: "delegate",
        output: { type: "json", value: { success: true, summary: "Project: octopus-agent v1.0" } },
      }],
    },
    { text: "The project is octopus-agent v1.0" },
  ]);

  // 子代理的 mock：读取文件返回结果
  const childModel = createMockModel([
    { text: "Done: Project is octopus-agent v1.0" },
  ]);

  // 共享 hooks — 验证父子都触发
  const allRecords: LLMCallRecord[] = [];
  const hooks: AgentHooks = {
    onLLMEnd: (r) => { allRecords.push(r); },
  };

  // 注意：delegate 工具内部创建 SubAgent 时会用自己的 model
  // 这里我们用 parentModel 来模拟父代理的行为
  // 子代理的 model 由 delegate config 控制
  const delegateTool = createDelegateTool({
    model: childModel as any,
    maxTurns: 3,
    hooks,
    tools: {
      readFile: {
        description: "Read file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
        execute: async () => ({ content: "{ name: 'octopus-agent', version: '1.0' }" }),
      } as any,
    },
  });

  // 模拟父代理调用 delegate
  const delegateResult = await (delegateTool as any).execute({ goal: "Read package.json" });

  // 验证子代理执行结果
  assert(delegateResult.success === true, "delegate returned success");
  assert(typeof delegateResult.summary === "string", "delegate returned summary");

  // 验证 hooks 记录包含子代理的调用
  const childRecords = allRecords.filter(r => r.agentName === "delegate");
  assert(childRecords.length >= 1, `child agent hooks recorded (${childRecords.length} calls)`);

  // 验证 agentName 在记录中正确设置
  assert(childRecords.every(r => r.agentName === "delegate"), "child records have agentName === 'delegate'");
}

async function testHooksAgentNameDistinction() {
  console.log("\n📝 Test 7: hooks 中 agentName 区分多 agent");

  const model1 = createMockModel([{ text: "Agent A response" }]);
  const model2 = createMockModel([{ text: "Agent B response" }]);

  const allRecords: LLMCallRecord[] = [];
  const hooks: AgentHooks = {
    onLLMEnd: (r) => { allRecords.push(r); },
  };

  const agentA = new SubAgent({ model: model1 as any, maxTurns: 5, hooks, name: "agent-a" });
  const agentB = new SubAgent({ model: model2 as any, maxTurns: 5, hooks, name: "agent-b" });

  await agentA.run("Task A");
  await agentB.run("Task B");

  assert(allRecords.length === 2, `2 LLM calls recorded (got ${allRecords.length})`);

  const recordsA = allRecords.filter(r => r.agentName === "agent-a");
  const recordsB = allRecords.filter(r => r.agentName === "agent-b");
  assert(recordsA.length === 1, "agent-a has 1 record");
  assert(recordsB.length === 1, "agent-b has 1 record");
  assert(recordsA[0].response.text === "Agent A response", "agent-a response matches");
  assert(recordsB[0].response.text === "Agent B response", "agent-b response matches");
}

// ====== Run All ======

async function main() {
  console.log("🧪 SubAgent + Delegate 验证测试\n");
  console.log("═".repeat(50));

  await testSimpleTextResponse();
  await testToolCallThenText();
  await testMaxTurnsExceeded();
  await testIsolatedContext();
  await testContextInjection();
  await testDelegateIntegration();
  await testHooksAgentNameDistinction();

  console.log("\n" + "═".repeat(50));
  console.log(`\n📊 结果: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
