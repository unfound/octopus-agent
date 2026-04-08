/**
 * 共享类型定义
 *
 * 所有模块共用的类型
 */

/**
 * 消息类型
 */
export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
}

/**
 * 对话会话
 */
export interface Session {
  id: string;
  messages: Message[];
  metadata?: Record<string, unknown>;
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  tool: string;
  result: unknown;
  error?: string;
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  name: string;
  model: string;
  instructions?: string;
}

/**
 * 记忆配置
 */
export interface MemoryConfig {
  shortTerm: boolean;
  longTerm: boolean;
  rag?: {
    enabled: boolean;
    vectorStore?: string;
  };
}
