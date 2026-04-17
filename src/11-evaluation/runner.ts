/**
 * 评估运行器
 *
 * 跑测试用例 → 收集结果 → 打分 → 生成报告
 */

import type { EvalCase, AgentResult, ScoreResult } from "./scorers";
import { scoreCase } from "./scorers";

/** 单个用例的评估结果 */
export interface EvalResult {
  case: EvalCase;
  result: AgentResult;
  scores: ScoreResult[];
  passed: boolean;
  avgScore: number;
}

/** 评估汇总 */
export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgScore: number;
  byTag: Record<string, { total: number; passed: number; avgScore: number }>;
}

/** 评估配置 */
export interface EvalConfig {
  /** 是否使用 LLM Judge（需要调模型，成本高） */
  useLLMJudge?: boolean;
  /** 通过阈值（平均分 >= 此值算通过） */
  passThreshold?: number;
}

/**
 * 运行评估
 *
 * @param cases 测试用例列表
 * @param agent Agent 函数，输入用户消息，返回结果
 * @param config 评估配置
 */
export async function runEval(
  cases: EvalCase[],
  agent: (input: string) => Promise<AgentResult>,
  config: EvalConfig = {},
): Promise<{ results: EvalResult[]; summary: EvalSummary }> {
  const { useLLMJudge = false, passThreshold = 0.6 } = config;
  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    // 运行 Agent
    const result = await agent(evalCase.input);

    // 评分
    const scores = await scoreCase(evalCase, result, { useLLMJudge });

    // 计算平均分
    const avgScore = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
      : 0;

    results.push({
      case: evalCase,
      result,
      scores,
      passed: avgScore >= passThreshold,
      avgScore,
    });
  }

  // 计算汇总
  const summary = computeSummary(results);

  return { results, summary };
}

/** 计算汇总统计 */
function computeSummary(results: EvalResult[]): EvalSummary {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const passRate = total > 0 ? passed / total : 0;
  const avgScore = total > 0
    ? results.reduce((sum, r) => sum + r.avgScore, 0) / total
    : 0;

  // 按标签统计
  const byTag: EvalSummary["byTag"] = {};
  for (const r of results) {
    for (const tag of r.case.tags ?? ["untagged"]) {
      if (!byTag[tag]) {
        byTag[tag] = { total: 0, passed: 0, avgScore: 0 };
      }
      byTag[tag].total++;
      if (r.passed) byTag[tag].passed++;
      byTag[tag].avgScore += r.avgScore;
    }
  }
  for (const tag of Object.keys(byTag)) {
    byTag[tag].avgScore /= byTag[tag].total;
  }

  return { total, passed, failed, passRate, avgScore, byTag };
}
