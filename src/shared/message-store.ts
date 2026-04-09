/**
 * 消息存储 — 对话历史的核心数据结构
 *
 * Vercel AI SDK 用 CoreMessage 表示一条消息：
 *   { role: "user" | "assistant" | "system", content: string }
 *
 * 我们在此基础上加元数据（时间戳、token 估算），方便窗口管理。
 */

import type { ModelMessage } from "ai";

/** 带元数据的消息 */
export interface StoredMessage {
  /** 原始消息（直接传给 AI SDK） */
  message: ModelMessage;
  /** 入库时间戳 */
  timestamp: number;
  /** 内容 token 粗估（1 token ≈ 4 chars 英文，1 token ≈ 2 chars 中文） */
  estimatedTokens: number;
}

/** 粗估 token 数 — 不需要精确，用于窗口管理的预算控制 */
export function estimateTokens(text: string): number {
  // 简单启发式：中文按 2 字/token，英文按 4 字/token
  // 实际生产中可用 tiktoken 做精确计算
  const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const otherChars = text.length - cjkChars;
  return Math.ceil(cjkChars / 1.5 + otherChars / 4);
}

/**
 * MessageStore — 对话历史管理器
 *
 * 职责：
 * 1. 存储消息（按时间顺序）
 * 2. 提供 CoreMessage[] 给 AI SDK 调用
 * 3. 支持清空、截断等操作
 */
export class MessageStore {
  private messages: StoredMessage[] = [];

  /** 添加一条消息 */
  add(message: ModelMessage): StoredMessage {
    const stored: StoredMessage = {
      message,
      timestamp: Date.now(),
      estimatedTokens:
        typeof message.content === "string"
          ? estimateTokens(message.content)
          : 0,
    };
    this.messages.push(stored);
    return stored;
  }

  /** 批量添加 */
  addAll(messages: ModelMessage[]): void {
    for (const msg of messages) {
      this.add(msg);
    }
  }

  /** 获取所有消息（AI SDK 格式） */
  getMessages(): ModelMessage[] {
    return this.messages.map((s) => s.message);
  }

  /** 获取带元数据的消息 */
  getStoredMessages(): StoredMessage[] {
    return [...this.messages];
  }

  /** 消息总数 */
  get length(): number {
    return this.messages.length;
  }

  /** 总 token 粗估 */
  get totalEstimatedTokens(): number {
    return this.messages.reduce((sum, m) => sum + m.estimatedTokens, 0);
  }

  /** 保留最后 N 条，返回被移除的消息 */
  keepLast(n: number): StoredMessage[] {
    if (n >= this.messages.length) return [];
    const removed = this.messages.splice(0, this.messages.length - n);
    return removed;
  }

  /** 清空所有消息 */
  clear(): void {
    this.messages = [];
  }

  /** 按 token 预算裁剪（从最老的消息开始丢），返回被移除的消息 */
  trimToTokenBudget(maxTokens: number): StoredMessage[] {
    const removed: StoredMessage[] = [];
    while (
      this.messages.length > 1 &&
      this.totalEstimatedTokens > maxTokens
    ) {
      const r = this.messages.shift();
      if (r) removed.push(r);
    }
    return removed;
  }
}
