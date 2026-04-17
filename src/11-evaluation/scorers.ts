/**
 * 评分器 — 三层评估
 *
 * Level 1: 关键词/结构校验（零成本）
 * Level 2: LLM-as-Judge（灵活，需要调 LLM）
 */

import { generateText } from "ai";
import { getModel } from "../shared/model";

// ====== 测试用例格式 ======

export interface EvalCase {
  id: string;
  name: string;
  input: string;
  expected?: {
    keywords?: string[];        // 输出应包含的关键词
    notKeywords?: string[];     // 输出不应包含的词
    toolCalls?: string[];       // 应调用的工具名
    answer?: string;            // 预期答案（用于 LLM Judge）
  };
  tags?: string[];
}

/** Agent 执行结果 */
export interface AgentResult {
  output: string;
  toolCalls: string[];          // 实际调用的工具名列表
}

/** 单项评分 */
export interface ScoreResult {
  name: string;                 // 评分项名称
  score: number;                // 0-1 分数
  passed: boolean;              // 是否通过（score >= threshold）
  detail?: string;              // 详情
}

// ====== Level 1: 关键词匹配 ======

/**
 * 关键词匹配评分
 *
 * 检查输出是否包含预期关键词
 * @returns 匹配比例 0-1
 */
export function keywordScore(output: string, keywords: string[]): ScoreResult {
  if (keywords.length === 0) {
    return { name: "keyword", score: 1, passed: true };
  }

  const lower = output.toLowerCase();
  const matched = keywords.filter(kw => lower.includes(kw.toLowerCase()));
  const score = matched.length / keywords.length;

  return {
    name: "keyword",
    score,
    passed: score >= 0.5,       // 至少匹配一半关键词
    detail: `${matched.length}/${keywords.length} matched: [${matched.join(", ")}]`,
  };
}

/**
 * 反向关键词检查
 *
 * 检查输出是否不包含某些词（如敏感信息）
 */
export function notKeywordScore(output: string, notKeywords: string[]): ScoreResult {
  if (notKeywords.length === 0) {
    return { name: "not_keyword", score: 1, passed: true };
  }

  const lower = output.toLowerCase();
  const found = notKeywords.filter(kw => lower.includes(kw.toLowerCase()));
  const score = found.length === 0 ? 1 : 0;

  return {
    name: "not_keyword",
    score,
    passed: score === 1,
    detail: found.length > 0 ? `found forbidden: [${found.join(", ")}]` : "ok",
  };
}

/**
 * 工具调用校验
 *
 * 检查是否调用了预期的工具
 */
export function toolCallScore(actual: string[], expected: string[]): ScoreResult {
  if (expected.length === 0) {
    return { name: "tool_call", score: 1, passed: true };
  }

  const matched = expected.filter(tool => actual.includes(tool));
  const score = matched.length / expected.length;

  return {
    name: "tool_call",
    score,
    passed: score >= 0.5,
    detail: `expected: [${expected.join(", ")}], actual: [${actual.join(", ")}]`,
  };
}

// ====== Level 2: LLM-as-Judge ======

const JUDGE_PROMPT = `你是一个评估专家。请评估 AI 助手的回答质量。

用户问题: {input}

AI 回答: {output}

预期答案: {expected}

请从以下维度评估（1-10 分）：
1. 正确性：答案是否正确
2. 完整性：是否回答了问题的所有方面
3. 相关性：是否与问题相关

只返回一个 JSON，格式如下：
{{"score": 8, "reason": "简短理由"}}
`;

/**
 * LLM-as-Judge 评分
 *
 * 让另一个 LLM 给输出打分（1-10），然后归一化到 0-1
 */
export async function llmJudgeScore(
  input: string,
  output: string,
  expected: string,
): Promise<ScoreResult> {
  const model = getModel();

  const prompt = JUDGE_PROMPT
    .replace("{input}", input)
    .replace("{output}", output)
    .replace("{expected}", expected);

  try {
    const result = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    // 解析 JSON
    const jsonMatch = result.text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return {
        name: "llm_judge",
        score: 0,
        passed: false,
        detail: "failed to parse judge response",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const score = (parsed.score ?? 0) / 10;

    return {
      name: "llm_judge",
      score,
      passed: score >= 0.6,     // 6 分以上通过
      detail: `score: ${parsed.score}/10, reason: ${parsed.reason}`,
    };
  } catch (err) {
    return {
      name: "llm_judge",
      score: 0,
      passed: false,
      detail: `error: ${(err as Error).message}`,
    };
  }
}

// ====== 综合评分 ======

/**
 * 对单个用例进行评分
 *
 * 运行所有适用的评分器，返回综合结果
 */
export async function scoreCase(
  evalCase: EvalCase,
  result: AgentResult,
  options: { useLLMJudge?: boolean } = {},
): Promise<ScoreResult[]> {
  const scores: ScoreResult[] = [];
  const { expected } = evalCase;

  if (!expected) {
    return [{ name: "no_expectation", score: 1, passed: true, detail: "no expected criteria" }];
  }

  // Level 1: 关键词
  if (expected.keywords) {
    scores.push(keywordScore(result.output, expected.keywords));
  }

  // Level 1: 反向关键词
  if (expected.notKeywords) {
    scores.push(notKeywordScore(result.output, expected.notKeywords));
  }

  // Level 1: 工具调用
  if (expected.toolCalls) {
    scores.push(toolCallScore(result.toolCalls, expected.toolCalls));
  }

  // Level 2: LLM Judge
  if (options.useLLMJudge && expected.answer) {
    scores.push(await llmJudgeScore(evalCase.input, result.output, expected.answer));
  }

  return scores;
}
