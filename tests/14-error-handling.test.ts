/**
 * 14-error-handling 测试
 *
 * 测试错误处理的核心行为：
 * 1. 错误分类正确
 * 2. 重试机制有效
 * 3. 降级链有效
 * 4. 错误统计正确
 */
import { describe, it, expect } from "vitest";
import { APICallError } from "ai";
import {
  classifyError,
  withRetry,
  createErrorStats,
} from "../src/14-error-handling/retry";


describe("14-error-handling — 错误分类", () => {
  it("429 应该是 retryable", () => {
    const err = new APICallError({
      message: "Too Many Requests",
      statusCode: 429,
      url: "https://api.example.com",
      requestBodyValues: {},
    });
    expect(classifyError(err)).toBe("retryable");
  });

  it("5xx 应该是 retryable", () => {
    for (const code of [500, 502, 503, 504]) {
      const err = new APICallError({
        message: "Server Error",
        statusCode: code,
        url: "https://api.example.com",
        requestBodyValues: {},
      });
      expect(classifyError(err)).toBe("retryable");
    }
  });

  it("400 应该是 fallback", () => {
    const err = new APICallError({
      message: "Bad Request",
      statusCode: 400,
      url: "https://api.example.com",
      requestBodyValues: {},
    });
    expect(classifyError(err)).toBe("fallback");
  });

  it("401 应该是 fatal", () => {
    const err = new APICallError({
      message: "Unauthorized",
      statusCode: 401,
      url: "https://api.example.com",
      requestBodyValues: {},
    });
    expect(classifyError(err)).toBe("fatal");
  });

  it("403 应该是 fatal", () => {
    const err = new APICallError({
      message: "Forbidden",
      statusCode: 403,
      url: "https://api.example.com",
      requestBodyValues: {},
    });
    expect(classifyError(err)).toBe("fatal");
  });

  it("Token 超限应该是 fallback", () => {
    const err = new Error("context length exceeded maximum of 4096 tokens");
    expect(classifyError(err)).toBe("fallback");
  });

  it("ETIMEDOUT 应该是 retryable", () => {
    const err = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
    expect(classifyError(err)).toBe("retryable");
  });

  it("ECONNREFUSED 应该是 retryable", () => {
    const err = new Error("connect ECONNREFUSED 192.168.0.120:8888");
    expect(classifyError(err)).toBe("retryable");
  });

  it("未知错误应该是 fatal", () => {
    const err = new Error("something unknown happened");
    expect(classifyError(err)).toBe("fatal");
  });
});

describe("14-error-handling — 重试机制", () => {
  it("正常函数不需要重试", { timeout: 5000 }, async () => {
    const result = await withRetry(
      () => Promise.resolve("ok"),
      { maxRetries: 3 },
    );
    expect(result).toBe("ok");
  });

  it("retryable 错误应该自动重试并最终成功", { timeout: 10000 }, async () => {
    let callCount = 0;

    const result = await withRetry(
      async () => {
        callCount++;
        if (callCount <= 2) {
          throw new APICallError({
            message: "模拟 429",
            statusCode: 429,
            url: "https://api.example.com",
            requestBodyValues: {},
          });
        }
        return "success after retry";
      },
      { maxRetries: 3, baseDelay: 10 },
    );

    expect(result).toBe("success after retry");
    expect(callCount).toBe(3); // 2 次失败 + 1 次成功
  });

  it("fatal 错误不应该重试", { timeout: 3000 }, async () => {
    let callCount = 0;

    await expect(
      withRetry(
        async () => {
          callCount++;
          throw new APICallError({
            message: "Unauthorized",
            statusCode: 401,
            url: "https://api.example.com",
            requestBodyValues: {},
          });
        },
        { maxRetries: 3, baseDelay: 10 },
      ),
    ).rejects.toThrow();

    // fatal 错误不重试，只调 1 次
    expect(callCount).toBe(1);
  });

  it("重试耗尽后应该抛错", { timeout: 10000 }, async () => {
    await expect(
      withRetry(
        () => {
          throw new APICallError({
            message: "模拟 503",
            statusCode: 503,
            url: "https://api.example.com",
            requestBodyValues: {},
          });
        },
        { maxRetries: 2, baseDelay: 10 },
      ),
    ).rejects.toThrow();
  });

  it("onRetry 回调应该被调用", { timeout: 10000 }, async () => {
    const retryLog: number[] = [];
    let callCount = 0;

    await withRetry(
      async () => {
        callCount++;
        if (callCount <= 2) {
          throw new APICallError({
            message: "429", statusCode: 429,
            url: "https://api.example.com", requestBodyValues: {},
          });
        }
        return "ok";
      },
      {
        maxRetries: 3,
        baseDelay: 10,
        onRetry: (attempt) => { retryLog.push(attempt); },
      },
    );

    expect(retryLog).toEqual([1, 2]); // 重试了 2 次
  });
});

describe("14-error-handling — 错误统计", () => {
  it("应该正确统计错误", () => {
    const stats = createErrorStats();

    // retryable
    stats.record(new APICallError({
      message: "429", statusCode: 429,
      url: "https://api.example.com", requestBodyValues: {},
    }));
    stats.record(new APICallError({
      message: "503", statusCode: 503,
      url: "https://api.example.com", requestBodyValues: {},
    }));

    // fatal
    stats.record(new APICallError({
      message: "401", statusCode: 401,
      url: "https://api.example.com", requestBodyValues: {},
    }));

    // fallback
    stats.record(new Error("token limit exceeded"));

    const summary = stats.summary();
    expect(summary.total).toBe(4);
    expect(summary.byCategory.retryable).toBe(2);
    expect(summary.byCategory.fatal).toBe(1);
    expect(summary.byCategory.fallback).toBe(1);
  });

  it("reset 应该清空统计", () => {
    const stats = createErrorStats();
    stats.record(new Error("test"));
    expect(stats.summary().total).toBe(1);

    stats.reset();
    expect(stats.summary().total).toBe(0);
  });

  it("recordRetry / recordFallback 应该递增", () => {
    const stats = createErrorStats();
    stats.recordRetry();
    stats.recordRetry();
    stats.recordFallback();

    expect(stats.summary().retries).toBe(2);
    expect(stats.summary().fallbacks).toBe(1);
  });
});
