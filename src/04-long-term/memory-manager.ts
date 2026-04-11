/**
 * 记忆管理器 — 提取、合并、衰减
 *
 * 对比 OpenClaw 的做法：
 * - OpenClaw: LLM 一次性总结整段对话 → 写入 .md → 下次全量发送
 * - 我们:   LLM 逐条提取结构化记忆 → JSONL 存储 → BM25 检索 topK
 *
 * 核心差异：粒度更细、可检索、不浪费 token
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import { createMemoryEntry, type MemoryEntry, type MemoryCategory } from "./memory-entry";
import { MemoryStore } from "./memory-store";
import { BM25Index } from "./bm25";

/** LLM 提取记忆的输出 schema */
const extractedMemorySchema = z.object({
  memories: z
    .array(
      z.object({
        content: z.string().describe("记忆内容，用第一人称描述用户的信息"),
        category: z
          .enum(["fact", "preference", "skill", "event"])
          .describe("分类"),
        keywords: z
          .array(z.string())
          .describe("2-5 个关键词，用于检索"),
        importance: z
          .number()
          .min(1)
          .max(10)
          .describe("重要性 1-10"),
      }),
    )
    .describe("从对话中提取的记忆条目，如果没有值得记住的内容则返回空数组"),
});

export class MemoryManager {
  private store: MemoryStore;
  private bm25: BM25Index;
  private model: ReturnType<typeof getModel>;

  constructor(store: MemoryStore, model?: ReturnType<typeof getModel>) {
    this.store = store;
    this.bm25 = new BM25Index();
    this.model = model ?? getModel();
  }

  /** 初始化：从 store 加载所有记忆到 BM25 索引 */
  async init(): Promise<void> {
    await this.store.load();
    for (const entry of this.store.getAll()) {
      this.addToIndex(entry);
    }
  }

  /**
   * 从一轮对话中提取值得记住的内容
   *
   * @param userMessage - 用户消息
   * @param assistantReply - 助手回复
   * @returns 新提取的记忆条目
   */
  async extract(
    userMessage: string,
    assistantReply: string,
  ): Promise<MemoryEntry[]> {
    const { object } = await generateObject({
      model: this.model,
      schema: extractedMemorySchema,
      prompt: `分析以下对话，提取值得长期记住的信息。

只提取关于用户的事实、偏好、技能、或重要事件。
不要提取临时性的对话内容（如"帮我查一下天气"）。
如果没有值得记住的内容，返回空数组。

用户：${userMessage}
助手：${assistantReply}`,
    });

    const entries: MemoryEntry[] = [];
    for (const m of object.memories) {
      const entry = createMemoryEntry(
        m.content,
        m.category as MemoryCategory,
        m.keywords,
        m.importance,
      );
      entries.push(entry);
      await this.store.add(entry);
      this.addToIndex(entry);
    }

    return entries;
  }

  /**
   * 检索相关记忆
   *
   * 综合 BM25 分数 + 重要性加权 + 时间衰减
   */
  recall(query: string, topK: number = 5): MemoryEntry[] {
    const results = this.bm25.search(query, topK * 2); // 多取一些，再筛选

    return results
      .map(({ docId, score }) => {
        const entry = this.store.get(docId);
        if (!entry) return null;

        // 综合评分：BM25 分数 × 重要性权重 × 时间衰减
        const importanceWeight = entry.importance / 10;
        const daysSinceAccess =
          (Date.now() - entry.lastAccessedAt) / (1000 * 60 * 60 * 24);
        // 指数衰减：每 30 天衰减到 50%
        const recencyWeight = Math.pow(0.5, daysSinceAccess / 30);
        const finalScore = score * importanceWeight * recencyWeight;

        return { entry, score: finalScore };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ entry }) => {
        // 标记访问
        this.store.markAccessed(entry.id);
        return entry;
      });
  }

  /** 格式化记忆为 prompt 片段 */
  formatForPrompt(entries: MemoryEntry[]): string {
    if (entries.length === 0) return "";

    const lines = entries.map((e) => {
      const cat = { fact: "事实", preference: "偏好", skill: "技能", event: "事件" }[
        e.category
      ];
      return `- [${cat}] ${e.content}`;
    });

    return `## 关于用户的记忆\n\n${lines.join("\n")}`;
  }

  /** 将记忆条目加入 BM25 索引 */
  private addToIndex(entry: MemoryEntry): void {
    // 把 content + keywords 拼在一起建索引，提升召回率
    const indexText = [entry.content, ...entry.keywords].join(" ");
    this.bm25.add(entry.id, indexText);
  }
}
