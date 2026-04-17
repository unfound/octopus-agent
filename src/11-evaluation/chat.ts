/**
 * 11-evaluation 交互入口
 *
 * 运行评估测试
 *
 * 运行方式：
 *   npx tsx src/11-evaluation/chat.ts              # 运行基础评估
 *   npx tsx src/11-evaluation/chat.ts --judge       # 启用 LLM Judge
 *   npx tsx src/11-evaluation/chat.ts --json        # 输出 JSON 格式
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { generateText, stepCountIs } from "ai";
import { getModel } from "../shared/model";
import type { EvalCase, AgentResult } from "./scorers";
import { runEval } from "./runner";
import { formatReport, formatJsonReport } from "./report";

// ========== Agent 封装 ==========

/**
 * 创建一个简单的 Agent 用于评估
 */
function createEvalAgent(tools: Record<string, any> = {}): (input: string) => Promise<AgentResult> {
  return async (input: string): Promise<AgentResult> => {
    const model = getModel();
    const toolCalls: string[] = [];

    try {
      const result = await generateText({
        model,
        messages: [{ role: "user", content: input }],
        tools: Object.keys(tools).length > 0 ? tools : undefined,
        stopWhen: stepCountIs(5),
      });

      // 收集工具调用
      const steps = (result as any).steps ?? [];
      for (const step of steps) {
        for (const tc of step.toolCalls ?? []) {
          toolCalls.push(tc.toolName);
        }
      }

      return {
        output: result.text,
        toolCalls,
      };
    } catch (err) {
      return {
        output: `Error: ${(err as Error).message}`,
        toolCalls,
      };
    }
  };
}

// ========== Demo ==========

async function demoBasic() {
  console.log("\n📦 Demo: 基础评估（Level 1: 关键词 + 工具调用）\n");

  // 加载测试用例
  const casesPath = join(__dirname, "cases/basic.json");
  const cases: EvalCase[] = JSON.parse(readFileSync(casesPath, "utf-8"));

  console.log(`加载 ${cases.length} 个测试用例\n`);

  // 创建 Agent
  const agent = createEvalAgent();

  // 运行评估
  const { results, summary } = await runEval(cases, agent, {
    useLLMJudge: false,
    passThreshold: 0.5,
  });

  // 输出报告
  console.log(formatReport(results, summary));
}

async function demoWithJudge() {
  console.log("\n📦 Demo: LLM Judge 评估（Level 2）\n");

  // 加载测试用例
  const casesPath = join(__dirname, "cases/basic.json");
  const cases: EvalCase[] = JSON.parse(readFileSync(casesPath, "utf-8"));

  // 只取有 answer 的用例
  const casesWithAnswer = cases.filter(c => c.expected?.answer);
  console.log(`加载 ${casesWithAnswer.length} 个有预期答案的用例\n`);

  // 创建 Agent
  const agent = createEvalAgent();

  // 运行评估
  const { results, summary } = await runEval(casesWithAnswer, agent, {
    useLLMJudge: true,
    passThreshold: 0.6,
  });

  // 输出报告
  console.log(formatReport(results, summary));
}

// ========== 入口 ==========

async function main() {
  const args = process.argv.slice(2);
  const useJudge = args.includes("--judge");
  const outputJson = args.includes("--json");

  if (useJudge) {
    await demoWithJudge();
  } else {
    await demoBasic();
  }
}

main().catch(console.error);
