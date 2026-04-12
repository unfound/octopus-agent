/**
 * Embedding 封装 — 调用本地 qwen3-embedding-0.6b
 *
 * Vercel AI SDK 的 @ai-sdk/openai 原生支持 embedding 接口。
 * 底层走 /v1/embeddings，和 Chat Completions 同一个 base URL。
 *
 * 注意：
 * - 模型上下文只有 2048 tokens，单条输入别太长
 * - 批量请求时，总 token 数也不能超 2048
 * - 所以 chunker 的 maxTokens 默认 256，留足余量
 */

import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import "dotenv/config";

/** Embedding 维度（qwen3-embedding-0.6b 固定 1024） */
export const EMBEDDING_DIM = 1024;

/** 获取 embedding 模型实例 */
function getEmbeddingModel(modelId?: string) {
  const openai = createOpenAI({
    baseURL: process.env.LOCAL_MODEL_BASE_URL || "http://192.168.0.120:8888/v1",
    apiKey: process.env.LOCAL_MODEL_API_KEY || "lm-studio",
  });
  return openai.embedding(modelId || process.env.EMBEDDING_MODEL || "qwen3-embedding-0.6b");
}

/**
 * 对单条文本做 embedding
 *
 * @param text - 输入文本
 * @param modelId - 模型名（默认 qwen3-embedding-0.6b）
 * @returns embedding 向量（number[]）
 */
export async function embedText(
  text: string,
  modelId?: string,
): Promise<number[]> {
  const model = getEmbeddingModel(modelId);
  const { embedding } = await embed({ model, value: text });
  return embedding;
}

/**
 * 对多条文本做批量 embedding
 *
 * @param texts - 输入文本数组
 * @param modelId - 模型名
 * @returns embedding 向量数组
 */
export async function embedTexts(
  texts: string[],
  modelId?: string,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) {
    return [await embedText(texts[0], modelId)];
  }

  const model = getEmbeddingModel(modelId);
  const { embeddings } = await embedMany({ model, values: texts });
  return embeddings;
}

/**
 * 余弦相似度
 *
 * 两个向量越相似，值越接近 1。
 * 不需要外部库——就是公式：cos(a,b) = (a·b) / (|a| × |b|)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `向量维度不匹配: ${a.length} vs ${b.length}`,
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
