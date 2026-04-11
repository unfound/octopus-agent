/**
 * 03-memory 测试
 *
 * 测试多轮对话记忆、窗口策略、摘要压缩
 * 运行方式：npx vitest run tests/03-memory.test.ts
 */

import { describe, it, expect } from "vitest";
import { Agent } from "../src/03-memory/agent";
import {
  slidingWindow,
  tokenBudget,
  summaryCompression,
} from "../src/03-memory/window";
import { MessageStore } from "../src/shared/message-store";

describe("multi-turn memory", () => {
  it("should remember previous context", async () => {
    const agent = new Agent();

    await agent.send("我叫 Octopus，是个 TypeScript 开发者。");
    const reply = await agent.send("我刚才说我叫什么来着？");

    expect(reply).toContain("Octopus");
  }, 30000);

  it("should track message stats", async () => {
    const agent = new Agent();
    await agent.send("第一条消息");
    await agent.send("第二条消息");

    const stats = agent.getStats();
    expect(stats.messages).toBeGreaterThan(2); // system + 2 user + 2 assistant
  }, 30000);
});

describe("sliding window strategy", () => {
  it("should keep only last N messages", async () => {
    const store = new MessageStore();
    store.add({ role: "system", content: "system" });
    store.add({ role: "user", content: "msg1" });
    store.add({ role: "user", content: "msg2" });
    store.add({ role: "user", content: "msg3" });
    store.add({ role: "user", content: "msg4" });

    const strategy = slidingWindow(3);
    const injected = await strategy.apply(store);

    expect(store.length).toBe(3);
    expect(injected.length).toBe(1);
    expect(injected[0].content).toContain("省略");
  });

  it("should not truncate when under limit", async () => {
    const store = new MessageStore();
    store.add({ role: "user", content: "msg1" });
    store.add({ role: "user", content: "msg2" });

    const strategy = slidingWindow(5);
    const injected = await strategy.apply(store);

    expect(store.length).toBe(2);
    expect(injected.length).toBe(0);
  });
});

describe("token budget strategy", () => {
  it("should trim to token budget", async () => {
    const store = new MessageStore();
    store.add({
      role: "user",
      content: "这是一条比较长的测试消息，用来测试 token 预算策略的裁剪功能。",
    });
    store.add({ role: "user", content: "短" });
    store.add({
      role: "user",
      content: "又一条比较长的测试消息，应该被裁剪掉因为超过了 token 预算限制。",
    });

    const strategy = tokenBudget(20);
    await strategy.apply(store);

    expect(store.totalEstimatedTokens).toBeLessThanOrEqual(20 + 20); // 略微宽松
  });
});

describe("summary compression strategy", () => {
  it("should trigger compression after threshold", async () => {
    const store = new MessageStore();
    store.add({ role: "user", content: "我在做一个 TypeScript 项目" });
    store.add({ role: "assistant", content: "好的，需要什么帮助？" });
    store.add({ role: "user", content: "需要实现工具调用" });
    store.add({ role: "assistant", content: "可以用 Vercel AI SDK" });

    const strategy = summaryCompression({
      triggerAfterMessages: 3,
      keepRecentMessages: 1,
    });

    const injected = await strategy.apply(store);

    // 应该生成了摘要注入
    expect(injected.length).toBe(1);
    expect(injected[0].content).toContain("摘要");
    // 只保留最近 1 条
    expect(store.length).toBe(1);
  }, 30000);
});
