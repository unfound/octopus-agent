/**
 * RAG 核心 — 索引 + 检索 + 增强
 *
 * 完整流程：
 * 1. 索引：读文件 → chunk → embed → 存入 VectorStore
 * 2. 检索：query → embed → 相似度搜索 topK
 * 3. 增强：把检索到的 chunks 拼成 context，注入 system prompt
 *
 * 对比 04-long-term：
 * - 04: BM25 关键词检索 → 擅长精确匹配
 * - 05: Embedding 语义检索 → 擅长理解含义
 * - 两者互补，不是替代关系
 */

import { readFile } from "fs/promises";
import { chunkText, type Chunk } from "./chunker";
import { embedText, embedTexts } from "./embedder";
import { VectorStore, type SearchResult } from "./vector-store";

export interface RagOptions {
  /** 向量存储文件路径 */
  storePath?: string;
  /** 检索返回的 topK 数量 */
  topK?: number;
  /** chunk 最大 token 数 */
  maxTokens?: number;
  /** chunk 重叠 token 数 */
  overlap?: number;
}

export class Rag {
  private store: VectorStore;
  private topK: number;
  private maxTokens: number;
  private overlap: number;

  constructor(options: RagOptions = {}) {
    this.store = new VectorStore(options.storePath ?? "./data/vectors.jsonl");
    this.topK = options.topK ?? 5;
    this.maxTokens = options.maxTokens ?? 256;
    this.overlap = options.overlap ?? 32;
  }

  /** 初始化：从文件加载已有向量 */
  async init(): Promise<void> {
    await this.store.load();
  }

  /**
   * 索引一个文件
   *
   * @param filePath - 文件路径
   * @returns 切片数量
   */
  async indexFile(filePath: string): Promise<number> {
    const content = await readFile(filePath, "utf-8");
    return this.indexText(content, filePath);
  }

  /**
   * 索引一段文本
   *
   * @param text - 文本内容
   * @param source - 来源标识
   * @returns 切片数量
   */
  async indexText(text: string, source: string): Promise<number> {
    // 1. 切片
    const chunks = chunkText(text, source, {
      maxTokens: this.maxTokens,
      overlap: this.overlap,
    });

    if (chunks.length === 0) return 0;

    // 2. 批量 embed
    const texts = chunks.map((c) => c.text);
    const embeddings = await embedTexts(texts);

    // 3. 存入向量存储
    const entries = chunks.map((chunk, i) => ({
      id: chunk.id,
      embedding: embeddings[i],
      text: chunk.text,
      metadata: chunk.metadata,
    }));

    await this.store.addAll(entries);
    return chunks.length;
  }

  /**
   * 检索：根据查询找最相关的 chunks
   *
   * @param query - 用户查询
   * @param topK - 返回数量（覆盖默认值）
   * @returns 检索结果（含相似度分数）
   */
  async retrieve(query: string, topK?: number): Promise<SearchResult[]> {
    const queryEmbedding = await embedText(query);
    return this.store.search(queryEmbedding, topK ?? this.topK);
  }

  /**
   * 增强：把检索结果格式化为 prompt 片段
   *
   * @param results - 检索结果
   * @returns 格式化的上下文文本
   */
  formatContext(results: SearchResult[]): string {
    if (results.length === 0) return "";

    const sections = results.map((r, i) => {
      const source = r.entry.metadata.source;
      const score = r.score.toFixed(3);
      return `### [${i + 1}] (${source}, 相似度: ${score})\n${r.entry.text}`;
    });

    return `## 知识库检索结果\n\n${sections.join("\n\n")}`;
  }

  /** 向量存储中的文档数 */
  get size(): number {
    return this.store.size;
  }

  /** 按来源获取已索引的 chunks */
  getBySource(source: string) {
    return this.store.getBySource(source);
  }

  /** 清空索引 */
  async clear(): Promise<void> {
    await this.store.clear();
  }
}
