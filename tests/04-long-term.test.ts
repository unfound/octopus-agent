/**
 * 04-long-term 测试
 *
 * 测试 BM25 检索和跨 session 长期记忆
 * 运行方式：npx vitest run tests/04-long-term.test.ts
 */

import { describe, it, expect } from "vitest";
import { BM25Index } from "../src/04-long-term/bm25";
import { Agent } from "../src/04-long-term/agent";
import { MemoryStore } from "../src/04-long-term/memory-store";
import { createMemoryEntry } from "../src/04-long-term/memory-entry";
import { unlinkSync, existsSync } from "fs";

describe("BM25 index", () => {
  it("should find relevant documents by query", () => {
    const index = new BM25Index();
    index.add("m1", "用户叫 Octopus，TypeScript 开发者");
    index.add("m2", "用户喜欢 Vercel AI SDK，不喜欢 Mastra 框架");
    index.add("m3", "用户电脑是 MacBook Pro M4");
    index.add("m4", "用户在学习 AI Agent 开发");
    index.add("m5", "用户的工作目录在 ~/projects");

    const results = index.search("用户叫什么名字", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].docId).toBe("m1");
  });

  it("should rank by relevance", () => {
    const index = new BM25Index();
    index.add("d1", "TypeScript 是一种编程语言");
    index.add("d2", "Python 也很流行");
    index.add("d3", "我用 TypeScript 做项目");

    const results = index.search("TypeScript 编程", 3);
    expect(results.length).toBeGreaterThan(0);
    // TypeScript 相关文档应该排在前面
    expect(results[0].docId).not.toBe("d2");
  });

  it("should handle removing documents", () => {
    const index = new BM25Index();
    index.add("d1", "hello world");
    index.add("d2", "goodbye world");

    expect(index.size).toBe(2);
    index.remove("d1");
    expect(index.size).toBe(1);

    const results = index.search("hello", 5);
    expect(results.length).toBe(0);
  });

  it("should handle empty query", () => {
    const index = new BM25Index();
    index.add("d1", "some content");

    const results = index.search("", 5);
    expect(results).toEqual([]);
  });
});

describe("memory store", () => {
  const TEST_FILE = "/tmp/octopus-agent/test-memories.jsonl";

  it("should add and retrieve entries", async () => {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);

    const store = new MemoryStore(TEST_FILE);
    const entry = createMemoryEntry("用户是 TypeScript 开发者", "fact", [
      "typescript",
      "开发者",
    ]);

    await store.add(entry);
    expect(store.size).toBe(1);
    expect(store.get(entry.id)).toEqual(entry);
  });

  it("should persist to JSONL file", async () => {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);

    const store1 = new MemoryStore(TEST_FILE);
    const entry = createMemoryEntry("用户喜欢咖啡", "preference", ["咖啡"]);
    await store1.add(entry);

    // 模拟重启 — 新建 store 重新加载
    const store2 = new MemoryStore(TEST_FILE);
    await store2.load();
    expect(store2.size).toBe(1);
    expect(store2.get(entry.id)?.content).toBe("用户喜欢咖啡");
  });
});

describe("cross-session memory", () => {
  const MEMORY_FILE = "/tmp/octopus-agent/test-cross-session.jsonl";

  it("should recall manually stored memories", async () => {
    if (existsSync(MEMORY_FILE)) unlinkSync(MEMORY_FILE);

    // 手动存储记忆（不依赖 LLM 提取）
    const store = new MemoryStore(MEMORY_FILE);
    const entry = createMemoryEntry(
      "用户叫 Octopus，是 TypeScript 开发者",
      "fact",
      ["Octopus", "TypeScript", "开发者"],
      8,
    );
    await store.add(entry);

    // 新建 agent，应该能检索到
    const agent = new Agent({ memoryFile: MEMORY_FILE });
    await agent.init();
    const reply = await agent.send("我叫什么名字？");

    // 本地模型 + BM25 检索，应该能回忆起
    expect(reply).toMatch(/Octopus|octopus/);
  }, 30000);
});
