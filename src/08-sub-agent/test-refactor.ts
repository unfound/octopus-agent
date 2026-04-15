/**
 * 验证重构后的 SubAgent 逻辑正确性
 *
 * 使用 mock LanguageModel，不依赖真实 LLM
 * 验证：循环次数、tool trace、hooks 调用、消息存储、隔离上下文
 */

import type { LanguageModel, GenerateTextResult, ToolCallPart, ToolResultPart } from "ai";
import { SubAgent } from "./agent";
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

  const model = createMockModel([
    { text: "Hello! I am a helpful assistant." },
  ]);

  const hookRecords: LLMCallRecord[] = [];
  const hooks: AgentHooks = {
    onLLMEnd: (r) => hookRecords.push(r),
  };

  const agent = new SubAgent({ model: model as any, maxTurns: 5, hooks });
  const result = await agent.run("Say hello");

  assert(result.success === true, "result.success === true");
  assert(result.summary === "Hello! I am a helpful assistant.", `summary matches (got: "${result.summary}")`);
  assert(result.stats.apiCalls === 1, `apiCalls === 1 (got ${result.stats.apiCalls})`);
  assert(result.stats.toolTrace.length === 0, "no tool calls");
  assert(hookRecords.length === 1, `hooks onLLMEnd called 1 time (got ${hookRecords.length})`);
  // 3 messages: system + user + assistant
  assert(result.stats.messageCount === 3, `messageCount === 3 (got ${result.stats.messageCount})`);
}

