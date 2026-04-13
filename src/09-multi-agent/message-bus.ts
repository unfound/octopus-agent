/**
 * MessageBus — Agent 间通信的基础设施
 *
 * 两种通信模式：
 * 1. send()    — 单向通知，不需要回复
 * 2. request() — RPC 调用，等待对方回复
 *
 * 本质是发布-订阅模式的简化实现
 * 生产环境可能是 RabbitMQ、Kafka、Redis Stream 等
 * 这里用内存实现，零依赖
 */

/** 消息结构 */
export interface AgentMessage {
  /** 消息唯一 ID */
  id: string;
  /** 发送者 Agent 名称 */
  from: string;
  /** 接收者 Agent 名称 */
  to: string;
  /** 动作/意图（如 "research", "write_report"） */
  action: string;
  /** 消息数据 */
  payload: unknown;
  /** 关联的请求 ID（用于 response 配对） */
  replyTo?: string;
}

/** 消息处理器返回值 */
export interface HandlerResult {
  /** 回复数据（如果有） */
  reply?: unknown;
  /** 回复的动作名（默认 action + "_reply"） */
  replyAction?: string;
}

/** 消息处理器类型 */
export type MessageHandler = (
  msg: AgentMessage,
) => Promise<HandlerResult | void> | HandlerResult | void;

/** 通信统计 */
export interface BusStats {
  total: number;
  byAction: Record<string, number>;
  byAgent: Record<string, number>;
}

/**
 * MessageBus — Agent 间通信的消息总线
 *
 * 用法：
 * ```typescript
 * const bus = new MessageBus();
 *
 * bus.register("researcher", async (msg) => {
 *   if (msg.action === "research") {
 *     const result = await doResearch(msg.payload);
 *     return { reply: result };
 *   }
 * });
 *
 * // 单向通知
 * bus.send({ from: "orchestrator", to: "researcher", action: "ping", payload: {} });
 *
 * // RPC 调用
 * const response = await bus.request({
 *   from: "writer",
 *   to: "researcher",
 *   action: "research",
 *   payload: { topic: "TypeScript" },
 * });
 * ```
 */
export class MessageBus {
  private handlers = new Map<string, MessageHandler>();
  private messageLog: AgentMessage[] = [];

  /** 注册一个 Agent */
  register(name: string, handler: MessageHandler): void {
    this.handlers.set(name, handler);
  }

  /** 注销一个 Agent */
  unregister(name: string): void {
    this.handlers.delete(name);
  }

  /** 获取已注册的 Agent 列表 */
  getRegisteredAgents(): string[] {
    return [...this.handlers.keys()];
  }

  /**
   * 单向发送消息（不需要回复）
   */
  send(msg: Omit<AgentMessage, "id">): void {
    const fullMsg: AgentMessage = {
      ...msg,
      id: generateId(),
    };

    this.messageLog.push(fullMsg);

    const handler = this.handlers.get(msg.to);
    if (!handler) {
      console.warn(`[MessageBus] Agent "${msg.to}" 未注册，消息丢弃`);
      return;
    }

    // 异步调用，不等待结果
    Promise.resolve(handler(fullMsg)).catch((err) => {
      console.error(`[MessageBus] Agent "${msg.to}" 处理消息出错:`, err);
    });
  }

  /**
   * RPC 调用 — 发送消息并等待回复
   *
   * 返回对方 handler 的 reply 数据
   */
  async request(
    msg: Omit<AgentMessage, "id">,
    timeout = 120_000,
  ): Promise<AgentMessage> {
    const fullMsg: AgentMessage = {
      ...msg,
      id: generateId(),
    };

    this.messageLog.push(fullMsg);

    const handler = this.handlers.get(msg.to);
    if (!handler) {
      throw new Error(`Agent "${msg.to}" 未注册`);
    }

    // 带超时的调用
    const result = await Promise.race([
      Promise.resolve(handler(fullMsg)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`请求超时 (${timeout}ms)`)), timeout),
      ),
    ]);

    // 构造回复消息
    const replyMsg: AgentMessage = {
      id: generateId(),
      from: msg.to,
      to: msg.from,
      action: result?.replyAction ?? `${msg.action}_reply`,
      payload: result?.reply ?? null,
      replyTo: fullMsg.id,
    };

    this.messageLog.push(replyMsg);
    return replyMsg;
  }

  /** 获取通信日志 */
  getMessageLog(): AgentMessage[] {
    return [...this.messageLog];
  }

  /** 获取通信统计 */
  getStats(): BusStats {
    const byAction: Record<string, number> = {};
    const byAgent: Record<string, number> = {};

    for (const msg of this.messageLog) {
      byAction[msg.action] = (byAction[msg.action] || 0) + 1;
      byAgent[msg.from] = (byAgent[msg.from] || 0) + 1;
    }

    return { total: this.messageLog.length, byAction, byAgent };
  }

  /** 清空日志 */
  clearLog(): void {
    this.messageLog = [];
  }
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
