/**
 * BM25 检索 — 手写实现
 *
 * BM25 是经典的信息检索算法，用于根据查询和文档的相关性打分。
 * Elasticsearch、Lucene 等都内置了 BM25。
 *
 * 公式：
 *   score(D, Q) = Σ IDF(qi) × TF(qi, D) × (k1 + 1) / (TF(qi, D) + k1 × (1 - b + b × |D|/avgdl))
 *
 * 参数：
 *   k1 = 1.2（词频饱和系数，越大词频影响越大）
 *   b  = 0.75（长度归一化系数，1 = 完全归一化）
 *
 * 切词：使用 nodejieba 做中文分词
 */

import jieba from "nodejieba";

/** BM25 默认参数 */
const K1 = 1.2;
const B = 0.75;

/** 对文本做分词 */
export function tokenize(text: string): string[] {
  return jieba.cut(text, true);
}

/**
 * BM25 索引
 *
 * 用法：
 *   const index = new BM25Index();
 *   index.add("doc1", "我喜欢 TypeScript 编程");
 *   index.add("doc2", "Python 也很适合做数据科学");
 *   const results = index.search("编程语言", 5);
 */
export class BM25Index {
  /** term → Map<docId, termFrequency> */
  private invertedIndex: Map<string, Map<string, number>> = new Map();
  /** docId → token 数量 */
  private docLengths: Map<string, number> = new Map();
  /** 总文档数 */
  private docCount = 0;
  /** 所有文档的平均长度 */
  private avgDocLength = 0;
  /** docId → 原始文本（用于调试） */
  private docs: Map<string, string> = new Map();

  /** 添加文档到索引 */
  add(docId: string, text: string): void {
    // 如果已存在，先移除旧的
    if (this.docs.has(docId)) {
      this.remove(docId);
    }

    const tokens = tokenize(text);
    this.docs.set(docId, text);
    this.docLengths.set(docId, tokens.length);
    this.docCount++;

    // 统计每个 term 的词频
    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // 建立倒排索引
    for (const [term, freq] of termFreq) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map());
      }
      this.invertedIndex.get(term)!.set(docId, freq);
    }

    // 更新平均文档长度
    this.recalcAvgLength();
  }

  /** 移除文档 */
  remove(docId: string): void {
    if (!this.docs.has(docId)) return;

    // 从倒排索引中移除该文档的所有 term
    for (const [, postings] of this.invertedIndex) {
      postings.delete(docId);
    }

    this.docs.delete(docId);
    this.docLengths.delete(docId);
    this.docCount--;
    this.recalcAvgLength();
  }

  /** 搜索，返回按 BM25 分数降序排列的结果 */
  search(query: string, topK: number = 5): Array<{ docId: string; score: number }> {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores = new Map<string, number>();

    for (const token of queryTokens) {
      const postings = this.invertedIndex.get(token);
      if (!postings) continue;

      // IDF = ln((N - df + 0.5) / (df + 0.5) + 1)
      const df = postings.size;
      const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, tf] of postings) {
        const dl = this.docLengths.get(docId) || 0;
        // BM25 评分
        const numerator = tf * (K1 + 1);
        const denominator = tf + K1 * (1 - B + B * (dl / this.avgDocLength));
        const score = idf * (numerator / denominator);

        scores.set(docId, (scores.get(docId) || 0) + score);
      }
    }

    // 排序取 topK
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docId, score]) => ({ docId, score }));
  }

  /** 索引中的文档数 */
  get size(): number {
    return this.docCount;
  }

  private recalcAvgLength(): void {
    if (this.docCount === 0) {
      this.avgDocLength = 0;
      return;
    }
    const total = [...this.docLengths.values()].reduce((s, l) => s + l, 0);
    this.avgDocLength = total / this.docCount;
  }
}
