/**
 * 文档切片 — 滑动窗口 + 段落边界优先
 *
 * 将长文档切成适合 embedding 的小块（chunk）。
 *
 * 策略：
 * 1. 按空行分段落
 * 2. 段落超过 maxTokens → 按句子切割
 * 3. 相邻 chunk 之间有 overlap，避免边界信息丢失
 *
 * 对比 OpenClaw：
 * - OpenClaw: .md 全量注入 → 浪费 token，上下文一长就超限
 * - 我们:    切片 + 按需检索 → 只注入最相关的片段
 */

/** 一个文档切片 */
export interface Chunk {
  /** 切片唯一 ID */
  id: string;
  /** 切片文本内容 */
  text: string;
  /** 元数据 */
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  /** 来源文件路径 */
  source: string;
  /** 在文档中的序号（从 0 开始） */
  index: number;
  /** 在原文中的字符偏移量 */
  charOffset: number;
}

/** 切片配置 */
export interface ChunkOptions {
  /** 最大 token 数（默认 256，留余量给 embedding 模型的 2048 上下文） */
  maxTokens?: number;
  /** 相邻 chunk 重叠的 token 数（默认 32） */
  overlap?: number;
}

/**
 * 粗略估算英文 token 数
 *
 * 简单规则：按空格分词，中文按字符计数。
 * 不需要精确——chunking 阶段用粗估就行。
 */
function estimateTokens(text: string): number {
  // 中文字符：每个约 1 token
  const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  // 英文部分：按空格分词
  const asciiPart = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ");
  const wordTokens = asciiPart.split(/\s+/).filter(Boolean).length;
  return cjkChars + wordTokens;
}

/**
 * 按句子分割文本
 *
 * 支持中英文句号、问号、感叹号作为句子边界。
 */
function splitSentences(text: string): string[] {
  // 按中英文标点分割，保留标点
  const parts = text.split(/(?<=[。！？.!?])\s*/);
  return parts.filter((s) => s.trim().length > 0);
}

/**
 * 将文本切成 chunks
 *
 * @param text - 原始文本
 * @param source - 来源标识（文件路径等）
 * @param options - 切片配置
 * @returns 切片数组
 */
export function chunkText(
  text: string,
  source: string,
  options: ChunkOptions = {},
): Chunk[] {
  const maxTokens = options.maxTokens ?? 256;
  const overlap = options.overlap ?? 32;

  // 1. 按空行分段落
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // 2. 对每个段落，如果超长则按句子切
  const segments: string[] = [];
  for (const para of paragraphs) {
    if (estimateTokens(para) <= maxTokens) {
      segments.push(para.trim());
    } else {
      // 按句子切，再拼回不超过 maxTokens 的块
      const sentences = splitSentences(para);
      let buffer = "";
      for (const sentence of sentences) {
        const combined = buffer ? buffer + sentence : sentence;
        if (estimateTokens(combined) > maxTokens && buffer) {
          segments.push(buffer.trim());
          buffer = sentence;
        } else {
          buffer = combined;
        }
      }
      if (buffer.trim()) {
        segments.push(buffer.trim());
      }
    }
  }

  // 3. 滑动窗口组装 chunks（带 overlap）
  const chunks: Chunk[] = [];
  let i = 0;

  while (i < segments.length) {
    let text = segments[i];
    let tokens = estimateTokens(text);
    let j = i + 1;

    // 尽量合并小段落，直到接近 maxTokens
    while (j < segments.length) {
      const nextTokens = estimateTokens(segments[j]);
      if (tokens + nextTokens > maxTokens) break;
      text += "\n\n" + segments[j];
      tokens += nextTokens;
      j++;
    }

    // 计算字符偏移量
    let charOffset = 0;
    for (let k = 0; k < i; k++) {
      charOffset += segments[k].length + 2; // +2 for \n\n
    }

    chunks.push({
      id: `${source}#${chunks.length}`,
      text,
      metadata: {
        source,
        index: chunks.length,
        charOffset,
      },
    });

    // 滑动窗口：回退 overlap 个 token 对应的段落数
    if (overlap > 0 && j < segments.length) {
      // 从后往前数，找到 overlap token 量对应的段落位置
      let overlapTokens = 0;
      let back = j - 1;
      while (back > i && overlapTokens < overlap) {
        overlapTokens += estimateTokens(segments[back]);
        back--;
      }
      i = Math.max(back, i + 1);
    } else {
      i = j;
    }
  }

  return chunks;
}
