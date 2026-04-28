/**
 * Mixture-of-Agents（多模型协作推理）
 *
 * 不是 agent 间协作，而是多个 LLM 并行推理 + 聚合器合成最终答案。
 *
 * 基于论文：arXiv:2406.04692v1
 *
 * 架构：
 *   Layer 1: 多个 reference model 并行生成回答
 *   Layer 2: aggregator model 综合所有回答，生成最终答案
 *
 * 适用场景：
 *   - 复杂数学证明
 *   - 多步骤推理
 *   - 需要多角度分析的问题
 *   - 单模型表现不稳定时（投票效应）
 */


import { generateText, tool } from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";

/** MoA 配置 */
export interface MoAConfig {
  /** 参考模型列表 */
  referenceModels?: string[];
  /** 聚合模型 */
  aggregatorModel?: string;
  /** 参考模型温度（越高越多样） */
  referenceTemperature?: number;
  /** 聚合模型温度（越低越聚焦） */
  aggregatorTemperature?: number;
  /** 最少需要多少个参考模型成功 */
  minSuccessfulReferences?: number;
}

/** MoA 结果 */
export interface MoAResult {
  /** 是否成功 */
  success: boolean;
  /** 最终合成的回答 */
  response: string;
  /** 各参考模型的回答 */
  referenceResponses: Array<{
    model: string;
    response: string;
    success: boolean;
  }>;
  /** 错误信息 */
  error?: string;
}

// 默认配置
const DEFAULT_REFERENCE_MODELS = [
  "openrouter/stepfun/step-3.5-flash",
  "openrouter/deepseek/deepseek-chat-v3-0324",
  "openrouter/google/gemini-2.0-flash-001",
];

const DEFAULT_AGGREGATOR_MODEL = "openrouter/stepfun/step-3.5-flash";

const AGGREGATOR_SYSTEM_PROMPT = `你收到了多个 AI 模型对同一问题的回答。
你的任务是综合这些回答，生成一个高质量的最终答案。

原则：
- 批判性评估每个回答，识别其中的错误或偏见
- 不要简单复制某个回答，而是提取各回答的精华
- 如果不同回答有矛盾，分析哪个更合理
- 最终答案应该准确、全面、结构清晰

参考回答如下：`;

/**
 * 安全地运行单个参考模型（带重试）
 */
async function runReferenceModel(
  modelId: string,
  prompt: string,
  temperature: number,
  maxRetries = 2,
): Promise<{ model: string; response: string; success: boolean }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const model = getModel(modelId);
      const result = await generateText({
        model,
        prompt,
        temperature,
      });

      if (result.text) {
        return { model: modelId, response: result.text, success: true };
      }
      // 空回复，重试
    } catch (err) {
      if (attempt === maxRetries - 1) {
        return {
          model: modelId,
          response: `模型 ${modelId} 调用失败: ${err}`,
          success: false,
        };
      }
      // 等待后重试
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  return { model: modelId, response: "重试后仍无响应", success: false };
}

/**
 * 运行聚合模型
 */
async function runAggregator(
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
): Promise<string> {
  const model = getModel(modelId);
  const result = await generateText({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
  });
  return result.text;
}

/**
 * Mixture-of-Agents
 *
 * 用法：
 * ```typescript
 * const result = await mixtureOfAgents("证明 √2 是无理数");
 * console.log(result.response);
 * ```
 */
export async function mixtureOfAgents(
  prompt: string,
  config: MoAConfig = {},
): Promise<MoAResult> {
  const refModels = config.referenceModels ?? DEFAULT_REFERENCE_MODELS;
  const aggModel = config.aggregatorModel ?? DEFAULT_AGGREGATOR_MODEL;
  const refTemp = config.referenceTemperature ?? 0.7;
  const aggTemp = config.aggregatorTemperature ?? 0.3;
  const minSuccess = config.minSuccessfulReferences ?? 1;

  try {
    // Layer 1: 并行调用参考模型
    const referenceResults = await Promise.all(
      refModels.map((m) => runReferenceModel(m, prompt, refTemp)),
    );

    const successful = referenceResults.filter((r) => r.success);
    const failed = referenceResults.filter((r) => !r.success);

    if (failed.length > 0) {
      console.log(
        `[MoA] ${failed.length}/${refModels.length} 参考模型失败:`,
        failed.map((f) => f.model).join(", "),
      );
    }

    if (successful.length < minSuccess) {
      return {
        success: false,
        response: "",
        referenceResponses: referenceResults,
        error: `成功参考模型不足 (${successful.length}/${minSuccess})`,
      };
    }

    // Layer 2: 聚合
    const responsesText = successful
      .map((r, i) => `${i + 1}. [${r.model}]\n${r.response}`)
      .join("\n\n---\n\n");

    const aggregatorPrompt = `${AGGREGATOR_SYSTEM_PROMPT}\n\n${responsesText}`;

    const finalResponse = await runAggregator(
      aggModel,
      aggregatorPrompt,
      prompt,
      aggTemp,
    );

    return {
      success: true,
      response: finalResponse,
      referenceResponses: referenceResults,
    };
  } catch (err) {
    return {
      success: false,
      response: "",
      referenceResponses: [],
      error: String(err),
    };
  }
}

/**
 * 创建 MoA 工具 — 让 Agent 可以调用 MoA
 *
 * ```typescript
 * const tools = {
 *   moa: createMoATool(),
 *   // ...其他工具
 * };
 * ```
 */
export function createMoATool(config: MoAConfig = {}) {
  return tool({
    description:
      "使用多模型协作推理（Mixture-of-Agents）解决复杂问题。" +
      "多个模型并行生成回答，然后综合成最优答案。" +
      "适用于：复杂数学推理、多步骤分析、需要多角度评估的问题。",
    inputSchema: z.object({
      prompt: z.string().describe("要解决的问题或要分析的主题"),
    }),
    execute: async ({ prompt }: { prompt: string }) => {
      const result = await mixtureOfAgents(prompt, config);
      return {
        success: result.success,
        response: result.response,
        referenceModelCount: result.referenceResponses.length,
        successCount: result.referenceResponses.filter((r) => r.success).length,
      };
    },
  });
}
