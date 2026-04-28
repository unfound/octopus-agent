/**
 * 14-error-handling — 重试策略核心实现
 *
 * 三种核心容错机制：
 * 1. withRetry    — 指数退避重试（429/5xx/超时）
 * 2. withFallback — 多模型降级链（主 → 备1 → 备2）
 * 3. classifyError — 错误分类（retryable / fallback / fatal）
 */

import { APICallError, generateText } from "ai";
import { getModel } from "../shared/model";

// ====== 错误分类 ======

/** 错误类别 */
export type ErrorCategory = "retryable" | "fallback" | "fatal";

/**
 * 判断连接超时（Node.js 抛出的 SystemError）
 */
function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ETIMEDOUT" || nodeErr.code === "ECONNREFUSED" || nodeErr.code === "ECONNRESET") {
      return true;
    }
    if (err.message.includes("timeout") || err.message.includes("timed out")) {
      return true;
    }
  }
  return false;
}

/**
 * 错误分类器
 *
 * - retryable: 临时错误，等待后可重试
 * - fallback:  不应重试但可以换模型
 * - fatal:     无法恢复
 */
export function classifyError(err: unknown): ErrorCategory {
  // APICallError 是 AI SDK 的标准错误类型
  if (APICallError.isInstance(err)) {
    // 429 Too Many Requests — 等一会儿再试
    if (err.statusCode === 429) return "retryable";
    // 5xx Server Error — 服务器临时故障
    if (err.statusCode !== undefined && err.statusCode >= 500) return "retryable";
    // 400 Bad Request — 可能是模型限制，换模型试试
    if (err.statusCode === 400) return "fallback";
    // 401/403 — 认证问题
    if (err.statusCode === 401 || err.statusCode === 403) return "fatal";
  }

  // AI SDK 的其他错误类型
  const errMsg = err instanceof Error ? err.message : String(err);

  // Token 超限 — 不可重试但可降级
  if (errMsg.includes("context length") || errMsg.includes("token") || errMsg.includes("maximum")) {
    return "fallback";
  }

  // 超时 — 网络问题，可重试
  if (isTimeoutError(err)) return "retryable";

  // 默认 fatal
  return "fatal";
}

// ====== 重试机制 ======

/** 重试配置 */
export interface RetryConfig {
  /** 最大重试次数（不包括首次调用） */
  maxRetries?: number;
  /** 基础延迟（毫秒），实际延迟 = baseDelay * 2^attempt + jitter */
  baseDelay?: number;
  /** 最大延迟（毫秒） */
  maxDelay?: number;
  /** 每次重试前的回调 */
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

/**
 * 带指数退避的重试包装器
 *
 * 延迟公式：min(baseDelay * 2^attempt + random(0, 1000), maxDelay)
 *
 * 只重试 retryable 错误，其他错误直接向上抛。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    onRetry,
  } = config;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // 最后一次尝试，直接抛错
      if (attempt === maxRetries) throw err;

      const category = classifyError(err);

      if (category === "retryable") {
        // 计算退避延迟
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        const delay = Math.min(exponentialDelay + jitter, maxDelay);

        onRetry?.(attempt + 1, err, Math.round(delay));

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // 非 retryable 错误直接抛
      throw err;
    }
  }

  throw new Error("unreachable");
}

// ====== 模型降级 ======

/** 模型降级配置 */
export interface FallbackConfig {
  /** 模型 ID 链，按优先级排列（第一个是首选） */
  modelChain: string[];
  /** 每次降级时的回调 */
  onFallback?: (from: string, to: string, error: unknown) => void;
}

/**
 * 模型降级链
 *
 * 依次尝试模型链中的每个模型。遇到 retryable 错误不降级（应该重试），
 * 遇到 fallback/fatal 错误则尝试下一个模型。
 *
 * 注意：函数签名用 `fn(modelId)` 让调用方可以用不同模型重试。
 */
export async function withFallback<T>(
  fn: (modelId: string) => Promise<T>,
  config: FallbackConfig,
): Promise<T> {
  const { modelChain, onFallback } = config;

  if (modelChain.length === 0) {
    throw new Error("模型降级链为空");
  }

  let lastError: unknown;

  for (let i = 0; i < modelChain.length; i++) {
    const modelId = modelChain[i];
    try {
      return await fn(modelId);
    } catch (err) {
      lastError = err;
      const category = classifyError(err);

      // retryable 错误不应该降级，应该让调用方重试
      if (category === "retryable") throw err;

      // 还有下一个模型就记录降级
      if (i < modelChain.length - 1) {
        onFallback?.(modelId, modelChain[i + 1], err);
        console.warn(`⚠️  模型 ${modelId} 失败 (${category})，降级到 ${modelChain[i + 1]}`);
      }
    }
  }

  throw new Error(`所有 ${modelChain.length} 个模型均失败。最后错误: ${String(lastError)}`);
}

// ====== 组合：retry + fallback ======

/**
 * 带完整容错的 generateText
 *
 * 先重试（指数退避），重试耗尽后降级到备选模型。
 *
 * 使用示例：
 * ```typescript
 * const text = await resilientGenerateText(
 *   "用 50 字总结 TypeScript 的优点",
 *   {
 *     modelChain: ["openrouter/anthropic/claude-sonnet-4", "local/qwen/qwen3.5-9b"],
 *     maxRetries: 3,
 *   }
 * );
 * ```
 */
export async function resilientGenerateText(
  prompt: string,
  config: { modelChain?: string[]; maxRetries?: number } = {},
): Promise<string> {
  const {
    modelChain = ["local/qwen/qwen3.5-9b"],
    maxRetries = 3,
  } = config;

  if (modelChain.length === 1) {
    // 只有一个模型，直接重试
    return withRetry(
      () => generateText({
        model: getModel(modelChain[0]),
        prompt,
      }).then(r => r.text),
      { maxRetries },
    );
  }

  // 多个模型，组合 retry + fallback
  return withFallback(
    (modelId) => withRetry(
      () => generateText({
        model: getModel(modelId),
        prompt,
      }).then(r => r.text),
      { maxRetries: 1 }, // 每个模型最多重试 1 次，快速切换
    ),
    { modelChain },
  );
}

// ====== 错误统计 ======

/** 错误统计器 */
export interface ErrorStats {
  total: number;
  byCategory: Record<ErrorCategory, number>;
  byType: Record<string, number>;
  retries: number;
  fallbacks: number;
}

/**
 * 创建错误统计器
 *
 * 用法：
 * ```typescript
 * const stats = createErrorStats();
 * try { await fn(); } catch (err) { stats.record(err); }
 * console.log(stats.summary());
 * ```
 */
export function createErrorStats() {
  const stats: ErrorStats = {
    total: 0,
    byCategory: { retryable: 0, fallback: 0, fatal: 0 },
    byType: {},
    retries: 0,
    fallbacks: 0,
  };

  return {
    record(err: unknown) {
      stats.total++;
      const category = classifyError(err);
      stats.byCategory[category]++;

      const typeName = err instanceof Error ? err.constructor.name : "Unknown";
      stats.byType[typeName] = (stats.byType[typeName] ?? 0) + 1;
    },

    recordRetry() { stats.retries++; },
    recordFallback() { stats.fallbacks++; },

    summary(): ErrorStats {
      return { ...stats };
    },

    reset() {
      stats.total = 0;
      stats.byCategory = { retryable: 0, fallback: 0, fatal: 0 };
      stats.byType = {};
      stats.retries = 0;
      stats.fallbacks = 0;
    },
  };
}
