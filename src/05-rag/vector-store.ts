/**
 * 向量存储 — 内存 + JSONL 持久化
 *
 * 存储 embedding 向量和对应的文本，支持余弦相似度检索。
 *
 * 存储格式：每行一个 JSON 对象
 *   { id, embedding: number[], text, metadata }
 *
 * 对比专业向量数据库（Pinecone / pgvector）：
 * - 这里用内存 Map + 暴力遍历，O(n) 检索
 * - 数据量小（< 10k 条）完全够用
 * - 好处：零依赖，调试简单，grep 能看
 */

import { readFile, appendFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { cosineSimilarity } from "./embedder";
import type { ChunkMetadata } from "./chunker";

/** 存储中的单条记录 */
export interface VectorEntry {
  id: string;
  embedding: number[];
  text: string;
  metadata: ChunkMetadata;
}

/** 检索结果 */
export interface SearchResult {
  entry: VectorEntry;
  score: number;
}

export class VectorStore {
  private entries: Map<string, VectorEntry> = new Map();
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** 从 JSONL 文件加载 */
  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return;

    const content = await readFile(this.filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as VectorEntry;
        this.entries.set(entry.id, entry);
      } catch {
        // 跳过损坏的行
      }
    }
  }

  /** 添加一条记录（追加写入文件） */
  async add(entry: VectorEntry): Promise<void> {
    this.entries.set(entry.id, entry);
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(entry) + "\n", "utf-8");
  }

  /** 批量添加 */
  async addAll(entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const lines: string[] = [];
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
      lines.push(JSON.stringify(entry));
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, lines.join("\n") + "\n", "utf-8");
  }

  /**
   * 按余弦相似度检索 topK
   *
   * @param queryEmbedding - 查询的 embedding 向量
   * @param topK - 返回前 K 个结果
   * @returns 按相似度降序排列的结果
   */
  search(queryEmbedding: number[], topK: number = 5): SearchResult[] {
    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      results.push({ entry, score });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /** 记录总数 */
  get size(): number {
    return this.entries.size;
  }

  /** 获取所有记录 */
  getAll(): VectorEntry[] {
    return [...this.entries.values()];
  }

  /** 按来源文件获取 */
  getBySource(source: string): VectorEntry[] {
    return this.getAll().filter((e) => e.metadata.source === source);
  }

  /** 清空（删除文件 + 内存） */
  async clear(): Promise<void> {
    this.entries.clear();
    if (existsSync(this.filePath)) {
      await writeFile(this.filePath, "", "utf-8");
    }
  }
}
