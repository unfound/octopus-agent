# 14 - Error Handling（错误处理与容错）

## 为什么需要错误处理？

前面 13 章，所有 Agent 都假设"模型调了一定能返回"。但真实环境中：

```typescript
// 这些都会发生：
await generateText({ model, messages });
// → APICallError: 429 Too Many Requests（频率限制）
// → APICallError: 503 Service Unavailable（服务挂了）
// → APICallError: 500 Internal Server Error
// → InvalidResponseDataError: 模型返回了乱码
// → 网络超时，连接断开
// → Token 超出模型限制
```

一个**没有错误处理的 Agent = 一次失败就崩溃**。

## 错误分类

```
┌─────────────────────────────────────────────┐
│  可重试错误                                    │
│  429 Rate Limit / 503 临时不可用 / 超时       │
│  → 等待 + 重试                                │
├─────────────────────────────────────────────┤
│  不可重试但可降级                              │
│  模型不支持 / Token 超限 / 400 Bad Request     │
│  → 换用 fallback 模型                          │
├─────────────────────────────────────────────┤
│  不可恢复                                      │
│  401 Unauthorized / 403 Forbidden            │
│  → 报告错误，停止                              │
└─────────────────────────────────────────────┘
```

## 解决方案层次

### 1. Retry（重试）
- 指数退避：1s → 2s → 4s → 8s → max
- 只对可重试错误重试
- 限制最大重试次数

### 2. Fallback（降级）
- 主模型失败 → 备选模型
- 大模型超时 → 小模型快速响应
- 复杂 prompt → 简化 prompt

### 3. Graceful Degradation（优雅降级）
- 工具调用失败 → 返回部分结果
- Token 超限 → 截断历史消息
- 部分失败 → 返回已完成部分 + 错误说明

## 文件结构

```
14-error-handling/
├── README.md          ← 本文件
├── retry.ts           # 重试策略：指数退避 + 错误分类
├── fallback.ts        # 模型降级：主模型 → 备选模型
├── resilient-agent.ts # 容错 Agent：组合 retry + fallback + 降级
└── chat.ts            # 交互入口：演示各种容错场景
```

## 设计要点

### 1. 错误分类器

```typescript
function classifyError(err: unknown): "retryable" | "fallback" | "fatal" {
  if (err instanceof APICallError) {
    if (err.statusCode === 429 || err.statusCode >= 500) return "retryable";
    if (err.statusCode === 400) return "fallback";
    return "fatal";
  }
  if (isTimeout(err)) return "retryable";
  return "fatal";
}
```

### 2. 重试 with 指数退避

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; baseDelay?: number },
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      if (classifyError(err) !== "retryable") throw err;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}
```

### 3. 模型降级链

```typescript
const models = [
  "openrouter/anthropic/claude-sonnet-4",  // 首选
  "openrouter/openai/gpt-4o",              // 备选 1
  "local/qwen/qwen3.5-9b",                 // 备选 2（本地）
];

async function withFallback<T>(
  fn: (model: string) => Promise<T>,
  modelChain: string[],
): Promise<T> {
  for (const model of modelChain) {
    try {
      return await fn(model);
    } catch (err) {
      if (classifyError(err) === "retryable") throw err; // 不降级，重试
      console.warn(`模型 ${model} 失败，尝试下一个...`);
    }
  }
  throw new Error("所有模型均失败");
}
```

## Demo 场景

1. **重试演示** — 模拟 API 错误，展示指数退避重试
2. **模型降级** — 主模型不可用时切换到备选
3. **容错 Agent** — 完整实现：retry + fallback + 工具调用容错
4. **错误统计** — 记录每种错误的频率，辅助决策

## 与前面章节的关系

- **08-sub-agent**：子代理失败不应导致父代理崩溃
- **10-sandbox**：权限错误和网络错误是同一层
- **11-evaluation**：错误处理策略可以通过评估来验证
