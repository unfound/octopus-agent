/**
 * 记忆条目数据结构
 *
 * 长期记忆的基本单元。每条记忆是一个独立的、可检索的事实。
 *
 * 设计要点：
 * - 每条记忆独立存储（不像 OpenClaw 把所有记忆塞一个 .md）
 * - 有分类和关键词，方便 BM25 检索
 * - 有重要性和时间戳，支持衰减和清理
 */

/** 记忆分类 */
export type MemoryCategory = "fact" | "preference" | "skill" | "event";

/** 记忆条目 */
export interface MemoryEntry {
  /** 唯一 ID */
  id: string;
  /** 记忆内容（自然语言描述） */
  content: string;
  /** 分类 */
  category: MemoryCategory;
  /** 关键词（用于 BM25 检索的补充） */
  keywords: string[];
  /** 重要性 1-10（10 最重要） */
  importance: number;
  /** 创建时间戳（ms） */
  createdAt: number;
  /** 最后访问时间戳 */
  lastAccessedAt: number;
  /** 访问次数 */
  accessCount: number;
}

/** 生成唯一 ID */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 创建新记忆条目 */
export function createMemoryEntry(
  content: string,
  category: MemoryCategory,
  keywords: string[] = [],
  importance: number = 5,
): MemoryEntry {
  const now = Date.now();
  return {
    id: generateId(),
    content,
    category,
    keywords,
    importance,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
  };
}
