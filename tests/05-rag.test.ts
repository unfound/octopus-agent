/**
 * 05-rag 测试
 *
 * 测试文档切片、embedding、向量存储、余弦相似度
 * 运行方式：npx vitest run tests/05-rag.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chunkText } from "../src/05-rag/chunker";
import { cosineSimilarity, embedText } from "../src/05-rag/embedder";
import { VectorStore } from "../src/05-rag/vector-store";
import { Rag } from "../src/05-rag/rag";
import { unlinkSync, existsSync } from "fs";

// ─── chunker ───

describe("chunker", () => {
  it("should split text into chunks", () => {
    const text = "第一段内容。\n\n第二段内容。\n\n第三段内容。";
    const chunks = chunkText(text, "test.md");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata.source).toBe("test.md");
    expect(chunks[0].metadata.index).toBe(0);
  });

  it("should respect maxTokens limit", () => {
    // 生成一个长文本
    const longText = Array(100).fill("这是一个测试段落，用于验证切片逻辑。").join("\n\n");
    const chunks = chunkText(longText, "long.txt", { maxTokens: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    // 每个 chunk 不应太大（粗略检查）
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThan(500);
    }
  });

  it("should handle empty text", () => {
    const chunks = chunkText("", "empty.txt");
    expect(chunks).toEqual([]);
  });

  it("should split long paragraphs by sentences", () => {
    const longPara = "这是第一句话。这是第二句话。这是第三句话。这是第四句话。这是第五句话。这是第六句话。这是第七句话。这是第八句话。这是第九句话。这是第十句话。";
    const chunks = chunkText(longPara, "long-para.txt", { maxTokens: 20 });
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ─── cosine similarity ───

describe("cosine similarity", () => {
  it("should return 1 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("should return 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("should return negative for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("should handle zero vectors", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("should throw on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow("维度不匹配");
  });
});

// ─── vector store ───

describe("vector store", () => {
  const TEST_FILE = "/tmp/octopus-agent/test-vectors.jsonl";

  it("should add and search entries", async () => {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);

    const store = new VectorStore(TEST_FILE);
    await store.add({
      id: "doc1",
      embedding: [1, 0, 0],
      text: "TypeScript 编程",
      metadata: { source: "test.md", index: 0, charOffset: 0 },
    });
    await store.add({
      id: "doc2",
      embedding: [0, 1, 0],
      text: "Python 数据科学",
      metadata: { source: "test.md", index: 1, charOffset: 10 },
    });

    // 查询向量和 doc1 更相似
    const results = store.search([0.9, 0.1, 0], 2);
    expect(results.length).toBe(2);
    expect(results[0].entry.id).toBe("doc1");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("should persist and reload from JSONL", async () => {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);

    const store1 = new VectorStore(TEST_FILE);
    await store1.add({
      id: "p1",
      embedding: [1, 2, 3],
      text: "持久化测试",
      metadata: { source: "p.md", index: 0, charOffset: 0 },
    });

    const store2 = new VectorStore(TEST_FILE);
    await store2.load();
    expect(store2.size).toBe(1);
    expect(store2.search([1, 2, 3], 1)[0].entry.text).toBe("持久化测试");
  });

  it("should filter by source", async () => {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);

    const store = new VectorStore(TEST_FILE);
    await store.addAll([
      { id: "a1", embedding: [1, 0], text: "A", metadata: { source: "a.txt", index: 0, charOffset: 0 } },
      { id: "b1", embedding: [0, 1], text: "B", metadata: { source: "b.txt", index: 0, charOffset: 0 } },
    ]);

    expect(store.getBySource("a.txt").length).toBe(1);
    expect(store.getBySource("b.txt").length).toBe(1);
    expect(store.getBySource("c.txt").length).toBe(0);
  });
});

// ─── embedding (需要本地模型运行) ───

describe("embedder", () => {
  it("should embed text to vector", { timeout: 15000 }, async () => {
    const vec = await embedText("你好世界");
    expect(vec.length).toBe(1024);
    expect(vec[0]).toBeTypeOf("number");
  });

  it("should produce similar embeddings for similar text", { timeout: 20000 }, async () => {
    const vec1 = await embedText("我喜欢编程");
    const vec2 = await embedText("我热爱写代码");
    const vec3 = await embedText("今天天气不错");

    const sim12 = cosineSimilarity(vec1, vec2);
    const sim13 = cosineSimilarity(vec1, vec3);

    // 编程和写代码应该比编程和天气更相似
    expect(sim12).toBeGreaterThan(sim13);
  });
});

// ─── rag (集成测试，需要本地模型) ───

describe("rag", () => {
  const TEST_STORE = "/tmp/octopus-agent/test-rag-vectors.jsonl";

  it("should index text and retrieve relevant chunks", { timeout: 30000 }, async () => {
    if (existsSync(TEST_STORE)) unlinkSync(TEST_STORE);

    const rag = new Rag({ storePath: TEST_STORE });
    await rag.init();

    // 索引一些文档
    await rag.indexText("Octopus Agent 是一个 TypeScript 学习项目", "intro.md");
    await rag.indexText("使用 Vercel AI SDK 做底层通信", "tech.md");
    await rag.indexText("今天天气很好，适合出去散步", "weather.md");

    expect(rag.size).toBe(3);

    // 检索
    const results = await rag.retrieve("Octopus 是什么？", 2);
    expect(results.length).toBeGreaterThan(0);
    // 应该找到 intro.md 的内容
    expect(results[0].entry.metadata.source).toBe("intro.md");
  });

  it("should format context for prompt", { timeout: 15000 }, async () => {
    // 复用上一个测试索引的数据
    const rag = new Rag({ storePath: TEST_STORE });
    await rag.init();
    await rag.indexText("格式化测试用的文档内容", "format-test.md");

    const results = await rag.retrieve("格式化测试", 1);
    const context = rag.formatContext(results);

    expect(context).toContain("知识库检索结果");
    expect(context).toContain("format-test.md");
  });
});
