/**
 * 14-error-handling 交互入口
 *
 * 演示错误处理和容错的各种模式：
 * 1. 错误分类   — classifyError 区分 retryable / fallback / fatal
 * 2. 重试演示   — withRetry + 指数退避
 * 3. 模型降级   — withFallback 多模型链
 * 4. 容错生成   — resilientGenerateText 完整容错
 *
 * 运行方式：
 *   npx tsx src/14-error-handling/chat.ts classify    # 错误分类
 *   npx tsx src/14-error-handling/chat.ts retry        # 重试演示
 *   npx tsx src/14-error-handling/chat.ts fallback     # 模型降级
 *   npx tsx src/14-error-handling/chat.ts resilient    # 完整容错
 *   npx tsx src/14-error-handling/chat.ts stats        # 错误统计
 */

import { APICallError } from "ai";
import {
  classifyError,
  withRetry,
  withFallback,
  resilientGenerateText,
  createErrorStats,
} from "./retry";
import type { ErrorCategory } from "./retry";
import { getModel } from "../shared/model";
import { generateText } from "ai";

// ====== 演示 1: 错误分类 ======

function demoClassify() {
  console.log("\n📦 Demo 1: 错误分类 — classifyError\n");

  const testCases: Array<{ name: string; error: unknown; expected: ErrorCategory }> = [
    {
      name: "429 Rate Limit",
      error: new APICallError({
        message: "Too Many Requests",
        statusCode: 429,
        url: "https://api.example.com",
        requestBodyValues: {},
      }),
      expected: "retryable",
    },
    {
      name: "503 Service Unavailable",
      error: new APICallError({
        message: "Service Unavailable",
        statusCode: 503,
        url: "https://api.example.com",
        requestBodyValues: {},
      }),
      expected: "retryable",
    },
    {
      name: "401 Unauthorized",
      error: new APICallError({
        message: "Unauthorized",
        statusCode: 401,
        url: "https://api.example.com",
        requestBodyValues: {},
      }),
      expected: "fatal",
    },
    {
      name: "400 Bad Request",
      error: new APICallError({
        message: "Bad Request",
        statusCode: 400,
        url: "https://api.example.com",
        requestBodyValues: {},
      }),
      expected: "fallback",
    },
    {
      name: "Token 超限",
      error: new Error("context length exceeded maximum of 4096 tokens"),
      expected: "fallback",
    },
    {
      name: "网络超时",
      error: Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }),
      expected: "retryable",
    },
    {
      name: "连接被拒绝",
      error: new Error("connect ECONNREFUSED 192.168.0.120:8888"),
      expected: "retryable",
    },
  ];

  console.log("错误类型 → 分类结果:");
  console.log("┌────────────────────────┬────────────┐");
  console.log("│ 错误                    │ 分类        │");
  console.log("├────────────────────────┼────────────┤");

  for (const { name, error, expected } of testCases) {
    const result = classifyError(error);
    const icon = result === expected ? "✅" : "❌";
    console.log(`│ ${name.padEnd(23)} │ ${icon} ${result.padEnd(10)} │`);
  }
  console.log("└────────────────────────┴────────────┘");
}

// ====== 演示 2: 重试机制 ======

async function demoRetry() {
  console.log("\n📦 Demo 2: 重试机制 — withRetry + 指数退避\n");

  let callCount = 0;

  // 模拟一个前 2 次失败、第 3 次成功的函数
  async function flakyFunction(): Promise<string> {
    callCount++;
    if (callCount <= 2) {
      throw new APICallError({
        message: "模拟 429 错误",
        statusCode: 429,
        url: "https://api.example.com",
        requestBodyValues: {},
      });
    }
    return "第 3 次调用成功！";
  }

  const retries: number[] = [];

  try {
    const result = await withRetry(flakyFunction, {
      maxRetries: 3,
      baseDelay: 100, // 演示用，实际场景 1000ms+
      onRetry: (attempt, err, delay) => {
        retries.push(attempt);
        console.log(`  ⚠️  第 ${attempt} 次重试 (${delay}ms 后)... 错误: ${(err as Error).message}`);
      },
    });

    console.log(`\n✅ 结果: ${result}`);
    console.log(`📊 总调用次数: ${callCount}, 重试次数: ${retries.length}`);
  } catch (err) {
    console.error(`❌ 重试耗尽: ${(err as Error).message}`);
  }
}

// ====== 演示 3: 模型降级 ======

async function demoFallback() {
  console.log("\n📦 Demo 3: 模型降级 — withFallback\n");
  console.log("（需要模型服务在运行）\n");

  const modelChain = [
    "openrouter/nonexistent/model",  // 故意写一个不存在的
    "local/qwen/qwen3.5-9b",         // 降级到本地模型
  ];

  try {
    const result = await withFallback(
      (modelId) => generateText({
        model: getModel(modelId),
        prompt: "用一句话回答: 1+1 等于几？",
      }).then(r => r.text),
      {
        modelChain,
        onFallback: (from, to, err) => {
          console.log(`  ⚠️  ${from} → ${to} (原因: ${(err as Error).message.slice(0, 50)})`);
        },
      },
    );

    console.log(`\n✅ 最终结果: ${result}`);
  } catch (err) {
    console.error(`❌ 所有模型均失败: ${(err as Error).message}`);
  }
}

// ====== 演示 4: 完整容错 ======

async function demoResilient() {
  console.log("\n📦 Demo 4: 完整容错 — resilientGenerateText\n");

  try {
    const result = await resilientGenerateText(
      "用 30 字总结什么是容错系统",
      {
        modelChain: ["local/qwen/qwen3.5-9b"],
        maxRetries: 2,
      },
    );

    console.log(`✅ 生成结果: ${result}`);
  } catch (err) {
    console.error(`❌ 容错也失败了: ${(err as Error).message}`);
  }
}

// ====== 演示 5: 错误统计 ======

function demoStats() {
  console.log("\n📦 Demo 5: 错误统计器 — createErrorStats\n");

  const stats = createErrorStats();

  // 模拟各种错误
  stats.record(new APICallError({
    message: "429", statusCode: 429,
    url: "https://api.example.com", requestBodyValues: {},
  }));
  stats.recordRetry();

  stats.record(new APICallError({
    message: "503", statusCode: 503,
    url: "https://api.example.com", requestBodyValues: {},
  }));
  stats.recordRetry();

  stats.record(new APICallError({
    message: "401", statusCode: 401,
    url: "https://api.example.com", requestBodyValues: {},
  }));

  stats.record(new Error("connect ETIMEDOUT"));
  stats.recordRetry();

  stats.recordFallback();

  const summary = stats.summary();

  console.log("错误统计摘要:");
  console.log(JSON.stringify(summary, null, 2));

  console.log("\n💡 用途: 监控运行时错误分布，辅助优化重试策略和模型选择");
}

// ====== 入口 ======

async function main() {
  const mode = process.argv[2] || "classify";

  switch (mode) {
    case "classify":
      demoClassify();
      break;
    case "retry":
      await demoRetry();
      break;
    case "fallback":
      await demoFallback();
      break;
    case "resilient":
      await demoResilient();
      break;
    case "stats":
      demoStats();
      break;
    default:
      console.log("用法: npx tsx src/14-error-handling/chat.ts [classify|retry|fallback|resilient|stats]");
  }
}

main().catch(console.error);
