/**
 * 基础 Agent — 单轮 / 多轮对话
 *
 * 核心概念：
 * - Agent = LLM + 系统指令
 * - generateText() 是 Vercel AI SDK 最基础的调用方式
 * - 单轮：直接传 prompt
 * - 多轮：传 messages 数组，自动累积上下文
 */

import { generateText, type ModelMessage } from "ai";
import { getModel } from "../shared/model";

/**
 * 单轮对话
 *
 * 最简单的 Agent：发一条消息，收一条回复
 */
export async function chat(
  message: string,
  options?: {
    system?: string;
    model?: string;
  }
) {
  const { text } = await generateText({
    model: getModel(options?.model),
    system:
      options?.system ||
      "你是一个友好的 AI 助手。请用简洁、有趣的方式回答用户的问题。",
    prompt: message,
  });

  return text;
}

/**
 * 多轮对话 Agent
 *
 * 维护 messages 数组，实现上下文累积
 * 用法：
 *   const agent = new ChatAgent("local/qwen/qwen3.5-9b");
 *   const reply1 = await agent.say("你好");
 *   const reply2 = await agent.say("刚才说了什么？"); // 能记住上一轮
 */
export class ChatAgent {
  private messages: ModelMessage[] = [];
  private system: string;
  private model: ReturnType<typeof getModel>;

  constructor(modelId?: string, system?: string) {
    this.model = getModel(modelId);
    this.system = system || "你是一个友好的 AI 助手。请用简洁的方式回答用户的问题。";
  }

  /** 发送消息并获取回复（自动维护上下文） */
  async say(message: string): Promise<string> {
    this.messages.push({ role: "user", content: message });

    const { text } = await generateText({
      model: this.model,
      system: this.system,
      messages: this.messages,
    });

    this.messages.push({ role: "assistant", content: text });
    return text;
  }

  /** 清除对话历史 */
  clear(): void {
    this.messages.length = 0;
  }
}
