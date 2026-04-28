# 12 - Streaming（流式输出）

## 为什么需要流式？

前面 11 章全部用 `generateText` — 等模型生成完再返回。但真实 AI 产品（ChatGPT、Claude）都是**一个字一个字往外蹦**的。

两种模式的本质区别：

```
generateText:  用户提问 → [████████ 等待 ████████] → 一次返回全部
streamText:    用户提问 → 你 → 好 → ！ → 我 → 是 → ... → 持续输出
```

**为什么重要：**
1. **感知速度** — 第一个字 200ms 出来 vs 等 3 秒才看到结果，体验天差地别
2. **长文本** — 生成 2000 字文章，流式让用户边看边等，不焦虑
3. **工具调用** — 流式场景下工具调用也能实时显示，用户能看到 Agent "正在思考用什么工具"

## Vercel AI SDK 的三种流

| API | 返回 | 用途 |
|-----|------|------|
| `streamText` | `{ textStream, fullStream }` | 最常用，文本 + 工具都流式 |
| `textStream` | `AsyncIterable<string>` | 纯文本流，最简单 |
| `fullStream` | `AsyncIterable<StreamPart>` | 完整事件流（文本块 + 工具调用 + 工具结果 + 结束） |

## 文件结构

```
12-streaming/
├── README.md           ← 本文件
├── stream-demo.ts      # 核心实现：textStream / fullStream / 工具流
├── chat.ts             # 交互入口：对比 generateText vs streamText
└── http-stream.ts      # HTTP Server-Sent Events 流式响应
```

## 设计要点

### 1. 最简单的流：textStream

```typescript
const result = streamText({
  model: getModel(),
  messages: [{ role: "user", content: "讲个笑话" }],
});

// 逐 token 打印
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);  // 不换行，一个字一个字
}
```

### 2. 带工具调用的流：fullStream

```typescript
const result = streamText({
  model: getModel(),
  messages: [{ role: "user", content: "读一下 /tmp/test.txt" }],
  tools: { readFile: readFileTool },
});

for await (const part of result.fullStream) {
  switch (part.type) {
    case "text-delta":       // 文本增量
      process.stdout.write(part.textDelta);
      break;
    case "tool-call":        // 工具调用开始
      console.log(`\n🔧 调用: ${part.toolName}`);
      break;
    case "tool-result":      // 工具调用结果
      console.log(`✅ 结果: ${part.result}`);
      break;
  }
}
```

### 3. 与 generateText 的对比

| | generateText | streamText |
|---|---|---|
| 返回时机 | 全部生成完 | 逐 token |
| 首字延迟 | 高 | 低 |
| 内存占用 | 一次性加载全部 | 流式处理 |
| 工具调用 | 全部完成后获取 | 实时获取 |
| 使用复杂度 | 简单 | 稍复杂 |

## Demo 场景

1. **基础流式** — 最简单的 textStream 输出
2. **打字机效果** — 模拟 ChatGPT 的逐字打印
3. **工具流** — 带工具调用的流式输出，能看到 Agent 实时决策
4. **对比测试** — 同一 prompt，generateText vs streamText 体验差异

## 与前面章节的关系

- **02-tool-system**：流式场景下的工具调用体验完全不同
- **08-sub-agent**：子代理的流式输出如何传递给父代理
- **09-multi-agent**：多 Agent 场景下的流式协调
