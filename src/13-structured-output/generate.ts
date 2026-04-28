/**
 * 13-structured-output — generateObject / streamObject 核心实现
 *
 * 展示三种结构化输出模式：
 * 1. generateObject — 生成符合 Zod Schema 的对象
 * 2. streamObject  — 流式生成结构化对象（逐字段构建）
 * 3. 错误处理    — Schema 不匹配时的修复策略
 */

import { generateObject, streamObject } from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import type {
  CodeReview,
  EmailExtract,
  Intent,
  EntityExtract,
} from "./schemas";
import {
  CodeReviewSchema,
  EmailExtractSchema,
  IntentSchema,
  EntityExtractSchema,
} from "./schemas";

// ====== 模式 1: generateObject ======

/**
 * 代码审查 — 生成结构化审查报告
 *
 * system 提示词引导 LLM 扮演代码审查者角色。
 * Schema 约束输出格式，保证类型安全。
 */
export async function reviewCode(code: string): Promise<CodeReview> {
  const { object } = await generateObject({
    model: getModel(),
    schema: CodeReviewSchema,
    system:
      "你是一个资深代码审查者。仔细分析代码，找出 bug、性能问题、安全隐患和风格问题。" +
      "用中文输出。",
    prompt: `请审查以下代码：\n\`\`\`\n${code}\n\`\`\``,
  });

  return object;
}

/**
 * 信息提取 — 从自然语言邮件中提取结构化信息
 *
 * 这是结构化的典型场景：非结构化输入 → 结构化输出
 */
export async function extractEmail(text: string): Promise<EmailExtract> {
  const { object } = await generateObject({
    model: getModel(),
    schema: EmailExtractSchema,
    prompt: `从以下邮件内容中提取结构化信息：\n${text}`,
  });

  return object;
}

/**
 * 意图分类 — 判断用户消息的意图
 *
 * 低延迟场景，适合用小模型
 */
export async function classifyIntent(message: string): Promise<Intent> {
  const { object } = await generateObject({
    model: getModel(),
    schema: IntentSchema,
    prompt: `分类以下用户消息的意图：\n"${message}"`,
  });

  return object;
}

/**
 * 实体提取 — 从文本中抽取命名实体
 *
 * 典型的 NER（Named Entity Recognition）用 LLM + Schema 实现
 */
export async function extractEntities(text: string): Promise<EntityExtract> {
  const { object } = await generateObject({
    model: getModel(),
    schema: EntityExtractSchema,
    prompt: `从以下文本中提取所有命名实体：\n${text}`,
  });

  return object;
}

// ====== 模式 2: streamObject — 流式结构化输出 ======

/**
 * 流式代码审查 — 对象逐步构建
 *
 * partialObjectStream 返回每次更新的部分对象
 * 用户可以实时看到审查报告"正在生成"
 */
export async function reviewCodeStream(
  code: string,
  onPartial?: (partial: Partial<CodeReview>) => void,
): Promise<CodeReview> {
  const { partialObjectStream } = streamObject({
    model: getModel(),
    schema: CodeReviewSchema,
    system:
      "你是一个资深代码审查者。仔细分析代码，找出 bug、性能问题、安全隐患和风格问题。" +
      "用中文输出。",
    prompt: `请审查以下代码：\n\`\`\`\n${code}\n\`\`\``,
  });

  let final: CodeReview | undefined;

  for await (const partial of partialObjectStream) {
    final = partial as unknown as CodeReview;
    onPartial?.(partial as unknown as Partial<CodeReview>);
  }

  if (!final) {
    throw new Error("streamObject 未返回结果");
  }

  return final;
}

// ====== 模式 3: 错误处理 ======

/**
 * 带 Schema 验证的有错误时返回 null
 *
 * 实际使用中，LLM 偶尔会输出不符合 Schema 的内容。
 * generateObject 会自动尝试修复（如字符串 "7" → 数字 7），
 * 但完全无法修复时会抛错。
 */
export async function safeGenerate<T>(
  schema: z.ZodType<T>,
  prompt: string,
  system?: string,
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const { object } = await generateObject({
      model: getModel(),
      schema,
      system,
      prompt,
    });
    return { success: true, data: object as T };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
