# 04 - 长期记忆

> 跨 session 的记忆持久化 — JSONL 存储 + BM25 检索 + LLM 查询改写

## 核心问题

03 的 Agent 虽然能记住当前对话，但 session 结束后记忆就消失了。

对比 OpenClaw 的做法：
- **OpenClaw**: `memory.md` 全量注入 → 浪费 token，文件越长越贵
- **我们**: 结构化存储 → BM25 检索 topK → 只注入最相关的

## 解决方案

### 记忆条目 (`MemoryEntry`)

每条记忆是一个独立的、可检索的事实：

```typescript
{
  id: "m_xxx",
  content: "用户叫 Octopus，是 TypeScript 开发者",
  category: "fact",          // fact | preference | skill | event
  keywords: ["Octopus", "TypeScript", "开发者"],
  importance: 8,             // 1-10
  createdAt: 1700000000000,
  lastAccessedAt: 1700000000000,
  accessCount: 3,
}
```

### 存储格式（JSONL）

```
{ "id": "m1", "content": "用户叫 Octopus", ... }
{ "id": "m2", "content": "用户喜欢 Vercel AI SDK", ... }
```

- 追加写入 O(1)，不需要每次读写整个文件
- `grep` / `wc -l` 直接能调试

### 检索流程

```
用户提问
  │
  ├─ BM25 直接搜
  │   ├─ 有结果 → 返回
  │   └─ 无结果 → LLM 改写查询再搜
  │               │
  │               └─ 「我是谁」→「用户 身份 名字 信息」
  │                  → 能匹配到「用户叫 Octopus」
  │
  └─ 综合评分：BM25 × 重要性 × 时间衰减（每 30 天衰减到 50%）
```

### 记忆提取

每轮对话结束后，用 LLM 提取值得记住的内容：

```
用户：我叫 Octopus
助手：你好 Octopus
         ↓
LLM 提取 → { content: "用户叫 Octopus", category: "fact", keywords: ["Octopus"] }
         ↓
追加写入 JSONL + 加入 BM25 索引
```

## 代码结构

```
src/04-long-term/
├── agent.ts          # 带长期记忆的 Agent（ReAct + 记忆检索 + 记忆提取）
├── memory-manager.ts # 记忆管理器（提取、检索、改写查询）
├── memory-store.ts   # JSONL 持久化
├── memory-entry.ts   # 记忆条目数据结构
├── bm25.ts           # BM25 检索算法（手写实现，含中文分词）
├── chat.ts           # 交互式对话入口
└── README.md
```

## 运行

```bash
# 交互式对话
npx tsx src/04-long-term/chat.ts
```

## 测试方式

**第一次运行（存储记忆）：**

1. 输入「我叫蛸蛸，是个 TypeScript 开发者」
2. 输入「我喜欢用 Vercel AI SDK」
3. 输入「我的电脑是 MacBook Pro M4」
4. `/exit` 退出 → 记忆自动提取并写入 JSONL

**第二次运行（回忆记忆）：**

1. 重新启动：`npx tsx src/04-long-term/chat.ts`
2. 输入「你还记得我是谁吗？」—— Agent 应该提到蛸蛸 / TypeScript
3. 输入「我用什么框架？」—— Agent 应该提到 Vercel AI SDK

**注意：** 回忆能力取决于 LLM 提取 + BM25 检索质量。如果直接搜不到会自动触发 LLM 查询改写（「我是谁」→「用户身份名字」），但本地小模型可能不够精准。可以删除记忆文件重试：`rm /tmp/octopus-agent/memories.jsonl`
