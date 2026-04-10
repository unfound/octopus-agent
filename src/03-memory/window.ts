/**
 * 上下文窗口管理策略
 *
 * 核心问题：对话越聊越长，但模型有 token 上限。
 * 需要策略来决定：保留哪些、丢弃什么、是否压缩。
 *
 * 三种策略：
 * 1. Sliding Window — 保留最近 N 条（最简单）
 * 2. Token Budget — 按 token 上限裁剪
 * 3. Summary — 压缩旧消息为摘要（最智能）
 */

import type { ModelMessage } from "ai";
import { generateText } from "ai";
import { getModel } from "../shared/model";
import { MessageStore } from "../shared/message-store";

/** 窗口管理策略接口 */
export interface WindowStrategy {
  name: string;
  /**
   * 对 store 做裁剪/压缩，返回要注入的额外消息（如摘要）。
   * 直接修改 store 内容。
   */
  apply(store: MessageStore): Promise<ModelMessage[]>;
}

/**
 * 策略 1：滑动窗口
 *
 * 最简单 — 只保留最近 N 条消息。
 * 缺点：早期的上下文直接丢失，模型会"忘记"前面聊过什么。
 */
export function slidingWindow(maxMessages: number): WindowStrategy {
  return {
    name: `sliding-window(${maxMessages})`,
    async apply(store: MessageStore): Promise<ModelMessage[]> {
      const removed = store.keepLast(maxMessages);
      if (removed.length === 0) return [];

      // 返回一个系统消息，提示有历史被截断
      return [
        {
          role: "system",
          content: `[上下文截断：${removed.length} 条早期消息已省略]`,
        },
      ];
    },
  };
}

/**
 * 策略 2：Token 预算
 *
 * 按 token 上限裁剪，从最老的消息开始丢。
 * 比滑动窗口更精确，但同样直接丢弃历史。
 */
export function tokenBudget(maxTokens: number): WindowStrategy {
  return {
    name: `token-budget(${maxTokens})`,
    async apply(store: MessageStore): Promise<ModelMessage[]> {
      const removed = store.trimToTokenBudget(maxTokens);
      if (removed.length === 0) return [];

      return [
        {
          role: "system",
          content: `[上下文截断：省略了 ${removed.length} 条早期消息，当前估算 ${store.totalEstimatedTokens} tokens]`,
        },
      ];
    },
  };
}

/**
 * 策略 3：摘要压缩
 *
 * 当消息超过阈值时，用 LLM 把旧消息压缩成摘要。
 * 保留语义，节省 token — 最接近人类的记忆方式。
 *
 * 工作流程：
 * 1. 检查是否需要压缩（消息数 or token 数超限）
 * 2. 把旧消息打包，让 LLM 生成摘要
 * 3. 用摘要替换旧消息
 */
export function summaryCompression(opts: {
  triggerAfterMessages: number;
  keepRecentMessages: number;
  modelId?: string;
}): WindowStrategy {
  return {
    name: `summary(trigger=${opts.triggerAfterMessages},keep=${opts.keepRecentMessages})`,
    async apply(store: MessageStore): Promise<ModelMessage[]> {
      // 没到触发阈值，不做任何事
      if (store.length < opts.triggerAfterMessages) return [];

      const all = store.getStoredMessages();
      const splitAt = all.length - opts.keepRecentMessages;

      // 要压缩的旧消息
      const oldMessages = all.slice(0, splitAt);
      if (oldMessages.length === 0) return [];

      // 把旧消息格式化成文本
      const conversationText = oldMessages
        .map((m) => {
          const role = m.message.role === "user" ? "用户" : "助手";
          const content =
            typeof m.message.content === "string"
              ? m.message.content
              : JSON.stringify(m.message.content);
          return `[${role}]: ${content}`;
        })
        .join("\n");

      // 用 LLM 生成摘要
      const model = getModel(opts.modelId);
      const { text: summary } = await generateText({
        model,
        messages: [
          {
            role: "system",
            content: `你是一个对话摘要器。把下面的对话压缩成简洁的摘要，保留关键信息（用户意图、结论、待办事项）。
用第三人称描述，例如："用户询问了...助手解释了...最终决定..."。
不要超过 300 字。`,
          },
          {
            role: "user",
            content: `请压缩以下对话：\n\n${conversationText}`,
          },
        ],
      });

      // 清空旧消息，只保留最近的
      store.keepLast(opts.keepRecentMessages);

      // 返回摘要作为系统上下文注入
      return [
        {
          role: "system",
          content: `[之前的对话摘要]\n${summary}`,
        },
      ];
    },
  };
}

/**
 * WindowManager — 把策略应用到消息存储
 *
 * 用法：
 *   const manager = new WindowManager(store, slidingWindow(10));
 *   const injectedMessages = await manager.apply();
 *   // injectedMessages 插入到对话最前面，作为上下文
 */
export class WindowManager {
  constructor(
    private store: MessageStore,
    private strategy: WindowStrategy,
  ) {}

  /** 切换策略 */
  setStrategy(strategy: WindowStrategy): void {
    this.strategy = strategy;
  }

  /** 应用策略，返回需要额外注入的消息（如摘要、截断提示） */
  async apply(): Promise<ModelMessage[]> {
    return this.strategy.apply(this.store);
  }

  /** 获取 store */
  getStore(): MessageStore {
    return this.store;
  }
}
