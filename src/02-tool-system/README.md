# 02 - 工具系统

## 目标

理解 Agent 最核心的机制——**ReAct 循环**。

## 核心概念

### Agent Loop（手动实现）

```
┌─────────────────────────────────────────┐
│              用户发消息                   │
└─────────────────┬───────────────────────┘
                  ▼
        ┌─────────────────┐
        │   调用 LLM API   │◄──────────────┐
        │ generateText()   │               │
        └────────┬────────┘               │
                 ▼                        │
        ┌─────────────────┐               │
        │ 有工具调用吗？    │               │
        └───┬─────────┬───┘               │
            │ 否      │ 是                │
            ▼         ▼                   │
       返回文本   执行工具                  │
                 结果塞回 messages ─────────┘
```

关键：**循环是我们自己写的**，不是框架提供的。

### tool() 函数

Vercel AI SDK 的 `tool()` 做三件事：

1. **Zod schema** → 自动生成 JSON Schema 给 LLM
2. **参数校验** → 运行时检查输入是否合法
3. **标准化返回** → 统一的工具结果格式

### 消息格式

```typescript
// user 消息
{ role: "user", content: "帮我读一下 config.json" }

// assistant 消息（含工具调用意图）
{ role: "assistant", content: [{ type: "tool-call", toolName: "readFile", args: { path: "config.json" } }] }

// user 消息（工具执行结果）
{ role: "user", content: [{ type: "tool-result", toolCallId: "...", result: { content: "..." } }] }
```

## 代码结构

```
02-tool-system/
├── agent.ts        # agentChat() — ReAct 循环
├── tools.ts        # 工具定义（readFile / writeFile / execCommand）
├── index.ts        # 演示入口
└── README.md
```

## 运行

```bash
# 演示（预设场景）
npx tsx src/02-tool-system/index.ts

# 交互式对话
npx tsx src/02-tool-system/chat.ts
```


