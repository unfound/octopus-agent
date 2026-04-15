/**
 * 模型配置
 *
 * 封装 Vercel AI SDK 的模型创建逻辑
 * 支持 OpenRouter、OpenAI 兼容的本地模型等
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import "dotenv/config";

/**
 * 获取模型实例
 *
 * 支持的 modelId 格式：
 *   openrouter/provider/model  → OpenRouter 中转
 *   local/model-name           → 本地 OpenAI 兼容服务
 *   model-name                 → OpenAI 官方
 *
 * 本地模型默认走 .chat()（Chat Completions API）
 */
export function getModel(modelId?: string | LanguageModel): LanguageModel {
  // 直接传入 LanguageModel 实例（用于测试或自定义模型）
  if (modelId && typeof modelId === "object" && "doGenerate" in modelId) {
    return modelId;
  }

  const id = (typeof modelId === "string" ? modelId : undefined)
    || process.env.DEFAULT_MODEL
    || "openrouter/stepfun/step-3.5-flash";

  if (id.startsWith("openrouter/")) {
    const openai = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    return openai.chat(id.replace("openrouter/", ""));
  }

  if (id.startsWith("local/")) {
    const openai = createOpenAI({
      baseURL: process.env.LOCAL_MODEL_BASE_URL || "http://192.168.0.120:8888/v1",
      apiKey: process.env.LOCAL_MODEL_API_KEY || "lm-studio",
    });
    return openai.chat(id.replace("local/", ""));
  }

  // 默认 OpenAI 官方
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai.chat(id);
}
