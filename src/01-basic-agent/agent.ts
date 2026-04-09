/**
 * 基础 Agent — 单轮对话
 *
 * 核心概念：
 * - Agent = LLM + 系统指令
 * - generateText() 是 Vercel AI SDK 最基础的调用方式
 * - 它做的事情：构造 messages → 发请求 → 返回结果
 */

import { generateText } from "ai";
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