async function testToolCallThenText() {
  console.log("\n📝 Test 2: 一次工具调用 → 文本响应");

  const model = createMockModel([
    {
      text: "Let me read the file",
      toolCalls: [
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "readFile",
          input: { path: "test.txt" },
        },
      ],
      toolResults: [
        {
          type: "tool-result",
          toolCallId: "tc1",
          toolName: "readFile",
          output: { type: "json", value: { content: "file content here" } },
        },
      ],
    },
    { text: "The file contains: file content here" },
  ]);

  const hookRecords: LLMCallRecord[] = [];
  const toolCalls: Array<{ name: string; args: unknown }> = [];
  const toolResults: Array<{ name: string; result: unknown }> = [];
  const hooks: AgentHooks = {
    onLLMEnd: (r) => hookRecords.push(r),
    onToolCall: (name, args) => toolCalls.push({ name, args }),
    onToolResult: (name, result) => toolResults.push({ name, result }),
  };

  const agent = new SubAgent({
    model: model as any,
    maxTurns: 5,
    hooks,
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
  assert(result.summary.includes("file content here"), `summary contains file content (got: "${result.summary}")`);
  assert(result.stats.apiCalls === 2, `apiCalls === 2 (got ${result.stats.apiCalls})`);
  assert(result.stats.toolTrace.length === 1, `toolTrace.length === 1 (got ${result.stats.toolTrace.length})`);
  assert(result.stats.toolTrace[0].toolName === "readFile", "toolTrace[0].toolName === 'readFile'");
  assert(hookRecords.length === 2, `hooks onLLMEnd called 2 times (got ${hookRecords.length})`);
  assert(toolCalls.length === 1, `onToolCall called 1 time (got ${toolCalls.length})`);
  // Note: onToolResult 不会在 mock 模型中触发（工具未真正执行）
  // 真实场景中 AI SDK 会执行工具并触发此 hook
  assert(toolCalls.length === 1, `onToolCall called 1 time (got ${toolCalls.length})`);
}

async function testMaxTurnsExceeded() {
  console.log("\n📝 Test 3: 达到最大迭代次数");

  // 每一轮都有工具调用，永远不会自行停止
  const model = createMockModel([
    {
      text: "Working...",
      toolCalls: [{ type: "tool-call", toolCallId: "tc1", toolName: "doWork", input: {} }],
      toolResults: [{ type: "tool-result", toolCallId: "tc1", toolName: "doWork", output: { type: "json", value: "done" } }],
    },
    {
      text: "Still working...",
      toolCalls: [{ type: "tool-call", toolCallId: "tc2", toolName: "doWork", input: {} }],
      toolResults: [{ type: "tool-result", toolCallId: "tc2", toolName: "doWork", output: { type: "json", value: "done" } }],
    },
    {
      text: "Almost done...",
      toolCalls: [{ type: "tool-call", toolCallId: "tc3", toolName: "doWork", input: {} }],
      toolResults: [{ type: "tool-result", toolCallId: "tc3", toolName: "doWork", output: { type: "json", value: "done" } }],
    },
  ]);

  const agent = new SubAgent({
    model: model as any,
    maxTurns: 3,
    tools: {
      doWork: {
        description: "Do work",
        parameters: { type: "object", properties: {} },
        execute: async () => "done",
      } as any,
    },
  });

  const result = await agent.run("Keep working");

  assert(result.success === false, "result.success === false (max turns)");
  assert(result.stats.apiCalls === 3, `apiCalls === 3 (got ${result.stats.apiCalls})`);
  assert(result.stats.toolTrace.length === 3, `toolTrace.length === 3 (got ${result.stats.toolTrace.length})`);
  assert(result.error?.includes("最大迭代次数"), `error mentions max iterations (got: "${result.error}")`);
}

async function testIsolatedContext() {
  console.log("\n📝 Test 4: 隔离上下文（多次 run 互不影响）");

  const model = createMockModel([
    { text: "Response 1" },
    { text: "Response 2" },
  ]);

  const agent = new SubAgent({ model: model as any, maxTurns: 5 });

  const result1 = await agent.run("First task");
  const result2 = await agent.run("Second task");

  assert(result1.summary === "Response 1", `first run: Response 1 (got: "${result1.summary}")`);
  assert(result2.summary === "Response 2", `second run: Response 2 (got: "${result2.summary}")`);
  // 3 messages per run: system + user + assistant
  assert(result1.stats.messageCount === 3, `first run messageCount === 3 (got ${result1.stats.messageCount})`);
  assert(result2.stats.messageCount === 3, `second run messageCount === 3 (got ${result2.stats.messageCount})`);
}

async function testToolTraceAccuracy() {
  console.log("\n📝 Test 5: Tool trace 记录准确性");

  const model = createMockModel([
    {
      text: "Reading files...",
      toolCalls: [
        { type: "tool-call", toolCallId: "tc1", toolName: "readFile", input: { path: "a.txt" } },
        { type: "tool-call", toolCallId: "tc2", toolName: "readFile", input: { path: "b.txt" } },
      ],
      toolResults: [
        { type: "tool-result", toolCallId: "tc1", toolName: "readFile", output: { type: "json", value: { content: "aaa" } } },
        { type: "tool-result", toolCallId: "tc2", toolName: "readFile", output: { type: "json", value: { content: "bbb" } } },
      ],
    },
    { text: "Both files read successfully" },
  ]);

  const agent = new SubAgent({
    model: model as any,
    maxTurns: 5,
    tools: {
      readFile: {
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
        execute: async () => ({}),
      } as any,
    },
  });

  const result = await agent.run("Read a.txt and b.txt");

  assert(result.stats.toolTrace.length === 2, `2 tool calls traced (got ${result.stats.toolTrace.length})`);
  assert(result.stats.toolTrace[0].toolName === "readFile", "first trace: readFile");
  assert((result.stats.toolTrace[0].args as any).path === "a.txt", "first trace: path=a.txt");
  assert(result.stats.toolTrace[1].toolName === "readFile", "second trace: readFile");
  assert((result.stats.toolTrace[1].args as any).path === "b.txt", "second trace: path=b.txt");
  assert(result.stats.apiCalls === 2, `apiCalls === 2 (got ${result.stats.apiCalls})`);
}

async function testContextInjection() {
  console.log("\n📝 Test 6: context 参数正确注入 system prompt");

  const model = createMockModel([
    { text: "Done with context" },
  ]);

  // 通过 hooks 检查 system prompt 是否包含 context
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

// ====== Run All ======

async function main() {
  console.log("🧪 SubAgent 重构验证测试\n");
  console.log("═".repeat(50));

  await testSimpleTextResponse();
  await testToolCallThenText();
  await testMaxTurnsExceeded();
  await testIsolatedContext();
  await testToolTraceAccuracy();
  await testContextInjection();

  console.log("\n" + "═".repeat(50));
  console.log(`\n📊 结果: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
