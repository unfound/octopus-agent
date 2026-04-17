/**
 * 评估报告生成器
 *
 * 格式化输出评估结果
 */

import type { EvalResult, EvalSummary } from "./runner";

/**
 * 生成终端报告
 */
export function formatReport(
  results: EvalResult[],
  summary: EvalSummary,
): string {
  const lines: string[] = [];

  // 标题
  lines.push("");
  lines.push("━".repeat(20) + " Evaluation Report " + "━".repeat(20));
  lines.push("");

  // 每个用例结果
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const score = (r.avgScore * 100).toFixed(0) + "%";

    lines.push(`${icon} ${r.case.name} (${score})`);

    // 评分详情
    for (const s of r.scores) {
      const sIcon = s.passed ? "  ✓" : "  ✗";
      const sScore = (s.score * 100).toFixed(0) + "%";
      lines.push(`${sIcon} ${s.name}: ${sScore}${s.detail ? ` — ${s.detail}` : ""}`);
    }
  }

  // 汇总
  lines.push("");
  lines.push("─".repeat(50));
  lines.push(`Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
  lines.push(`Pass Rate: ${(summary.passRate * 100).toFixed(1)}% | Avg Score: ${(summary.avgScore * 100).toFixed(1)}%`);

  // 按标签统计
  if (Object.keys(summary.byTag).length > 1) {
    lines.push("");
    lines.push("By Tag:");
    for (const [tag, stats] of Object.entries(summary.byTag)) {
      lines.push(`  ${tag}: ${stats.passed}/${stats.total} passed (${(stats.avgScore * 100).toFixed(0)}%)`);
    }
  }

  lines.push("");

  return lines.join("\n");
}

/**
 * 生成 JSON 报告（方便机器处理）
 */
export function formatJsonReport(
  results: EvalResult[],
  summary: EvalSummary,
): string {
  return JSON.stringify({
    summary,
    results: results.map(r => ({
      id: r.case.id,
      name: r.case.name,
      passed: r.passed,
      avgScore: r.avgScore,
      scores: r.scores,
      output: r.result.output.slice(0, 200),
    })),
  }, null, 2);
}
