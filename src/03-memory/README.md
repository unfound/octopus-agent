# 03 - 记忆系统

> 让 Agent 能"记住"之前的对话 — 跨轮次对话历史 + 上下文窗口管理

## 核心问题

02 的 Agent 是无状态的：每次 `agentChat(msg)` 都是独立调用，说完就忘。

这有两个问题：
1. **无法引用历史** — "我刚才说了什么？"答不上来
2. **长对话爆 token** — 消息越积越多，超出模型上下文限制

## 解决方案

### 消息存储 (`MessageStore`)

```
用户消息 → 存入 → [msg1, msg2, msg3, ...] → 取出 → 发给 LLM
```

- 每条消息带时间戳和 token 粗估
- 支持按条数 / token 数裁剪

### 窗口策略

| 策略 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 滑动窗口 | 保留最近 N 条 | 简单快速 | 早期上下文丢失 |
| Token 预算 | 按 token 上限裁剪 | 更精确 | 同上 |
| 摘要压缩 | LLM 压缩旧消息 | 保留语义 | 多一次 LLM 调用 |

### 架构

```
Agent.send(msg)
  │
  ├─ 1. MessageStore.add(user_msg)
  │
  ├─ 2. WindowManager.apply()
  │     ├─ slidingWindow: 删除旧消息
  │     ├─ tokenBudget: 按 token 删除
  │     └─ summary: LLM 压缩旧消息 → 摘要
  │
  ├─ 3. 拼装消息: [注入的摘要] + [历史消息]
  │
  ├─ 4. generateText(model, messages, tools)  ← ReAct 循环
  │
  └─ 5. MessageStore.add(assistant_msg)
```

## 代码结构

```
src/03-memory/
├── window.ts    # 窗口策略（滑动/预算/摘要）
├── agent.ts     # 有状态的 Agent（ReAct + 记忆）
├── chat.ts      # 交互式对话入口
└── README.md
```

## 运行

```bash
# 交互式对话
npx tsx src/03-memory/chat.ts
```

## 测试方式

1. 第一轮输入「我叫 Octopus，是个 TypeScript 开发者，喜欢猫」
2. 第二轮输入「我的爱好是什么？」—— Agent 应该回答「喜欢猫」
3. 连续发 5~6 条消息（随便输入什么），触发滑动窗口截断（keep 6）
4. 再问「我叫什么？」—— 窗口只保留最近 6 条，早期消息被截断，Agent 会「忘记」
5. `/exit` 退出

## 关键概念

### CoreMessage

Vercel AI SDK 的消息格式：

```typescript
type CoreMessage =
  | { role: "system", content: string }
  | { role: "user", content: string }
  | { role: "assistant", content: string }
  | { role: "tool", content: ToolResult[] }
```

### Token 估算

不用 tiktoken（太重），用简单启发式：
- 中文：约 1.5 字/token
- 英文：约 4 字/token

生产环境建议用 `tiktoken` 或模型自带的 tokenizer。

### 摘要压缩流程

```
旧消息 [msg1..msg10] → LLM 压缩 → 摘要文本
                               ↓
新历史 [摘要(sys), msg9, msg10]
```

摘要作为 `system` 消息注入，模型会把它当作"之前发生过的事"来理解。

## 下一步

- **04-long-term** — JSONL 持久化 + BM25 检索（跨会话记忆）
