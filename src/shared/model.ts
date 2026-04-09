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
 * 优先级：环境变量 DEFAULT_MODEL > 默认值
 * 支持 openrouter/xxx 格式（通过 OpenRouter 中转）
 * 支持直接 provider/model 格式
 */
export function getModel(modelId?: string): LanguageModel {
  const id = modelId || process.env.DEFAULT_MODEL || "openrouter/stepfun/step-3.5-flash";

  // OpenRouter 模型：openrouter/provider/model
  if (id.startsWith("openrouter/")) {
    const openrouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    // openrouter/stepfun/step-3.5-flash → stepfun/step-3.5-flash
    return openrouter(id.replace("openrouter/", ""));
  }

  // 本地模型（LM Studio / Ollama 等 OpenAI 兼容服务）
  if (process.env.LOCAL_MODEL_ENABLED === "true") {
    const local = createOpenAI({
      baseURL: process.env.LOCAL_MODEL_BASE_URL || "http://localhost:1234/v1",
      apiKey: process.env.LOCAL_MODEL_API_KEY || "lm-studio",
    });
    return local(process.env.LOCAL_MODEL_ID || id);
  }

  // 默认：直接用 openai provider（需要 OPENAI_API_KEY）
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai(id);
}
